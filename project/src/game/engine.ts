import type {
  GameState, PlayerState, Card, Flag, Deck, FieldCard, AutoEffectType, AutoTrigger, RuleSet, AttackTarget, FxEvent, FxInput,
} from "@/types";
import { DEFAULT_RULES } from "@/types";
import { uid } from "@/storage";

export type Side = "host" | "guest";
export type { AttackTarget };
export type Result = { state: GameState; ok: boolean; msg: string };
export type CounterOption =
  | { zone: "hand"; index: number }
  | { zone: "set"; index: number }
  | { zone: "field"; uid: string };

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
function fx(g: GameState, e: FxInput) {
  const id = (g.fxSeq ?? 0) + 1;
  g.fxSeq = id;
  g.fx = [...(g.fx ?? []), { ...e, id } as FxEvent].slice(-30);
}
const posOf = (g: GameState, side: Side, fc: FieldCard) => (g[side].item?.uid === fc.uid ? -1 : fc.position);

function log(g: GameState, msg: string) {
  g.log = [...g.log, msg].slice(-80);
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
  if (drawn > 0) { log(g, `${nameOf(side)} จั่วการ์ด ${drawn} ใบ`); fx(g, { k: "draw", side, n: drawn }); }
  return drawn;
}

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
  if (moved > 0) { log(g, `${nameOf(side)} Charge เกจ +${moved}`); fx(g, { k: "charge", side, n: moved }); }
  return moved;
}

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
  if (delta !== 0) fx(g, { k: "life", side, delta });
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
    tempPower: 0, tempCritical: 0, tempDefense: 0, attacks: 0, soul: [],
  };
}

function findFc(p: PlayerState, fcUid: string): FieldCard | null {
  return p.monsters.find(m => m.uid === fcUid) ?? (p.item?.uid === fcUid ? p.item : null);
}

/* ------------------------------------------------------------------ */
/* Soul / destroy / effects                                            */
/* ------------------------------------------------------------------ */
function mRemoveSoul(g: GameState, side: Side, fc: FieldCard, n: number): number {
  const p = g[side];
  let moved = 0;
  for (let i = 0; i < n && fc.soul.length > 0; i++) {
    p.dropZone.push(fc.soul.pop()!);
    moved++;
  }
  if (moved > 0) {
    const card = getCard(fc.cardId);
    log(g, `${card?.name ?? "การ์ด"} ถูกถอด Soul ${moved} ใบลงสุสาน`);
    fx(g, { k: "soulOut", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved });
    if (card) applyEffects(g, side, card, "onSoulRemoved", { fc });
  }
  return moved;
}

function mDestroyMonster(g: GameState, side: Side, monsterUid: string): boolean {
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  if (!m) return false;
  const card = getCard(m.cardId);

  // Soulguard: ถอด Soul 1 ใบลงสุสานแทนการถูกทำลาย
  if (card && hasKeyword(card, "soulguard") && m.soul.length >= 1) {
    log(g, `${card.name} ใช้ Soulguard! ถอด Soul 1 ใบแทนการถูกทำลาย (เหลือ Soul ${m.soul.length - 1})`);
    fx(g, { k: "guard", side, uid: m.uid, pos: m.position, left: m.soul.length - 1 });
    mRemoveSoul(g, side, m, 1);
    return false;
  }

  fx(g, { k: "destroy", side, uid: m.uid, cardId: m.cardId, pos: m.position });
  p.monsters = p.monsters.filter(x => x.uid !== monsterUid);
  p.dropZone.push(m.cardId, ...m.soul);
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
    for (const eff of skill.effects) {
      if (g.winner) return;
      const n = Math.max(0, Math.floor(eff.value));
      let abort = false;
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
        case "addSoul": {
          const fc = ctx?.fc;
          if (!fc) break;
          let moved = 0;
          for (let i = 0; i < n && g[side].deck.length > 0; i++) { fc.soul.push(g[side].deck.shift()!); moved++; }
          if (moved > 0) { log(g, `${card.name} ได้รับ Soul +${moved}`); fx(g, { k: "soulIn", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved }); }
          break;
        }
        case "removeSoul": {
          const fc = ctx?.fc;
          if (!fc || fc.soul.length < n) { abort = true; log(g, `${card.name}: Soul ไม่พอ เอฟเฟกต์ไม่ทำงาน`); break; }
          mRemoveSoul(g, side, fc, n);
          break;
        }
        case "negateAttack":
          if (g.battle) { g.battle.negated = true; log(g, `${card.name} ยกเลิกการโจมตี!`); fx(g, { k: "negate", side }); }
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
          g.battle.linkUids.forEach(u => {
            const a = findFc(g[atkSide], u);
            if (a) a.state = "rest";
          });
          log(g, `${card.name} Rest ผู้โจมตี`);
          break;
        }
        default:
          break; // penetrate / doubleAttack / soulguard / counterattack ฯลฯ เป็นคีย์เวิร์ด ถูกอ่านตอนต่อสู้
      }
      if (abort) break; // ถ้า "ค่าใช้จ่าย" ไม่ผ่าน เอฟเฟกต์ที่เหลือของสกิลนี้ไม่ทำงาน
    }
  });
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
export function createPlayerState(deck: Deck, flag: Flag, _cards: Card[]): PlayerState {
  const allCards = [...deck.cardIds];
  if (deck.buddyId && !allCards.includes(deck.buddyId)) allCards.push(deck.buddyId);
  // ค่าเริ่มต้นมาจาก Flag (Life / จั่ว / เกจ) — ถ้า Flag เก่าไม่มีค่า ใช้ค่ามาตรฐาน Buddyfight
  const num = (v: unknown, d: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? n : d; };
  const handN = num(flag.startHand, 6), gaugeN = num(flag.startGauge, 2);
  const hand = allCards.splice(0, Math.min(handN, allCards.length));
  const gaugePile = allCards.splice(0, Math.min(gaugeN, allCards.length));
  return {
    life: num(flag.life, 10) || 10,
    gauge: gaugePile.length,
    gaugePile,
    deck: allCards,
    hand,
    dropZone: [],
    setZone: [],
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
  p.monsters.forEach(m => { m.state = "stand"; m.attacks = 0; });
  if (p.item) { p.item.state = "stand"; p.item.attacks = 0; }
  g.attacksThisTurn = 0;
  g.battle = null;
  // ลำดับเทิร์น: Stand → Draw → Charge & Draw → Main → Attack → Final (ผู้เล่นคนแรกเทิร์นแรกข้าม Draw)
  g.phase = skipDraw ? "charge" : "draw";
  log(g, `— เทิร์น ${g.turn}: ${nameOf(side)} (Stand${skipDraw ? " · เทิร์นแรกไม่จั่ว" : ""}) —`);
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
  const r = { ...DEFAULT_RULES, ...rules };
  const first: Side = r.firstPlayer === "host" ? "host" : r.firstPlayer === "guest" ? "guest" : Math.random() < 0.5 ? "host" : "guest";
  const g: GameState = {
    turn: 1,
    currentTurn: first,
    phase: "charge",
    rules: r,
    mulligan: { host: false, guest: false },
    battle: null,
    firstPlayer: first,
    attacksThisTurn: 0,
    rev: 0,
    host: createPlayerState(hostDeck, hostFlag, cards),
    guest: createPlayerState(guestDeck, guestFlag, cards),
    log: [`เกมเริ่มต้นแล้ว! ${nameOf(first)} เริ่มก่อน (เทิร์นแรกไม่จั่ว) — เลือก Mulligan ก่อนเริ่มเล่น`],
    winner: null,
  };
  (["host", "guest"] as Side[]).forEach(s => {
    const f = s === "host" ? hostFlag : guestFlag;
    log(g, `${nameOf(s)} (${f?.name ?? "Flag"}): Life ${g[s].life} · มือเริ่มต้น ${g[s].hand.length} ใบ · เกจเริ่มต้น ${g[s].gauge} ใบ · เด็คเหลือ ${g[s].deck.length} ใบ`);
  });
  startTurn(g, true);
  return g;
}

export function addLog(state: GameState, msg: string): GameState {
  const g = structuredClone(state);
  log(g, msg);
  return g;
}

export function mulliganDone(state: GameState): boolean {
  return state.mulligan.host && state.mulligan.guest;
}

// Mulligan: เอาการ์ดที่เลือกคืนเด็ค สับ แล้วจั่วใหม่เท่าจำนวนเดิม (ทำได้ครั้งเดียว)
export function mulligan(state: GameState, side: Side, indices: number[]): Result {
  if (state.mulligan[side]) return { state, ok: false, msg: "เลือก Mulligan ไปแล้ว" };
  const g = structuredClone(state);
  const p = g[side];
  const uniq = [...new Set(indices)].filter(i => i >= 0 && i < p.hand.length).sort((a, b) => b - a);
  const back = uniq.map(i => p.hand.splice(i, 1)[0]);
  if (back.length > 0) {
    p.deck.push(...back);
    for (let i = p.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
    }
    for (let i = 0; i < back.length && p.deck.length > 0; i++) p.hand.push(p.deck.shift()!);
  }
  g.mulligan[side] = true;
  log(g, `${nameOf(side)} ${back.length > 0 ? `Mulligan เปลี่ยนการ์ด ${back.length} ใบ` : "เก็บมือเดิม"}`);
  return { state: g, ok: true, msg: "Mulligan เสร็จแล้ว" };
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
function baseGuard(state: GameState, side: Side): string | null {
  if (state.winner) return "เกมจบแล้ว";
  if (!mulliganDone(state)) return "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน";
  if (state.currentTurn !== side) return "ยังไม่ใช่เทิร์นของคุณ";
  return null;
}

// Draw Phase: จั่วการ์ด 1 ใบ แล้วเข้า Charge & Draw
export function drawPhase(state: GameState, side: Side): Result {
  const bg = baseGuard(state, side);
  if (bg) return { state, ok: false, msg: bg };
  if (state.phase !== "draw") return { state, ok: false, msg: "ตอนนี้ไม่ใช่ Draw Phase" };
  const g = structuredClone(state);
  log(g, `${nameOf(side)} Draw Phase`);
  mDraw(g, side, 1);
  if (!g.winner) g.phase = "charge";
  return { state: g, ok: true, msg: "จั่วการ์ดแล้ว เข้าสู่ Charge & Draw" };
}

export function chargeAndDraw(state: GameState, side: Side, handIndex: number | null): Result {
  const bg = baseGuard(state, side);
  if (bg) return { state, ok: false, msg: bg };
  if (state.phase === "draw") return { state, ok: false, msg: "ต้องจั่วการ์ดใน Draw Phase ก่อน (กดปุ่ม 'Draw')" };
  if (state.phase !== "charge") return { state, ok: false, msg: "ผ่านช่วง Charge & Draw ไปแล้ว" };
  const g = structuredClone(state);
  const p = g[side];
  if (handIndex !== null) {
    if (handIndex < 0 || handIndex >= p.hand.length) return { state, ok: false, msg: "ไม่พบการ์ดในมือ" };
    p.gaugePile.push(p.hand.splice(handIndex, 1)[0]);
    syncGauge(p);
    fx(g, { k: "charge", side, n: 1 });
    log(g, `${nameOf(side)} Charge การ์ด 1 ใบลงเกจ`);
    mDraw(g, side, 1);
  } else {
    log(g, `${nameOf(side)} ข้าม Charge & Draw`);
  }
  g.phase = "main";
  return { state: g, ok: true, msg: "เข้าสู่ Main Phase" };
}

export function goToAttack(state: GameState, side: Side): Result {
  const bg = baseGuard(state, side);
  if (bg) return { state, ok: false, msg: bg };
  if (state.battle) return { state, ok: false, msg: "กำลังรอ Counter" };
  if (state.phase !== "main") return { state, ok: false, msg: "ไป Attack Phase ได้จาก Main Phase เท่านั้น" };
  const g = structuredClone(state);
  g.phase = "attack";
  log(g, `${nameOf(side)} เข้าสู่ Attack Phase`);
  return { state: g, ok: true, msg: "Attack Phase" };
}

export function goToFinal(state: GameState, side: Side): Result {
  const bg = baseGuard(state, side);
  if (bg) return { state, ok: false, msg: bg };
  if (state.battle) return { state, ok: false, msg: "กำลังรอ Counter" };
  if (state.phase === "final") return { state, ok: false, msg: "อยู่ Final Phase แล้ว" };
  if (state.phase === "draw" || state.phase === "charge") return { state, ok: false, msg: "ต้องผ่านช่วง Draw และ Charge & Draw ก่อน" };
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
  if (state.battle || !mulliganDone(state)) return state;
  const g = structuredClone(state);
  if (g.winner) return g;
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
  const bg = baseGuard(state, side);
  if (bg) return bg;
  if (state.battle) return "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter";
  if (state.phase === "draw") return "ยังอยู่ใน Draw Phase — ต้องจั่วการ์ดก่อน (กดปุ่ม 'Draw') แล้วผ่าน Charge & Draw จึงจะลงการ์ดได้";
  if (state.phase === "charge") return "ต้องผ่านช่วง Charge & Draw ก่อน (กด 'ข้าม' ถ้าไม่ Charge)";
  if (needPhase === "main" && state.phase !== "main") return "ลงการ์ด/ร่ายเวทได้เฉพาะ Main Phase";
  if (needPhase === "attack" && state.phase !== (state.rules.useAttackPhase ? "attack" : "main"))
    return state.rules.useAttackPhase ? "โจมตีได้เฉพาะ Attack Phase" : "โจมตีได้เฉพาะ Main Phase";
  if (needPhase === "final" && state.phase !== "final") return "Impact ใช้ได้เฉพาะ Final Phase";
  return null;
}

// ตรวจค่าใช้จ่าย: คืนข้อความอธิบายถ้าจ่ายไม่ได้
function costProblem(g: GameState, side: Side, card: Card): string | null {
  const p = g[side];
  if (card.callCostType === "Gauge") {
    if (p.gaugePile.length < card.callCost)
      return `เกจไม่พอ: ต้องจ่ายเกจ ${card.callCost} แต่คุณมีเกจเพียง ${p.gaugePile.length}`;
  } else if (p.life <= card.callCost) {
    return `Life ไม่พอ: ต้องจ่าย Life ${card.callCost} แต่คุณมี Life ${p.life} (หลังจ่ายต้องเหลืออย่างน้อย 1)`;
  }
  return null;
}

function payCost(g: GameState, side: Side, card: Card): string | null {
  const bad = costProblem(g, side, card);
  if (bad) return bad;
  if (card.callCostType === "Gauge") mPayGauge(g, side, card.callCost);
  else g[side].life -= card.callCost;
  return null;
}

export function callMonster(state: GameState, side: Side, handIndex: number, position: number): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (card.type !== "Monster") return { state, ok: false, msg: `${card.name} ไม่ใช่มอนสเตอร์ จึงลงช่องมอนสเตอร์ไม่ได้` };
  if (p.monsters.some(m => m.position === position))
    return { state, ok: false, msg: `ช่อง${POSITION_NAMES[position]}มีมอนสเตอร์อยู่แล้ว` };

  // Size 0 วางได้เสมอ ไม่นับรวมขีดจำกัด Size
  const currentSize = totalMonsterSize(p);
  if (card.size > 0 && currentSize + card.size > g.rules.maxSize)
    return { state, ok: false, msg: `Size เกิน: ในสนามมี Size รวม ${currentSize} + ${card.name} (Size ${card.size}) = ${currentSize + card.size} เกินขีดจำกัด ${g.rules.maxSize}` };

  const soulN = Math.max(0, card.callSoulFromDeck ?? 0);
  if (soulN > 0 && p.deck.length < soulN)
    return { state, ok: false, msg: `เด็คไม่พอสำหรับ Call Cost: ต้องนำการ์ดบนเด็ค ${soulN} ใบเข้า Soul แต่เด็คเหลือ ${p.deck.length} ใบ` };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: costErr };

  p.hand.splice(handIndex, 1);
  const fc = newFieldCard(cardId, position);
  if (soulN > 0) {
    fc.soul = p.deck.splice(0, soulN);
    log(g, `${card.name} ได้ Soul ${soulN} ใบจากเด็ค (Call Cost)`);
  }
  p.monsters.push(fc);
  log(g, `${card.name} ลงสนาม (ช่อง${POSITION_NAMES[position]})`);

  const isBuddyCall = p.buddyId === cardId && !p.buddyCalledThisGame;
  fx(g, { k: "call", side, uid: fc.uid, pos: position, buddy: isBuddyCall });
  if (soulN > 0) fx(g, { k: "soulIn", side, uid: fc.uid, pos: position, n: soulN });
  if (isBuddyCall) {
    p.buddyCalledThisGame = true;
    log(g, `Buddy Call "${card.name}"! ได้รับ Buddy Gift`);
    if (g.rules.buddyCallLife > 0) mLife(g, side, g.rules.buddyCallLife);
  }
  applyEffects(g, side, card, "onCall", { fc });
  if (isBuddyCall) applyEffects(g, side, card, "onBuddyCall", { fc });
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
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (card.type !== "Spell" && card.type !== "Impact") return { state, ok: false, msg: `${card.name} ไม่ใช่เวทมนตร์/Impact` };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: `ร่าย ${card.name} ไม่ได้ — ${costErr}` };

  p.hand.splice(handIndex, 1);
  p.dropZone.push(cardId);
  log(g, `${card.name} ถูกร่าย!`);
  fx(g, { k: "cast", side, cardId, label: card.type === "Impact" ? "IMPACT!" : "SPELL!" });
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
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (card.type !== "Item") return { state, ok: false, msg: `${card.name} ไม่ใช่ไอเทม` };

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: `ติดตั้ง ${card.name} ไม่ได้ — ${costErr}` };

  if (p.item) p.dropZone.push(p.item.cardId, ...p.item.soul);
  p.hand.splice(handIndex, 1);
  p.item = newFieldCard(cardId, 0);
  log(g, `${card.name} ถูกติดตั้ง!`);
  applyEffects(g, side, card, "onCall", { fc: p.item });
  return { state: g, ok: true, msg: `ติดตั้ง ${card.name}` };
}

// Move: ย้ายมอนสเตอร์ไปช่องอื่น (ถ้ามีตัวอยู่ จะสลับกัน) 1 ครั้งต่อเทิร์น ใน Main Phase
export function moveMonster(state: GameState, side: Side, monsterUid: string, position: number): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  const card = m ? getCard(m.cardId) : undefined;
  if (!m || !card) return { state, ok: false, msg: "ไม่พบมอนสเตอร์" };
  if (!hasKeyword(card, "move")) return { state, ok: false, msg: `${card.name} ไม่มีความสามารถ Move` };
  if (m.movedTurn === g.turn) return { state, ok: false, msg: `${card.name} ใช้ Move ไปแล้วในเทิร์นนี้` };
  if (m.position === position) return { state, ok: false, msg: "มอนสเตอร์อยู่ช่องนั้นอยู่แล้ว" };
  const occ = p.monsters.find(x => x.position === position);
  if (occ) occ.position = m.position;
  m.position = position;
  m.movedTurn = g.turn;
  log(g, `${card.name} Move ไปช่อง${POSITION_NAMES[position]}${occ ? " (สลับตำแหน่ง)" : ""}`);
  return { state: g, ok: true, msg: "Move" };
}

// Set: วางการ์ด Counter Act คว่ำไว้ในช่อง Set (จ่ายค่าใช้จ่ายตอน Set) แล้วใช้ตอนศัตรูโจมตีได้
export function setCard(state: GameState, side: Side, handIndex: number): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (!card.autoSkills?.some(s => s.trigger === "onCounter"))
    return { state, ok: false, msg: `${card.name} ไม่มีสกิล Counter Act จึง Set ไม่ได้` };
  if (p.setZone.length >= g.rules.maxSet)
    return { state, ok: false, msg: `ช่อง Set เต็มแล้ว (สูงสุด ${g.rules.maxSet} ใบ)` };
  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: `Set ${card.name} ไม่ได้ — ${costErr}` };
  p.hand.splice(handIndex, 1);
  p.setZone.push(cardId);
  log(g, `${nameOf(side)} Set การ์ด 1 ใบ (คว่ำ)`);
  return { state: g, ok: true, msg: `Set ${card.name}` };
}

/* ------------------------------------------------------------------ */
/* Battle                                                              */
/* ------------------------------------------------------------------ */
export function legalTargets(state: GameState, side: Side, attackerUid: string, linkUids: string[] = []): AttackTarget[] {
  const me = state[side];
  const foe = state[other(side)];
  const uids = [...new Set([attackerUid, ...linkUids])];
  const ignore = uids.some(u => {
    const fc = findFc(me, u);
    const c = fc ? getCard(fc.cardId) : undefined;
    return !!c && hasKeyword(c, "ignoreCenter");
  });
  const targets: AttackTarget[] = foe.monsters.map(m => ({ kind: "monster", position: m.position }));
  const centerBlocked = foe.monsters.some(m => m.position === 1);
  if (!centerBlocked || ignore) targets.push({ kind: "fighter" });
  return targets;
}

// ประกาศโจมตี (ใส่ linkUids เพื่อ Link Attack): ผู้โจมตีทุกตัวจะ Rest ทันที
export function declareAttack(
  state: GameState, side: Side, attackerUid: string, target?: AttackTarget, linkUids: string[] = []
): Result {
  const err = guardTurn(state, side, "attack");
  if (err) return { state, ok: false, msg: err };
  const lim = state.rules.firstTurnAttacks;
  if (state.turn === 1 && lim > 0 && state.attacksThisTurn >= lim)
    return { state, ok: false, msg: `ผู้เล่นคนแรกโจมตีได้ ${lim} ครั้งในเทิร์นแรกเท่านั้น (Link Attack นับเป็น 1 ครั้ง)` };

  const g = structuredClone(state);
  const me = g[side];
  const oppSide = other(side);
  const foe = g[oppSide];

  const uids = [...new Set([attackerUid, ...linkUids])];
  const fcs: FieldCard[] = [];
  for (const u of uids) {
    const fc = findFc(me, u);
    if (!fc) return { state, ok: false, msg: "ไม่พบผู้โจมตี" };
    const c = getCard(fc.cardId);
    if (!c) return { state, ok: false, msg: "ไม่พบข้อมูลการ์ด" };
    if (fc.state !== "stand") return { state, ok: false, msg: `${c.name} อยู่ในสถานะ Rest โจมตีไม่ได้` };
    fcs.push(fc);
  }
  const lead = fcs[0];
  const leadCard = getCard(lead.cardId)!;

  const legal = legalTargets(state, side, attackerUid, uids);
  const chosen: AttackTarget = target ??
    (foe.monsters.some(m => m.position === 1) ? { kind: "monster", position: 1 } : { kind: "fighter" });
  const isLegal = legal.some(t =>
    t.kind === chosen.kind && (t.kind === "fighter" || (chosen.kind === "monster" && t.position === chosen.position))
  );
  if (!isLegal) {
    return { state, ok: false, msg: chosen.kind === "fighter"
      ? "ตีผู้เล่นไม่ได้ เพราะศัตรูยังมีมอนสเตอร์ช่องกลาง (ต้องทำลายช่องกลางก่อน)" : "ไม่มีมอนสเตอร์ในช่องที่เลือก" };
  }

  // ผู้โจมตีทุกตัว Rest ตอนประกาศโจมตี (กลับมา Stand ตอนจบการต่อสู้ ถ้ายังโจมตีได้อีก)
  fcs.forEach(fc => { fc.attacks++; fc.state = "rest"; });
  g.attacksThisTurn++;
  const label = chosen.kind === "fighter" ? "ผู้เล่น" : `มอนสเตอร์ช่อง${POSITION_NAMES[chosen.position]}`;
  const names = fcs.map(f => getCard(f.cardId)!.name).join(" + ");
  log(g, `${fcs.length > 1 ? "⚔ Link Attack! " : "⚔ "}${names} โจมตี${label}!`);
  fcs.forEach(fc => {
    const c = getCard(fc.cardId);
    if (c) applyEffects(g, side, c, "onAttack", { fc });
  });
  void leadCard;

  g.battle = { attackerSide: side, attackerUid: lead.uid, linkUids: uids, target: chosen, negated: false };
  fx(g, { k: "attack", side, uids, units: fcs.map(f => ({ uid: f.uid, cardId: f.cardId, pos: posOf(g, side, f) })), target: chosen });

  if (g.rules.enableCounter && counterOptions(g, oppSide).length > 0) {
    log(g, `รอ ${nameOf(oppSide)} เลือกว่าจะใช้ Counter Act หรือไม่...`);
    return { state: g, ok: true, msg: "รอ Counter" };
  }
  resolveBattle(g);
  return { state: g, ok: true, msg: "โจมตีแล้ว" };
}

export function attack(state: GameState, side: Side, attackerUid: string, target?: AttackTarget): Result {
  return declareAttack(state, side, attackerUid, target);
}

function skillNeedsSoul(card: Card): number {
  let need = 0;
  card.autoSkills?.forEach(s => {
    if (s.trigger !== "onCounter") return;
    let n = 0;
    s.effects.forEach(e => { if (e.type === "removeSoul") n += Math.floor(e.value); });
    need = Math.max(need, n);
  });
  return need;
}

// ตัวเลือก Counter Act ของฝั่ง side: จากมือ / ช่อง Set / การ์ดบนสนาม
export function counterOptions(state: GameState, side: Side): CounterOption[] {
  if (!state.rules.enableCounter || !state.battle) return [];
  const p = state[side];
  const out: CounterOption[] = [];
  p.hand.forEach((id, i) => {
    const c = getCard(id);
    if (!c || !c.autoSkills?.some(s => s.trigger === "onCounter")) return;
    const afford = c.callCostType === "Gauge" ? p.gaugePile.length >= c.callCost : p.life > c.callCost;
    if (afford) out.push({ zone: "hand", index: i });
  });
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (c?.autoSkills?.some(s => s.trigger === "onCounter")) out.push({ zone: "set", index: i });
  });
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
    const c = getCard(fc.cardId);
    if (!c || !c.autoSkills?.some(s => s.trigger === "onCounter")) return;
    if (fc.counterUsedTurn === state.turn) return;
    if (fc.soul.length < skillNeedsSoul(c)) return;
    out.push({ zone: "field", uid: fc.uid });
  });
  return out;
}

export function counterCardOf(state: GameState, side: Side, opt: CounterOption): Card | undefined {
  const p = state[side];
  if (opt.zone === "hand") return getCard(p.hand[opt.index]);
  if (opt.zone === "set") return getCard(p.setZone[opt.index]);
  const fc = findFc(p, opt.uid);
  return fc ? getCard(fc.cardId) : undefined;
}

function sameOption(a: CounterOption, b: CounterOption) {
  if (a.zone !== b.zone) return false;
  if (a.zone === "field" && b.zone === "field") return a.uid === b.uid;
  if (a.zone !== "field" && b.zone !== "field") return a.index === b.index;
  return false;
}

export function counterAct(state: GameState, side: Side, opt: CounterOption): Result {
  const b = state.battle;
  if (!b) return { state, ok: false, msg: "ไม่มีการโจมตีให้ Counter" };
  if (b.attackerSide === side) return { state, ok: false, msg: "Counter ได้เฉพาะฝั่งที่ถูกโจมตี" };
  if (!counterOptions(state, side).some(o => sameOption(o, opt))) return { state, ok: false, msg: "ใช้การ์ดนี้เป็น Counter ไม่ได้ในตอนนี้ (เช่น เกจ/Soul ไม่พอ หรือใช้ไปแล้วในเทิร์นนี้)" };
  const g = structuredClone(state);
  const p = g[side];
  const tgt = b.target.kind === "monster" ? p.monsters.find(m => m.position === (b.target as { position: number }).position) : undefined;

  if (opt.zone === "hand") {
    const cardId = p.hand[opt.index];
    const card = getCard(cardId)!;
    const costErr = payCost(g, side, card);
    if (costErr) return { state, ok: false, msg: costErr };
    p.hand.splice(opt.index, 1);
    p.dropZone.push(cardId);
    log(g, `🛡 ${nameOf(side)} ใช้ Counter Act จากมือ: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    applyEffects(g, side, card, "onCounter", { fc: tgt });
  } else if (opt.zone === "set") {
    const cardId = p.setZone[opt.index];
    const card = getCard(cardId)!;
    p.setZone.splice(opt.index, 1);
    p.dropZone.push(cardId);
    log(g, `🛡 ${nameOf(side)} เปิดการ์ด Set: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    applyEffects(g, side, card, "onCounter", { fc: tgt });
  } else {
    const fc = findFc(p, opt.uid)!;
    const card = getCard(fc.cardId)!;
    fc.counterUsedTurn = g.turn;
    log(g, `🛡 ${nameOf(side)} ใช้ Counter Act ของ ${card.name} บนสนาม!`);
    applyEffects(g, side, card, "onCounter", { fc });
  }
  if (g.winner) { g.battle = null; return { state: g, ok: true, msg: "จบเกม" }; }
  if (counterOptions(g, side).length === 0) resolveBattle(g);
  return { state: g, ok: true, msg: "ใช้ Counter" };
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

// คำนวณผลการต่อสู้ (รองรับ Link Attack: รวม Power และ Critical ของผู้โจมตีทุกตัว)
function resolveBattle(g: GameState) {
  const b = g.battle;
  if (!b) return;
  g.battle = null;
  const side = b.attackerSide;
  const oppSide = other(side);
  const me = g[side];
  const foe = g[oppSide];

  const parts = b.linkUids
    .map(u => findFc(me, u))
    .filter((x): x is FieldCard => !!x)
    .map(fc => ({ fc, card: getCard(fc.cardId)!, isItem: me.item?.uid === fc.uid }))
    .filter(x => !!x.card);
  if (parts.length === 0) { log(g, "ผู้โจมตีหายไปแล้ว การโจมตีไม่เกิดผล"); return; }

  // จบการต่อสู้: ตัวที่ยังอยู่และยังโจมตีได้อีกจะ Stand กลับ ที่เหลือ Rest ค้างไว้จนเทิร์นถัดไปของเรา
  const finish = () => {
    parts.forEach(({ fc, card }) => {
      const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
      if (!alive) return;
      if (fc.attacks < maxAttacks(card)) {
        fc.state = "stand";
        log(g, `${card.name} Stand กลับมา (โจมตีได้อีก ${maxAttacks(card) - fc.attacks} ครั้ง)`);
      } else {
        fc.state = "rest";
      }
    });
    checkWin(g);
  };

  if (b.negated) {
    log(g, "การโจมตีถูกยกเลิก");
    finish();
    return;
  }

  const total = parts.reduce((a, { fc }) => {
    const s = statsOf(fc);
    return { power: a.power + s.power, critical: a.critical + s.critical };
  }, { power: 0, critical: 0 });
  const penetrate = parts.some(x => hasKeyword(x.card, "penetrate"));
  const lifelink = parts.some(x => hasKeyword(x.card, "lifelink"));
  const chosen = b.target;
  const linkNote = parts.length > 1 ? ` (Link Attack รวม Power ${total.power} / Critical ${total.critical})` : "";

  if (chosen.kind === "monster") {
    const tgt = foe.monsters.find(m => m.position === chosen.position);
    if (!tgt) {
      log(g, "เป้าหมายหายไปแล้ว การโจมตีไม่เกิดผล");
      finish();
      return;
    }
    const tgtCard = getCard(tgt.cardId);
    const tgtStats = statsOf(tgt);
    const tgtName = tgtCard?.name ?? "มอนสเตอร์";

    // ผู้โจมตีทำดาเมจใส่เป้าหมาย: Power ≥ Defense ของเป้า -> เป้าถูกทำลาย
    let targetDestroyed = false;
    if (tgtCard && hasKeyword(tgtCard, "indestructibleBattle")) {
      log(g, `${tgtName} ไม่ถูกทำลายจากการต่อสู้`);
    } else if (total.power >= tgtStats.defense) {
      log(g, `Power ${total.power} ≥ Def ${tgtStats.defense} → ทำลาย ${tgtName}${linkNote}`);
      targetDestroyed = mDestroyMonster(g, oppSide, tgt.uid);
    } else {
      log(g, `Power ${total.power} < Def ${tgtStats.defense} → ${tgtName} รอด${linkNote}`);
    }

    // ตอบโต้: เฉพาะเป้าหมายที่มี Counterattack เท่านั้น ถึงจะทำลายผู้โจมตีกลับได้
    if (tgtCard && hasKeyword(tgtCard, "counterattack") && !g.winner) {
      parts.forEach(({ fc, card, isItem }) => {
        if (isItem || hasKeyword(card, "indestructibleBattle")) return;
        const st = statsOf(fc);
        if (tgtStats.power >= st.defense) {
          log(g, `Counterattack! ${tgtName} Power ${tgtStats.power} ≥ Def ${st.defense} → ${card.name} ถูกทำลาย`);
          mDestroyMonster(g, side, fc.uid);
        }
      });
    }

    if (targetDestroyed) {
      parts.forEach(({ fc, card }) => {
        const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
        if (alive) applyEffects(g, side, card, "onDestroyEnemy", { fc });
      });
      if (penetrate && chosen.position === 1 && !g.winner) {
        log(g, `Penetrate! ทะลวงเกราะ ดาเมจ ${total.critical}`);
        mLife(g, oppSide, -total.critical);
        if (lifelink && total.critical > 0 && !g.winner) mLife(g, side, total.critical);
        if (!g.winner) parts.forEach(({ fc, card }) => {
          const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
          if (alive) applyEffects(g, side, card, "onDamage", { fc });
        });
      }
    }
  } else {
    log(g, `ทำดาเมจใส่ผู้เล่น ${total.critical}${linkNote}`);
    mLife(g, oppSide, -total.critical);
    if (lifelink && total.critical > 0 && !g.winner) mLife(g, side, total.critical);
    if (!g.winner) parts.forEach(({ fc, card }) => {
      const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
      if (alive) applyEffects(g, side, card, "onDamage", { fc });
    });
  }

  finish();
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
      p.dropZone.push(...m.soul);
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
  const m = findFc(p, monsterUid);
  if (m) m.state = m.state === "stand" ? "rest" : "stand";
  return g;
}

export function sandboxAdjustPower(state: GameState, side: Side, monsterUid: string, delta: number): GameState {
  const g = structuredClone(state);
  const m = g[side].monsters.find(mo => mo.uid === monsterUid);
  if (m) m.tempPower += delta;
  return g;
}

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
