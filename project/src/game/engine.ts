import { condBuffAmounts, deckBuddies } from "@/types";
import type {
  GameState, PlayerState, Card, Flag, Deck, FieldCard, AutoEffectType, AutoTrigger, RuleSet, AttackTarget, FxEvent, FxInput, AutoSkill, CounterTiming, AutoEffect,
} from "@/types";
import { DEFAULT_RULES, callCostAmounts, canTransform, transformCostAmounts } from "@/types";
import { uid } from "@/storage";
import { skillLines } from "@/game/helpers";

export type Side = "host" | "guest";
export type { AttackTarget };
export type Result = { state: GameState; ok: boolean; msg: string };
export type CounterOption = (
  | { zone: "hand"; index: number }
  | { zone: "set"; index: number }       // การ์ดคว่ำในช่อง Set ใช้เป็น 【Counter】 (ใช้แล้วลงสุสาน)
  | { zone: "setAct"; index: number }    // การ์ด Set ที่เปิดอยู่: ใช้ Counter 【Act】 ของมัน (การ์ดยังอยู่ในช่อง Set ใช้ได้ 1 ครั้งต่อเทิร์น)
  | { zone: "field"; uid: string }
) & { discard?: number[]; skill?: number }; // skill = ดัชนีสกิล Counter Act (ใน autoSkills) เมื่อการ์ดมี Act หลายอัน // discard = ตำแหน่งการ์ดในมือที่เลือกทิ้งเป็นค่าใช้จ่าย (เมื่อสกิลมี "ทิ้งการ์ดบนมือ")

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

// การ์ดของ FieldCard รวมความสามารถที่ได้รับจาก Soul (soulGrant) — ใช้เมื่อต้องอ่านสกิลของการ์ดบนสนาม
export function cardOfFc(fc: FieldCard): Card | undefined {
  const c = getCard(fc.cardId);
  if (!c || !fc.grantedSkills || fc.grantedSkills.length === 0) return c;
  return { ...c, autoSkills: [...(c.autoSkills ?? []), ...fc.grantedSkills] };
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
  const c = cardOfFc(fc);
  if (!c) return { power: 0, defense: 0, critical: 0 };
  return {
    power: c.power + fc.tempPower + (fc.manualPower ?? 0) + (fc.auraPower ?? 0) + continuousSum(c, "buffPower") + continuousSum(c, "powerPerSoul") * fc.soul.length,
    defense: c.defense + (fc.tempDefense ?? 0) + (fc.manualDefense ?? 0) + (fc.auraDefense ?? 0) + continuousSum(c, "buffDefense"),
    critical: c.critical + (fc.tempCritical ?? 0) + (fc.manualCritical ?? 0) + (fc.auraCritical ?? 0) + continuousSum(c, "buffCritical") + continuousSum(c, "criticalPerSoul") * fc.soul.length,
  };
}

// ค่าของคีย์เวิร์ด (เช่น Soulguard 2 / Lifelink 3) = ค่าสูงสุดที่ตั้งไว้ในการ์ด, 0 = ไม่มีคีย์เวิร์ดนี้
export function keywordValue(card: Card, type: AutoEffectType): number {
  let v = 0;
  card.autoSkills?.forEach(s => {
    if (s.trigger !== "continuous" && s.trigger !== "onAttack") return;
    s.effects.forEach(e => { if (e.type === type) v = Math.max(v, Math.max(1, Math.floor(e.value))); });
  });
  return v;
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
      if (e.type === "quadrupleAttack") n = Math.max(n, 4);
      if (e.type === "hextupleAttack") n = Math.max(n, 6);
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
    const card = cardOfFc(fc);
    log(g, `${card?.name ?? "การ์ด"} ถูกถอด Soul ${moved} ใบลงสุสาน`);
    fx(g, { k: "soulOut", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved });
    if (card) applyEffects(g, side, card, "onSoulRemoved", { fc });
    fireSet(g, side, "onSoulRemoved", { fc }); // การ์ด Set ของเราที่รอ "เมื่อ Soul ถูกถอด"
    recalcAuras(g);
  }
  return moved;
}

// Soulguard: การ์ดที่จะถูกนำออกจากสนาม (ทำลาย / ดึงกลับมือ) ถอด Soul N ใบลงสุสานเพื่อ "อยู่ต่อ" ได้ (N = ค่า Soulguard, ปกติ 1)
// คืน true = กันสำเร็จ (การ์ดไม่ออกจากสนาม)
function trySoulguard(g: GameState, side: Side, m: FieldCard, card: Card | undefined, why: string): boolean {
  if (!card || keywordValue(card, "soulguard") <= 0) return false;
  if (m.nullified) { log(g, `${card.name} ถูก Nullify — Soulguard ไม่ทำงาน`); return false; }
  if (g[side].soulguardOff) { log(g, `${nameOf(side)} ปิด Soulguard ไว้ — ${card.name} ไม่ใช้ Soulguard`); return false; }
  if (m.soul.length < 1) return false;
  log(g, `${card.name} ใช้ Soulguard! ถอด Soul 1 ใบ กัน${why}ออกจากสนาม (เหลือ Soul ${m.soul.length - 1})`);
  fx(g, { k: "guard", side, uid: m.uid, pos: m.position, left: m.soul.length - 1 });
  mRemoveSoul(g, side, m, 1);
  return true;
}

// ผู้เล่นเลือกเปิด/ปิดการใช้ Soulguard (เปิด = ถ้าจะออกจากสนามแล้วมี Soul จะถอดกันให้ทันที)
export function setSoulguardAuto(state: GameState, side: Side, on: boolean): GameState {
  if ((state[side].soulguardOff ?? false) === !on) return state;
  const g = structuredClone(state);
  g[side].soulguardOff = !on;
  log(g, `${nameOf(side)} ${on ? "เปิด" : "ปิด"} การใช้ Soulguard`);
  return g;
}

function mDestroyMonster(g: GameState, side: Side, monsterUid: string): boolean {
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  if (!m) return false;
  const card = cardOfFc(m);
  if (trySoulguard(g, side, m, card, "การถูกทำลาย")) return false;

  fx(g, { k: "destroy", side, uid: m.uid, cardId: m.cardId, pos: m.position });
  p.monsters = p.monsters.filter(x => x.uid !== monsterUid);
  p.dropZone.push(m.cardId, ...m.soul);
  log(g, `${card?.name ?? "มอนสเตอร์"} ถูกทำลาย`);
  if (card) applyEffects(g, side, card, "onDestroyed");
  // Lifelink: เมื่อการ์ดนี้ตาย เจ้าของโดนดาเมจตามค่า Lifelink
  const ll = card && !m.nullified ? keywordValue(card, "lifelink") : 0;
  if (ll > 0 && !g.winner) {
    log(g, `Lifelink! ${card!.name} ตาย → ${nameOf(side)} โดนดาเมจ ${ll}`);
    mLife(g, side, -ll);
  }
  return true;
}

// นำมอนสเตอร์ออกจากสนามโดยไม่ใช่การตาย (กลับมือ / ลงสุสาน / กลับบนเด็ค): ไม่ทำงาน onDestroyed / Lifelink — Soulguard กันได้ทุกแบบ
function mLeaveField(g: GameState, side: Side, monsterUid: string, dest: "hand" | "drop" | "deck"): boolean {
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  if (!m) return false;
  const card = cardOfFc(m);
  const label = dest === "hand" ? "ถูกดึงกลับมือ" : dest === "drop" ? "ถูกส่งลงสุสาน" : "ถูกใส่กลับเด็ค";
  if (trySoulguard(g, side, m, card, `การ${label.replace("ถูก", "ถูก")}`)) return false;
  fx(g, { k: "destroy", side, uid: m.uid, cardId: m.cardId, pos: m.position });
  p.monsters = p.monsters.filter(x => x.uid !== monsterUid);
  if (dest === "hand") p.hand.push(m.cardId);
  else if (dest === "drop") p.dropZone.push(m.cardId);
  else p.deck.unshift(m.cardId);
  p.dropZone.push(...m.soul); // Soul ลงสุสานเสมอ
  log(g, `${card?.name ?? "มอนสเตอร์"} ${label}`);
  return true;
}

// เลือกการ์ดจากสุสานตามชนิด (นับจากใบที่ลงล่าสุด)
function pickFromDrop(g: GameState, side: Side, n: number, filter?: string): string[] {
  const p = g[side];
  const out: string[] = [];
  for (let i = p.dropZone.length - 1; i >= 0 && out.length < n; i--) {
    const c = getCard(p.dropZone[i]);
    if (filter && filter !== "any" && c?.type !== filter) continue;
    out.push(p.dropZone.splice(i, 1)[0]);
  }
  return out;
}

// เอฟเฟกต์ที่เลือกเป้าหมายมอนสเตอร์ศัตรูได้
const TARGETED_EFFECTS: AutoEffectType[] = ["destroyOpponentMonster", "restOpponent", "nullifyOpponentMonster", "bounceOpponentMonster", "opponentMonsterToDrop", "opponentMonsterToDeck"];
const TARGET_LABEL: Partial<Record<AutoEffectType, string>> = {
  destroyOpponentMonster: "ทำลาย", restOpponent: "Rest", nullifyOpponentMonster: "ยกเลิกความสามารถ",
  bounceOpponentMonster: "ดึงกลับมือ", opponentMonsterToDrop: "ส่งลงสุสาน", opponentMonsterToDeck: "ใส่กลับเด็ค",
};
export const targetEffectLabel = (t: AutoEffectType) => TARGET_LABEL[t] ?? String(t);

function applyTargetEffect(g: GameState, side: Side, card: Card, type: AutoEffectType, uids: string[]) {
  const opp = other(side);
  uids.forEach(uid => {
    const m = g[opp].monsters.find(x => x.uid === uid);
    if (!m) return;
    const nm = cardOfFc(m)?.name ?? "มอนสเตอร์";
    switch (type) {
      case "destroyOpponentMonster": mDestroyMonster(g, opp, uid); break;
      case "restOpponent": m.state = "rest"; log(g, `${card.name} Rest ${nm}`); break;
      case "nullifyOpponentMonster": m.nullified = true; log(g, `${card.name} Nullify! ความสามารถของ ${nm} ถูกยกเลิกจนจบเทิร์น`); break;
      case "bounceOpponentMonster": mLeaveField(g, opp, uid, "hand"); break;
      case "opponentMonsterToDrop": mLeaveField(g, opp, uid, "drop"); break;
      case "opponentMonsterToDeck": mLeaveField(g, opp, uid, "deck"); break;
      default: break;
    }
  });
}

export function resolveTargetChoice(state: GameState, side: Side, uids: string[]): Result {
  const pt = state.pendingTarget;
  if (!pt || pt.side !== side) return { state, ok: false, msg: "ไม่มีการเลือกเป้าหมายที่รอคุณอยู่" };
  const need = Math.min(pt.n, pt.candidates.length);
  if (new Set(uids).size !== uids.length || uids.length !== need) return { state, ok: false, msg: `ต้องเลือกเป้าหมาย ${need} ตัว` };
  if (uids.some(u => !pt.candidates.includes(u))) return { state, ok: false, msg: "เลือกเป้าหมายที่เลือกไม่ได้" };
  const g = structuredClone(state);
  g.pendingTarget = null;
  const card = getCard(pt.cardId);
  if (card) {
    applyTargetEffect(g, side, card, pt.effType, uids);
    if (pt.cont && pt.cont.skills.length > 0 && !g.winner) {
      const baseFc = pt.cont.fcUid ? findFc(g[side], pt.cont.fcUid) ?? undefined : undefined;
      runSkills(g, side, card, pt.cont.skills, { fc: baseFc });
    }
  }
  recalcAuras(g);
  if (pt.resumeCounter) afterCounter(g, side);
  return { state: g, ok: true, msg: "เลือกเป้าหมายแล้ว" };
}

function applyEffects(
  g: GameState,
  side: Side,
  card: Card,
  trigger: AutoTrigger,
  ctx?: { fc?: FieldCard }
) {
  runSkills(g, side, card, (card.autoSkills ?? []).filter(sk => sk.trigger === trigger), ctx ?? {});
}

// ทำงานตามรายการสกิล (แยกออกมาเพื่อให้ "ดูกอง แล้วเลือก" หยุดรอผู้เล่นแล้วไปต่อได้)
function runSkills(
  g: GameState,
  side: Side,
  card: Card,
  skills: AutoSkill[],
  ctx: { fc?: FieldCard; all?: boolean }
) {
  const opp = other(side);
  for (let si = 0; si < skills.length; si++) {
    const skill = skills[si];
    for (let ei = 0; ei < skill.effects.length; ei++) {
      const eff = skill.effects[ei];
      if (g.winner) return;
      const n = Math.max(0, Math.floor(eff.value));
      let abort = false;
      // เอฟเฟกต์ที่ต้อง "เลือกเป้าหมาย": ถ้าศัตรูมีให้เลือกมากกว่าจำนวนที่ต้องใช้ ให้หยุดรอผู้เล่นเลือก
      if (TARGETED_EFFECTS.includes(eff.type) && n > 0) {
        const cands = g[opp].monsters.filter(m => eff.type !== "restOpponent" || m.state === "stand");
        if (cands.length > n) {
          const restOfSkill = skill.effects.slice(ei + 1);
          const restSkills: AutoSkill[] = [...(restOfSkill.length > 0 ? [{ ...skill, effects: restOfSkill }] : []), ...skills.slice(si + 1)];
          g.pendingTarget = {
            side, cardId: card.id, effType: eff.type, n, candidates: cands.map(m => m.uid),
            cont: restSkills.length > 0 ? { skills: restSkills, fcUid: ctx.fc?.uid } : null,
          };
          log(g, `${card.name}: ${nameOf(side)} เลือกเป้าหมายมอนสเตอร์ศัตรู ${n} ตัว (${TARGET_LABEL[eff.type] ?? eff.type})`);
          return;
        }
      }
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
          const got = pickFromDrop(g, side, n, eff.filter);
          g[side].hand.push(...got);
          log(g, `${card.name} เก็บการ์ดจากสุสานขึ้นมือ ${got.length} ใบ`);
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
          const targets = ctx.fc ? [ctx.fc] : ctx.all ? [...g[side].monsters] : g[side].monsters.slice(-1);
          if (targets.length === 0) break;
          targets.forEach(target => {
            if (eff.type === "buffPower") target.tempPower += eff.value;
            if (eff.type === "buffCritical") target.tempCritical += eff.value;
            if (eff.type === "buffDefense") target.tempDefense += eff.value;
          });
          log(g, `${card.name} ${eff.type === "buffPower" ? "Power" : eff.type === "buffCritical" ? "Critical" : "Defense"} +${eff.value}`);
          break;
        }
        case "condBuff": {
          // ใช้กับตัวกระตุ้นอื่นที่ไม่ใช่ "ถาวร" (เช่น เมื่อลงสนาม/โจมตี): ตรวจเงื่อนไขตอนสกิลทำงาน แล้วบัฟชั่วคราวจนจบเทิร์น
          const self = ctx.fc ?? null;
          if (!condBuffMet(g, side, eff, self)) { log(g, `${card.name}: เงื่อนไขไม่ครบ ไม่ได้รับบัฟ`); break; }
          const amt = condBuffAmounts(eff);
          const ts = condBuffTargets(g, side, eff, self);
          if (ts.length === 0) break;
          ts.forEach(t => { t.tempPower += amt.power; t.tempCritical += amt.critical; t.tempDefense += amt.defense; t.tempSize = (t.tempSize ?? 0) + amt.size; });
          const parts = [amt.power ? `Power +${amt.power}` : "", amt.critical ? `Critical +${amt.critical}` : "", amt.defense ? `Defense +${amt.defense}` : "", amt.size ? `Size ${amt.size > 0 ? "+" : ""}${amt.size}` : ""].filter(Boolean).join(" ");
          log(g, `${card.name}: เงื่อนไขครบ — ${ts.map(t => cardOfFc(t)?.name ?? "การ์ด").join(", ")} ได้รับ ${parts} จนจบเทิร์น`);
          break;
        }
        case "addSoul": {
          const ss = ownSetSoul(g, side, card, ctx);
          if (ss) {
            let moved = 0;
            for (let i = 0; i < n && g[side].deck.length > 0; i++) { ss.push(g[side].deck.shift()!); moved++; }
            if (moved > 0) { log(g, `${card.name} (Set) ได้รับ Soul +${moved} (รวม ${ss.length})`); recalcAuras(g); }
            break;
          }
          // จากเวท/การ์ด Set ที่ไม่มีการ์ดเป้าหมาย: ใส่ให้มอนสเตอร์ของเราตัวแรก (ช่องกลาง → ซ้าย → ขวา)
          const fc = ctx.fc ?? [1, 0, 2].map(pos => g[side].monsters.find(m => m.position === pos)).find(Boolean);
          if (!fc) break;
          let moved = 0;
          for (let i = 0; i < n && g[side].deck.length > 0; i++) { fc.soul.push(g[side].deck.shift()!); moved++; }
          if (moved > 0) { log(g, `${card.name} ได้รับ Soul +${moved}`); fx(g, { k: "soulIn", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved }); }
          if (moved > 0) recalcAuras(g);
          break;
        }
        case "dropToSoul": {
          const ss = ownSetSoul(g, side, card, ctx);
          if (ss) {
            const got = pickFromDrop(g, side, n, eff.filter);
            if (got.length === 0) { log(g, `${card.name}: ไม่มีการ์ดที่ตรงเงื่อนไขในสุสาน`); break; }
            ss.push(...got);
            log(g, `${card.name} (Set) นำการ์ดจากสุสาน ${got.length} ใบเข้า Soul ของตัวเอง (รวม ${ss.length})`);
            recalcAuras(g);
            break;
          }
          // เป้าหมาย: การ์ดที่ใช้สกิล > มอนสเตอร์ที่มี Soulguard > มอนสเตอร์ตัวล่าสุด
          const fc = ctx?.fc
            ?? g[side].monsters.find(m => { const c = cardOfFc(m); return !!c && keywordValue(c, "soulguard") > 0; })
            ?? g[side].monsters[g[side].monsters.length - 1];
          if (!fc) { log(g, `${card.name}: ไม่มีมอนสเตอร์ให้ใส่ Soul`); break; }
          const got = pickFromDrop(g, side, n, eff.filter);
          if (got.length === 0) { log(g, `${card.name}: ไม่มีการ์ดที่ตรงเงื่อนไขในสุสาน`); break; }
          fc.soul.push(...got);
          log(g, `${card.name} นำการ์ดจากสุสาน ${got.length} ใบเข้า Soul ของ ${cardOfFc(fc)?.name ?? "การ์ด"} (รวม ${fc.soul.length})`);
          fx(g, { k: "soulIn", side, uid: fc.uid, pos: posOf(g, side, fc), n: got.length, from: "drop" });
          break;
        }
        case "soulToHand": {
          const ss = ownSetSoul(g, side, card, ctx);
          if (ss) {
            if (ss.length === 0) { log(g, `${card.name}: ไม่มี Soul ให้ถอดขึ้นมือ`); break; }
            let moved = 0;
            for (let i = 0; i < n && ss.length > 0; i++) { g[side].hand.push(ss.pop()!); moved++; }
            log(g, `${card.name} (Set) ถอด Soul ${moved} ใบขึ้นมือ`);
            recalcAuras(g);
            break;
          }
          const fc = ctx?.fc;
          if (!fc || fc.soul.length === 0) { log(g, `${card.name}: ไม่มี Soul ให้ถอดขึ้นมือ`); break; }
          let moved = 0;
          for (let i = 0; i < n && fc.soul.length > 0; i++) { g[side].hand.push(fc.soul.pop()!); moved++; }
          log(g, `${card.name} ถอด Soul ${moved} ใบขึ้นมือ`);
          fx(g, { k: "soulOut", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved });
          const c0 = cardOfFc(fc);
          if (c0) applyEffects(g, side, c0, "onSoulRemoved", { fc });
          break;
        }
        case "bounceOpponentMonster": {
          const order = [1, 0, 2];
          [...g[opp].monsters]
            .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position))
            .slice(0, n)
            .forEach(m => mLeaveField(g, opp, m.uid, "hand"));
          break;
        }
        case "opponentMonsterToDrop":
        case "opponentMonsterToDeck": {
          const order = [1, 0, 2];
          [...g[opp].monsters]
            .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position))
            .slice(0, n)
            .forEach(m => mLeaveField(g, opp, m.uid, eff.type === "opponentMonsterToDrop" ? "drop" : "deck"));
          break;
        }
        case "nullifyOpponentMonster": {
          const order = [1, 0, 2];
          [...g[opp].monsters]
            .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position))
            .slice(0, n)
            .forEach(m => { m.nullified = true; log(g, `${card.name} Nullify! ความสามารถของ ${cardOfFc(m)?.name ?? "มอนสเตอร์"} ถูกยกเลิกจนจบเทิร์น`); });
          break;
        }
        case "removeSoul": {
          const ss = ownSetSoul(g, side, card, ctx);
          if (ss) {
            if (ss.length < n) { abort = true; log(g, `${card.name}: Soul ไม่พอ เอฟเฟกต์ที่เหลือไม่ทำงาน`); break; }
            for (let i = 0; i < n; i++) g[side].dropZone.push(ss.pop()!);
            log(g, `${card.name} (Set) ถอด Soul ${n} ใบลงสุสาน (เหลือ ${ss.length})`);
            recalcAuras(g);
            break;
          }
          let fc = ctx.fc;
          if (!fc) {
            // ใช้จากเวท/ไม่มีการ์ดเป้าหมาย: เลือกการ์ดของเราที่มี Soul มากที่สุด (ที่มีพอ)
            const cands = [...g[side].monsters, ...(g[side].item ? [g[side].item] : [])]
              .filter(m => m.soul.length >= n)
              .sort((a, b) => b.soul.length - a.soul.length);
            fc = cands[0];
          }
          if (!fc || fc.soul.length < n) { abort = true; log(g, `${card.name}: Soul ไม่พอ เอฟเฟกต์ที่เหลือไม่ทำงาน`); break; }
          mRemoveSoul(g, side, fc, n);
          ctx.fc = fc; // เอฟเฟกต์ถัดไป (บัฟ Attack/Defense) จะใช้กับการ์ดใบที่ถูกถอด Soul
          break;
        }
        case "destroyOpponentSet": {
          const zone = g[opp].setZone;
          for (let k = 0; k < n && zone.length > 0; k++) {
            // เลือกการ์ด Set ที่เปิดหน้าก่อน (ผลต่อเนื่อง) ถ้าไม่มีจึงเอาใบคว่ำ
            let idx = zone.findIndex(id => { const c = getCard(id); return !!c && hasSetKeyword(c); });
            if (idx < 0) idx = 0;
            mDestroySet(g, opp, idx);
          }
          break;
        }
        case "negateSpell":
          if (g.spellWindow) { g.spellWindow.negated = true; log(g, `${card.name} ยกเลิกเวทที่ศัตรูร่าย!`); }
          break;
        case "chooseRemoveSoul": {
          const cands = [...g[side].monsters, ...(g[side].item ? [g[side].item] : [])].filter(m => m.soul.length >= Math.max(1, n));
          if (cands.length === 0) { abort = true; log(g, `${card.name}: ไม่มีการ์ดที่มี Soul พอให้ถอด เอฟเฟกต์ที่เหลือไม่ทำงาน`); break; }
          const restOfSkill = skill.effects.slice(ei + 1);
          const restSkills: AutoSkill[] = [...(restOfSkill.length > 0 ? [{ ...skill, effects: restOfSkill }] : []), ...skills.slice(si + 1)];
          g.pendingSoul = {
            side, cardId: card.id, n: Math.max(1, n), candidates: cands.map(c => c.uid),
            cont: restSkills.length > 0 ? { skills: restSkills, fcUid: ctx.fc?.uid, firstIsRest: restOfSkill.length > 0 } : null,
          };
          log(g, `${card.name}: ${nameOf(side)} เลือกการ์ดที่จะถอด Soul ${Math.max(1, n)} ใบ`);
          return;
        }
        case "lookTop": {
          const cards = g[side].deck.slice(0, Math.max(1, n));
          if (cards.length === 0) { log(g, `${card.name}: เด็คไม่มีการ์ดให้ดู`); break; }
          const restSkills: AutoSkill[] = [{ ...skill, effects: skill.effects.slice(ei + 1) }, ...skills.slice(si + 1)].filter(sk => sk.effects.length > 0);
          g.pendingLook = {
            side, cardId: card.id, cards,
            toHand: Math.max(0, Math.floor(eff.toHand ?? 0)), toDrop: Math.max(0, Math.floor(eff.toDrop ?? 0)), toBottom: Math.max(0, Math.floor(eff.toBottom ?? 0)),
            cont: restSkills.length > 0 ? { skills: restSkills, fcUid: ctx.fc?.uid } : null,
          };
          log(g, `${card.name}: ${nameOf(side)} ดูการ์ดบนสุดของกอง ${cards.length} ใบ`);
          return; // หยุดรอผู้เล่นเลือก แล้วค่อยไปต่อ
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
  }
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
export function createPlayerState(deck: Deck, flag: Flag, _cards: Card[]): PlayerState {
  const allCards = [...deck.cardIds];
  const buddies = deckBuddies(deck);
  buddies.forEach(id => { if (!allCards.includes(id)) allCards.push(id); });
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
    setSoul: [],
    monsters: [],
    item: null,
    flagId: flag.id,
    buddyId: buddies[0] ?? null,
    buddyIds: buddies,
    buddiesCalled: [],
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
  g.moveWindow = null;
  g.spellWindow = null;
  g.pendingLook = null;
  g.pendingSoul = null;
  g.pendingTarget = null;
  // ลำดับเทิร์น: Stand → Draw → Charge & Draw → Main → Attack → Final (ข้าม Draw เฉพาะเมื่อปิดกติกา "ผู้เล่นคนแรกจั่วด้วย")
  g.phase = skipDraw ? "charge" : "draw";
  log(g, `— เทิร์น ${g.turn}: ${nameOf(side)} (Stand${skipDraw ? " · เทิร์นแรกไม่จั่ว" : ""}) —`);
  if (g.winner) return;
  p.monsters.forEach(m => {
    const c = cardOfFc(m);
    if (c) applyEffects(g, side, c, "onTurnStart", { fc: m });
  });
  fireSet(g, side, "onTurnStart");
  recalcAuras(g);
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
    moveWindow: null,
    spellWindow: null,
    pendingLook: null,
    pendingSoul: null,
    pendingTarget: null,
    firstPlayer: first,
    attacksThisTurn: 0,
    rev: 0,
    host: createPlayerState(hostDeck, hostFlag, cards),
    guest: createPlayerState(guestDeck, guestFlag, cards),
    log: [`เกมเริ่มต้นแล้ว! ${nameOf(first)} เริ่มก่อน${r.firstPlayerDraws ? "" : " (เทิร์นแรกไม่จั่ว)"} — เลือก Mulligan ก่อนเริ่มเล่น`],
    winner: null,
  };
  (["host", "guest"] as Side[]).forEach(s => {
    const f = s === "host" ? hostFlag : guestFlag;
    log(g, `${nameOf(s)} (${f?.name ?? "Flag"}): Life ${g[s].life} · มือเริ่มต้น ${g[s].hand.length} ใบ · เกจเริ่มต้น ${g[s].gauge} ใบ · เด็คเหลือ ${g[s].deck.length} ใบ`);
  });
  startTurn(g, !r.firstPlayerDraws); // ปกติผู้เล่นคนแรกก็เริ่มที่ Draw Phase และจั่ว 1 ใบเหมือนเทิร์นอื่น
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

// Size จริงของมอนสเตอร์บนสนาม = Size ของการ์ด + ค่าที่ปรับเองใน Sandbox (ต่ำสุด 0)
export function sizeOfFc(fc: FieldCard): number {
  return Math.max(0, (cardOfFc(fc)?.size ?? 0) + (fc.manualSize ?? 0) + (fc.auraSize ?? 0) + (fc.tempSize ?? 0));
}

export function totalMonsterSize(player: PlayerState): number {
  return player.monsters.reduce((sum, m) => sum + sizeOfFc(m), 0);
}

/* ------------------------------------------------------------------ */
/* Turn flow                                                           */
/* ------------------------------------------------------------------ */
function baseGuard(state: GameState, side: Side): string | null {
  if (state.winner) return "เกมจบแล้ว";
  if (!mulliganDone(state)) return "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน";
  if (state.pendingLook) return `กำลังรอ${nameOf(state.pendingLook.side)}เลือกการ์ดหลังดูกอง`;
  if (state.pendingSoul) return `กำลังรอ${nameOf(state.pendingSoul.side)}เลือกการ์ดที่จะถอด Soul`;
  if (state.pendingTarget) return `กำลังรอ${nameOf(state.pendingTarget.side)}เลือกเป้าหมายมอนสเตอร์`;
  if (state.spellWindow) return "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter ต่อเวทที่ร่าย";
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
  // Move: ตอนเริ่ม Attack Phase ฝั่งป้องกันที่มีมอนสเตอร์ [Move] ย้ายไปช่องว่างได้ก่อนเริ่มโจมตี
  const defender = other(side);
  if (g.rules.useAttackPhase && movableMonsters(g, defender).length > 0) {
    g.moveWindow = defender;
    log(g, `รอ ${nameOf(defender)} เลือกว่าจะใช้ Move หรือไม่...`);
  }
  return { state: g, ok: true, msg: "Attack Phase" };
}

export function goToFinal(state: GameState, side: Side): Result {
  const bg = baseGuard(state, side);
  if (bg) return { state, ok: false, msg: bg };
  if (state.moveWindow) return { state, ok: false, msg: "กำลังรอฝั่งตรงข้ามเลือก Move ก่อน" };
  if (state.battle) return { state, ok: false, msg: "กำลังรอ Counter" };
  if (state.phase === "final") return { state, ok: false, msg: "อยู่ Final Phase แล้ว" };
  if (state.phase === "draw" || state.phase === "charge") return { state, ok: false, msg: "ต้องผ่านช่วง Draw และ Charge & Draw ก่อน" };
  const g = structuredClone(state);
  g.phase = "final";
  log(g, `${nameOf(side)} เข้าสู่ Final Phase`);
  g[side].monsters.forEach(m => {
    const c = cardOfFc(m);
    if (c) applyEffects(g, side, c, "onFinal", { fc: m });
  });
  fireSet(g, side, "onFinal");
  return { state: g, ok: true, msg: "Final Phase" };
}

export function endTurn(state: GameState): GameState {
  if (state.battle || state.moveWindow || state.spellWindow || state.pendingLook || state.pendingSoul || state.pendingTarget || !mulliganDone(state)) return state;
  const g = structuredClone(state);
  if (g.winner) return g;
  (["host", "guest"] as Side[]).forEach(s => {
    [...g[s].monsters, ...(g[s].item ? [g[s].item!] : [])].forEach(m => {
      m.tempPower = 0; m.tempCritical = 0; m.tempDefense = 0; m.tempSize = 0; m.nullified = false;
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
function guardTurn(state: GameState, side: Side, needPhase: "main" | "final" | "attack", anyActivePhase = false): string | null {
  const bg = baseGuard(state, side);
  if (bg) return bg;
  if (state.battle) return "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter";
  if (state.moveWindow) return "กำลังรอฝั่งตรงข้ามเลือก Move (ตอนเริ่ม Attack Phase) ก่อน จึงจะโจมตีได้";
  if (state.phase === "draw") return "ยังอยู่ใน Draw Phase — ต้องจั่วการ์ดก่อน (กดปุ่ม 'Draw') แล้วผ่าน Charge & Draw จึงจะลงการ์ดได้";
  if (state.phase === "charge") return "ต้องผ่านช่วง Charge & Draw ก่อน (กด 'ข้าม' ถ้าไม่ Charge)";
  if (anyActivePhase) return null;
  if (needPhase === "main" && state.phase !== "main") return "ลงการ์ด/ร่ายเวทได้เฉพาะ Main Phase";
  if (needPhase === "attack" && state.phase !== (state.rules.useAttackPhase ? "attack" : "main"))
    return state.rules.useAttackPhase ? "โจมตีได้เฉพาะ Attack Phase" : "โจมตีได้เฉพาะ Main Phase";
  if (needPhase === "final" && state.phase !== "final") return "Impact ใช้ได้เฉพาะ Final Phase";
  return null;
}

// ตรวจค่าใช้จ่าย: คืนข้อความอธิบายถ้าจ่ายไม่ได้ (จ่ายได้ทั้งเกจและ Life พร้อมกัน)
function costProblem(g: GameState, side: Side, card: Card): string | null {
  const p = g[side];
  const c = callCostAmounts(card);
  if (p.gaugePile.length < c.gauge)
    return `เกจไม่พอ: ต้องจ่ายเกจ ${c.gauge} แต่คุณมีเกจเพียง ${p.gaugePile.length}`;
  if (c.life > 0 && p.life <= c.life)
    return `Life ไม่พอ: ต้องจ่าย Life ${c.life} แต่คุณมี Life ${p.life} (หลังจ่ายต้องเหลืออย่างน้อย 1)`;
  return null;
}

function payCost(g: GameState, side: Side, card: Card): string | null {
  const bad = costProblem(g, side, card);
  if (bad) return bad;
  const c = callCostAmounts(card);
  if (c.gauge > 0) mPayGauge(g, side, c.gauge);
  if (c.life > 0) g[side].life -= c.life;
  return null;
}

export function callMonster(state: GameState, side: Side, handIndex: number, position: number, opts?: { ignoreSize?: boolean }): Result {
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
  const callSize = Math.max(0, card.size + sizeModWhenCalled(g, side, card)); // สกิลลด Size ของตัวเอง (ถ้าเงื่อนไขครบ) นับตอนลงสนามด้วย
  if (!opts?.ignoreSize && callSize > 0 && currentSize + callSize > g.rules.maxSize)
    return { state, ok: false, msg: `Size เกิน: ในสนามมี Size รวม ${currentSize} + ${card.name} (Size ${callSize}) = ${currentSize + callSize} เกินขีดจำกัด ${g.rules.maxSize}` };

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

  // Buddy Call: Buddy แต่ละตัว (ช่องบัดดี้มีได้ 1-4 ตัว) ทำได้ตัวละ 1 ครั้งต่อเกม
  const myBuddies = deckBuddies(p);
  const calledBuddies = p.buddiesCalled ?? (p.buddyCalledThisGame && p.buddyId ? [p.buddyId] : []);
  const isBuddyCall = myBuddies.includes(cardId) && !calledBuddies.includes(cardId);
  fx(g, { k: "call", side, uid: fc.uid, pos: position, buddy: isBuddyCall });
  if (soulN > 0) fx(g, { k: "soulIn", side, uid: fc.uid, pos: position, n: soulN });
  if (isBuddyCall) {
    p.buddiesCalled = [...calledBuddies, cardId];
    p.buddyCalledThisGame = myBuddies.every(b => p.buddiesCalled!.includes(b));
    log(g, `Buddy Call "${card.name}"! ได้รับ Buddy Gift`);
    if (g.rules.buddyCallLife > 0) mLife(g, side, g.rules.buddyCallLife);
  }
  applyEffects(g, side, card, "onCall", { fc });
  if (isBuddyCall) applyEffects(g, side, card, "onBuddyCall", { fc });
  recalcAuras(g);
  return { state: g, ok: true, msg: `${card.name} ลงสนามสำเร็จ` };
}

// การ์ดที่มีคีย์เวิร์ด Set (แบบ engine, ป้าย kw เก่า, หรือคีย์เวิร์ดกำหนดเองชื่อ "Set")
export function hasSetKeyword(card: Card): boolean {
  return (card.autoSkills ?? []).some(s => s.name === "Set" || s.effects.some(e => e.type === "set" || (e.type === "kw" && e.name === "Set")));
}
// Set ชื่อเดียวกันได้กี่ใบ (ค่าของคีย์เวิร์ด; ป้ายเก่า = 1)
function setLimit(card: Card): number {
  let n = 0;
  (card.autoSkills ?? []).forEach(sk => sk.effects.forEach(e => { if (e.type === "set") n = Math.max(n, Math.floor(e.value) || 1); }));
  return n || 1;
}
// การ์ด Set ที่ "เปิดหน้า" อยู่ในช่อง Set ของ side (ไม่นับการ์ด Counter ที่วางคว่ำ)
export function activeSetCards(p: PlayerState): Card[] {
  return p.setZone.map(id => getCard(id)).filter((c): c is Card => !!c && hasSetKeyword(c));
}

// Soul ใต้การ์ด Set ของเราที่เป็นต้นทางของเอฟเฟกต์ (เมื่อไม่มีการ์ดบนสนามเป็นเป้าหมาย): ใช้เก็บ Soul ของการ์ด Set ใบนั้นเอง
function ownSetSoul(g: GameState, side: Side, card: Card, ctx?: { fc?: FieldCard }): string[] | null {
  if (ctx?.fc || !hasSetKeyword(card)) return null;
  const p = g[side];
  const i = p.setZone.lastIndexOf(card.id);
  return i < 0 ? null : normSetSoul(p)[i];
}

// ผลต่อเนื่องจากการ์ด Set: บัฟ Power/Defense/Critical ให้มอนสเตอร์และไอเทมของเจ้าของ (คำนวณใหม่ทุกครั้งที่ Set เปลี่ยน)
export function recalcAuras(g: GameState) {
  (["host", "guest"] as Side[]).forEach(side => {
    const p = g[side];
    // soulGrant: การ์ดใน Soul ที่ระบุว่าให้ความสามารถแก่เจ้าของโซล (ชื่อเจ้าของโซลตรงกับ targetName หรือว่าง = ทุกใบ)
    fieldCardsOf(p).forEach(fc => {
      const hostName = getCard(fc.cardId)?.name ?? "";
      const seen = new Set<string>();
      const granted: AutoSkill[] = [];
      fc.soul.forEach(id => {
        const sc = getCard(id);
        if (!sc || seen.has(id)) return;
        const isGrant = (sk: AutoSkill) => sk.effects.some(e => e.type === "soulGrant");
        const ok = (sc.autoSkills ?? []).some(sk => sk.trigger === "continuous" && sk.effects.some(e => {
          if (e.type !== "soulGrant") return false;
          const tn = (e.targetName ?? "").trim().toLowerCase();
          return !tn || textHas(hostName, tn);
        }));
        if (!ok) return;
        seen.add(id); // การ์ดชื่อ/ใบเดียวกันหลายใบใน Soul นับครั้งเดียว กันสกิลทำงานซ้ำ
        (sc.autoSkills ?? []).forEach(sk => { if (!isGrant(sk)) granted.push(sk); });
      });
      fc.grantedSkills = granted.length > 0 ? granted : undefined;
    });
    let pw = 0, df = 0, cr = 0, pps = 0, cps = 0;
    activeSetCards(p).forEach(c => {
      pw += continuousSum(c, "buffPower"); df += continuousSum(c, "buffDefense"); cr += continuousSum(c, "buffCritical");
      pps += continuousSum(c, "powerPerSoul"); cps += continuousSum(c, "criticalPerSoul");
    });
    [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
      fc.auraPower = pw + pps * fc.soul.length; fc.auraDefense = df; fc.auraCritical = cr + cps * fc.soul.length; fc.auraSize = 0;
    });

    // บัฟถาวรแบบมีเงื่อนไข (condBuff ในสกิล "ถาวร"): มีผลตราบที่เงื่อนไขครบ
    const runCond = (card: Card, self: FieldCard | null) => {
      (card.autoSkills ?? []).forEach(sk => {
        if (sk.trigger !== "continuous") return;
        sk.effects.forEach(e => {
          if (e.type !== "condBuff" || !condBuffMet(g, side, e, self)) return;
          const amt = condBuffAmounts(e);
          condBuffTargets(g, side, e, self).forEach(t => {
            t.auraPower = (t.auraPower ?? 0) + amt.power;
            t.auraCritical = (t.auraCritical ?? 0) + amt.critical;
            t.auraDefense = (t.auraDefense ?? 0) + amt.defense;
            t.auraSize = (t.auraSize ?? 0) + amt.size;
          });
        });
      });
    };
    fieldCardsOf(p).forEach(fc => {
      if (fc.nullified) return; // ถูก Nullify: ความสามารถของการ์ดใบนี้ใช้ไม่ได้
      const c = cardOfFc(fc);
      if (c) runCond(c, fc);
    });
    activeSetCards(p).forEach(c => runCond(c, null));

    // soulCond: ถ้าโซลของการ์ดมีการ์ดที่กำหนดครบ X ใบ → ผู้ได้รับ (การ์ดนี้ หรือการ์ดอื่นของเราที่คุณสมบัติ/ชื่อตรง) ได้บัฟสถานะ (คูณตามจำนวนโซลได้) และ/หรือคีย์เวิร์ด
    // (คำนวณใหม่ทุกครั้ง จึงหายเมื่อโซลไม่ครบ) — ใช้ได้ทั้งกับการ์ดบนสนามและการ์ด Set ที่เปิดอยู่ (ใช้ Soul ใต้การ์ด Set)
    const runSoulCond = (c: Card, soul: string[], self: FieldCard | null) => {
      (c.autoSkills ?? []).forEach(sk => {
        if (sk.trigger !== "continuous") return;
        sk.effects.forEach(e => {
          if (e.type !== "soulCond") return;
          const n = soulCondCount(soul, e);
          if (n < Math.max(1, Math.floor(e.value) || 1)) return;
          const mult = e.perSoul ? n : 1;
          soulCondTargets(p, self, e).forEach(t => {
            t.auraPower = (t.auraPower ?? 0) + (e.bPower ?? 0) * mult;
            t.auraCritical = (t.auraCritical ?? 0) + (e.bCritical ?? 0) * mult;
            t.auraDefense = (t.auraDefense ?? 0) + (e.bDefense ?? 0) * mult;
            const kws: AutoEffect[] = (e.grantKw ?? []).map(k => ({ type: k, value: 1 }));
            if (kws.length > 0) t.grantedSkills = [...(t.grantedSkills ?? []), { trigger: "continuous", effects: kws }];
          });
        });
      });
    };
    fieldCardsOf(p).forEach(fc => {
      if (fc.nullified) return;
      const c = cardOfFc(fc);
      if (c) runSoulCond(c, fc.soul, fc);
    });
    p.setZone.forEach((id, i) => {
      const c = getCard(id);
      if (c && hasSetKeyword(c)) runSoulCond(c, setSoulOf(p, i), null);
    });
  });
}

// ---- soulCond: นับการ์ดในโซลของการ์ดใบนี้ที่ตรงเงื่อนไข (คุณสมบัติ/ชื่อ; คั่นหลายค่าด้วย , = ตรงอย่างใดอย่างหนึ่ง; ว่าง = การ์ดใดก็ได้) ----
// เทียบข้อความแบบทนต่อความต่างเล็กน้อย: ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่างซ้ำ/ช่องว่างพิเศษ/อักขระเต็มความกว้าง (ใช้กับ soulCond)
const normTxt = (t: string) => t.normalize("NFKC").toLowerCase().replace(/[\s\u00a0\u200b]+/g, " ").trim();
// คั่นหลายค่าด้วย , ， 、 ; / | หรือขึ้นบรรทัดใหม่ (ตรงอย่างใดอย่างหนึ่ง)
const splitAlts = (t: string | undefined) => (t ?? "").normalize("NFKC").split(/[,;\/|、\n]+/).map(normTxt).filter(Boolean);
const altHas = (hay: string | undefined, alt: string) => {
  if (!hay) return false;
  const h = normTxt(hay);
  return h.includes(alt) || h.replace(/ /g, "").includes(alt.replace(/ /g, ""));
};
// จำนวนการ์ดในโซลของ fc ที่ตรงเงื่อนไข (ว่าง = นับทุกใบ)
function soulCondCount(soul: string[], e: AutoEffect): number {
  const alts = splitAlts(e.condText);
  if (alts.length === 0) return soul.length; // ไม่กำหนดเงื่อนไข = นับทุกใบ (ไม่ต้องรู้จักการ์ด)
  return soul.filter(id => {
    const sc = getCard(id);
    if (!sc) return false;
    if (alts.length === 0) return true;
    return alts.some(a => (e.condMatch === "name" ? altHas(sc.name, a) : altHas(sc.attribute, a)));
  }).length;
}
// ผู้ได้รับผล: ไม่ระบุ targetText = การ์ดใบนี้เอง; ระบุ = การ์ดอื่นของเราบนสนามที่คุณสมบัติ/ชื่อตรง (รวมใบนี้ถ้าติ๊ก includeSelf)
function soulCondTargets(p: PlayerState, self: FieldCard | null, e: AutoEffect): FieldCard[] {
  const alts = splitAlts(e.targetText);
  if (alts.length === 0) return self ? [self] : []; // การ์ด Set ไม่มีสถานะของตัวเอง จึงต้องระบุผู้ได้รับเป็นการ์ดบนสนาม
  return fieldCardsOf(p).filter(f => {
    if (self && f.uid === self.uid && !e.includeSelf) return false;
    const c = getCard(f.cardId);
    return !!c && alts.some(a => (e.targetMatch === "name" ? altHas(c.name, a) : altHas(c.attribute, a)));
  });
}

// ---- condBuff: เงื่อนไข "ถ้าบนสนามมีการ์ดใบอื่นที่มีคุณสมบัติ/ชื่อ ..." และผู้ได้รับบัฟ ----
const fieldCardsOf = (q: PlayerState): FieldCard[] => [...q.monsters, ...(q.item ? [q.item] : [])];
const textHas = (hay: string | undefined, needle: string) => !!hay && hay.toLowerCase().includes(needle);

function condBuffMet(g: GameState, side: Side, e: AutoEffect, self: FieldCard | null): boolean {
  const need = (e.condText ?? "").trim().toLowerCase();
  if (!need) return true;
  const opp: Side = side === "host" ? "guest" : "host";
  const sides: Side[] = e.condWhere === "opponent" ? [opp] : e.condWhere === "any" ? [side, opp] : [side];
  return sides.some(sd => fieldCardsOf(g[sd]).some(f => {
    if (self && f.uid === self.uid) return false; // ไม่นับการ์ดใบที่ถือสกิลนี้เอง
    const c = cardOfFc(f);
    return !!c && (e.condMatch === "name" ? textHas(c.name, need) : textHas(c.attribute, need));
  }));
}

// Size ที่เปลี่ยนให้การ์ดใบนี้ตอนจะลงสนาม (จากสกิลถาวรแบบมีเงื่อนไขที่ให้ตัวเอง และเงื่อนไขครบตอนนี้)
function sizeModWhenCalled(g: GameState, side: Side, card: Card): number {
  let mod = 0;
  (card.autoSkills ?? []).forEach(sk => {
    if (sk.trigger !== "continuous") return;
    sk.effects.forEach(e => {
      if (e.type !== "condBuff") return;
      const amt = condBuffAmounts(e);
      const forSelf = !(e.targetName ?? "").trim() || !!e.includeSelf;
      if (amt.size && forSelf && condBuffMet(g, side, e, null)) mod += amt.size;
    });
  });
  return mod;
}

// ผู้ได้รับบัฟ: การ์ดของเราที่ชื่อตรงกับ targetName (+ การ์ดใบนี้ถ้าไม่ระบุชื่อ หรือติ๊ก "รวมใบนี้")
function condBuffTargets(g: GameState, side: Side, e: AutoEffect, self: FieldCard | null): FieldCard[] {
  const tn = (e.targetName ?? "").trim().toLowerCase();
  const out: FieldCard[] = [];
  if (tn) fieldCardsOf(g[side]).forEach(t => { if (textHas(cardOfFc(t)?.name, tn)) out.push(t); });
  if (self && (!tn || e.includeSelf) && !out.includes(self)) out.push(self);
  return out;
}

// ทำงานสกิลของการ์ด Set ที่อยู่ในช่อง Set ตามทริกเกอร์ (ต้นเทิร์น / Final / มอนสเตอร์เราโจมตี / ทำลายศัตรู / ทำดาเมจ)
function fireSet(g: GameState, side: Side, trigger: AutoTrigger, ctx: { fc?: FieldCard } = {}) {
  // ไม่มีการ์ดเป้าหมาย (เช่น ต้นเทิร์น / Final) บัฟที่ตั้งไว้จะใช้กับมอนสเตอร์ทุกตัวของเรา
  [...g[side].setZone].forEach(id => {
    if (g.winner) return;
    const c = getCard(id);
    if (!c || !hasSetKeyword(c)) return;
    const skills = (c.autoSkills ?? []).filter(sk => sk.trigger === trigger);
    if (skills.length > 0) runSkills(g, side, c, skills, { ...ctx, all: !ctx.fc });
  });
}

// วางเวท Set ลงช่อง Set: จ่ายค่าใช้จ่าย, ตรวจจำนวน/ชื่อซ้ำ, ทำผลตอนวาง (onCast/onCall) 1 ครั้ง
// Soul ใต้การ์ด Set: เก็บเป็นอาร์เรย์คู่ขนานกับ setZone (ต้องแก้ทั้งสองคู่กันเสมอ)
export function setSoulOf(p: PlayerState, i: number): string[] { return p.setSoul?.[i] ?? []; }
function normSetSoul(p: PlayerState): string[][] {
  const arr = p.setSoul ?? (p.setSoul = []);
  while (arr.length < p.setZone.length) arr.push([]);
  if (arr.length > p.setZone.length) arr.length = p.setZone.length;
  return arr;
}
// เพิ่มการ์ดเข้าช่อง Set พร้อมที่เก็บ Soul ว่าง
function pushSet(p: PlayerState, cardId: string) { normSetSoul(p); p.setZone.push(cardId); p.setSoul!.push([]); }
// เอาการ์ด Set ออกจากช่อง: Soul ทั้งหมดลงสุสานพร้อมกัน (คืน Soul ที่ลงสุสานไป)
function popSet(p: PlayerState, i: number): string[] {
  const souls = normSetSoul(p).splice(i, 1)[0] ?? [];
  p.setZone.splice(i, 1);
  if (souls.length) p.dropZone.push(...souls);
  return souls;
}

function placeSet(g: GameState, side: Side, handIndex: number): string | null {
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return "ไม่พบการ์ดใบนี้ในมือ";
  if (p.setZone.length >= g.rules.maxSet)
    return `ช่อง Set เต็มแล้ว (สูงสุด ${g.rules.maxSet} ใบ) — ต้องรอให้การ์ด Set เดิมถูกทำลายหรือถูกใช้ไปก่อน`;
  const lim = setLimit(card);
  const same = p.setZone.filter(id => getCard(id)?.name === card.name).length;
  if (same >= lim)
    return `${card.name} Set ได้เพียง ${lim} ใบ (ชื่อเดียวกัน) และใบเดิมยังอยู่ในช่อง Set จึงนำใบใหม่มา Set ทับไม่ได้`;
  const costErr = payCost(g, side, card);
  if (costErr) return `Set ${card.name} ไม่ได้ — ${costErr}`;
  p.hand.splice(handIndex, 1);
  pushSet(p, cardId);
  log(g, `${nameOf(side)} Set ${card.name} ลงช่อง Set (อยู่บนสนามจนกว่าจะถูกทำลาย)`);
  fx(g, { k: "cast", side, cardId, label: "SET!" });
  recalcAuras(g);
  const trig = castTrigger(card);
  if (trig) applyEffects(g, side, card, trig);
  recalcAuras(g);
  return null;
}

// ทำลายการ์ด Set ของ side ที่ตำแหน่ง index: ลงสุสาน ผลต่อเนื่องหยุดทันที
function mDestroySet(g: GameState, side: Side, index: number): boolean {
  const p = g[side];
  const id = p.setZone[index];
  if (id === undefined) return false;
  const lostSoul = popSet(p, index);
  p.dropZone.push(id);
  log(g, `${getCard(id)?.name ?? "การ์ด Set"} ในช่อง Set ถูกทำลาย → ลงสุสาน${lostSoul.length ? ` (Soul ${lostSoul.length} ใบลงสุสานด้วย)` : ""} ผลต่อเนื่องหยุดลง`);
  recalcAuras(g);
  return true;
}

// สกิลที่ทำงาน "ตอนใช้เวท": onCast; ถ้าผู้ออกแบบเลือกทริกเกอร์ "เมื่อลงสนาม/ติดตั้ง" (onCall) ให้การ์ดเวท ก็ถือเป็นผลตอนใช้เช่นกัน
function castTrigger(card: Card): AutoTrigger | null {
  const sk = card.autoSkills ?? [];
  if (sk.some(s => s.trigger === "onCast")) return "onCast";
  if (sk.some(s => s.trigger === "onCall")) return "onCall";
  return null;
}
const isCounterOnly = (card: Card) =>
  !hasSetKeyword(card) && (card.autoSkills ?? []).some(s => s.trigger === "onCounter") && castTrigger(card) === null;

export function castSpell(state: GameState, side: Side, handIndex: number): Result {
  const card0 = getCard(state[side].hand[handIndex]);
  const isImpact = card0?.type === "Impact";
  const err = guardTurn(state, side, isImpact ? "final" : "main");
  if (err) return { state, ok: false, msg: err };

  // เวท Counter ล้วน: ห้ามแค่ทิ้งลงสุสานเฉย ๆ — ใช้ผลทันทีถ้าทำได้ ไม่งั้นแจ้งและไม่เสียการ์ด
  if (card0 && isCounterOnly(card0)) {
    const opt: CounterOption = { zone: "hand", index: handIndex };
    if (freeCounterOptions(state, side).some(o => sameOption(o, opt))) return useCounterAnytime(state, side, opt);
    return {
      state, ok: false,
      msg: `${card0.name} เป็นการ์ด Counter — ใช้ตอนศัตรูโจมตี/ร่ายเวท หรือกด Set (วางคว่ำ) ไว้ก่อน (ตอนนี้ใช้ทันทีไม่ได้ เช่น เกจ/Life ไม่พอ หรือผลมีความหมายเฉพาะตอนศัตรูโจมตี/ร่ายเวท)`,
    };
  }

  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (card.type !== "Spell" && card.type !== "Impact") return { state, ok: false, msg: `${card.name} ไม่ใช่เวทมนตร์/Impact` };

  // เวทที่มีคีย์เวิร์ด Set: วางลงช่อง Set (ไม่ลงสุสาน) คงผลต่อเนื่อง — ตรวจก่อนทุกอย่าง แม้การ์ดจะมีสกิล Counter ด้วย
  if (card.type === "Spell" && hasSetKeyword(card)) {
    const e2 = placeSet(g, side, handIndex);
    if (e2) return { state, ok: false, msg: e2 };
    return { state: g, ok: true, msg: `Set ${card.name}` };
  }

  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: `ร่าย ${card.name} ไม่ได้ — ${costErr}` };

  p.hand.splice(handIndex, 1);
  p.dropZone.push(cardId);
  log(g, `${card.name} ถูกร่าย!`);
  fx(g, { k: "cast", side, cardId, label: card.type === "Impact" ? "IMPACT!" : "SPELL!" });
  // เปิดจังหวะ Counter ให้ฝั่งตรงข้ามก่อนเวทมีผล (ถ้ามี Counter ที่ใช้กับเวทได้)
  g.spellWindow = { casterSide: side, cardId, negated: false };
  if (g.rules.enableCounter && counterOptions(g, other(side)).length > 0) {
    log(g, `รอ ${nameOf(other(side))} เลือกว่าจะใช้ Counter กับ ${card.name} หรือไม่...`);
    return { state: g, ok: true, msg: "รอ Counter" };
  }
  resolveSpell(g);
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
  // ไอเทมก็เป็น Buddy ได้: ติดตั้งไอเทมที่เป็น Buddy = Buddy Call (ได้ Buddy Gift ตัวละ 1 ครั้งต่อเกม)
  const myBuddies = deckBuddies(p);
  const calledBuddies = p.buddiesCalled ?? (p.buddyCalledThisGame && p.buddyId ? [p.buddyId] : []);
  const isBuddyCall = myBuddies.includes(cardId) && !calledBuddies.includes(cardId);
  if (isBuddyCall) {
    p.buddiesCalled = [...calledBuddies, cardId];
    p.buddyCalledThisGame = myBuddies.every(b => p.buddiesCalled!.includes(b));
    log(g, `Buddy Call "${card.name}"! ได้รับ Buddy Gift`);
    if (g.rules.buddyCallLife > 0) mLife(g, side, g.rules.buddyCallLife);
  }
  applyEffects(g, side, card, "onCall", { fc: p.item });
  if (isBuddyCall) applyEffects(g, side, card, "onBuddyCall", { fc: p.item });
  recalcAuras(g);
  return { state: g, ok: true, msg: `ติดตั้ง ${card.name}` };
}

// Transform: มอนสเตอร์ (จากมือหรือบนสนาม) จ่าย Transform Cost แล้วกลายเป็นไอเทมของเรา
// ไอเทมเดิม (ถ้ามี) ถูกส่งลงสุสาน · ถ้าแปลงจากสนาม Soul และสถานะ (Rest / จำนวนครั้งที่โจมตีแล้ว) ติดไปด้วย
export type TransformSource = { zone: "hand"; index: number } | { zone: "field"; uid: string };
export function transformCard(state: GameState, side: Side, src: TransformSource): Result {
  const err = guardTurn(state, side, "main");
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];

  let cardId: string | undefined;
  let old: FieldCard | undefined;
  if (src.zone === "hand") {
    cardId = p.hand[src.index];
  } else {
    old = p.monsters.find(m => m.uid === src.uid);
    cardId = old?.cardId;
  }
  const card = cardId ? getCard(cardId) : undefined;
  if (!card || !cardId) return { state, ok: false, msg: src.zone === "hand" ? "ไม่พบการ์ดใบนี้ในมือ" : "ไม่พบมอนสเตอร์ใบนี้บนสนาม" };
  if (!canTransform(card)) return { state, ok: false, msg: `${card.name} ไม่มีความสามารถ Transform` };
  if (old?.nullified) return { state, ok: false, msg: `${card.name} ถูก Nullify อยู่ Transform ไม่ได้` };

  const c = transformCostAmounts(card);
  if (p.gaugePile.length < c.gauge) return { state, ok: false, msg: `Transform ไม่ได้ — เกจไม่พอ: ต้องจ่ายเกจ ${c.gauge} แต่มีเกจ ${p.gaugePile.length}` };
  if (c.life > 0 && p.life <= c.life) return { state, ok: false, msg: `Transform ไม่ได้ — Life ไม่พอ: ต้องจ่าย Life ${c.life} แต่มี Life ${p.life} (หลังจ่ายต้องเหลืออย่างน้อย 1)` };
  if (c.gauge > 0) mPayGauge(g, side, c.gauge);
  if (c.life > 0) p.life -= c.life;

  if (p.item) {
    p.dropZone.push(p.item.cardId, ...p.item.soul);
    log(g, `${cardOfFc(p.item)?.name ?? "ไอเทมเดิม"} ถูกแทนที่และลงสุสาน`);
  }
  const item = newFieldCard(cardId, 0);
  if (src.zone === "hand") {
    p.hand.splice(src.index, 1);
  } else if (old) {
    p.monsters = p.monsters.filter(m => m.uid !== old!.uid);
    item.soul = old.soul;
    item.state = old.state;
    item.attacks = old.attacks;
  }
  p.item = item;
  log(g, `🔄 ${nameOf(side)} Transform ${card.name} → กลายเป็นไอเทม! (จ่าย ${[c.gauge > 0 ? `เกจ ${c.gauge}` : "", c.life > 0 ? `Life ${c.life}` : ""].filter(Boolean).join(" + ") || "0"})`);
  fx(g, { k: "cast", side, cardId, label: "TRANSFORM!" });
  recalcAuras(g);
  // เอฟเฟกต์ "เมื่อ Transform เสร็จ" ทำงานหลังกลายเป็นไอเทมแล้ว (เอฟเฟกต์ที่กระทำกับตัวเองจะกระทำกับไอเทมนี้)
  applyEffects(g, side, card, "onTransform", { fc: item });
  fireSet(g, side, "onTransform", { fc: item });
  recalcAuras(g);
  return { state: g, ok: true, msg: `Transform ${card.name}` };
}

// Move: ตอนเริ่ม Attack Phase ของผู้เล่นแต่ละฝ่าย (ก่อนมีการโจมตี) ย้ายมอนสเตอร์ที่มี [Move] ไป "ช่องที่ว่าง" ได้ 1 ครั้งต่อเทิร์น
function moveWindowOpen(state: GameState): boolean {
  const phaseName = state.rules.useAttackPhase ? "attack" : "main";
  return state.phase === phaseName && state.attacksThisTurn === 0 && !state.battle;
}

export function movableMonsters(state: GameState, side: Side): FieldCard[] {
  const p = state[side];
  const hasFree = [0, 1, 2].some(pos => !p.monsters.some(m => m.position === pos));
  if (!hasFree) return [];
  return p.monsters.filter(m => {
    const c = cardOfFc(m);
    return !!c && !m.nullified && hasKeyword(c, "move") && m.movedTurn !== state.turn;
  });
}

export function moveMonster(state: GameState, side: Side, monsterUid: string, position: number): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (!mulliganDone(state)) return { state, ok: false, msg: "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน" };
  if (state.battle || state.spellWindow || state.pendingLook || state.pendingSoul || state.pendingTarget) return { state, ok: false, msg: "กำลังรอการตัดสินใจ (Counter / เลือกการ์ด) ก่อน" };
  if (!moveWindowOpen(state))
    return { state, ok: false, msg: `Move ใช้ได้ตอนเริ่ม ${state.rules.useAttackPhase ? "Attack Phase" : "Main Phase"} ก่อนมีการโจมตีเท่านั้น (ของทั้งสองฝั่ง)` };
  if (state.currentTurn !== side && state.moveWindow !== side)
    return { state, ok: false, msg: "ตอนนี้ยังไม่ใช่ช่วงที่คุณย้ายได้" };
  const g = structuredClone(state);
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  const card = m ? cardOfFc(m) : undefined;
  if (!m || !card) return { state, ok: false, msg: "ไม่พบมอนสเตอร์" };
  if (!hasKeyword(card, "move")) return { state, ok: false, msg: `${card.name} ไม่มีความสามารถ Move` };
  if (m.nullified) return { state, ok: false, msg: `${card.name} ถูก Nullify จึงใช้ Move ไม่ได้` };
  if (m.movedTurn === g.turn) return { state, ok: false, msg: `${card.name} ใช้ Move ไปแล้วในเทิร์นนี้` };
  if (m.position === position) return { state, ok: false, msg: "มอนสเตอร์อยู่ช่องนั้นอยู่แล้ว" };
  if (p.monsters.some(x => x.position === position))
    return { state, ok: false, msg: `Move ย้ายได้เฉพาะไปยัง "ช่องมอนสเตอร์ที่ว่าง" แต่ช่อง${POSITION_NAMES[position]}มีมอนสเตอร์อยู่` };
  m.position = position;
  m.movedTurn = g.turn;
  log(g, `${card.name} Move ไปช่อง${POSITION_NAMES[position]}`);
  return { state: g, ok: true, msg: "Move" };
}

// ฝั่งป้องกันเลือกจบช่วง Move (ไม่ย้ายต่อ) เพื่อให้ฝั่งโจมตีเริ่มโจมตีได้
export function closeMoveWindow(state: GameState, side: Side): Result {
  if (state.moveWindow !== side) return { state, ok: false, msg: "ไม่มีช่วง Move ให้ปิด" };
  const g = structuredClone(state);
  g.moveWindow = null;
  log(g, `${nameOf(side)} จบช่วง Move`);
  return { state: g, ok: true, msg: "จบช่วง Move" };
}

// Set: วางการ์ด Counter Act คว่ำไว้ในช่อง Set (จ่ายค่าใช้จ่ายตอน Set) แล้วใช้ตอนศัตรูโจมตีได้
export function setCard(state: GameState, side: Side, handIndex: number): Result {
  // Set ได้ทุกเฟสหลัก (Main / Attack / Final) ของเทิร์นตัวเอง
  const err = guardTurn(state, side, "main", true);
  if (err) return { state, ok: false, msg: err };
  const g = structuredClone(state);
  const p = g[side];
  const cardId = p.hand[handIndex];
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return { state, ok: false, msg: "ไม่พบการ์ดใบนี้ในมือ" };
  if (card.type === "Spell" && hasSetKeyword(card)) {
    const e2 = placeSet(g, side, handIndex);
    if (e2) return { state, ok: false, msg: e2 };
    return { state: g, ok: true, msg: `Set ${card.name}` };
  }
  if (!card.autoSkills?.some(s => s.trigger === "onCounter"))
    return { state, ok: false, msg: `${card.name} ไม่มีสกิล Counter หรือคีย์เวิร์ด Set จึง Set ไม่ได้` };
  if (p.setZone.length >= g.rules.maxSet)
    return { state, ok: false, msg: `ช่อง Set เต็มแล้ว (สูงสุด ${g.rules.maxSet} ใบ)` };
  const costErr = payCost(g, side, card);
  if (costErr) return { state, ok: false, msg: `Set ${card.name} ไม่ได้ — ${costErr}` };
  p.hand.splice(handIndex, 1);
  pushSet(p, cardId);
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
    const c = fc ? cardOfFc(fc) : undefined;
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
    const c = cardOfFc(fc);
    if (!c) return { state, ok: false, msg: "ไม่พบข้อมูลการ์ด" };
    if (fc.state !== "stand") return { state, ok: false, msg: `${c.name} อยู่ในสถานะ Rest โจมตีไม่ได้` };
    fcs.push(fc);
  }
  const lead = fcs[0];
  const leadCard = cardOfFc(lead)!;

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
  const names = fcs.map(f => cardOfFc(f)!.name).join(" + ");
  log(g, `${fcs.length > 1 ? "⚔ Link Attack! " : "⚔ "}${names} โจมตี${label}!`);
  // เอฟเฟกต์ "เมื่อโจมตี" ของผู้โจมตีจะทำงานหลังจังหวะ Counter (ใน resolveBattle) เพื่อให้ฝั่งป้องกันมีโอกาสใช้ Counter ก่อน
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

// จังหวะ Counter ปัจจุบัน: ตอนศัตรูโจมตี หรือ ตอนศัตรูร่ายเวท
function counterTiming(state: GameState): CounterTiming | null {
  if (state.battle) return "attack";
  if (state.spellWindow) return "cast";
  return null;
}
const timingOk = (sk: AutoSkill, timing: CounterTiming) => {
  const t = sk.timing ?? "attack";
  return t === "any" || t === timing;
};
// timing = null → ใช้นอกจังหวะโจมตี/ร่ายเวท (ใช้ได้ทุกเวลา) ไม่กรองตามจังหวะ
const counterSkills = (card: Card, trig: AutoTrigger, timing: CounterTiming | null, only?: number) =>
  (card.autoSkills ?? []).filter((sk, i) => (only === undefined || i === only) && sk.trigger === trig && (timing === null || timingOk(sk, timing)));
// ดัชนีสกิล Counter Act บนสนามที่ใช้ได้ตอนนี้ (anytime = ใช้ได้ทุกเวลา ไม่ผูกกับจังหวะ)
function actSkillIdxs(card: Card, timing: CounterTiming | null, anytime: boolean): number[] {
  const out: number[] = [];
  (card.autoSkills ?? []).forEach((sk, i) => {
    if (sk.trigger !== "onCounterAct") return;
    if (anytime ? !sk.effects.some(e => !WINDOW_ONLY_EFFECTS.has(e.type)) : !(timing === null || timingOk(sk, timing))) return;
    out.push(i);
  });
  return out;
}
const actUsed = (fc: FieldCard, turn: number, idx: number) => fc.counterUsedTurn === turn && (fc.counterUsedSkills ?? []).includes(idx);

function skillNeedsSoul(card: Card, timing: CounterTiming | null, only?: number): number {
  let need = 0;
  counterSkills(card, "onCounterAct", timing, only).forEach(s => {
    let n = 0;
    s.effects.forEach(e => { if (e.type === "removeSoul") n += Math.floor(e.value); });
    need = Math.max(need, n);
  });
  return need;
}

// ---- ค่าใช้จ่ายเพิ่มเติมที่กำหนดในสกิล Counter (เกจ / Life) ----
interface ExtraCost { gauge: number; life: number; deck: number; hand: number }
function extraCostOf(card: Card, trig: AutoTrigger, timing: CounterTiming | null, only?: number): ExtraCost {
  const out: ExtraCost = { gauge: 0, life: 0, deck: 0, hand: 0 };
  counterSkills(card, trig, timing, only).forEach(s => {
    out.gauge += Math.max(0, Math.floor(s.cost?.gauge ?? 0));
    out.life += Math.max(0, Math.floor(s.cost?.life ?? 0));
    out.deck += Math.max(0, Math.floor(s.cost?.deckToDrop ?? 0));
    out.hand += Math.max(0, Math.floor(s.cost?.handToDrop ?? 0));
  });
  return out;
}
const optSkill = (opt: CounterOption) => (opt.zone === "field" ? opt.skill : undefined);
const trigOfOpt = (opt: CounterOption): AutoTrigger => (opt.zone === "hand" || opt.zone === "set" ? "onCounter" : "onCounterAct");
// จำนวนการ์ดในมือที่ต้องเลือกทิ้งเป็นค่าใช้จ่าย (UI ใช้เพื่อเปิดหน้าเลือกการ์ด)
export function counterHandCost(card: Card, opt: CounterOption, timing: CounterTiming | null = null): number {
  return extraCostOf(card, trigOfOpt(opt), timing, optSkill(opt)).hand;
}
// withCall = รวม Call Cost ของการ์ดในมือเข้าไปด้วย (ใช้กับ Counter จากมือ — การ์ดที่ใช้เองไม่นับเป็นการ์ดที่ทิ้งได้)
function canAffordExtra(p: PlayerState, card: Card, trig: AutoTrigger, timing: CounterTiming | null, withCall: boolean, only?: number): boolean {
  const ex = extraCostOf(card, trig, timing, only);
  const cc = withCall ? callCostAmounts(card) : { gauge: 0, life: 0 };
  const gaugeNeed = ex.gauge + cc.gauge;
  const lifeNeed = ex.life + cc.life;
  if (p.gaugePile.length < gaugeNeed) return false;
  if (lifeNeed > 0 && p.life <= lifeNeed) return false; // ต้องเหลือ Life อย่างน้อย 1
  if (p.deck.length < ex.deck) return false;
  if (p.hand.length - (withCall ? 1 : 0) < ex.hand) return false;
  return true;
}
// ตรวจรายการการ์ดในมือที่เลือกทิ้ง: คืน id ของการ์ด หรือข้อความผิดพลาด
function pickDiscard(p: PlayerState, need: number, opt: CounterOption): { ids: string[] } | { err: string } {
  if (need <= 0) return { ids: [] };
  const sel = opt.discard ?? [];
  const uniq = new Set(sel);
  if (sel.length !== need || uniq.size !== need) return { err: `ต้องเลือกการ์ดในมือที่จะทิ้ง ${need} ใบ` };
  for (const i of sel) {
    if (!Number.isInteger(i) || i < 0 || i >= p.hand.length) return { err: "เลือกการ์ดที่จะทิ้งไม่ถูกต้อง" };
    if (opt.zone === "hand" && i === opt.index) return { err: "ทิ้งการ์ด Counter ใบที่กำลังใช้ซ้ำไม่ได้" };
  }
  return { ids: sel.map(i => p.hand[i]) };
}
// จ่ายค่าใช้จ่ายที่ไม่ต้องเลือก (เกจ / Life / การ์ดบนเด็ค) — การทิ้งการ์ดบนมือทำแยกด้วย discardFromHand หลังการ์ดที่ใช้ออกจากมือแล้ว
function payExtra(g: GameState, side: Side, card: Card, trig: AutoTrigger, timing: CounterTiming | null, only?: number) {
  const ex = extraCostOf(card, trig, timing, only);
  if (ex.gauge > 0) { mPayGauge(g, side, ex.gauge); log(g, `${nameOf(side)} จ่ายเกจ ${ex.gauge} เพื่อใช้ ${card.name}`); }
  if (ex.life > 0) mLife(g, side, -ex.life);
  if (ex.deck > 0) {
    const p = g[side];
    let n = 0;
    for (let i = 0; i < ex.deck && p.deck.length > 0; i++) { p.dropZone.push(p.deck.shift()!); n++; }
    log(g, `${nameOf(side)} ทิ้งการ์ดบนเด็ค ${n} ใบลงสุสาน เพื่อใช้ ${card.name}`);
  }
}
function discardFromHand(g: GameState, side: Side, ids: string[], cardName: string) {
  if (ids.length === 0) return;
  const p = g[side];
  ids.forEach(id => {
    const at = p.hand.indexOf(id);
    if (at >= 0) { p.hand.splice(at, 1); p.dropZone.push(id); }
  });
  log(g, `${nameOf(side)} ทิ้งการ์ดบนมือ ${ids.length} ใบ (${ids.map(i => getCard(i)?.name ?? "?").join(", ")}) เพื่อใช้ ${cardName}`);
}
// ข้อความค่าใช้จ่ายเพิ่มเติม สำหรับแสดงบนปุ่ม (เช่น "เกจ 1 + Life 1") ว่างถ้าไม่มี
export function counterExtraCostLabel(card: Card, opt: CounterOption, timing: CounterTiming | null = null): string {
  const ex = extraCostOf(card, trigOfOpt(opt), timing, optSkill(opt));
  const parts: string[] = [];
  if (ex.gauge > 0) parts.push(`เกจ ${ex.gauge}`);
  if (ex.life > 0) parts.push(`Life ${ex.life}`);
  if (ex.deck > 0) parts.push(`ทิ้งเด็ค ${ex.deck}`);
  if (ex.hand > 0) parts.push(`ทิ้งมือ ${ex.hand}`);
  return parts.join(" + ");
}

// ---- Counter 【Act】 ของการ์ด Set ในช่อง Set ----
const setKey = (p: PlayerState, i: number) => `${p.setZone[i]}#${p.setZone.slice(0, i).filter(x => x === p.setZone[i]).length}`;
const setActUsedThisTurn = (state: GameState, side: Side, i: number) => state[side].setActUsed?.[setKey(state[side], i)] === state.turn;
// ค่าใช้จ่ายแบบ Soul ของสกิล (ถอด Soul ฯลฯ) ต้องมีการ์ดของเราที่มี Soul พอ จึงใช้ได้
function setActAffordable(p: PlayerState, c: Card, timing: CounterTiming | null): boolean {
  let need = 0;
  counterSkills(c, "onCounterAct", timing).forEach(s => {
    let n = 0;
    s.effects.forEach(e => { if (e.type === "removeSoul" || e.type === "chooseRemoveSoul") n += Math.max(1, Math.floor(e.value)); });
    need = Math.max(need, n);
  });
  if (need === 0) return true;
  return [...p.monsters, ...(p.item ? [p.item] : [])].some(m => m.soul.length >= need);
}
function setActOptions(state: GameState, side: Side, timing: CounterTiming | null, anytime: boolean): CounterOption[] {
  const p = state[side];
  const out: CounterOption[] = [];
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (!c || !hasSetKeyword(c)) return;
    const has = anytime ? usableAnytime(c, "onCounterAct") : counterSkills(c, "onCounterAct", timing).length > 0;
    if (!has || setActUsedThisTurn(state, side, i) || !setActAffordable(p, c, timing) || !canAffordExtra(p, c, "onCounterAct", timing, false)) return;
    out.push({ zone: "setAct", index: i });
  });
  return out;
}

// ตัวเลือก Counter ของฝั่ง side ณ จังหวะปัจจุบัน
//  - 【Counter】: การ์ดในมือ (จ่ายค่าใช้จ่าย) และการ์ดในช่อง Set (จ่ายไว้แล้ว)
//  - Counter 【Act】: ความสามารถของการ์ดบนสนาม (ใช้ได้ 1 ครั้งต่อเทิร์น จ่ายตามที่เขียนในสกิล เช่น ถอด Soul)
export function counterOptions(state: GameState, side: Side): CounterOption[] {
  const timing = counterTiming(state);
  if (!state.rules.enableCounter || !timing) return [];
  if (state.battle && state.battle.attackerSide === side) return [];
  if (state.spellWindow && state.spellWindow.casterSide === side) return [];
  const p = state[side];
  const out: CounterOption[] = [];
  p.hand.forEach((id, i) => {
    const c = getCard(id);
    if (!c || counterSkills(c, "onCounter", timing).length === 0) return;
    if (canAffordExtra(p, c, "onCounter", timing, true)) out.push({ zone: "hand", index: i });
  });
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (c && counterSkills(c, "onCounter", timing).length > 0 && canAffordExtra(p, c, "onCounter", timing, false)) out.push({ zone: "set", index: i });
  });
  out.push(...setActOptions(state, side, timing, false));
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
    const c = cardOfFc(fc);
    if (!c || fc.nullified) return;
    actSkillIdxs(c, timing, false).forEach(idx => {
      if (actUsed(fc, state.turn, idx)) return;
      if (fc.soul.length < skillNeedsSoul(c, timing, idx)) return;
      if (!canAffordExtra(p, c, "onCounterAct", timing, false, idx)) return;
      out.push({ zone: "field", uid: fc.uid, skill: idx });
    });
  });
  return out;
}

// ข้อความสรุป Counter 【Act】 ที่เลือก (แสดงเมื่อการ์ดมี Act หลายอัน เพื่อแยกว่าเป็นอันไหน)
export function counterSkillLabel(card: Card, opt: CounterOption): string {
  if (opt.zone !== "field" || opt.skill === undefined) return "";
  const acts = (card.autoSkills ?? []).filter(sk => sk.trigger === "onCounterAct");
  if (acts.length <= 1) return "";
  const sk = card.autoSkills?.[opt.skill];
  if (!sk) return "";
  return skillLines({ ...card, customText: "", autoSkills: [sk] })[0] ?? sk.name ?? "";
}
export function counterCardOf(state: GameState, side: Side, opt: CounterOption): Card | undefined {
  const p = state[side];
  if (opt.zone === "hand") return getCard(p.hand[opt.index]);
  if (opt.zone === "set" || opt.zone === "setAct") return getCard(p.setZone[opt.index]);
  const fc = findFc(p, opt.uid);
  return fc ? cardOfFc(fc) : undefined;
}

function sameOption(a: CounterOption, b: CounterOption) {
  if (a.zone !== b.zone) return false;
  if (a.zone === "field" && b.zone === "field") return a.uid === b.uid && a.skill === b.skill;
  if (a.zone !== "field" && b.zone !== "field") return a.index === b.index;
  return false;
}

// จบจังหวะ Counter: ต่อสู้ต่อ หรือให้เวทมีผล
function finishWindow(g: GameState) {
  if (g.battle) resolveBattle(g);
  else if (g.spellWindow) resolveSpell(g);
}

function resolveSpell(g: GameState) {
  const w = g.spellWindow;
  g.spellWindow = null;
  if (!w) return;
  const card = getCard(w.cardId);
  if (!card) return;
  if (w.negated) { log(g, `${card.name} ถูกยกเลิก ไม่มีผล`); return; }
  const trig = castTrigger(card);
  if (!trig) { log(g, `${card.name} ไม่มีผลที่ทำงานตอนร่าย`); return; }
  applyEffects(g, w.casterSide, card, trig);
}

// หลังใช้ Counter 1 ใบ: ถ้ามีการเลือกการ์ดค้างให้รอก่อน ไม่งั้นถ้าไม่มี Counter เหลือให้ปิดจังหวะ
function afterCounter(g: GameState, side: Side) {
  if (g.pendingLook) { g.pendingLook.resumeCounter = true; return; }
  if (g.pendingSoul) { g.pendingSoul.resumeCounter = true; return; }
  if (g.pendingTarget) { g.pendingTarget.resumeCounter = true; return; }
  if (g.winner) { g.battle = null; g.spellWindow = null; return; }
  if (g.battle?.triggered) { finishWindow(g); return; } // จังหวะ Counter ผ่านไปแล้ว เหลือแค่คิดดาเมจหลังเลือกเสร็จ
  if (counterOptions(g, side).length === 0) finishWindow(g);
}

// ทำงานของ Counter 1 ใบ (ใช้ร่วมกันทั้งตอนอยู่ในจังหวะโจมตี/ร่ายเวท และตอนใช้ได้ทุกเวลา)
function runCounterOption(g: GameState, side: Side, opt: CounterOption, timing: CounterTiming | null): string | null {
  const p = g[side];
  const b = g.battle;
  const tgt = b && b.target.kind === "monster" ? p.monsters.find(m => m.position === (b.target as { position: number }).position) : undefined;

  if (opt.zone === "hand") {
    const cardId = p.hand[opt.index];
    const card = getCard(cardId)!;
    if (!canAffordExtra(p, card, "onCounter", timing, true)) return "ค่าใช้จ่ายของ Counter นี้ไม่พอ (เกจ / Life / การ์ดบนเด็ค / การ์ดบนมือ)";
    const dis = pickDiscard(p, extraCostOf(card, "onCounter", timing).hand, opt);
    if ("err" in dis) return dis.err;
    const costErr = payCost(g, side, card);
    if (costErr) return costErr;
    payExtra(g, side, card, "onCounter", timing);
    p.hand.splice(opt.index, 1);
    p.dropZone.push(cardId);
    discardFromHand(g, side, dis.ids, card.name);
    log(g, `🛡 ${nameOf(side)} ใช้ Counter จากมือ: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    runSkills(g, side, card, counterSkills(card, "onCounter", timing), { fc: tgt });
  } else if (opt.zone === "set") {
    const cardId = p.setZone[opt.index];
    const card = getCard(cardId)!;
    if (!canAffordExtra(p, card, "onCounter", timing, false)) return "ค่าใช้จ่ายของ Counter นี้ไม่พอ (เกจ / Life / การ์ดบนเด็ค / การ์ดบนมือ)";
    const dis = pickDiscard(p, extraCostOf(card, "onCounter", timing).hand, opt);
    if ("err" in dis) return dis.err;
    payExtra(g, side, card, "onCounter", timing);
    discardFromHand(g, side, dis.ids, card.name);
    popSet(p, opt.index);
    p.dropZone.push(cardId);
    log(g, `🛡 ${nameOf(side)} เปิดการ์ด Set: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    runSkills(g, side, card, counterSkills(card, "onCounter", timing), { fc: tgt });
  } else if (opt.zone === "setAct") {
    const cardId = p.setZone[opt.index];
    const card = getCard(cardId)!;
    if (!canAffordExtra(p, card, "onCounterAct", timing, false)) return "ค่าใช้จ่ายของ Counter 【Act】 นี้ไม่พอ (เกจ / Life / การ์ดบนเด็ค / การ์ดบนมือ)";
    const dis = pickDiscard(p, extraCostOf(card, "onCounterAct", timing).hand, opt);
    if ("err" in dis) return dis.err;
    payExtra(g, side, card, "onCounterAct", timing);
    discardFromHand(g, side, dis.ids, card.name);
    p.setActUsed = { ...(p.setActUsed ?? {}), [setKey(p, opt.index)]: g.turn };
    log(g, `🛡 ${nameOf(side)} ใช้ Counter 【Act】 ของการ์ด Set: ${card.name} (การ์ดยังอยู่ในช่อง Set)`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER ACT!" });
    runSkills(g, side, card, counterSkills(card, "onCounterAct", timing), {});
  } else {
    const fc = findFc(p, opt.uid)!;
    const card = cardOfFc(fc)!;
    // เลือกสกิล Act ที่ระบุ (ถ้าไม่ระบุและมีหลายอัน ใช้อันแรกที่ใช้ได้)
    const only = opt.skill ?? actSkillIdxs(card, timing, timing === null).find(i => !actUsed(fc, g.turn, i));
    if (only === undefined || !counterSkills(card, "onCounterAct", timing, only).length) return "ไม่พบ Counter 【Act】 ที่เลือก";
    if (actUsed(fc, g.turn, only)) return "Counter 【Act】 นี้ใช้ไปแล้วในเทิร์นนี้";
    if (fc.soul.length < skillNeedsSoul(card, timing, only)) return "Soul ไม่พอสำหรับ Counter 【Act】 นี้";
    if (!canAffordExtra(p, card, "onCounterAct", timing, false, only)) return "ค่าใช้จ่ายของ Counter 【Act】 นี้ไม่พอ (เกจ / Life / การ์ดบนเด็ค / การ์ดบนมือ)";
    const dis = pickDiscard(p, extraCostOf(card, "onCounterAct", timing, only).hand, opt);
    if ("err" in dis) return dis.err;
    payExtra(g, side, card, "onCounterAct", timing, only);
    discardFromHand(g, side, dis.ids, card.name);
    if (fc.counterUsedTurn !== g.turn) fc.counterUsedSkills = [];
    fc.counterUsedTurn = g.turn;
    fc.counterUsedSkills = [...(fc.counterUsedSkills ?? []), only];
    const multi = (card.autoSkills ?? []).filter(sk => sk.trigger === "onCounterAct").length > 1;
    const sk = card.autoSkills?.[only];
    log(g, `🛡 ${nameOf(side)} ใช้ Counter 【Act】${multi && sk?.name ? ` 「${sk.name}」` : ""} ของ ${card.name} บนสนาม!`);
    runSkills(g, side, card, counterSkills(card, "onCounterAct", timing, only), { fc });
  }
  recalcAuras(g);
  return null;
}

export function counterAct(state: GameState, side: Side, opt: CounterOption): Result {
  const timing = counterTiming(state);
  if (!timing) return { state, ok: false, msg: "ไม่มีจังหวะให้ Counter" };
  if (state.pendingLook || state.pendingSoul || state.pendingTarget) return { state, ok: false, msg: "กำลังรอเลือกการ์ด (ดูกอง / ถอด Soul)" };
  if (state.battle && state.battle.attackerSide === side) return { state, ok: false, msg: "Counter ได้เฉพาะฝั่งที่ถูกโจมตี" };
  if (state.spellWindow && state.spellWindow.casterSide === side) return { state, ok: false, msg: "Counter ได้เฉพาะฝั่งตรงข้ามของผู้ร่ายเวท" };
  if (!counterOptions(state, side).some(o => sameOption(o, opt))) return { state, ok: false, msg: "ใช้การ์ดนี้เป็น Counter ไม่ได้ในตอนนี้ (เช่น เกจ/Soul ไม่พอ ใช้ไปแล้วในเทิร์นนี้ หรือจังหวะไม่ตรงกับการ์ด)" };
  const g = structuredClone(state);
  const err = runCounterOption(g, side, opt, timing);
  if (err) return { state, ok: false, msg: err };
  afterCounter(g, side);
  return { state: g, ok: true, msg: "ใช้ Counter" };
}

/* ------------------------------------------------------------------ */
/* Counter ใช้ได้ทุกเวลา: Main / Attack / Final ของเทิร์นใครก็ได้       */
/* (นอกจังหวะที่กำลังรอ Counter ของการโจมตี/เวท)                       */
/* ------------------------------------------------------------------ */
// เอฟเฟกต์ที่มีความหมายเฉพาะตอนมีการโจมตี/เวทกำลังรอ — ใช้นอกจังหวะไม่ได้ผล จึงไม่เสนอให้กดใช้ลอย ๆ
const WINDOW_ONLY_EFFECTS = new Set<string>(["negateAttack", "destroyAttacker", "restAttacker", "negateSpell"]);
const usableAnytime = (card: Card, trig: AutoTrigger) =>
  counterSkills(card, trig, null).some(sk => sk.effects.some(e => !WINDOW_ONLY_EFFECTS.has(e.type)));

export function freeCounterOptions(state: GameState, side: Side): CounterOption[] {
  if (!state.rules.enableCounter || state.winner || !mulliganDone(state)) return [];
  if (state.battle || state.spellWindow || state.pendingLook || state.pendingSoul || state.pendingTarget || state.moveWindow) return [];
  const p = state[side];
  const out: CounterOption[] = [];
  p.hand.forEach((id, i) => {
    const c = getCard(id);
    if (!c || !usableAnytime(c, "onCounter")) return;
    if (canAffordExtra(p, c, "onCounter", null, true)) out.push({ zone: "hand", index: i });
  });
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (c && usableAnytime(c, "onCounter") && canAffordExtra(p, c, "onCounter", null, false)) out.push({ zone: "set", index: i });
  });
  out.push(...setActOptions(state, side, null, true));
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
    const c = cardOfFc(fc);
    if (!c || fc.nullified) return;
    actSkillIdxs(c, null, true).forEach(idx => {
      if (actUsed(fc, state.turn, idx)) return;
      if (fc.soul.length < skillNeedsSoul(c, null, idx)) return;
      if (!canAffordExtra(p, c, "onCounterAct", null, false, idx)) return;
      out.push({ zone: "field", uid: fc.uid, skill: idx });
    });
  });
  return out;
}

export function useCounterAnytime(state: GameState, side: Side, opt: CounterOption): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (!mulliganDone(state)) return { state, ok: false, msg: "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน" };
  if (state.battle || state.spellWindow) return { state, ok: false, msg: "กำลังอยู่ในจังหวะ Counter ของการโจมตี/เวท — ใช้ผ่านหน้าต่าง Counter" };
  if (state.pendingLook || state.pendingSoul || state.pendingTarget || state.moveWindow) return { state, ok: false, msg: "กำลังรอการตัดสินใจ (เลือกการ์ด / Move) ก่อน" };
  if (!freeCounterOptions(state, side).some(o => sameOption(o, opt)))
    return { state, ok: false, msg: "ใช้ Counter ใบนี้ไม่ได้ในตอนนี้ (เกจ/Life/Soul ไม่พอ ใช้ไปแล้วในเทิร์นนี้ หรือสกิลมีผลเฉพาะตอนศัตรูโจมตี/ร่ายเวท)" };
  const g = structuredClone(state);
  const err = runCounterOption(g, side, opt, null);
  if (err) return { state, ok: false, msg: err };
  return { state: g, ok: true, msg: "ใช้ Counter" };
}

export function passCounter(state: GameState, side: Side): Result {
  if (!counterTiming(state)) return { state, ok: false, msg: "ไม่มีจังหวะให้ตัดสินใจ" };
  if (state.pendingLook || state.pendingSoul || state.pendingTarget) return { state, ok: false, msg: "กำลังรอเลือกการ์ด (ดูกอง / ถอด Soul)" };
  if (state.battle && state.battle.attackerSide === side) return { state, ok: false, msg: "ไม่ใช่ฝั่งป้องกัน" };
  if (state.spellWindow && state.spellWindow.casterSide === side) return { state, ok: false, msg: "ไม่ใช่ฝั่งที่ต้องตัดสินใจ" };
  const g = structuredClone(state);
  log(g, `${nameOf(side)} ไม่ใช้ Counter`);
  finishWindow(g);
  return { state: g, ok: true, msg: "ดำเนินต่อ" };
}

// เลือกการ์ดที่จะถอด Soul (targetUid = null คือไม่ถอด: ข้ามเอฟเฟกต์ที่ขึ้นกับการถอดของสกิลนี้)
export function resolveSoulChoice(state: GameState, side: Side, targetUid: string | null): Result {
  const ps = state.pendingSoul;
  if (!ps || ps.side !== side) return { state, ok: false, msg: "ไม่มีการเลือกถอด Soul ที่รอคุณอยู่" };
  if (targetUid !== null && !ps.candidates.includes(targetUid)) return { state, ok: false, msg: "การ์ดใบนี้ถอด Soul ไม่ได้ (Soul ไม่พอ)" };
  const g = structuredClone(state);
  const p = g[side];
  g.pendingSoul = null;
  const card = getCard(ps.cardId);
  let chosen: FieldCard | undefined;
  let skills = ps.cont?.skills ?? [];
  if (targetUid === null) {
    log(g, `${nameOf(side)} เลือกไม่ถอด Soul`);
    if (ps.cont?.firstIsRest) skills = skills.slice(1);
  } else {
    chosen = findFc(p, targetUid) ?? undefined;
    if (chosen) mRemoveSoul(g, side, chosen, ps.n);
    else if (ps.cont?.firstIsRest) skills = skills.slice(1);
  }
  if (card && skills.length > 0 && !g.winner) {
    const baseFc = ps.cont?.fcUid ? findFc(p, ps.cont.fcUid) ?? undefined : undefined;
    runSkills(g, side, card, skills, { fc: chosen ?? baseFc });
  }
  if (ps.resumeCounter) afterCounter(g, side);
  return { state: g, ok: true, msg: "เลือกเสร็จแล้ว" };
}

// ดูการ์ดบนสุดของกองแล้วเลือก: ขึ้นมือ / ลงดรอป / ใต้สุดของกอง (ที่ไม่ได้เลือกจะวางกลับบนสุดตามลำดับเดิม)
export function resolveLook(state: GameState, side: Side, pick: { hand: number[]; drop: number[]; bottom: number[] }): Result {
  const pl = state.pendingLook;
  if (!pl || pl.side !== side) return { state, ok: false, msg: "ไม่มีการเลือกการ์ดที่รอคุณอยู่" };
  const all = [...pick.hand, ...pick.drop, ...pick.bottom];
  if (new Set(all).size !== all.length || all.some(i => i < 0 || i >= pl.cards.length))
    return { state, ok: false, msg: "เลือกการ์ดซ้ำกัน หรือเลือกนอกช่วง" };
  if (pick.hand.length > pl.toHand) return { state, ok: false, msg: `ขึ้นมือได้สูงสุด ${pl.toHand} ใบ` };
  if (pick.drop.length > pl.toDrop) return { state, ok: false, msg: `ลงดรอปได้สูงสุด ${pl.toDrop} ใบ` };
  if (pick.bottom.length > pl.toBottom) return { state, ok: false, msg: `ใส่ใต้กองได้สูงสุด ${pl.toBottom} ใบ` };

  const g = structuredClone(state);
  const p = g[side];
  const top = p.deck.splice(0, pl.cards.length);
  const keep: string[] = [];
  const bottom: string[] = [];
  top.forEach((id, i) => {
    if (pick.hand.includes(i)) p.hand.push(id);
    else if (pick.drop.includes(i)) p.dropZone.push(id);
    else if (pick.bottom.includes(i)) bottom.push(id);
    else keep.push(id);
  });
  p.deck.unshift(...keep);
  p.deck.push(...bottom);
  const parts: string[] = [];
  if (pick.hand.length) parts.push(`ขึ้นมือ ${pick.hand.length}`);
  if (pick.drop.length) parts.push(`ลงดรอป ${pick.drop.length}`);
  if (pick.bottom.length) parts.push(`ใต้กอง ${pick.bottom.length}`);
  if (keep.length) parts.push(`วางกลับบนกอง ${keep.length}`);
  log(g, `${nameOf(side)} เลือกจากการดูกอง: ${parts.join(" · ") || "ไม่เลือก"}`);
  g.pendingLook = null;

  const card = getCard(pl.cardId);
  if (card && pl.cont) {
    const fc = pl.cont.fcUid ? findFc(p, pl.cont.fcUid) ?? undefined : undefined;
    runSkills(g, side, card, pl.cont.skills, { fc });
  }
  if (pl.resumeCounter) afterCounter(g, side); // ผู้ที่ใช้ Counter คือผู้ที่ดูกอง
  return { state: g, ok: true, msg: "เลือกเสร็จแล้ว" };
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

  let parts = b.linkUids
    .map(u => findFc(me, u))
    .filter((x): x is FieldCard => !!x)
    .map(fc => ({ fc, card: cardOfFc(fc)!, isItem: me.item?.uid === fc.uid }))
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
    log(g, "การโจมตีถูกยกเลิก (ความสามารถ \"เมื่อโจมตี\" ไม่ทำงาน)");
    finish();
    return;
  }

  // หลังจังหวะ Counter: เอฟเฟกต์ "เมื่อโจมตี" ของผู้โจมตีทำงาน (เช่น ทำลายมอนสเตอร์ศัตรู) ก่อนคิดดาเมจ
  if (!b.triggered) {
    parts.forEach(({ fc, card }) => {
      applyEffects(g, side, card, "onAttack", { fc });
      fireSet(g, side, "onAttack", { fc });
    });
    if (g.winner) return;
    if (g.pendingLook || g.pendingSoul || g.pendingTarget) {
      // ต้องรอผู้เล่นเลือกก่อน: คงการต่อสู้ไว้ (ไม่เปิดหน้าต่าง Counter ซ้ำ) แล้วค่อยคิดดาเมจหลังเลือกเสร็จ
      g.battle = { ...b, triggered: true };
      if (g.pendingLook) g.pendingLook.resumeCounter = true;
      if (g.pendingSoul) g.pendingSoul.resumeCounter = true;
      if (g.pendingTarget) g.pendingTarget.resumeCounter = true;
      return;
    }
    parts = parts.filter(x => me.monsters.some(m => m.uid === x.fc.uid) || me.item?.uid === x.fc.uid);
    if (parts.length === 0) { log(g, "ผู้โจมตีหายไปแล้ว การโจมตีไม่เกิดผล"); return; }
  }

  const total = parts.reduce((a, { fc }) => {
    const s = statsOf(fc);
    return { power: a.power + s.power, critical: a.critical + s.critical };
  }, { power: 0, critical: 0 });
  const penetrate = parts.some(x => hasKeyword(x.card, "penetrate"));
  const chosen = b.target;
  const linkNote = parts.length > 1 ? ` (Link Attack รวม Power ${total.power} / Critical ${total.critical})` : "";

  if (chosen.kind === "monster") {
    const tgt = foe.monsters.find(m => m.position === chosen.position);
    if (!tgt) {
      log(g, "เป้าหมายหายไปแล้ว การโจมตีไม่เกิดผล");
      finish();
      return;
    }
    const tgtCard = cardOfFc(tgt);
    const tgtStats = statsOf(tgt);
    const tgtName = tgtCard?.name ?? "มอนสเตอร์";

    // ผู้โจมตีทำดาเมจใส่เป้าหมาย: Power ≥ Defense ของเป้า -> เป้าถูกทำลาย
    let targetDestroyed = false;
    if (tgtCard && !tgt.nullified && hasKeyword(tgtCard, "indestructibleBattle")) {
      log(g, `${tgtName} ไม่ถูกทำลายจากการต่อสู้`);
    } else if (total.power >= tgtStats.defense) {
      log(g, `Power ${total.power} ≥ Def ${tgtStats.defense} → ทำลาย ${tgtName}${linkNote}`);
      targetDestroyed = mDestroyMonster(g, oppSide, tgt.uid);
    } else {
      log(g, `Power ${total.power} < Def ${tgtStats.defense} → ${tgtName} รอด${linkNote}`);
    }

    // Counterattack: ถ้าเป้าหมายที่ถูกโจมตียังอยู่บนสนามหลังการโจมตี เลือกผู้โจมตี 1 ตัวที่ Defense ≤ Power ของเป้า แล้วทำลาย
    if (tgtCard && !tgt.nullified && hasKeyword(tgtCard, "counterattack") && !g.winner && foe.monsters.some(m => m.uid === tgt.uid)) {
      const victims = parts
        .filter(({ fc, card, isItem }) => !isItem && me.monsters.some(m => m.uid === fc.uid) && !(!fc.nullified && hasKeyword(card, "indestructibleBattle")) && statsOf(fc).defense <= tgtStats.power)
        .sort((x, y) => statsOf(y.fc).critical - statsOf(x.fc).critical);
      if (victims.length > 0) {
        const v = victims[0];
        log(g, `Counterattack! ${tgtName} (Power ${tgtStats.power}) ยังอยู่บนสนาม → ทำลาย ${v.card.name} (Def ${statsOf(v.fc).defense})`);
        mDestroyMonster(g, side, v.fc.uid);
      }
    }

    if (targetDestroyed) {
      parts.forEach(({ fc, card }) => {
        const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
        if (alive) { applyEffects(g, side, card, "onDestroyEnemy", { fc }); fireSet(g, side, "onDestroyEnemy", { fc }); }
      });
      if (penetrate && chosen.position === 1 && !g.winner) {
        log(g, `Penetrate! ทะลวงเกราะ ดาเมจ ${total.critical}`);
        mLife(g, oppSide, -total.critical);
        if (!g.winner) parts.forEach(({ fc, card }) => {
          const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
          if (alive) { applyEffects(g, side, card, "onDamage", { fc }); fireSet(g, side, "onDamage", { fc }); }
        });
      }
    }
  } else {
    // ไอเทมของฝั่งที่ถูกโจมตีมี Defense: ถ้า Power รวมของผู้โจมตี < Defense ของไอเทม → ป้องกันได้ ผู้เล่นไม่ได้รับดาเมจ
    const guard = foe.item;
    const guardCard = guard ? cardOfFc(guard) : undefined;
    const guardDef = guard && guardCard && !guard.nullified ? statsOf(guard).defense : 0;
    if (guardDef > 0 && total.power < guardDef) {
      log(g, `🛡 ${guardCard!.name} ป้องกันไว้! Power ${total.power} < Def ${guardDef} → ผู้เล่นไม่ได้รับดาเมจ${linkNote}`);
    } else {
      if (guardDef > 0) log(g, `${guardCard!.name} ป้องกันไม่ไหว (Power ${total.power} ≥ Def ${guardDef})`);
      log(g, `ทำดาเมจใส่ผู้เล่น ${total.critical}${linkNote}`);
      mLife(g, oppSide, -total.critical);
      if (!g.winner) parts.forEach(({ fc, card }) => {
        const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
        if (alive) { applyEffects(g, side, card, "onDamage", { fc }); fireSet(g, side, "onDamage", { fc }); }
      });
    }
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
  to: "hand" | "dropZone" | "gauge" | "field" | "deck" | "deckBottom",
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
    // uidOrIndex = ตำแหน่งในกอง (ใช้ตอนค้นเด็ค) ถ้าไม่ระบุ = ใบบนสุด
    const idx = typeof uidOrIndex === "number" ? uidOrIndex : 0;
    cardId = p.deck.splice(idx, 1)[0] ?? null;
  }

  if (!cardId) return state;

  if (to === "hand") p.hand.push(cardId);
  else if (to === "dropZone") p.dropZone.push(cardId);
  else if (to === "deck") p.deck.unshift(cardId);
  else if (to === "deckBottom") p.deck.push(cardId);
  else if (to === "gauge") { p.gaugePile.push(cardId); syncGauge(p); }
  else if (to === "field") {
    const free = [1, 0, 2].find(pos => !p.monsters.some(m => m.position === pos));
    if (free !== undefined) p.monsters.push(newFieldCard(cardId, free));
    else p.hand.push(cardId);
  }

  log(g, `[Sandbox] ${nameOf(side)} ย้ายการ์ดจาก ${from} ไป ${to}`);
  return g;
}

// Sandbox: ปรับ Power / Defense / Critical ของการ์ดบนสนามด้วยมือ (คงอยู่ตราบที่การ์ดอยู่บนสนาม)
export function sandboxAdjustStat(state: GameState, side: Side, uidStr: string, stat: "power" | "defense" | "critical", delta: number): GameState {
  const g = structuredClone(state);
  const fc = findFc(g[side], uidStr);
  if (!fc) return state;
  if (stat === "power") fc.manualPower = (fc.manualPower ?? 0) + delta;
  else if (stat === "defense") fc.manualDefense = (fc.manualDefense ?? 0) + delta;
  else fc.manualCritical = (fc.manualCritical ?? 0) + delta;
  log(g, `[Sandbox] ${cardOfFc(fc)?.name ?? "การ์ด"} ${stat === "power" ? "Power" : stat === "defense" ? "Defense" : "Critical"} ${delta > 0 ? "+" : ""}${delta}`);
  return g;
}

// Sandbox: ปรับ Size ของมอนสเตอร์บนสนาม (delta บวก/ลบ, reset = กลับเป็น Size เดิมของการ์ด) ไม่จำกัดค่า
export function sandboxAdjustSize(state: GameState, side: Side, uidStr: string, delta: number, reset = false): GameState {
  const g = structuredClone(state);
  const fc = findFc(g[side], uidStr);
  if (!fc) return state;
  const base = cardOfFc(fc)?.size ?? 0;
  if (reset) fc.manualSize = 0;
  else fc.manualSize = Math.max(-base, (fc.manualSize ?? 0) + delta); // Size รวมต้องไม่ต่ำกว่า 0
  log(g, `[Sandbox] ${cardOfFc(fc)?.name ?? "การ์ด"} Size = ${sizeOfFc(fc)}`);
  return g;
}

// Sandbox: ใส่การ์ดเข้า Soul ของการ์ดที่เลือก จากมือ / สุสาน / เกจ / เด็ค (index = ตำแหน่งในโซนนั้น)
export function sandboxAddSoul(state: GameState, side: Side, uidStr: string, from: "hand" | "dropZone" | "gauge" | "deck", index: number): GameState {
  const g = structuredClone(state);
  const p = g[side];
  const fc = findFc(p, uidStr);
  if (!fc) return state;
  const list = from === "hand" ? p.hand : from === "dropZone" ? p.dropZone : from === "gauge" ? p.gaugePile : p.deck;
  const cardId = list.splice(index, 1)[0];
  if (!cardId) return state;
  if (from === "gauge") syncGauge(p);
  fc.soul.push(cardId);
  log(g, `[Sandbox] ใส่การ์ด 1 ใบเข้า Soul ของ ${cardOfFc(fc)?.name ?? "การ์ด"} (จาก${from === "hand" ? "มือ" : from === "dropZone" ? "สุสาน" : from === "gauge" ? "เกจ" : "เด็ค"}) รวม Soul ${fc.soul.length}`);
  return g;
}

// Sandbox: ถอด Soul ใบที่เลือกของการ์ด ไปที่ มือ / สุสาน / เกจ / บนเด็ค / ใต้เด็ค (ไม่ทำงานเอฟเฟกต์อัตโนมัติ — เล่นเองบนโต๊ะ)
export function sandboxRemoveSoul(state: GameState, side: Side, uidStr: string, soulIndex: number, to: "hand" | "dropZone" | "gauge" | "deckTop" | "deckBottom"): GameState {
  const g = structuredClone(state);
  const p = g[side];
  const fc = findFc(p, uidStr);
  if (!fc) return state;
  const cardId = fc.soul.splice(soulIndex, 1)[0];
  if (!cardId) return state;
  if (to === "hand") p.hand.push(cardId);
  else if (to === "dropZone") p.dropZone.push(cardId);
  else if (to === "gauge") { p.gaugePile.push(cardId); syncGauge(p); }
  else if (to === "deckTop") p.deck.unshift(cardId);
  else p.deck.push(cardId);
  log(g, `[Sandbox] ถอด Soul 1 ใบของ ${cardOfFc(fc)?.name ?? "การ์ด"} (เหลือ ${fc.soul.length})`);
  return g;
}

// Sandbox: สับเด็คสุ่มใหม่ (ใช้หลังค้น/ดูการ์ดในเด็ค)
export function sandboxShuffleDeck(state: GameState, side: Side): GameState {
  const g = structuredClone(state);
  const d = g[side].deck;
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  log(g, `[Sandbox] ${nameOf(side)} สับเด็ค`);
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

// Sandbox: ย้ายการ์ดในช่อง Set ไปที่อื่น (มือ / สุสาน / เกจ / เด็ค / Soul ของการ์ดบนสนาม) ผลต่อเนื่องของ Set คำนวณใหม่ทันที
// Sandbox: ใส่การ์ดเข้า Soul ของการ์ด Set ใบที่เลือก (จากมือ / สุสาน / เกจ / เด็ค)
export function sandboxAddSetSoul(state: GameState, side: Side, setIndex: number, from: "hand" | "dropZone" | "gauge" | "deck", index: number): GameState {
  const g = structuredClone(state);
  const p = g[side];
  if (p.setZone[setIndex] === undefined) return state;
  const list = from === "hand" ? p.hand : from === "dropZone" ? p.dropZone : from === "gauge" ? p.gaugePile : p.deck;
  const cardId = list.splice(index, 1)[0];
  if (!cardId) return state;
  if (from === "gauge") syncGauge(p);
  const souls = normSetSoul(p)[setIndex];
  souls.push(cardId);
  log(g, `[Sandbox] ใส่การ์ด 1 ใบเข้า Soul ของการ์ด Set ${getCard(p.setZone[setIndex])?.name ?? ""} (จาก${from === "hand" ? "มือ" : from === "dropZone" ? "สุสาน" : from === "gauge" ? "เกจ" : "เด็ค"}) รวม Soul ${souls.length}`);
  recalcAuras(g);
  return g;
}

// Sandbox: ถอด Soul ใบที่เลือกของการ์ด Set ไปที่ มือ / สุสาน / เกจ / บนเด็ค / ใต้เด็ค
export function sandboxRemoveSetSoul(state: GameState, side: Side, setIndex: number, soulIndex: number, to: "hand" | "dropZone" | "gauge" | "deckTop" | "deckBottom"): GameState {
  const g = structuredClone(state);
  const p = g[side];
  if (p.setZone[setIndex] === undefined) return state;
  const souls = normSetSoul(p)[setIndex];
  const cardId = souls.splice(soulIndex, 1)[0];
  if (!cardId) return state;
  if (to === "hand") p.hand.push(cardId);
  else if (to === "dropZone") p.dropZone.push(cardId);
  else if (to === "gauge") { p.gaugePile.push(cardId); syncGauge(p); }
  else if (to === "deckTop") p.deck.unshift(cardId);
  else p.deck.push(cardId);
  log(g, `[Sandbox] ถอด Soul 1 ใบของการ์ด Set ${getCard(p.setZone[setIndex])?.name ?? ""} (เหลือ ${souls.length})`);
  recalcAuras(g);
  return g;
}

export function sandboxMoveSet(
  state: GameState,
  side: Side,
  index: number,
  to: "hand" | "dropZone" | "gauge" | "deck" | "deckBottom" | "soul",
  soulUid?: string
): GameState {
  const g = structuredClone(state);
  const p = g[side];
  const id = p.setZone[index];
  if (id === undefined) return state;
  const host = to === "soul" ? findFc(p, soulUid ?? "") : null;
  if (to === "soul" && !host) return state;
  popSet(p, index); // Soul ใต้การ์ด Set ลงสุสาน
  if (to === "hand") p.hand.push(id);
  else if (to === "dropZone") p.dropZone.push(id);
  else if (to === "gauge") { p.gaugePile.push(id); syncGauge(p); }
  else if (to === "deck") p.deck.unshift(id);
  else if (to === "deckBottom") p.deck.push(id);
  else if (host) host.soul.push(id);
  log(g, `[Sandbox] ${nameOf(side)} ย้าย ${getCard(id)?.name ?? "การ์ด Set"} จากช่อง Set ไป ${to === "soul" ? "Soul" : to}`);
  recalcAuras(g);
  return g;
}

// Sandbox: ทำลายการ์ดในช่อง Set (ลงสุสาน ผลต่อเนื่องหยุด)
export function sandboxDestroySet(state: GameState, side: Side, index: number): GameState {
  const g = structuredClone(state);
  if (!mDestroySet(g, side, index)) return state;
  return g;
}
