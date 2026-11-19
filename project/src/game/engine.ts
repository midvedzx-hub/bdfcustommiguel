import type {
  GameState, PlayerState, Card, Flag, Deck, FieldCard, AutoEffectType, AutoTrigger, RuleSet, AttackTarget, FxEvent, FxInput, AutoSkill, CounterTiming,
} from "@/types";
import { DEFAULT_RULES } from "@/types";
import { uid } from "@/storage";

export type Side = "host" | "guest";
export type { AttackTarget };
export type Result = { state: GameState; ok: boolean; msg: string };
export type CounterOption =
  | { zone: "hand"; index: number }
  | { zone: "set"; index: number }       // การ์ดคว่ำในช่อง Set ใช้เป็น 【Counter】 (ใช้แล้วลงสุสาน)
  | { zone: "setAct"; index: number }    // การ์ด Set ที่เปิดอยู่: ใช้ Counter 【Act】 ของมัน (การ์ดยังอยู่ในช่อง Set ใช้ได้ 1 ครั้งต่อเทิร์น)
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
    power: c.power + fc.tempPower + (fc.auraPower ?? 0) + continuousSum(c, "buffPower") + continuousSum(c, "powerPerSoul") * fc.soul.length,
    defense: c.defense + (fc.tempDefense ?? 0) + (fc.auraDefense ?? 0) + continuousSum(c, "buffDefense"),
    critical: c.critical + (fc.tempCritical ?? 0) + (fc.auraCritical ?? 0) + continuousSum(c, "buffCritical") + continuousSum(c, "criticalPerSoul") * fc.soul.length,
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
    const card = getCard(fc.cardId);
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
  const card = getCard(m.cardId);
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
  const card = getCard(m.cardId);
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
        case "addSoul": {
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
          // เป้าหมาย: การ์ดที่ใช้สกิล > มอนสเตอร์ที่มี Soulguard > มอนสเตอร์ตัวล่าสุด
          const fc = ctx?.fc
            ?? g[side].monsters.find(m => { const c = getCard(m.cardId); return !!c && keywordValue(c, "soulguard") > 0; })
            ?? g[side].monsters[g[side].monsters.length - 1];
          if (!fc) { log(g, `${card.name}: ไม่มีมอนสเตอร์ให้ใส่ Soul`); break; }
          const got = pickFromDrop(g, side, n, eff.filter);
          if (got.length === 0) { log(g, `${card.name}: ไม่มีการ์ดที่ตรงเงื่อนไขในสุสาน`); break; }
          fc.soul.push(...got);
          log(g, `${card.name} นำการ์ดจากสุสาน ${got.length} ใบเข้า Soul ของ ${getCard(fc.cardId)?.name ?? "การ์ด"} (รวม ${fc.soul.length})`);
          fx(g, { k: "soulIn", side, uid: fc.uid, pos: posOf(g, side, fc), n: got.length, from: "drop" });
          break;
        }
        case "soulToHand": {
          const fc = ctx?.fc;
          if (!fc || fc.soul.length === 0) { log(g, `${card.name}: ไม่มี Soul ให้ถอดขึ้นมือ`); break; }
          let moved = 0;
          for (let i = 0; i < n && fc.soul.length > 0; i++) { g[side].hand.push(fc.soul.pop()!); moved++; }
          log(g, `${card.name} ถอด Soul ${moved} ใบขึ้นมือ`);
          fx(g, { k: "soulOut", side, uid: fc.uid, pos: posOf(g, side, fc), n: moved });
          const c0 = getCard(fc.cardId);
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
            .forEach(m => { m.nullified = true; log(g, `${card.name} Nullify! ความสามารถของ ${getCard(m.cardId)?.name ?? "มอนสเตอร์"} ถูกยกเลิกจนจบเทิร์น`); });
          break;
        }
        case "removeSoul": {
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
  g.moveWindow = null;
  g.spellWindow = null;
  g.pendingLook = null;
  g.pendingSoul = null;
  // ลำดับเทิร์น: Stand → Draw → Charge & Draw → Main → Attack → Final (ข้าม Draw เฉพาะเมื่อปิดกติกา "ผู้เล่นคนแรกจั่วด้วย")
  g.phase = skipDraw ? "charge" : "draw";
  log(g, `— เทิร์น ${g.turn}: ${nameOf(side)} (Stand${skipDraw ? " · เทิร์นแรกไม่จั่ว" : ""}) —`);
  if (g.winner) return;
  p.monsters.forEach(m => {
    const c = getCard(m.cardId);
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

export function totalMonsterSize(player: PlayerState): number {
  return player.monsters.reduce((sum, m) => sum + (getCard(m.cardId)?.size ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* Turn flow                                                           */
/* ------------------------------------------------------------------ */
function baseGuard(state: GameState, side: Side): string | null {
  if (state.winner) return "เกมจบแล้ว";
  if (!mulliganDone(state)) return "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน";
  if (state.pendingLook) return `กำลังรอ${nameOf(state.pendingLook.side)}เลือกการ์ดหลังดูกอง`;
  if (state.pendingSoul) return `กำลังรอ${nameOf(state.pendingSoul.side)}เลือกการ์ดที่จะถอด Soul`;
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
    const c = getCard(m.cardId);
    if (c) applyEffects(g, side, c, "onFinal", { fc: m });
  });
  fireSet(g, side, "onFinal");
  return { state: g, ok: true, msg: "Final Phase" };
}

export function endTurn(state: GameState): GameState {
  if (state.battle || state.moveWindow || state.spellWindow || state.pendingLook || state.pendingSoul || !mulliganDone(state)) return state;
  const g = structuredClone(state);
  if (g.winner) return g;
  (["host", "guest"] as Side[]).forEach(s => {
    [...g[s].monsters, ...(g[s].item ? [g[s].item!] : [])].forEach(m => {
      m.tempPower = 0; m.tempCritical = 0; m.tempDefense = 0; m.nullified = false;
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

// ผลต่อเนื่องจากการ์ด Set: บัฟ Power/Defense/Critical ให้มอนสเตอร์และไอเทมของเจ้าของ (คำนวณใหม่ทุกครั้งที่ Set เปลี่ยน)
export function recalcAuras(g: GameState) {
  (["host", "guest"] as Side[]).forEach(side => {
    const p = g[side];
    let pw = 0, df = 0, cr = 0, pps = 0, cps = 0;
    activeSetCards(p).forEach(c => {
      pw += continuousSum(c, "buffPower"); df += continuousSum(c, "buffDefense"); cr += continuousSum(c, "buffCritical");
      pps += continuousSum(c, "powerPerSoul"); cps += continuousSum(c, "criticalPerSoul");
    });
    [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
      fc.auraPower = pw + pps * fc.soul.length; fc.auraDefense = df; fc.auraCritical = cr + cps * fc.soul.length;
    });
  });
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
  p.setZone.push(cardId);
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
  p.setZone.splice(index, 1);
  p.dropZone.push(id);
  log(g, `${getCard(id)?.name ?? "การ์ด Set"} ในช่อง Set ถูกทำลาย → ลงสุสาน ผลต่อเนื่องหยุดลง`);
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
  applyEffects(g, side, card, "onCall", { fc: p.item });
  recalcAuras(g);
  return { state: g, ok: true, msg: `ติดตั้ง ${card.name}` };
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
    const c = getCard(m.cardId);
    return !!c && !m.nullified && hasKeyword(c, "move") && m.movedTurn !== state.turn;
  });
}

export function moveMonster(state: GameState, side: Side, monsterUid: string, position: number): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (!mulliganDone(state)) return { state, ok: false, msg: "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน" };
  if (state.battle || state.spellWindow || state.pendingLook || state.pendingSoul) return { state, ok: false, msg: "กำลังรอการตัดสินใจ (Counter / เลือกการ์ด) ก่อน" };
  if (!moveWindowOpen(state))
    return { state, ok: false, msg: `Move ใช้ได้ตอนเริ่ม ${state.rules.useAttackPhase ? "Attack Phase" : "Main Phase"} ก่อนมีการโจมตีเท่านั้น (ของทั้งสองฝั่ง)` };
  if (state.currentTurn !== side && state.moveWindow !== side)
    return { state, ok: false, msg: "ตอนนี้ยังไม่ใช่ช่วงที่คุณย้ายได้" };
  const g = structuredClone(state);
  const p = g[side];
  const m = p.monsters.find(x => x.uid === monsterUid);
  const card = m ? getCard(m.cardId) : undefined;
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
    fireSet(g, side, "onAttack", { fc });
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
const counterSkills = (card: Card, trig: AutoTrigger, timing: CounterTiming | null) =>
  (card.autoSkills ?? []).filter(sk => sk.trigger === trig && (timing === null || timingOk(sk, timing)));

function skillNeedsSoul(card: Card, timing: CounterTiming | null): number {
  let need = 0;
  counterSkills(card, "onCounterAct", timing).forEach(s => {
    let n = 0;
    s.effects.forEach(e => { if (e.type === "removeSoul") n += Math.floor(e.value); });
    need = Math.max(need, n);
  });
  return need;
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
    if (!has || setActUsedThisTurn(state, side, i) || !setActAffordable(p, c, timing)) return;
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
    const afford = c.callCostType === "Gauge" ? p.gaugePile.length >= c.callCost : p.life > c.callCost;
    if (afford) out.push({ zone: "hand", index: i });
  });
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (c && counterSkills(c, "onCounter", timing).length > 0) out.push({ zone: "set", index: i });
  });
  out.push(...setActOptions(state, side, timing, false));
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
    const c = getCard(fc.cardId);
    if (!c || fc.nullified || counterSkills(c, "onCounterAct", timing).length === 0) return;
    if (fc.counterUsedTurn === state.turn) return;
    if (fc.soul.length < skillNeedsSoul(c, timing)) return;
    out.push({ zone: "field", uid: fc.uid });
  });
  return out;
}

export function counterCardOf(state: GameState, side: Side, opt: CounterOption): Card | undefined {
  const p = state[side];
  if (opt.zone === "hand") return getCard(p.hand[opt.index]);
  if (opt.zone === "set" || opt.zone === "setAct") return getCard(p.setZone[opt.index]);
  const fc = findFc(p, opt.uid);
  return fc ? getCard(fc.cardId) : undefined;
}

function sameOption(a: CounterOption, b: CounterOption) {
  if (a.zone !== b.zone) return false;
  if (a.zone === "field" && b.zone === "field") return a.uid === b.uid;
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
  if (g.winner) { g.battle = null; g.spellWindow = null; return; }
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
    const costErr = payCost(g, side, card);
    if (costErr) return costErr;
    p.hand.splice(opt.index, 1);
    p.dropZone.push(cardId);
    log(g, `🛡 ${nameOf(side)} ใช้ Counter จากมือ: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    runSkills(g, side, card, counterSkills(card, "onCounter", timing), { fc: tgt });
  } else if (opt.zone === "set") {
    const cardId = p.setZone[opt.index];
    const card = getCard(cardId)!;
    p.setZone.splice(opt.index, 1);
    p.dropZone.push(cardId);
    log(g, `🛡 ${nameOf(side)} เปิดการ์ด Set: ${card.name}!`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER!" });
    runSkills(g, side, card, counterSkills(card, "onCounter", timing), { fc: tgt });
  } else if (opt.zone === "setAct") {
    const cardId = p.setZone[opt.index];
    const card = getCard(cardId)!;
    p.setActUsed = { ...(p.setActUsed ?? {}), [setKey(p, opt.index)]: g.turn };
    log(g, `🛡 ${nameOf(side)} ใช้ Counter 【Act】 ของการ์ด Set: ${card.name} (การ์ดยังอยู่ในช่อง Set)`);
    fx(g, { k: "cast", side, cardId, label: "COUNTER ACT!" });
    runSkills(g, side, card, counterSkills(card, "onCounterAct", timing), {});
  } else {
    const fc = findFc(p, opt.uid)!;
    const card = getCard(fc.cardId)!;
    fc.counterUsedTurn = g.turn;
    log(g, `🛡 ${nameOf(side)} ใช้ Counter 【Act】 ของ ${card.name} บนสนาม!`);
    runSkills(g, side, card, counterSkills(card, "onCounterAct", timing), { fc });
  }
  recalcAuras(g);
  return null;
}

export function counterAct(state: GameState, side: Side, opt: CounterOption): Result {
  const timing = counterTiming(state);
  if (!timing) return { state, ok: false, msg: "ไม่มีจังหวะให้ Counter" };
  if (state.pendingLook || state.pendingSoul) return { state, ok: false, msg: "กำลังรอเลือกการ์ด (ดูกอง / ถอด Soul)" };
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
  if (state.battle || state.spellWindow || state.pendingLook || state.pendingSoul || state.moveWindow) return [];
  const p = state[side];
  const out: CounterOption[] = [];
  p.hand.forEach((id, i) => {
    const c = getCard(id);
    if (!c || !usableAnytime(c, "onCounter")) return;
    const afford = c.callCostType === "Gauge" ? p.gaugePile.length >= c.callCost : p.life > c.callCost;
    if (afford) out.push({ zone: "hand", index: i });
  });
  p.setZone.forEach((id, i) => {
    const c = getCard(id);
    if (c && usableAnytime(c, "onCounter")) out.push({ zone: "set", index: i });
  });
  out.push(...setActOptions(state, side, null, true));
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(fc => {
    const c = getCard(fc.cardId);
    if (!c || fc.nullified || !usableAnytime(c, "onCounterAct")) return;
    if (fc.counterUsedTurn === state.turn) return;
    if (fc.soul.length < skillNeedsSoul(c, null)) return;
    out.push({ zone: "field", uid: fc.uid });
  });
  return out;
}

export function useCounterAnytime(state: GameState, side: Side, opt: CounterOption): Result {
  if (state.winner) return { state, ok: false, msg: "เกมจบแล้ว" };
  if (!mulliganDone(state)) return { state, ok: false, msg: "ต้องรอให้ทั้งสองฝั่งเลือก Mulligan ให้เสร็จก่อน" };
  if (state.battle || state.spellWindow) return { state, ok: false, msg: "กำลังอยู่ในจังหวะ Counter ของการโจมตี/เวท — ใช้ผ่านหน้าต่าง Counter" };
  if (state.pendingLook || state.pendingSoul || state.moveWindow) return { state, ok: false, msg: "กำลังรอการตัดสินใจ (เลือกการ์ด / Move) ก่อน" };
  if (!freeCounterOptions(state, side).some(o => sameOption(o, opt)))
    return { state, ok: false, msg: "ใช้ Counter ใบนี้ไม่ได้ในตอนนี้ (เกจ/Life/Soul ไม่พอ ใช้ไปแล้วในเทิร์นนี้ หรือสกิลมีผลเฉพาะตอนศัตรูโจมตี/ร่ายเวท)" };
  const g = structuredClone(state);
  const err = runCounterOption(g, side, opt, null);
  if (err) return { state, ok: false, msg: err };
  return { state: g, ok: true, msg: "ใช้ Counter" };
}

export function passCounter(state: GameState, side: Side): Result {
  if (!counterTiming(state)) return { state, ok: false, msg: "ไม่มีจังหวะให้ตัดสินใจ" };
  if (state.pendingLook || state.pendingSoul) return { state, ok: false, msg: "กำลังรอเลือกการ์ด (ดูกอง / ถอด Soul)" };
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
    log(g, `ทำดาเมจใส่ผู้เล่น ${total.critical}${linkNote}`);
    mLife(g, oppSide, -total.critical);
    if (!g.winner) parts.forEach(({ fc, card }) => {
      const alive = me.monsters.some(m => m.uid === fc.uid) || me.item?.uid === fc.uid;
      if (alive) { applyEffects(g, side, card, "onDamage", { fc }); fireSet(g, side, "onDamage", { fc }); }
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

// Sandbox: ทำลายการ์ดในช่อง Set (ลงสุสาน ผลต่อเนื่องหยุด)
export function sandboxDestroySet(state: GameState, side: Side, index: number): GameState {
  const g = structuredClone(state);
  if (!mDestroySet(g, side, index)) return state;
  return g;
}
