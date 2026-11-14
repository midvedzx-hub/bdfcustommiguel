import type {
  GameState, PlayerState, Card, Flag, Deck, FieldCard, AutoEffectType, AutoTrigger, RuleSet, AttackTarget,
} from "@/types";
import { DEFAULT_RULES } from "@/types";
import { uid } from "@/storage";

export type Side = "host" | "guest";
export type { AttackTarget };
export type Result = { state: GameState; ok: boolean; msg: string };

export const POSITION_NAMES = ["ซ้าย", "กลาง", "ขวา"];
const other = (s: Side): Side => (s === "host" ? "guest" : "host");
const nameOf = (s: Side) => (s === "host" ? "ผู้สร้างห้อง" : "ผู้เข้าร่วม");

/* ------------------------------------------------------------------ */
/* Card cache                                                          */
/* ------------------------------------------------------------------ */
let _sizeCache: { [id: string]: number } = {};
export function setCardSizeCache(cards: Card[]) {
  _sizeCache = {};
  cards.forEach(c => { _sizeCache[c.id] = c.size; });
}

let _cardCache: { [id: string]: Card } = {};
export function setCardCache(cards: Card[]) {
  _cardCache = {};
  cards.forEach(c => { _cardCache[c.id] = c; });
}

export function getCard(cardId: string): Card | undefined {
  return _cardCache[cardId];
}

// เพิ่มการ์ดของเพื่อน (ที่ส่งมาตอนต่อออนไลน์) เข้า cache โดยไม่ทับการ์ดของเรา
// ถ้า id ชนกันแต่เนื้อหาต่าง (เช่น import ไฟล์เดียวกันแล้วแก้คนละแบบ) ให้ใช้ของเรา
export function registerCards(cards: Card[]) {
  cards.forEach(c => {
    const existing = _cardCache[c.id];
    if (!existing) {
      _cardCache[c.id] = c;
    } else if (!existing.image && c.image) {
      _cardCache[c.id] = { ...existing, image: c.image };
    }
    if (_sizeCache[c.id] === undefined) _sizeCache[c.id] = c.size;
  });
}

export function setCardImage(id: string, image: string) {
  const c = _cardCache[id];
  if (c && !c.image) _cardCache[id] = { ...c, image };
}

export function missingImageIds(ids: string[]): string[] {
  return ids.filter(id => _cardCache[id] && !_cardCache[id].image);
}

/* ------------------------------------------------------------------ */
/* Internal mutable helpers (ทำงานบน state ที่ clone มาแล้วเท่านั้น)     */
/* ------------------------------------------------------------------ */
function log(g: GameState, msg: string) {
  g.log = [...g.log, msg].slice(-60);
}

function checkWin(g: GameState) {
  if (g.winner) return;
  if (g.host.life <= 0) { g.winner = "guest"; log(g, "ผู้สร้างห้อง แพ้! Life เหลือ 0"); }
  else if (g.guest.life <= 0) { g.winner = "host"; log(g, "ผู้เข้าร่วม แพ้! Life เหลือ 0"); }
}

function syncGauge(p: PlayerState) {
  p.gauge = p.gaugePile.length;
}

function deckOut(g: GameState, side: Side) {
  if (g.winner || !g.rules.deckOutLose) return;
  g.winner = other(side);
  log(g, `${nameOf(side)} เด็คหมด! แพ้ทันที`);
}

function mDraw(g: GameState, side: Side, n: number, canLose = true): number {
  const p = g[side];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (canLose) deckOut(g, side);
      break;
    }
    p.hand.push(p.deck.shift()!);
    drawn++;
  }
  if (drawn > 0) log(g, `${nameOf(side)} จั่วการ์ด ${drawn} ใบ`);
  return drawn;
}

// Charge: การ์ดบนเด็คลงเกจ (คว่ำ)
function mCharge(g: GameState, side: Side, n: number, canLose = true): number {
  const p = g[side];
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (canLose) deckOut(g, side);
      break;
    }
    p.gaugePile.push(p.deck.shift()!);
    moved++;
  }
  syncGauge(p);
  if (moved > 0) log(g, `${nameOf(side)} Charge เกจ +${moved}`);
  return moved;
}

// จ่ายเกจ: การ์ดในเกจถูกย้ายไปสุสาน
function mPayGauge(g: GameState, side: Side, n: number) {
  const p = g[side];
  for (let i = 0; i < n && p.gaugePile.length > 0; i++) {
    p.dropZone.push(p.gaugePile.shift()!);
  }
  syncGauge(p);
}

function mLife(g: GameState, side: Side, delta: number) {
  const p = g[side];
  p.life = Math.max(0, p.life + delta);
  log(g, `${nameOf(side)} ${delta >= 0 ? "ฟื้น" : "เสีย"} Life ${Math.abs(delta)} (เหลือ ${p.life})`);
  checkWin(g);
}

/* ------------------------------------------------------------------ */
/* Stats / keywords                                                    */
/* ------------------------------------------------------------------ */
function continuousSum(card: Card, type: AutoEffectType): number {
  let sum = 0;
  card.autoSkills?.forEach(s => {
    if (s.trigger !== "continuous") return;
    s.effects.forEach(e => { if (e.type === type) sum += e.value; });
  });
  return sum;
}

export function statsOf(fc: FieldCard): { power: number; defense: number; critical: number } {
  const c = getCard(fc.cardId);
  if (!c) return { power: 0, defense: 0, critical: 0 };
  return {
    power: c.power + fc.tempPower + continuousSum(c, "buffPower"),
    defense: c.defense + (fc.tempDefense ?? 0) + continuousSum(c, "buffDefense"),
    critical: c.critical + (fc.tempCritical ?? 0) + continuousSum(c, "buffCritical"),
  };
}

// คีย์เวิร์ดอ่านได้จากสกิลถาวร และจาก "เมื่อโจมตี" (รองรับการ์ดเก่าที่สร้างไว้แล้ว)
export function hasKeyword(card: Card, type: AutoEffectType): boolean {
  return !!card.autoSkills?.some(
    s => (s.trigger === "continuous" || s.trigger === "onAttack") && s.effects.some(e => e.type === type)
  );
}

export function maxAttacks(card: Card): number {
  let n = 1;
  card.autoSkills?.forEach(s => {
    if (s.trigger !== "continuous" && s.trigger !== "onAttack") return;
    s.effects.forEach(e => {
      if (e.type === "doubleAttack") n = Math.max(n, 2);
      if (e.type === "tripleAttack") n = Math.max(n, 3);
      if (e.type === "multiAttack") n = Math.max(n, Math.floor(e.value) || 1);
    });
  });
  return n;
}

function newFieldCard(cardId: string, position: number): FieldCard {
  return {
    uid: uid(), cardId, position, state: "stand",
    tempPower: 0, tempCritical: 0, tempDefense: 0, attacks: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */
function mDestroyMonster(g: GameState, side: Side, monsterUid: string): boolean {
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  if (!m) return false;
  const card = getCard(m.cardId);

  // Soulguard: จ่ายเกจ 1 เพื่อไม่ถูกทำลาย (ครั้งเดียวต่อเทิร์น)
  if (card && hasKeyword(card, "soulguard") && !m.guardUsed && p.gaugePile.length >= 1) {
    mPayGauge(g, side, 1);
    m.guardUsed = true;
    log(g, `${card.name} ใช้ Soulguard! จ่ายเกจ 1 เพื่อรอดจากการถูกทำลาย`);
    return false;
  }

  p.monsters = p.monsters.filter(x => x.uid !== monsterUid);
  p.dropZone.push(m.cardId);
  log(g, `${card?.name ?? "มอนสเตอร์"} ถูกทำลาย`);
  if (card) applyEffects(g, side, card, "onDestroyed");
  return true;
}

function applyEffects(
  g: GameState,
  side: Side,
  card: Card,
  trigger: AutoTrigger,
  ctx?: { fc?: FieldCard }
) {
  const opp = other(side);
  card.autoSkills?.forEach(skill => {
    if (skill.trigger !== trigger) return;
    skill.effects.forEach(eff => {
      if (g.winner) return;
      const n = Math.max(0, Math.floor(eff.value));
      switch (eff.type) {
        case "draw": mDraw(g, side, n); break;
        case "addGauge": mCharge(g, side, n); break;
        case "addLife": mLife(g, side, n); break;
        case "reduceLife":
          log(g, `${card.name} ทำดาเมจตรง ${n}`);
          mLife(g, opp, -n);
          break;
        case "destroyOpponentMonster": {
          const order = [1, 0, 2];
          const targets = [...g[opp].monsters]
            .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position))
            .slice(0, n);
          targets.forEach(m => mDestroyMonster(g, opp, m.uid));
          break;
        }
        case "restOpponent": {
          g[opp].monsters.filter(m => m.state === "stand").slice(0, n).forEach(m => { m.state = "rest"; });
          log(g, `${card.name} Rest มอนสเตอร์ศัตรู`);
          break;
        }
        case "opponentDiscard": {
          const h = g[opp].hand;
          for (let i = 0; i < n && h.length > 0; i++) {
            const idx = Math.floor(Math.random() * h.length);
            g[opp].dropZone.push(h.splice(idx, 1)[0]);
          }
          log(g, `${card.name} ทำให้ศัตรูทิ้งการ์ด`);
          break;
        }
        case "recoverFromDrop": {
          const p = g[side];
          for (let i = 0; i < n && p.dropZone.length > 0; i++) p.hand.push(p.dropZone.pop()!);
          log(g, `${card.name} เก็บการ์ดจากสุสานขึ้นมือ`);
          break;
        }
        case "standSelf": {
          const rests = g[side].monsters.filter(m => m.state === "rest");
          (ctx?.fc ? [ctx.fc] : rests.slice(0, Math.max(1, n))).forEach(m => { m.state = "stand"; });
          log(g, `${card.name} Stand มอนสเตอร์`);
          break;
        }
        case "buffPower":
        case "buffCritical":
        case "buffDefense": {
          const target = ctx?.fc ?? g[side].monsters[g[side].monsters.length - 1];
          if (!target) break;
          if (eff.type === "buffPower") target.tempPower += eff.value;
          if (eff.type === "buffCritical") target.tempCritical += eff.value;
          if (eff.type === "buffDefense") target.tempDefense += eff.value;
          log(g, `${card.name} ${eff.type === "buffPower" ? "Power" : eff.type === "buffCritical" ? "Critical" : "Defense"} +${eff.value}`);
          break;
        }
        case "negateAttack":
          if (g.battle) { g.battle.negated = true; log(g, `${card.name} ยกเลิกการโจมตี!`); }
          break;
        case "destroyAttacker": {
          if (!g.battle) break;
          const atkSide = g.battle.attackerSide;
          const m = g[atkSide].monsters.find(x => x.uid === g.battle!.attackerUid);
          if (m) mDestroyMonster(g, atkSide, m.uid);
          else g.battle.negated = true; // ผู้โจมตีเป็นไอเทม: ยกเลิกการโจมตีแทน
          log(g, `${card.name} ทำลายผู้โจมตี!`);
          break;
        }
        case "restAttacker": {
          if (!g.battle) break;
          const atkSide = g.battle.attackerSide;
          const a = g[atkSide].monsters.find(x => x.uid === g.battle!.attackerUid) ??
            (g[atkSide].item?.uid === g.battle.attackerUid ? g[atkSide].item : null);
          if (a) { a.state = "rest"; log(g, `${card.name} Rest ผู้โจมตี`); }
          break;
        }
        default:
          // penetrate / doubleAttack / soulguard ฯลฯ เป็นคีย์เวิร์ด ถูกอ่านตอนต่อสู้
          break;
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
export function createPlayerState(deck: Deck, flag: Flag, _cards: Card[]): PlayerState {
  const allCards = [...deck.cardIds];
  // Buddy ต้องอยู่ในเด็คเสมอ (ถ้าเลือก Buddy จากรายการของโลกที่ไม่ได้ใส่ในเด็ค ให้เติมเข้าไป)
  if (deck.buddyId && !allCards.includes(deck.buddyId)) allCards.push(deck.buddyId);
  const hand = allCards.splice(0, Math.min(flag.startHand, allCards.length));
  const gaugePile = allCards.splice(0, Math.min(flag.startGauge, allCards.length));
  return {
    life: flag.life,
    gauge: gaugePile.length,
    gaugePile,
    deck: allCards,
    hand,
    dropZone: [],
    monsters: [],
    item: null,
    flagId: flag.id,
    buddyId: deck.buddyId,
    buddyCalledThisGame: false,
  };
}

function startTurn(g: GameState, skipDraw: boolean) {
  const side = g.currentTurn;
  const p = g[side];
  p.monsters.forEach(m => { m.state = "stand"; m.attacks = 0; m.guardUsed = false; });
  if (p.item) { p.item.state = "stand"; p.item.attacks = 0; }
  g.attacksThisTurn = 0;
  g.battle = null;
  g.phase = "charge";
  log(g, `— เทิร์น ${g.turn}: ${nameOf(side)} (Stand${skipDraw ? "" : " & Draw"}) —`);
  if (!skipDraw) mDraw(g, side, 1);
  if (g.winner) return;
  p.monsters.forEach(m => {
    const c = getCard(m.cardId);
    if (c) applyEffects(g, side, c, "onTurnStart", { fc: m });
  });
}

export function createInitialState(
  hostDeck: Deck, guestDeck: Deck, hostFlag: Flag, guestFlag: Flag, cards: Card[],
  rules: RuleSet = DEFAULT_RULES
): GameState {
  const g: GameState = {
    turn: 1,
    currentTurn: "host",
    phase: "charge",
    rules: { ...DEFAULT_RULES, ...rules },
    battle: null,
    firstPlayer: "host",
    attacksThisTurn: 0,
    rev: 0,
    host: createPlayerState(hostDeck, hostFlag, cards),
    guest: createPlayerState(guestDeck, guestFlag, cards),
    log: ["เกมเริ่มต้นแล้ว! ผู้สร้างห้องเริ่มก่อน (เทิร์นแรกไม่จั่ว)"],
    winner: null,
  };
  startTurn(g, true); // ผู้เล่นคนแรกข้าม Draw ในเทิร์นแรก
  return g;
}

export function addLog(state: GameState, msg: string): GameState {
  const g = structuredClone(state);
  log(g, msg);
  return g;
}

/* ------------------------------------------------------------------ */
/* Public: thin wrappers (ใช้จาก UI / sandbox)                         */
/* ------------------------------------------------------------------ */
export function drawCard(state: GameState, side: Side, count = 1): GameState {
  const g = structuredClone(state);
  mDraw(g, side, count);
  return g;
}

export function addGauge(state: GameState, side: Side, count = 1): GameState {
  const g = structuredClone(state);
  mCharge(g, side, count, false);
  return g;
}

export function changeLife(state: GameState, side: Side, delta: number): GameState {
  const g = structuredClone(state);
  mLife(g, side, delta);
  return g;
}

export function totalMonsterSize(player: PlayerState): number {
  return player.monsters.reduce((sum, m) => sum + (getCard(m.cardId)?.size ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* Turn flow                                                           */
/* ------------------------------------------------------------------ */
// Charge & Draw: ใส่การ์ดจากมือ 1 ใบลงเกจ แล้วจั่ว 1 ใบ (ทำหรือไม่ก็ได้)
export function chargeAndDraw(state: GameState, side: Side, handIndex: number | null): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (state.currentTurn !== side) return { state, ok: false, msg: "ไม่ใช่เทิร์นของคุณ" };
  if (state.phase !== "charge") return { state, ok: false, msg: "ผ่านช่วง Charge & Draw ไปแล้ว" };
  const g = structuredClone(state);
  const p = g[side];
  if (handIndex !== null) {
    if (handIndex < 0 || handIndex >= p.hand.length) return { state, ok: false, msg: "ไม่พบการ์ดในมือ" };
    p.gaugePile.push(p.hand.splice(handIndex, 1)[0]);
    syncGauge(p);
    log(g, `${nameOf(side)} Charge การ์ด 1 ใบลงเกจ`);
    mDraw(g, side, 1);
  } else {
    log(g, `${nameOf(side)} ข้าม Charge & Draw`);
  }
  g.phase = "main";
  return { state: g, ok: true, msg: "เข้าสู่ Main Phase" };
}

export function goToAttack(state: GameState, side: Side): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (state.currentTurn !== side) return { state, ok: false, msg: "ไม่ใช่เทิร์นของคุณ" };
  if (state.battle) return { state, ok: false, msg: "กำลังรอ Counter" };
  if (state.phase !== "main") return { state, ok: false, msg: "ไป Attack Phase ได้จาก Main Phase เท่านั้น" };
  const g = structuredClone(state);
  g.phase = "attack";
  log(g, `${nameOf(side)} เข้าสู่ Attack Phase`);
  return { state: g, ok: true, msg: "Attack Phase" };
}

export function goToFinal(state: GameState, side: Side): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (state.currentTurn !== side) return { state, ok: false, msg: "ไม่ใช่เทิร์นของคุณ" };
  if (state.battle) return { state, ok: false, msg: "กำลังรอ Counter" };
  if (state.phase === "final") return { state, ok: false, msg: "อยู่ Final Phase แล้ว" };
  if (state.phase === "charge") return { state, ok: false, msg: "ต้องผ่านช่วง Charge & Draw ก่อน" };
  const g = structuredClone(state);
  g.phase = "final";
  log(g, `${nameOf(side)} เข้าสู่ Final Phase`);
  g[side].monsters.forEach(m => {
    const c = getCard(m.cardId);
    if (c) applyEffects(g, side, c, "onFinal", { fc: m });
  });
  return { state: g, ok: true, msg: "Final Phase" };
}

export function endTurn(state: GameState): GameState {
  if (state.battle) return state; // ต้องจบ Counter ก่อน
  const g = structuredClone(state);
  if (g.winner) return g;
  // buff "เทิร์นนี้" หมดอายุ
  (["host", "guest"] as Side[]).forEach(s => {
    [...g[s].monsters, ...(g[s].item ? [g[s].item!] : [])].forEach(m => {
      m.tempPower = 0; m.tempCritical = 0; m.tempDefense = 0;
    });
  });
  g.currentTurn = other(g.currentTurn);
  g.turn++;
  startTurn(g, false);
  return g;
}

/* ------------------------------------------------------------------ */
/* Playing cards                                                       */
/* ------------------------------------------------------------------ */
function guardTurn(state: GameState, side: Side, needPhase: "main" | "final" | "attack"): string | null {
  if (state.winner) return "เกมจบแล้ว";
  if (state.currentTurn !== side) return "ไม่ใช่เทิร์นของคุณ";
  if (state.battle) return "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter";
  if (state.phase === "charge") return "ต้องผ่านช่วง Charge & Draw ก่อน (กด 'ข้าม' ถ้าไม่ Charge)";
  if (needPhase === "main" && state.phase !== "main") return "ลงการ์ด/ร่ายเวทได้เฉพาะ Main Phase";
  if (needPhase === "attack" && state.phase !== (state.rules.useAttackPhase ? "attack" : "main"))
    return state.rules.useAttackPhase ? "โจมตีได้เฉพาะ Attack Phase" : "โจมตีได้เฉพาะ Main Phase";
  if (needPhase === "final" && state.phase !== "final") return "Impact ใช้ได้เฉพาะ Final Phase";
  return null;
}

function payCost(g: GameState, side: Side, card: Card): string | null {
  const p = g[side];
  if (card.callCostType === "Gauge") {
    if (p.gaugePile.length < card.callCost) return `เกจไม่พอ (ต้องการ ${card.callCost} มี ${p.gaugePile.length})`;
    mPayGauge(g, side, card.callCost);
  } else {
    if (p.life <= card.callCost) return "Life ไม่พอจ่าย";
    p.life -= card.callCost;
  }
  return null;
}

export function callMonster(state: GameState, side: Side, handIndex: number, position: number): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ด" };
  if (card.type !== "Monster") return { state, ok: false, msg: "ไม่ใช่มอนสเตอร์" };
  if (p.monsters.some(m => m.position === position)) return { state, ok: false, msg: "ช่องนั้นมีมอนสเตอร์แล้ว" };

  const currentSize = totalMonsterSize(p);
  if (currentSize + card.size > g.rules.maxSize)
    return { state, ok: false, msg: `Size รวมเกิน ${g.rules.maxSize} (${currentSize + card.size})` };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: costErr };

  p.hand.splice(handIndex, 1);
  const fc = newFieldCard(cardId, position);
  p.monsters.push(fc);
  log(g, `${card.name} ลงสนาม (ช่อง${POSITION_NAMES[position] ?? position})`);

  if (p.buddyId === cardId && !p.buddyCalledThisGame) {
    p.buddyCalledThisGame = true;
    log(g, `Buddy Call "${card.name}"!`);
    mLife(g, side, g.rules.buddyCallLife);
  }
  applyEffects(g, side, card, "onCall", { fc });
  return { state: g, ok: true, msg: `${card.name} ลงสนามสำเร็จ` };
}

export function castSpell(state: GameState, side: Side, handIndex: number): Result {
  const card0 = getCard(state[side].hand[handIndex]);
  const isImpact = card0?.type === "Impact";
  const err = guardTurn(state, side, isImpact ? "final" : "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ด" };
  if (card.type !== "Spell" && card.type !== "Impact") return { state, ok: false, msg: "ไม่ใช่เวทมนตร์/Impact" };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: costErr };

  p.hand.splice(handIndex, 1);
  p.dropZone.push(cardId);
  log(g, `${card.name} ถูกร่าย!`);
  applyEffects(g, side, card, "onCast");
  return { state: g, ok: true, msg: `ร่าย ${card.name} สำเร็จ` };
}

export function equipItem(state: GameState, side: Side, handIndex: number): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ด" };
  if (card.type !== "Item") return { state, ok: false, msg: "ไม่ใช่ไอเทม" };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: costErr };

  if (p.item) p.dropZone.push(p.item.cardId);
  p.hand.splice(handIndex, 1);
  p.item = newFieldCard(cardId, 0);
  log(g, `${card.name} ถูกติดตั้ง!`);
  applyEffects(g, side, card, "onCall", { fc: p.item });
  return { state: g, ok: true, msg: `ติดตั้ง ${card.name}` };
}

/* ------------------------------------------------------------------ */
/* Battle                                                              */
/* ------------------------------------------------------------------ */
// ตัวเลือกเป้าหมายที่ตีได้ (ใช้ทั้ง UI และบอท)
export function legalTargets(state: GameState, side: Side, attackerUid: string): AttackTarget[] {
  const me = state[side];
  const foe = state[other(side)];
  const fc = me.monsters.find(m => m.uid === attackerUid) ?? (me.item?.uid === attackerUid ? me.item : null);
  const card = fc ? getCard(fc.cardId) : undefined;
  const targets: AttackTarget[] = foe.monsters.map(m => ({ kind: "monster", position: m.position }));
  const centerBlocked = foe.monsters.some(m => m.position === 1);
  if (!centerBlocked || (card && hasKeyword(card, "ignoreCenter"))) targets.push({ kind: "fighter" });
  return targets;
}

// ประกาศโจมตี: ถ้าฝั่งป้องกันมี Counter Act ที่ใช้ได้ จะรอให้เลือกก่อน ไม่งั้นต่อสู้ทันที
export function declareAttack(state: GameState, side: Side, attackerUid: string, target?: AttackTarget): Result {
  const err = guardTurn(state, side, "attack");
  if (err) return { state, ok: false, msg: err };
  const lim = state.rules.firstTurnAttacks;
  if (state.turn === 1 && lim > 0 && state.attacksThisTurn >= lim)
    return { state, ok: false, msg: `ผู้เล่นคนแรกโจมตีได้ ${lim} ครั้งในเทิร์นแรก` };

  const g = structuredClone(state);
  const me = g[side];
  const oppSide = other(side);
  const foe = g[oppSide];

  const monster = me.monsters.find(m => m.uid === attackerUid);
  const attackerFc = monster ?? (me.item?.uid === attackerUid ? me.item : null);
  if (!attackerFc) return { state, ok: false, msg: "ไม่พบผู้โจมตี" };
  const card = getCard(attackerFc.cardId);
  if (!card) return { state, ok: false, msg: "ไม่พบข้อมูลการ์ด" };
  if (attackerFc.state !== "stand") return { state, ok: false, msg: "อยู่ในสถานะ Rest แล้ว" };

  const legal = legalTargets(state, side, attackerUid);
  const chosen: AttackTarget = target ??
    (foe.monsters.some(m => m.position === 1) ? { kind: "monster", position: 1 } : { kind: "fighter" });
  const isLegal = legal.some(t =>
    t.kind === chosen.kind && (t.kind === "fighter" || (chosen.kind === "monster" && t.position === chosen.position))
  );
  if (!isLegal) {
    return { state, ok: false, msg: chosen.kind === "fighter"
      ? "ตีผู้เล่นไม่ได้ ถ้าศัตรูยังมีมอนสเตอร์ช่องกลาง" : "ไม่มีมอนสเตอร์ในช่องที่เลือก" };
  }

  attackerFc.attacks++;
  g.attacksThisTurn++;
  const label = chosen.kind === "fighter" ? "ผู้เล่น" : `มอนสเตอร์ช่อง${POSITION_NAMES[chosen.position]}`;
  log(g, `⚔ ${card.name} โจมตี${label}!`);
  applyEffects(g, side, card, "onAttack", { fc: attackerFc }); // บัฟตอนประกาศโจมตี

  g.battle = { attackerSide: side, attackerUid, target: chosen, negated: false };

  if (g.rules.enableCounter && counterOptions(g, oppSide).length > 0) {
    log(g, `รอ ${nameOf(oppSide)} เลือกว่าจะใช้ Counter Act หรือไม่...`);
    return { state: g, ok: true, msg: "รอ Counter" };
  }
  resolveBattle(g);
  return { state: g, ok: true, msg: "โจมตีแล้ว" };
}

// ไม่ระบุเป้า = ช่องกลางหรือผู้เล่น (ใช้กับเทสต์/บอทแบบง่าย)
export function attack(state: GameState, side: Side, attackerUid: string, target?: AttackTarget): Result {
  return declareAttack(state, side, attackerUid, target);
}

// การ์ดในมือที่ใช้เป็น Counter Act ได้ตอนนี้ (มีสกิล onCounter และจ่ายค่าได้)
export function counterOptions(state: GameState, side: Side): number[] {
  if (!state.rules.enableCounter) return [];
  const p = state[side];
  const out: number[] = [];
  p.hand.forEach((id, i) => {
    const c = getCard(id);
    if (!c || !c.autoSkills?.some(s => s.trigger === "onCounter")) return;
    const afford = c.callCostType === "Gauge" ? p.gaugePile.length >= c.callCost : p.life > c.callCost;
    if (afford) out.push(i);
  });
  return out;
}

export function counterAct(state: GameState, side: Side, handIndex: number): Result {
  const b = state.battle;
  if (!b) return { state, ok: false, msg: "ไม่มีการโจมตีให้ Counter" };
  if (b.attackerSide === side) return { state, ok: false, msg: "Counter ได้เฉพาะฝั่งที่ถูกโจมตี" };
  if (!counterOptions(state, side).includes(handIndex)) return { state, ok: false, msg: "ใช้การ์ดนี้เป็น Counter ไม่ได้" };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = getCard(cardId)!;
  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: costErr };
  p.hand.splice(handIndex, 1);
  p.dropZone.push(cardId);
  log(g, `🛡 ${nameOf(side)} ใช้ Counter Act: ${card.name}!`);
  const tgt = b.target.kind === "monster" ? p.monsters.find(m => m.position === (b.target as { position: number }).position) : undefined;
  applyEffects(g, side, card, "onCounter", { fc: tgt });
  if (g.winner) { g.battle = null; return { state: g, ok: true, msg: "จบเกม" }; }
  // ถ้ายังมี Counter ให้ใช้ต่อได้ ไม่งั้นต่อสู้เลย
  if (counterOptions(g, side).length === 0) resolveBattle(g);
  return { state: g, ok: true, msg: `ใช้ ${card.name}` };
}

export function passCounter(state: GameState, side: Side): Result {
  const b = state.battle;
  if (!b) return { state, ok: false, msg: "ไม่มีการโจมตีให้ตัดสินใจ" };
  if (b.attackerSide === side) return { state, ok: false, msg: "ไม่ใช่ฝั่งป้องกัน" };
  const g = structuredClone(state);
  log(g, `${nameOf(side)} ไม่ใช้ Counter`);
  resolveBattle(g);
  return { state: g, ok: true, msg: "ต่อสู้" };
}

// คำนวณผลการต่อสู้ตาม g.battle (ทำงานบน state ที่ clone แล้ว)
function resolveBattle(g: GameState) {
  const b = g.battle;
  if (!b) return;
  g.battle = null;
  const side = b.attackerSide;
  const oppSide = other(side);
  const me = g[side];
  const foe = g[oppSide];

  const monster = me.monsters.find(m => m.uid === b.attackerUid);
  const attackerFc = monster ?? (me.item?.uid === b.attackerUid ? me.item : null);
  const card = attackerFc ? getCard(attackerFc.cardId) : undefined;
  if (!attackerFc || !card) { log(g, "ผู้โจมตีหายไปแล้ว การโจมตีไม่เกิดผล"); return; }

  const finish = (destroyed: boolean) => {
    if (destroyed) return;
    attackerFc.state = attackerFc.attacks < maxAttacks(card) ? "stand" : "rest";
    if (attackerFc.state === "stand") log(g, `${card.name} Stand กลับมาโจมตีต่อได้`);
  };

  if (b.negated) {
    log(g, `การโจมตีของ ${card.name} ถูกยกเลิก`);
    if (attackerFc.state === "stand") attackerFc.state = attackerFc.attacks < maxAttacks(card) ? "stand" : "rest";
    checkWin(g);
    return;
  }

  const atk = statsOf(attackerFc);
  const penetrate = hasKeyword(card, "penetrate");
  const lifelink = hasKeyword(card, "lifelink");
  let attackerDestroyed = false;
  const chosen = b.target;

  if (chosen.kind === "monster") {
    const tgt = foe.monsters.find(m => m.position === chosen.position);
    if (!tgt) {
      log(g, "เป้าหมายหายไปแล้ว การโจมตีไม่เกิดผล");
      finish(false);
      checkWin(g);
      return;
    }
    const tgtCard = getCard(tgt.cardId);
    const tgtStats = statsOf(tgt);
    const tgtName = tgtCard?.name ?? "มอนสเตอร์";

    let targetDestroyed = false;
    if (tgtCard && hasKeyword(tgtCard, "indestructibleBattle")) {
      log(g, `${tgtName} ไม่ถูกทำลายจากการต่อสู้`);
    } else if (atk.power >= tgtStats.defense) {
      targetDestroyed = mDestroyMonster(g, oppSide, tgt.uid);
      log(g, `Power ${atk.power} ≥ Def ${tgtStats.defense} → ทำลาย ${tgtName}`);
    } else {
      log(g, `Power ${atk.power} < Def ${tgtStats.defense} → ${tgtName} รอด`);
    }

    if (monster && !g.winner && tgtStats.power >= atk.defense && !hasKeyword(card, "indestructibleBattle")) {
      attackerDestroyed = mDestroyMonster(g, side, monster.uid);
      if (attackerDestroyed) log(g, `Power ${tgtStats.power} ≥ Def ${atk.defense} → ${card.name} ถูกทำลายจากการตอบโต้`);
    }

    if (targetDestroyed) {
      if (!attackerDestroyed) applyEffects(g, side, card, "onDestroyEnemy", { fc: attackerFc });
      if (penetrate && chosen.position === 1 && !g.winner) {
        log(g, `${card.name} Penetrate! ทะลวงเกราะ`);
        mLife(g, oppSide, -atk.critical);
        if (lifelink && atk.critical > 0) mLife(g, side, atk.critical);
        if (!g.winner && !attackerDestroyed) applyEffects(g, side, card, "onDamage", { fc: attackerFc });
      }
    }
  } else {
    log(g, `${card.name} ทำดาเมจใส่ผู้เล่น ${atk.critical}`);
    mLife(g, oppSide, -atk.critical);
    if (lifelink && atk.critical > 0 && !g.winner) mLife(g, side, atk.critical);
    if (!g.winner) applyEffects(g, side, card, "onDamage", { fc: attackerFc });
  }

  finish(attackerDestroyed);
  checkWin(g);
}

/* ------------------------------------------------------------------ */
/* Sandbox manual actions                                              */
/* ------------------------------------------------------------------ */
export function sandboxMoveCard(
  state: GameState,
  side: Side,
  from: "hand" | "field" | "dropZone" | "deck" | "gauge",
  to: "hand" | "dropZone" | "gauge" | "field" | "deck",
  uidOrIndex: string | number
): GameState {
  const g = structuredClone(state);
  const p = g[side];
  let cardId: string | null = null;

  if (from === "hand") {
    const idx = typeof uidOrIndex === "number" ? uidOrIndex : parseInt(uidOrIndex);
    cardId = p.hand.splice(idx, 1)[0] ?? null;
  } else if (from === "field") {
    const m = p.monsters.find(mo => mo.uid === uidOrIndex);
    if (m) {
      cardId = m.cardId;
      p.monsters = p.monsters.filter(mo => mo.uid !== uidOrIndex);
    } else if (p.item?.uid === uidOrIndex) {
      cardId = p.item.cardId;
      p.item = null;
    }
  } else if (from === "dropZone") {
    const idx = typeof uidOrIndex === "number" ? uidOrIndex : parseInt(uidOrIndex);
    cardId = p.dropZone.splice(idx, 1)[0] ?? null;
  } else if (from === "gauge") {
    const idx = typeof uidOrIndex === "number" ? uidOrIndex : parseInt(uidOrIndex);
    cardId = p.gaugePile.splice(idx, 1)[0] ?? null;
    syncGauge(p);
  } else if (from === "deck") {
    cardId = p.deck.splice(0, 1)[0] ?? null;
  }

  if (!cardId) return state;

  if (to === "hand") p.hand.push(cardId);
  else if (to === "dropZone") p.dropZone.push(cardId);
  else if (to === "deck") p.deck.unshift(cardId);
  else if (to === "gauge") { p.gaugePile.push(cardId); syncGauge(p); }
  else if (to === "field") {
    const free = [1, 0, 2].find(pos => !p.monsters.some(m => m.position === pos));
    if (free !== undefined) p.monsters.push(newFieldCard(cardId, free));
    else p.hand.push(cardId);
  }

  log(g, `[Sandbox] ${nameOf(side)} ย้ายการ์ดจาก ${from} ไป ${to}`);
  return g;
}

export function sandboxPayGauge(state: GameState, side: Side, n = 1): GameState {
  const g = structuredClone(state);
  mPayGauge(g, side, n);
  return g;
}

export function sandboxFlipRest(state: GameState, side: Side, monsterUid: string): GameState {
  const g = structuredClone(state);
  const p = g[side];
  const m = p.monsters.find(mo => mo.uid === monsterUid) ?? (p.item?.uid === monsterUid ? p.item : null);
  if (m) m.state = m.state === "stand" ? "rest" : "stand";
  return g;
}

export function sandboxAdjustPower(state: GameState, side: Side, monsterUid: string, delta: number): GameState {
  const g = structuredClone(state);
  const m = g[side].monsters.find(mo => mo.uid === monsterUid);
  if (m) m.tempPower += delta;
  return g;
}

// ย้ายมอนสเตอร์ไปช่องที่เลือก (ถ้ามีตัวอยู่ จะสลับกัน)
export function sandboxMoveToPosition(state: GameState, side: Side, monsterUid: string, pos: number): GameState {
  const g = structuredClone(state);
  const p = g[side];
  const m = p.monsters.find(mo => mo.uid === monsterUid);
  if (!m || m.position === pos) return state;
  const occ = p.monsters.find(mo => mo.position === pos);
  if (occ) occ.position = m.position;
  m.position = pos;
  return g;
}

export function sandboxFreeDraw(state: GameState, side: Side): GameState {
  const g = structuredClone(state);
  mDraw(g, side, 1, false);
  return g;
}
