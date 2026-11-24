import { useState, useRef, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Swords, Heart, Zap, Skull, LogOut, Plus, Minus, Hand, Trash2, RotateCw, Crown,
  Copy, LogIn, Users, RefreshCw, Wrench, X, Shield, Star, AlertTriangle, Link2, Eye,
} from "lucide-react";
import type { GameState, Card, Flag, Deck, SyncMessage, RuleSet, FieldCard, AutoSkill } from "@/types";
import { TRIGGER_LABELS, customTextList, callCostLabel, canTransform, transformCostLabel, isMonsterImpact, matchesType, callSelfEffect, impactCastCondText } from "@/types";
import { DEFAULT_RULES, deckBuddies } from "@/types";
import type { SoulPick, StatExplain } from "@/game/engine";
import { explainFc } from "@/game/engine";
import { keywordValue,
  createInitialState, setCardCache, setCardSizeCache, getCard, registerCards, setCardImage,
  callMonster, impactCall, castSpell, equipItem, setCard, moveMonster, declareAttack, endTurn, drawPhase, chargeAndDraw,
  goToAttack, goToFinal, mulligan, freeCallPositions, resolveFreeCall, zoneCallOptions, resolveZoneCall, transformCard, legalTargets, statsOf, counterOptions, callSelfSlots, impactCastProblem, effCostCard, soulCallOffers, useSoulCall, counterCardOf, counterAct, counterExtraCostLabel, handPlayability, counterBlockedHand, counterHandCost, counterSkillLabel, freeCounterOptions, useCounterAnytime,
  passCounter, maxAttacks, hasKeyword, changeLife, addGauge, addLog, POSITION_NAMES,
  sandboxMoveCard, sandboxSetPhase, sandboxFlipRest, sandboxAdjustPower, sandboxMoveToPosition, sandboxFreeDraw, sandboxPayGauge,
  sandboxAdjustStat, sandboxAdjustSize, sizeOfFc, cardOfFc, matchCallRequires, sandboxAddSoul, sandboxRemoveSoul, sandboxShuffleDeck, sandboxAddSetSoul, sandboxRemoveSetSoul, setSoulOf,
  type AttackTarget, type CounterOption, type Result,
  setSoulguardAuto, closeMoveWindow, movableMonsters, recalcAuras, hasSetKeyword, activeSetCards, sandboxDestroySet, sandboxMoveSet, resolveLook, resolveSoulChoice, resolveTargetChoice, targetEffectLabel,
} from "@/game/engine";
import { getFlags, getCards, getDecks } from "@/storage";
import { FlagInfoDialog } from "@/components/FlagInfo";
import { getFlagColor, hasCounter, skillLines, keywordBadges, costText, effectText, KEYWORD_HELP, TRIGGER_HELP } from "@/game/helpers";
import { mp } from "@/game/multiplayer";
import { CardView } from "@/components/CardView";
import { FxLayer, Banner } from "@/components/FxLayer";
import { playSfx } from "@/game/sfx";
import { AudioControl } from "@/components/AudioControl";
import { buildSave, saveGame, clearSavedGame, type SavedGame } from "@/game/savegame";

interface Props {
  mode: "bot" | "multiplayer";
  hostDeck: Deck;
  rules?: RuleSet;
  initialState?: GameState; // ใช้ทดสอบ/แสดงตัวอย่าง
  resume?: SavedGame;       // เล่นต่อเกมที่เซฟไว้ (บอท / ออนไลน์: ต่อห้องเดิม)
  onExit: () => void;
}

type Side = "host" | "guest";
type MenuTarget =
  | { kind: "field"; side: Side; uid: string }
  | { kind: "set"; side: Side; index: number }
  | { kind: "drop"; side: Side }
  | { kind: "deck"; side: Side }
  | { kind: "soul"; side: Side; uid: string }
  | { kind: "deckView"; side: Side; mode: "search" | "top"; n: number; soulUid?: string }
  | null;
type Drag = { kind: "hand"; index: number } | { kind: "unit"; uid: string } | null;

// แคชผลเช็กว่าการ์ดในมือเล่นได้ไหม (ผูกกับอ็อบเจ็กต์สถานะ — เปลี่ยนสถานะเมื่อไหร่ก็คำนวณใหม่) กันคำนวณซ้ำทุกครั้งที่เลื่อนเมาส์
const playCache = new WeakMap<object, Map<string, { ok: boolean; reason: string }>>();
function playOf(g: GameState, side: "host" | "guest", i: number) {
  let m = playCache.get(g);
  if (!m) { m = new Map(); playCache.set(g, m); }
  const k = `${side}:${i}`;
  let v = m.get(k);
  if (!v) { v = handPlayability(g, side, i); m.set(k, v); }
  return v;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ตัดการ์ดที่ไม่มีข้อมูลแล้ว (เช่น ถูกลบจาก Card Studio แต่ยังค้างในเด็ค) ออก ไม่งั้นจะกลายเป็นการ์ดคว่ำที่ใช้ไม่ได้
const cleanDeck = (d: Deck): Deck => ({ ...d, cardIds: d.cardIds.filter(id => !!getCard(id)), buddyId: deckBuddies(d).find(id => !!getCard(id)) ?? null, buddyIds: deckBuddies(d).filter(id => !!getCard(id)) });

function makeGame(hDeck: Deck, gDeck: Deck, hFlag: Flag, gFlag: Flag, cards: Card[], rules: RuleSet): GameState {
  const h = cleanDeck(hDeck), gd = cleanDeck(gDeck);
  return createInitialState(
    { ...h, cardIds: shuffled(h.cardIds) },
    { ...gd, cardIds: shuffled(gd.cardIds) },
    hFlag, gFlag, cards, rules
  );
}

// ตัดรูปออกจากข้อความ (base64 ใหญ่เป็นเมกะไบต์ ทำให้ออนไลน์หลุด) แล้วทยอยส่งรูปทีละใบทีหลัง
function collectCards(deck: Deck, cards: Card[]): { [id: string]: Card } {
  const map: { [id: string]: Card } = {};
  const ids = [...deck.cardIds, ...deckBuddies(deck)];
  ids.forEach(id => {
    const c = cards.find(x => x.id === id);
    if (c) map[id] = { ...c, image: "" };
  });
  return map;
}

function stripFlags(flag?: Flag): { [id: string]: Flag } {
  return flag ? { [flag.id]: { ...flag, image: "" } } : {};
}

function sendImages(deck: Deck, cards: Card[], flag?: Flag) {
  const queue: SyncMessage[] = [];
  if (flag?.image) queue.push({ type: "image", imageFor: { id: "flag:" + flag.id, image: flag.image } });
  const seen = new Set<string>();
  [...deck.cardIds, ...deckBuddies(deck)].forEach(id => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = cards.find(x => x.id === id);
    if (c?.image) queue.push({ type: "image", imageFor: { id, image: c.image } });
  });
  queue.forEach((m, i) => setTimeout(() => mp.send(m), 80 * (i + 1)));
}

const _remoteFlagCache: { [id: string]: Flag } = {};

/* ------------------------------------------------------------------ */
/* Playmat primitives (ตามแผ่นเล่น Buddyfight)                         */
/* ------------------------------------------------------------------ */
const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const MAT_RED = "#9f1d1d";

function place(l: number, t: number, w: number, h: number, mirror: boolean): CSSProperties {
  return {
    position: "absolute",
    left: `${mirror ? 100 - l - w : l}%`,
    top: `${mirror ? 100 - t - h : t}%`,
    width: `${w}%`,
    height: `${h}%`,
  };
}

function HexZone({ style, label, glow, onClick, onDrop, children, fx }: {
  style: CSSProperties; label: string; glow?: string; onClick?: () => void;
  onDrop?: () => void; children?: ReactNode; fx?: string;
}) {
  return (
    <div
      data-fx={fx}
      style={style}
      className={`${glow ?? ""} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}
    >
      <div className="absolute inset-0" style={{ clipPath: HEX, background: MAT_RED }} />
      <div className="absolute" style={{ inset: "3px", clipPath: HEX, background: "linear-gradient(160deg,#3b4252,#252a36)" }} />
      {!children && (
        <div className="absolute inset-0 flex items-center justify-center text-center font-display font-bold text-slate-300/70 leading-tight px-[18%]" style={{ fontSize: "calc(var(--hs) * 0.11)" }}>{label}</div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function RectZone({ style, label, glow, onClick, onDrop, children, className = "", fx }: {
  style: CSSProperties; label?: string; glow?: string; onClick?: () => void;
  onDrop?: () => void; children?: ReactNode; className?: string; fx?: string;
}) {
  return (
    <div
      data-fx={fx}
      style={{ ...style, border: `2px solid ${MAT_RED}`, background: "linear-gradient(160deg,#3b4252,#252a36)" }}
      className={`rounded-md flex items-center justify-center overflow-hidden ${glow ?? ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}
    >
      {label && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display font-bold text-slate-300/50 pointer-events-none" style={{ fontSize: "calc(var(--mh) * 0.045)" }}>{label}</span>}
      {children}
    </div>
  );
}

// การ์ดซ้อนอยู่ใต้มอนสเตอร์ = Soul (ยิ่งเยอะยิ่งหนา สูงสุด 4 ชั้นที่เห็น)
function SoulStack({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <>
      {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
        <div key={i} className="absolute rounded-[6px]" style={{
          inset: 0,
          transform: `translate(calc(var(--cw) * ${0.05 * (i + 1)}), calc(var(--cw) * ${0.06 * (i + 1)}))`,
          background: "linear-gradient(160deg,#6d28d9,#2e1065)",
          border: "1.5px solid #c4b5fd",
          boxShadow: "0 0 10px #a855f788",
          opacity: 0.95 - i * 0.12,
        }} />
      ))}
    </>
  );
}

const LIFE_TRACK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50];

/* ------------------------------------------------------------------ */
/* Bot                                                                 */
/* ------------------------------------------------------------------ */
function botAttack(s: GameState): GameState | null {
  const me = s.guest;
  const candidates = [...me.monsters, ...(me.item ? [me.item] : [])].filter(m => m.state === "stand");
  for (const m of candidates) {
    const targets = legalTargets(s, "guest", m.uid);
    if (targets.length === 0) continue;
    const myPower = statsOf(m).power;
    const killable = targets.find(t => {
      if (t.kind !== "monster") return false;
      const tm = s.host.monsters.find(x => x.position === t.position);
      return tm ? myPower >= statsOf(tm).defense : false;
    });
    const pick: AttackTarget = killable ?? targets.find(t => t.kind === "fighter") ?? targets[0];
    const r = declareAttack(s, "guest", m.uid, pick);
    if (r.ok) return r.state;
  }
  return null;
}

// บอทเลือกการ์ดหลังดูกอง: เอาใบที่ดีที่สุด (มอนสเตอร์พลังสูง > เวท > อื่นๆ) ขึ้นมือตามจำนวนที่ได้
function botPickLook(pl: NonNullable<GameState["pendingLook"]>): { hand: number[]; drop: number[]; bottom: number[] } {
  const score = (id: string) => {
    const c = getCard(id);
    if (!c) return 0;
    return (c.type === "Monster" ? 3 : c.type === "Spell" ? 2 : 1) * 100000 + c.power + c.critical * 1000;
  };
  const order = pl.cards.map((id, i) => ({ i, sc: score(id) })).sort((a, b) => b.sc - a.sc).map(x => x.i);
  return { hand: order.slice(0, pl.toHand), drop: [], bottom: [] };
}

export function botStep(s: GameState): GameState {
  if (s.winner) return s;
  if (!s.mulligan.guest) return mulligan(s, "guest", []).state;
  if (!s.mulligan.host) return s; // รอมนุษย์เลือก Mulligan
  if (s.pendingLook) {
    if (s.pendingLook.side === "host") return s; // รอมนุษย์เลือกการ์ด
    return resolveLook(s, "guest", botPickLook(s.pendingLook)).state;
  }
  if (s.pendingSoul) {
    if (s.pendingSoul.side === "host") return s;
    // บอทเลือกถอด Soul จากการ์ดที่มี Soul มากที่สุด
    const ps = s.pendingSoul;
    const pool = [...s.guest.monsters, ...(s.guest.item ? [s.guest.item] : [])].filter(m => ps.candidates.includes(m.uid));
    const best = ps.mode === "add" ? pool[0] : pool.sort((a, b) => b.soul.length - a.soul.length)[0];
    return resolveSoulChoice(s, "guest", best ? best.uid : null).state;
  }
  if (s.pendingZoneCall) {
    if (s.pendingZoneCall.side === "host") return s; // รอมนุษย์เลือกมอนสเตอร์ที่จะคอล
    const opts = zoneCallOptions(s, s.pendingZoneCall);
    const best = [...opts].sort((a, b) => (getCard(b.cardId)?.power ?? 0) - (getCard(a.cardId)?.power ?? 0))[0]; // บอทเลือกตัวที่ Power สูงสุด ช่องกลางก่อน
    return resolveZoneCall(s, "guest", best ? { from: best.from, cardId: best.cardId, position: best.positions[0] } : null).state;
  }
  if (s.pendingFreeCall?.queue.length) {
    const head = s.pendingFreeCall.queue[0];
    if (head.side === "host") return s; // รอมนุษย์ตัดสินใจ Call จากสุสาน
    const pos = freeCallPositions(s, "guest", head.cardId);
    return resolveFreeCall(s, "guest", pos.length > 0 ? pos[0] : null).state; // บอท Call เสมอถ้าลงได้
  }
  if (s.pendingTarget) {
    if (s.pendingTarget.side === "host") return s; // รอมนุษย์เลือกเป้าหมาย
    const pt = s.pendingTarget;
    const order = [1, 0, 2]; // บอทเลือกเป้าหมายจากช่องกลางก่อน
    const picks = s.host.monsters.filter(m => pt.candidates.includes(m.uid))
      .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position)).slice(0, Math.min(pt.n, pt.candidates.length)).map(m => m.uid);
    return resolveTargetChoice(s, "guest", picks).state;
  }
  if (s.moveWindow === "host") return s; // รอมนุษย์เลือก Move
  if (s.moveWindow === "guest") return closeMoveWindow(s, "guest").state;

  // บอทเป็นฝ่ายป้องกัน: ตัดสินใจ Counter
  if (s.battle || s.spellWindow) {
    if (s.battle?.attackerSide === "guest" || s.spellWindow?.casterSide === "guest") return s; // รอมนุษย์
    const opts = counterOptions(s, "guest");
    if (opts.length > 0) {
      const o0 = opts[0];
      const c0 = counterCardOf(s, "guest", o0);
      const slot = c0 && callSelfEffect(c0) ? ([1, 0, 2].find(p => callSelfSlots(s, "guest", c0).includes(p)) ?? 1) : undefined;
      const r = counterAct(s, "guest", slot === undefined ? o0 : { ...o0, position: slot });
      if (r.ok) return (r.state.battle || r.state.spellWindow) && !r.state.pendingLook ? passCounter(r.state, "guest").state : r.state;
    }
    return passCounter(s, "guest").state;
  }
  if (s.currentTurn !== "guest") return s;

  switch (s.phase) {
    case "draw": {
      const r = drawPhase(s, "guest");
      return r.ok ? r.state : s;
    }
    case "charge": {
      const r = chargeAndDraw(s, "guest", s.guest.hand.length > 5 ? s.guest.hand.length - 1 : null);
      return r.ok ? r.state : s;
    }
    case "main": {
      let state = s;
      // บอทคอลการ์ดที่เพิ่งออกจาก Soul ลงช่องว่าง
      for (const o of soulCallOffers(state, "guest")) {
        const c0 = getCard(o.cardId);
        const slot = c0 ? [1, 0, 2].find(p => callSelfSlots(state, "guest", c0).includes(p)) : undefined;
        if (slot === undefined) continue;
        const r = useSoulCall(state, "guest", o.index, slot);
        if (r.ok) return r.state;
      }
      for (let i = state.guest.hand.length - 1; i >= 0; i--) {
        const card = getCard(state.guest.hand[i]);
        if (!card) continue;
        const free = [1, 0, 2].filter(p => !state.guest.monsters.some(m => m.position === p));
        const counterOnly = hasCounter(card) && !card.autoSkills.some(k => k.trigger === "onCast");
        if (card.type === "Monster" && !isMonsterImpact(card) && free.length > 0) {
          const r = callMonster(state, "guest", i, free[0]);
          if (r.ok) state = r.state;
        } else if (card.type === "Item" && !state.guest.item && !counterOnly) {
          const r = equipItem(state, "guest", i);
          if (r.ok) state = r.state;
        } else if (card.type === "Spell" && hasSetKeyword(card)) {
          const r = castSpell(state, "guest", i); // Set: วางลงช่อง Set (ซ้ำชื่อ/ช่องเต็มจะไม่สำเร็จ ข้ามไป)
          if (r.ok) state = r.state;
        } else if (card.type === "Spell" && !counterOnly && card.autoSkills.some(k => k.trigger === "onCast")) {
          const r = castSpell(state, "guest", i);
          if (r.ok) state = r.state;
        } else if (counterOnly && card.type !== "Monster") {
          const r = setCard(state, "guest", i);
          if (r.ok) state = r.state;
        }
      }
      if (state.rules.useAttackPhase) {
        const r = goToAttack(state, "guest");
        return r.ok ? r.state : state;
      }
      return botAttack(state) ?? (goToFinal(state, "guest").state);
    }
    case "attack":
      return botAttack(s) ?? goToFinal(s, "guest").state;
    case "final": {
      // Impact Call มอนสเตอร์ไม้ตาย (เทิร์นละ 1 ใบ) แล้วโจมตีด้วยมอนสเตอร์ไม้ตายที่ Stand อยู่
      if (s.guest.impactCalledTurn !== s.turn) {
        const free = [1, 0, 2].filter(p => !s.guest.monsters.some(m => m.position === p));
        for (let i = 0; i < s.guest.hand.length && free.length > 0; i++) {
          const c = getCard(s.guest.hand[i]);
          if (!isMonsterImpact(c)) continue;
          const r = impactCall(s, "guest", i, free[0]);
          if (r.ok) return r.state;
        }
      }
      const atk = botAttack(s);
      if (atk) return atk;
      for (let i = 0; i < s.guest.hand.length; i++) {
        const c = getCard(s.guest.hand[i]);
        if (c?.type === "Impact" && c.autoSkills.some(k => k.trigger === "onCast")) {
          const r = castSpell(s, "guest", i);
          if (r.ok) return r.state;
        }
      }
      return endTurn(s);
    }
  }
  return s;
}

/* ------------------------------------------------------------------ */
export function BattleArena({ mode, hostDeck, rules = DEFAULT_RULES, initialState, resume, onExit }: Props) {
  const [allCards] = useState<Card[]>(() => getCards());
  const [allFlags] = useState<Flag[]>(() => getFlags());
  const [allDecks] = useState<Deck[]>(() => getDecks());

  useState(() => {
    setCardCache(allCards);
    setCardSizeCache(allCards);
    if (resume) {
      // การ์ดที่ไม่มีในคลังเครื่องนี้ (เช่น การ์ดของเพื่อน) เอามาจากเซฟ — รูปจะมาจากคลัง/ที่เพื่อนส่งให้ทีหลัง
      registerCards(Object.values(resume.cards));
      Object.values(resume.flags).forEach(f => { _remoteFlagCache[f.id] = f; });
    }
    return true;
  });

  const hostFlag = allFlags.find(f => f.id === hostDeck.flagId) ?? allFlags[0];
  const [guestDeckId, setGuestDeckId] = useState<string>(resume?.guestDeckId ?? allDecks[0]?.id ?? hostDeck.id);
  const guestDeck = allDecks.find(d => d.id === guestDeckId) ?? hostDeck;
  const guestFlag = allFlags.find(f => f.id === guestDeck.flagId) ?? hostFlag;

  const [game, setGame] = useState<GameState>(() => initialState ?? resume?.state ?? makeGame(hostDeck, guestDeck, hostFlag, guestFlag, allCards, rules));
  const gameRef = useRef<GameState>(game);

  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null);
  const [hovered, setHovered] = useState<{ card: Card; flagId?: string; stats?: { power: number; defense: number; critical: number }; soul?: number } | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(mode === "multiplayer" && !resume);
  const [roomId, setRoomId] = useState(resume?.roomId ?? "");
  const [joinId, setJoinId] = useState(resume?.roomId ?? "");
  const [mpStatus, setMpStatus] = useState("");
  const [role, setRole] = useState<Side>(resume?.role ?? "host");
  const roleRef = useRef<Side>(resume?.role ?? "host");
  const persistRef = useRef<() => void>(() => {});
  const roomIdRef = useRef(resume?.roomId ?? "");
  const liveGameRef = useRef(!!resume);            // มีเกมที่กำลังเล่นอยู่แล้ว (เล่นต่อ / เคยเริ่มเกมแล้ว) — เพื่อนกลับเข้าห้องแล้วไม่สร้างเกมใหม่ทับ
  const [dropped, setDropped] = useState(false);   // การเชื่อมต่อกับเพื่อนหลุดระหว่างเล่น
  const [exitAsk, setExitAsk] = useState(false);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(mode !== "multiplayer");
  const syncedRef = useRef(mode !== "multiplayer");
  const menuRef = useRef<HTMLDivElement>(null);
  const [autoShuffle, setAutoShuffle] = useState(true); // Sandbox: สับเด็คอัตโนมัติหลังค้น/ดูการ์ดในเด็ค
  const [deckFilter, setDeckFilter] = useState("");
  const [lookN, setLookN] = useState(3);
  const menuTargetRef = useRef<MenuTarget>(null);
  const autoShuffleRef = useRef(true);
  const closeMenuRef = useRef<() => void>(() => {});
  const [sandbox, setSandbox] = useState(false);
  const histRef = useRef<{ before: GameState; label: string; by: Side }[]>([]);
  const turnStartsRef = useRef<Map<number, GameState>>(new Map());
  const undoFnRef = useRef<() => void>(() => {});
  const [histN, setHistN] = useState(0);
  const [undoAsk, setUndoAsk] = useState<null | "last" | "turn">(null);
  const [atkSels, setAtkSels] = useState<string[]>([]);
  const [linkMode, setLinkMode] = useState(false);
  const [moveSel, setMoveSel] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [lookSel, setLookSel] = useState<{ hand: number[]; drop: number[]; bottom: number[] }>({ hand: [], drop: [], bottom: [] });
  const [handSel, setHandSel] = useState<number | null>(null);
  const [chargePick, setChargePick] = useState(false);
  const [showFreeCounter, setShowFreeCounter] = useState(false);
  const [mullSel, setMullSel] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ title: string; msg: string } | null>(null);
  const [, setImgTick] = useState(0);
  const dragRef = useRef<Drag>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [soulTarget, setSoulTarget] = useState<string | null>(null); // เลือกการ์ดที่จะรับ Soul แล้ว (ขั้นที่ 2: เลือกใบจากมือ/สุสาน)
  const [soulPicks, setSoulPicks] = useState<SoulPick[]>([]);
  const [statTip, setStatTip] = useState<{ uid: string; stat: "power" | "defense" | "critical" | "size"; x: number; y: number } | null>(null); // ป้ายอธิบายที่มาของตัวเลขสถานะ
  const [soulView, setSoulView] = useState<{ title: string; ids: string[]; flagId?: string } | null>(null); // หน้าต่างดูการ์ดใน Soul
  const [flagInfo, setFlagInfo] = useState<Flag | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [banner, setBanner] = useState<{ key: number; text: string; sub?: string; color: string; back?: boolean } | null>(null);
  const bannerTimer = useRef<number | undefined>(undefined);
  const prevPhase = useRef({ turn: 0, phase: "", started: false });
  const [inspect, setInspect] = useState<{ card: Card; flagId?: string; fc?: FieldCard | null; note?: string } | null>(null);

  const mySide: Side = mode === "multiplayer" ? role : "host";
  const oppSide: Side = mySide === "host" ? "guest" : "host";
  const me = game[mySide];
  const foe = game[oppSide];
  const started = game.mulligan.host && game.mulligan.guest;
  const isMyTurn = game.currentTurn === mySide && !game.winner && started;
  const attackPhaseName = game.rules.useAttackPhase ? "attack" : "main";
  const sw = game.spellWindow ?? null;
  const iAmDefender = (!!game.battle && game.battle.attackerSide !== mySide) || (!!sw && sw.casterSide !== mySide);
  const waitingCounter = (!!game.battle && game.battle.attackerSide === mySide) || (!!sw && sw.casterSide === mySide);
  const myLook = game.pendingLook && game.pendingLook.side === mySide ? game.pendingLook : null;
  const oppLooking = !!game.pendingLook && game.pendingLook.side !== mySide;
  const mySoulPick = game.pendingSoul && game.pendingSoul.side === mySide ? game.pendingSoul : null;
  const myZoneCall = game.pendingZoneCall && game.pendingZoneCall.side === mySide ? game.pendingZoneCall : null;
  const oppZoneCall = !!game.pendingZoneCall && game.pendingZoneCall.side !== mySide;
  const [zcSel, setZcSel] = useState<{ from: "drop" | "deck"; cardId: string } | null>(null);
  useEffect(() => { setZcSel(null); }, [game.pendingZoneCall?.cardId, game.pendingZoneCall?.n]);
  const oppSoulPick = !!game.pendingSoul && game.pendingSoul.side !== mySide;
  const myTargetPick = game.pendingTarget && game.pendingTarget.side === mySide ? game.pendingTarget : null;
  const oppTargetPick = !!game.pendingTarget && game.pendingTarget.side !== mySide;
  const [targetSel, setTargetSel] = useState<string[]>([]);
  useEffect(() => { setTargetSel([]); }, [game.pendingTarget?.cardId, game.pendingTarget?.effType, game.pendingTarget?.candidates.join(",")]);
  const busy = !!game.battle || !!sw || !!game.pendingLook || !!game.pendingSoul || !!game.pendingTarget || !!game.pendingFreeCall || !!game.pendingZoneCall;
  // Final Phase: มีเฉพาะมอนสเตอร์ไม้ตายที่ Stand อยู่เท่านั้นที่โจมตีได้
  const finalAttack = isMyTurn && game.phase === "final" && !busy && me.monsters.some(m => m.state === "stand" && isMonsterImpact(cardOfFc(m)));
  const canAttackNow = isMyTurn && !busy && (game.phase === attackPhaseName || finalAttack);
  const canAtk = (fc: { state: string; cardId: string }, isItem = false) =>
    canAttackNow && fc.state === "stand" && (game.phase !== "final" || (!isItem && isMonsterImpact(getCard(fc.cardId))));
  const canPlayNow = isMyTurn && game.phase === "main" && !busy;
  const canImpactCallNow = isMyTurn && game.phase === "final" && !busy;
  // Move: ตอนเริ่ม Attack Phase ของทั้งสองฝั่ง ก่อนมีการโจมตี (ฝั่งป้องกันย้ายได้ในช่วงที่ระบบเปิดให้)
  const canMoveNow = started && !game.winner && !busy && game.phase === attackPhaseName && game.attacksThisTurn === 0 &&
    (isMyTurn || game.moveWindow === mySide);
  const moveWindowMine = game.moveWindow === mySide;

  function commit(next: GameState) {
    // จำสถานะ "ต้นเทิร์น" ของทุกเทิร์น (ใช้กับปุ่มกลับไปต้นเทิร์น) — ตอนย้อนกลับใช้ restoreState แทน จึงไม่ทับค่านี้
    const prev = gameRef.current;
    const mDone = (s: GameState) => !!(s.mulligan?.host && s.mulligan?.guest);
    if (next.turn !== prev.turn || (mDone(next) && !mDone(prev))) turnStartsRef.current.set(next.turn, next);
    gameRef.current = next;
    setGame(next);
  }

  /* ---------------- Undo: ย้อนการกระทำล่าสุด / กลับไปต้นเทิร์น ---------------- */
  // ประวัติเก็บเฉพาะ "การกระทำของผู้เล่น" (บอท/ระบบอัตโนมัติ/Mulligan ไม่นับ) จึงย้อนครั้งเดียวคืนถึงจุดก่อนกดจริงๆ
  function pushHist(before: GameState, after: GameState, by: Side) {
    const list = histRef.current;
    list.push({ before, label: after.turn !== before.turn ? `จบเทิร์น ${before.turn}` : (after.log[after.log.length - 1] ?? "การกระทำ"), by });
    if (list.length > 120) list.shift();
    setHistN(list.length);
  }
  function restoreState(snapshot: GameState, kind: "last" | "turn", label: string, byMe: boolean, remoteInc?: GameState) {
    const cur = gameRef.current;
    const next: GameState = remoteInc ? remoteInc : structuredClone(snapshot);
    if (!remoteInc) {
      next.rev = (cur.rev ?? 0) + 1;
      next.fxSeq = cur.fxSeq ?? 0; // ตัวนับอนิเมชันไม่ถอยกลับ จะได้ไม่เล่นเอฟเฟกต์เก่าซ้ำ
      next.fx = [];
      next.log = [...cur.log, `↩ ${mySide === "host" ? "ผู้สร้างห้อง" : "ผู้เข้าร่วม"} ${kind === "turn" ? "กลับไปต้นเทิร์น" : "ย้อนการกระทำล่าสุด"}: ${label}`].slice(-80);
      recalcAuras(next);
    }
    setAtkSels([]); setHandSel(null); setChargePick(false); setMenuTarget(null); setMoveSel(null); setLinkMode(false); setInspect(null);
    gameRef.current = next;
    setGame(next);
    setHistN(histRef.current.length);
    if (byMe && mode === "multiplayer") mp.send({ type: "state", state: next, undo: kind, undoNote: label });
  }
  function canUndoLast(): string | null {
    if (game.winner) return "เกมจบแล้ว";
    if (mode === "multiplayer" && !syncedRef.current) return "ยังไม่ได้เชื่อมต่อกับเพื่อน";
    if (histRef.current.length === 0) return "ยังไม่มีการกระทำให้ย้อน";
    return null;
  }
  function canUndoTurn(): string | null {
    if (game.winner) return "เกมจบแล้ว";
    if (mode === "multiplayer" && !syncedRef.current) return "ยังไม่ได้เชื่อมต่อกับเพื่อน";
    if (!turnStartsRef.current.get(game.turn)) return "ไม่มีข้อมูลต้นเทิร์นนี้";
    if (!histRef.current.some(h => h.before.turn === game.turn)) return "ตอนนี้อยู่ที่ต้นเทิร์นอยู่แล้ว";
    return null;
  }
  function doUndo(kind: "last" | "turn") {
    const why = kind === "last" ? canUndoLast() : canUndoTurn();
    if (why) { setNotice({ title: kind === "last" ? "ย้อนไม่ได้" : "กลับไปต้นเทิร์นไม่ได้", msg: why }); return; }
    if (kind === "last") {
      const e = histRef.current.pop()!;
      restoreState(e.before, "last", e.label, true);
    } else {
      const ts = turnStartsRef.current.get(game.turn)!;
      histRef.current = histRef.current.filter(h => h.before.turn < game.turn);
      restoreState(ts, "turn", `เทิร์น ${game.turn}`, true);
    }
    setUndoAsk(null);
  }
  // ขอย้อน: ออนไลน์/กลับต้นเทิร์นให้ยืนยันก่อน (กันกดพลาด), โหมดบอทย้อนการกระทำล่าสุดได้ทันที
  function askUndo(kind: "last" | "turn") {
    const why = kind === "last" ? canUndoLast() : canUndoTurn();
    if (why) { setNotice({ title: kind === "last" ? "ย้อนไม่ได้" : "กลับไปต้นเทิร์นไม่ได้", msg: why }); return; }
    if (mode === "bot" && kind === "last") doUndo("last"); else setUndoAsk(kind);
  }
  undoFnRef.current = () => askUndo("last");

  /* ---------------- Multiplayer messages ---------------- */
  useEffect(() => {
    mp.onMessage = (msg: SyncMessage) => {
      if (msg.type === "image" && msg.imageFor) {
        const { id, image } = msg.imageFor;
        if (id.startsWith("flag:")) {
          const fid = id.slice(5);
          if (_remoteFlagCache[fid]) _remoteFlagCache[fid] = { ..._remoteFlagCache[fid], image };
        } else {
          setCardImage(id, image);
        }
        setImgTick(t => t + 1);
        return;
      }
      if (msg.cards) registerCards(Object.values(msg.cards));
      if (msg.flags) Object.values(msg.flags).forEach(f => {
        _remoteFlagCache[f.id] = { ...f, image: _remoteFlagCache[f.id]?.image ?? f.image };
      });

      if (msg.type === "hello" && roleRef.current === "host" && msg.deck) {
        // เพื่อนกลับเข้าห้องเดิมระหว่างเกมที่กำลังเล่น/เซฟไว้: ส่งสถานะเดิมให้ ไม่สร้างเกมใหม่ทับ
        const live = gameRef.current;
        if (liveGameRef.current && live.mulligan?.host && live.mulligan?.guest) {
          syncedRef.current = true;
          setSynced(true);
          setConnected(true);
          setDropped(false);
          setShowRoomDialog(false);
          mp.send({ type: "state", state: live, cards: collectCards(hostDeck, allCards), flags: stripFlags(hostFlag) });
          sendImages(hostDeck, allCards, hostFlag);
          setNotice({ title: "เพื่อนกลับเข้าห้องแล้ว", msg: "เล่นต่อจากสถานะเดิมได้เลย" });
          return;
        }
        const gDeck = msg.deck;
        const gFlag = msg.flags?.[gDeck.flagId] ?? Object.values(msg.flags ?? {})[0] ?? hostFlag;
        const gs = makeGame(hostDeck, gDeck, hostFlag, gFlag, allCards, rules);
        commit(gs);
        liveGameRef.current = true;
        syncedRef.current = true;
        setSynced(true);
        setConnected(true);
        setShowRoomDialog(false);
        mp.send({ type: "state", state: gs, cards: collectCards(hostDeck, allCards), flags: stripFlags(hostFlag) });
        sendImages(hostDeck, allCards, hostFlag);
        return;
      }

      if (msg.type === "requestSync" && roleRef.current === "host") {
        mp.send({ type: "state", state: gameRef.current });
        return;
      }

      if (msg.type === "state" && msg.state) {
        const cur = gameRef.current;
        const inc = msg.state;
        // ผู้เข้าร่วมที่ต่อกลับเข้ามา แล้วสถานะของตัวเองใหม่กว่าของเจ้าของห้อง (เช่น เพิ่งทำอะไรไปตอนเน็ตหลุด): ส่งของเราให้เจ้าของห้องใช้แทน
        if (roleRef.current === "guest" && !syncedRef.current && liveGameRef.current && (inc.rev ?? 0) < (cur.rev ?? 0)) {
          mp.send({ type: "state", state: cur });
          syncedRef.current = true; setSynced(true); setConnected(true); setDropped(false); setShowRoomDialog(false);
          return;
        }
        const accept = (inc.rev ?? 0) > (cur.rev ?? 0) ||
          ((inc.rev ?? 0) === (cur.rev ?? 0) && roleRef.current === "guest") || !syncedRef.current;
        if (!accept) return;
        if (msg.undo && syncedRef.current) {
          // อีกฝั่งกดย้อน: ถอยประวัติของเราตามให้ตรงกัน แล้วใช้สถานะที่ส่งมา
          if (msg.undo === "last") histRef.current.pop();
          else histRef.current = histRef.current.filter(h => h.before.turn < inc.turn);
          restoreState(inc, msg.undo, msg.undoNote ?? "", false, inc);
          setNotice({ title: msg.undo === "turn" ? "เพื่อนกลับไปต้นเทิร์น" : "เพื่อนย้อนการกระทำล่าสุด", msg: msg.undoNote ? `ย้อนกลับไปก่อน: ${msg.undoNote}` : "สถานะเกมถูกย้อนกลับ" });
          return;
        }
        // การกระทำของอีกฝั่ง (ไม่ใช่ระบบอัตโนมัติ) ก็นับเป็นขั้นที่ย้อนได้ — ใครกดพลาดก็ย้อนได้
        if (syncedRef.current && !msg.auto && (inc.rev ?? 0) > (cur.rev ?? 0) && !cur.winner && cur.mulligan?.host && cur.mulligan?.guest) pushHist(cur, inc, roleRef.current === "host" ? "guest" : "host");
        commit(inc);
        if (roleRef.current === "guest") {
          liveGameRef.current = true;
          syncedRef.current = true;
          setSynced(true);
          setConnected(true);
          setDropped(false);
          setShowRoomDialog(false);
        }
      }
    };
    mp.onStatus = (s) => setMpStatus(s);
    mp.onClose = () => {
      // เน็ตหลุด / เพื่อนปิดแท็บ: หยุดเล่นชั่วคราว เกมถูกเซฟอัตโนมัติไว้แล้ว — เพื่อนต่อกลับเข้ามาห้องเดิมแล้วเล่นต่อได้
      syncedRef.current = false;
      setSynced(false);
      setConnected(false);
      setDropped(true);
    };
    // เล่นต่อเกมออนไลน์ที่เซฟไว้: เจ้าของห้องเปิดห้องเดิม / ผู้เข้าร่วมต่อห้องเดิมให้อัตโนมัติ
    if (resume && mode === "multiplayer") {
      if (resume.role === "host") {
        mp.hostRoom(resume.roomId, true).catch(() => { /* สถานะแสดงใน mpStatus ผู้เล่นกดเชื่อมต่อใหม่เองได้ */ });
      } else {
        joinRoomWith(resume.roomId);
      }
    }
    return () => { mp.onClose = null; mp.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  menuTargetRef.current = menuTarget;
  autoShuffleRef.current = autoShuffle;
  // ปิดเมนู — ถ้าเพิ่งเปิดดู/ค้นการ์ดในเด็ค และเปิดสับอัตโนมัติ จะสับเด็คให้ทันที
  closeMenuRef.current = () => {
    const t = menuTargetRef.current;
    if (t?.kind === "deckView" && autoShuffleRef.current) doAction(s => sandboxShuffleDeck(s, t.side));
    setMenuTarget(null);
  };
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenuRef.current();
    }
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        undoFnRef.current();
        return;
      }
      if (e.key === "Escape") {
        setAtkSels([]); setHandSel(null); setChargePick(false); closeMenuRef.current(); setMoveSel(null); setNotice(null); setLinkMode(false); setInspect(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, []);

  useEffect(() => { setAtkSels([]); setHandSel(null); setChargePick(false); setMoveSel(null); setMoveMode(false); setLinkMode(false); }, [game.phase, game.currentTurn]);
  useEffect(() => {
    if (atkSels.length === 0) return;
    const ok = atkSels.filter(u => {
      const fc = me.monsters.find(m => m.uid === u) ?? (me.item?.uid === u ? me.item : null);
      return fc && fc.state === "stand";
    });
    if (ok.length !== atkSels.length) setAtkSels(ok);
  }, [game, atkSels, me]);

  // opts.auto = การกระทำของระบบ (บอท / Draw อัตโนมัติ) — ไม่บันทึกลงประวัติ Undo
  function doAction(fn: (s: GameState) => GameState, opts?: { auto?: boolean }) {
    if (mode === "multiplayer" && !syncedRef.current) {
      setNotice({ title: "ยังเล่นไม่ได้", msg: "ยังไม่ได้เชื่อมต่อกับเพื่อน กรุณารอให้เพื่อนเข้าห้องหรือกดปุ่ม 'ซิงค์'" });
      return;
    }
    const prev = gameRef.current;
    const next = fn(prev);
    if (next === prev) return;
    recalcAuras(next); // ผลต่อเนื่องจากการ์ด Set ให้ตรงกับสถานะล่าสุดเสมอ
    next.rev = (prev.rev ?? 0) + 1;
    if (!opts?.auto && !prev.winner && prev.mulligan?.host && prev.mulligan?.guest) pushHist(prev, next, mySide); // Mulligan ไม่นับเป็นขั้นที่ย้อนได้
    commit(next);
    if (mode === "multiplayer") mp.send({ type: "state", state: next, auto: !!opts?.auto });
  }

  // ทำ action ที่อาจล้มเหลว: ถ้าไม่ผ่านจะแสดง popup บอกเหตุผล (ไม่ส่งอะไรไปให้เพื่อน)
  function act(title: string, fn: (s: GameState) => Result, auto = false): boolean {
    if (mode === "multiplayer" && !syncedRef.current) {
      setNotice({ title: "ยังเล่นไม่ได้", msg: "ยังไม่ได้เชื่อมต่อกับเพื่อน กรุณารอให้เพื่อนเข้าห้องหรือกดปุ่ม 'ซิงค์'" });
      return false;
    }
    const r = fn(gameRef.current);
    if (!r.ok) { setNotice({ title, msg: r.msg }); return false; }
    doAction(() => r.state, { auto });
    return true;
  }

  /* ---------------- แบนเนอร์เปลี่ยนเทิร์น / เฟส ---------------- */
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = { turn: game.turn, phase: game.phase, started };
    if (game.winner || !started) return;
    const mine = game.currentTurn === mySide;
    let nb: { text: string; sub?: string; color: string; back?: boolean } | null = null;
    const ORDER: Record<string, number> = { draw: 0, charge: 1, main: 2, attack: 3, final: 4 };
    const LABEL: Record<string, string> = { charge: "CHARGE & DRAW", main: "MAIN PHASE", attack: "ATTACK PHASE", final: "FINAL PHASE" };
    if (!prev.started || game.turn !== prev.turn) {
      nb = mine
        ? { text: "เทิร์นของคุณ", sub: `TURN ${game.turn}`, color: "#0891b2" }
        : { text: "เทิร์นฝั่งตรงข้าม", sub: `TURN ${game.turn}`, color: "#be123c" };
    } else if (game.phase !== prev.phase) {
      if ((ORDER[game.phase] ?? 0) < (ORDER[prev.phase] ?? 0)) {
        nb = { text: `◀ ${LABEL[game.phase] ?? game.phase.toUpperCase()}`, sub: "ย้อนกลับเฟส (Sandbox)", color: "#475569", back: true };
      } else if (mine && game.phase === "main") {
        nb = { text: "MAIN PHASE", sub: "ลงมอนสเตอร์ ร่ายเวท จัดทัพ", color: "#059669" };
      } else if (mine && game.phase === "attack") {
        nb = { text: "ATTACK PHASE", sub: "เลือกผู้โจมตี แล้วเลือกเป้าหมาย", color: "#dc2626" };
      } else if (mine && game.phase === "final") {
        nb = { text: "FINAL PHASE", sub: "ช่วงสุดท้าย: Impact / Impact Call มอนสเตอร์ไม้ตาย แล้วจบเทิร์น", color: "#a21caf" };
      } else if (!mine && (game.phase === "attack" || game.phase === "final")) {
        nb = { text: LABEL[game.phase], sub: "ฝั่งตรงข้าม", color: game.phase === "attack" ? "#9f1239" : "#6b21a8" };
      }
    }
    if (nb) {
      playSfx("turn");
      setBanner({ ...nb, key: Date.now() });
      window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(() => setBanner(null), 1500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn, game.phase, game.currentTurn, started]);
  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);
  // เสียง: ผลแพ้ชนะ และแจ้งเตือนทำไม่ได้
  useEffect(() => { if (game.winner) playSfx(game.winner === mySide ? "win" : "lose", 300); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.winner]);
  useEffect(() => { if (notice) playSfx("error"); }, [notice]);
  useEffect(() => { setSoulTarget(null); setSoulPicks([]); }, [game.pendingSoul?.cardId, game.pendingSoul?.src, game.pendingSoul?.n]);
  useEffect(() => { setLookSel({ hand: [], drop: [], bottom: [] }); }, [game.pendingLook?.cardId, game.pendingLook?.cards.join(",")]);

  const hideUnits = (uids: string[], ms: number) => {
    setHidden(h => [...h, ...uids]);
    window.setTimeout(() => setHidden(h => h.filter(u => !uids.includes(u))), ms);
  };

  /* ---------------- Draw Phase: จั่วให้อัตโนมัติหลังเห็นเฟส Draw สั้นๆ ---------------- */
  useEffect(() => {
    if (game.winner || !started || game.phase !== "draw" || game.battle) return;
    if (game.currentTurn !== mySide) return; // ฝั่งตรงข้าม/บอทจัดการเอง
    if (mode === "multiplayer" && !synced) return; // ออนไลน์: รอเชื่อมต่อกับเพื่อนก่อนค่อยจั่ว (เช่น เล่นต่อเกมที่เซฟไว้)
    const t = setTimeout(() => act("จั่วไม่ได้", s => (s.phase === "draw" && s.currentTurn === mySide ? drawPhase(s, mySide) : { state: s, ok: true, msg: "" }), true), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.currentTurn, game.turn, started, synced]);

  /* ---------------- แจ้งเตือนการ์ดที่ถูกลบแต่ยังค้างในเด็ค ---------------- */
  useEffect(() => {
    if (resume) return; // เล่นต่อเกมเดิม: ไม่ต้องตรวจเด็ค
    const miss = (d: Deck) => d.cardIds.filter(id => !getCard(id)).length;
    const mine = miss(hostDeck);
    const bot = mode === "bot" ? miss(guestDeck) : 0;
    const msgs: string[] = [];
    if (mine + bot > 0) msgs.push(`เด็คมีการ์ดที่ไม่มีข้อมูลแล้ว ${mine > 0 ? `${mine} ใบ (เด็คของคุณ)` : ""}${mine > 0 && bot > 0 ? " และ " : ""}${bot > 0 ? `${bot} ใบ (เด็คบอท)` : ""} — ระบบตัดออกจากเกมนี้ให้แล้ว ไปที่ Deck Builder เพื่อลบ/แทนที่ถาวร`);
    // เด็คต้องมีการ์ดพอสำหรับมือเริ่มต้น + เกจเริ่มต้นตาม Flag
    const valid = hostDeck.cardIds.filter(id => !!getCard(id)).length;
    const need = (Number(hostFlag?.startHand) || 0) + (Number(hostFlag?.startGauge) || 0);
    if (hostFlag && valid < need) msgs.push(`เด็คของคุณมีการ์ดที่ใช้ได้เพียง ${valid} ใบ แต่ Flag "${hostFlag.name}" กำหนดมือเริ่มต้น ${hostFlag.startHand} ใบ + เกจ ${hostFlag.startGauge} ใบ (รวม ${need}) จึงได้มือไม่ครบ — เพิ่มการ์ดในเด็คให้พอ (แนะนำ 40+ ใบ)`);
    if (msgs.length) setNotice({ title: "ตรวจพบปัญหาเด็ค", msg: msgs.join("\n\n") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Bot ---------------- */
  useEffect(() => {
    if (mode !== "bot" || game.winner) return;
    const botMull = !game.mulligan.guest;
    const botDefending = (!!game.battle && game.battle.attackerSide === "host") || (!!game.spellWindow && game.spellWindow.casterSide === "host");
    const botLook = game.pendingLook?.side === "guest" || game.pendingSoul?.side === "guest" || game.pendingTarget?.side === "guest" || game.pendingZoneCall?.side === "guest";
    const botTurn = game.currentTurn === "guest" && !game.battle && !game.spellWindow && !game.pendingLook && !game.pendingSoul && !game.pendingTarget && game.mulligan.host && game.mulligan.guest;
    if (!botMull && !botDefending && !botTurn && !botLook) return;
    const t = setTimeout(() => doAction(s => botStep(s), { auto: true }), botMull ? 100 : botDefending ? 900 : 850);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game]);

  /* ---------------- Actions ---------------- */
  const tryCall = (i: number, pos: number) => {
    const c = cardOf(me.hand[i] ?? "");
    // มอนสเตอร์ที่มี Counter "คอลจากมือ": นอก Main Phase ของเรา (เช่น Attack Phase / เทิร์นคู่ต่อสู้) ลงด้วย Counter ได้ทุกเฟส
    if (c && callSelfEffect(c) && !(isMyTurn && game.phase === "main" && !busy)) {
      const o = freeOpts.find(x => x.zone === "hand" && x.index === i);
      if (!o) { setNotice({ title: "Counter ไม่ได้", msg: "ใช้ Counter คอลมอนสเตอร์ตอนนี้ไม่ได้ (เช่น เกจ/Life ไม่พอ ไม่มีช่องว่าง Size เกิน หรือกำลังรอเลือกอยู่)" }); setHandSel(null); return; }
      requestCounter({ ...o, position: pos }, true); setHandSel(null); return;
    }
    if (isMonsterImpact(c)) {
      // มอนสเตอร์ไม้ตาย: Main Phase ลงไม่ได้ ต้อง Impact Call ใน Final Phase (Sandbox ลงด้วยมือได้เหมือนถูกเอฟเฟกต์เรียก)
      if (game.phase === "final") act("Impact Call ไม่ได้", s => impactCall(s, mySide, i, pos, { ignoreSize: sandbox, free: sandbox }));
      else act("ลงมอนสเตอร์ไม่ได้", s => callMonster(s, mySide, i, pos, { ignoreSize: sandbox, byEffect: sandbox }));
    } else act("ลงมอนสเตอร์ไม่ได้", s => callMonster(s, mySide, i, pos, { ignoreSize: sandbox }));
    setHandSel(null);
  };
  const tryCast = (i: number) => { act("ร่ายไม่ได้", s => castSpell(s, mySide, i)); setHandSel(null); };
  const tryTransform = (src: { zone: "hand"; index: number } | { zone: "field"; uid: string }) => {
    act("Transform ไม่ได้", s => transformCard(s, mySide, src));
    setHandSel(null);
    setInspect(null);
  };
  const tryEquip = (i: number) => { act("ติดตั้งไอเทมไม่ได้", s => equipItem(s, mySide, i)); setHandSel(null); };
  const trySet = (i: number) => { act("Set การ์ดไม่ได้", s => setCard(s, mySide, i)); setHandSel(null); };
  const tryMove = (uid: string, pos: number) => { act("Move ไม่ได้", s => moveMonster(s, mySide, uid, pos)); setMoveSel(null); };

  function launchAttack(leadUid: string, target: AttackTarget) {
    const uids = atkSels.includes(leadUid) ? [leadUid, ...atkSels.filter(u => u !== leadUid)] : [leadUid];
    act("โจมตีไม่ได้", s => declareAttack(s, mySide, uids[0], target, uids));
    setAtkSels([]);
    setLinkMode(false);
  }
  function tryAttack(target: AttackTarget) {
    if (atkSels.length === 0) return;
    launchAttack(atkSels[0], target);
  }
  const doDraw = () => act("จั่วไม่ได้", s => drawPhase(s, mySide));
  const doCharge = (i: number | null) => { act("Charge ไม่ได้", s => chargeAndDraw(s, mySide, i)); setChargePick(false); };
  const doGoAttack = () => act("เปลี่ยนเฟสไม่ได้", s => goToAttack(s, mySide));
  const doGoFinal = () => act("เปลี่ยนเฟสไม่ได้", s => goToFinal(s, mySide));
  const doEndTurn = () => doAction(s => endTurn(s));
  const [discardPick, setDiscardPick] = useState<{ opt: CounterOption; free: boolean; need: number; sel: number[] } | null>(null);
  const doCounterRaw = (opt: CounterOption) => act("ใช้ Counter ไม่ได้", s => counterAct(s, mySide, opt));
  const doPassCounter = () => act("ผิดพลาด", s => passCounter(s, mySide));
  // Counter ใช้ได้ทุกเวลา (Main / Attack / Final ของเทิร์นใครก็ได้ ที่ไม่ได้อยู่ในจังหวะรอ Counter)
  const freeOpts = freeCounterOptions(game, mySide);
  const doFreeCounterRaw = (opt: CounterOption) => {
    const ok = act("ใช้ Counter ไม่ได้", s => useCounterAnytime(s, mySide, opt));
    if (ok) setShowFreeCounter(false);
  };
  // ถ้าสกิลมีค่าใช้จ่าย "ทิ้งการ์ดบนมือ" ให้เปิดหน้าเลือกการ์ดก่อน แล้วค่อยใช้ Counter
  const [showSoulCall, setShowSoulCall] = useState(false);
  const mySoulCalls = soulCallOffers(game, mySide);
  const [slotPick, setSlotPick] = useState<{ opt: CounterOption; free: boolean } | null>(null);
  const requestCounter = (opt: CounterOption, free: boolean) => {
    const c = counterCardOf(game, mySide, opt);
    // Counter "คอลการ์ดใบนี้จากมือ": เลือกช่องที่จะลงก่อน
    if (c && opt.zone === "hand" && callSelfEffect(c) && opt.position === undefined) { setSlotPick({ opt, free }); return; }
    const need = c ? counterHandCost(c, opt, free ? null : (game.battle ? "attack" : "cast")) : 0;
    if (need > 0 && !opt.discard) { setDiscardPick({ opt, free, need, sel: [] }); return; }
    if (free) doFreeCounterRaw(opt); else doCounterRaw(opt);
  };
  const doCounter = (opt: CounterOption) => requestCounter(opt, false);
  const doFreeCounter = (opt: CounterOption) => requestCounter(opt, true);
  function requestSync() {
    if (roleRef.current === "guest") mp.send({ type: "requestSync" });
    else mp.send({ type: "state", state: gameRef.current });
  }

  function createRoom() {
    if (roomId) return;
    const id = mp.generateRoomId();
    setRoomId(id);
    roleRef.current = "host";
    setRole("host");
    mp.hostRoom(id).catch(() => setRoomId(""));
  }

  function joinRoom() { joinRoomWith(joinId.trim().toUpperCase()); }
  function joinRoomWith(id: string) {
    if (!id) return;
    roleRef.current = "guest";
    setRole("guest");
    mp.joinRoom(id)
      .then(() => {
        setRoomId(id);
        mp.send({ type: "hello", deck: hostDeck, cards: collectCards(hostDeck, allCards), flags: stripFlags(hostFlag) });
        sendImages(hostDeck, allCards, hostFlag);
      })
      .catch(() => { if (!liveGameRef.current) { roleRef.current = "host"; setRole("host"); } }); // เล่นต่อ/ต่อกลับ: ห้ามสลับบทบาท
  }

  // ต่อห้องเดิมใหม่หลังหลุด: เจ้าของห้องเปิดห้องเดิมรอเพื่อน / ผู้เข้าร่วมเข้าห้องเดิมอีกครั้ง
  function reconnect() {
    const id = roomId || resume?.roomId || "";
    if (!id) { setShowRoomDialog(true); return; }
    setMpStatus("กำลังเชื่อมต่อห้อง " + id + " ใหม่...");
    if (roleRef.current === "host") mp.hostRoom(id, true).catch(() => { /* สถานะแสดงใน mpStatus */ });
    else joinRoomWith(id);
  }

  /* ---------------- เซฟเกมอัตโนมัติ ---------------- */
  // บันทึกทุกครั้งที่สถานะเปลี่ยน (หลังเริ่มเกมจริง ๆ) — ปิดแท็บ/เน็ตหลุด/รีเฟรช แล้วกด "เล่นต่อ" ที่หน้าแรกได้
  const inProgress = started && !game.winner && !initialState;
  function persistNow() {
    const g = gameRef.current;
    if (initialState || !g.mulligan?.host || !g.mulligan?.guest || g.winner) return;
    saveGame(buildSave({
      mode, role: roleRef.current, roomId: mode === "multiplayer" ? roomIdRef.current : "",
      hostDeck, guestDeckId: mode === "bot" ? guestDeckId : undefined, rules: g.rules ?? rules, state: g,
      flagOf: id => allFlags.find(f => f.id === id) ?? _remoteFlagCache[id],
    }));
  }
  persistRef.current = persistNow;
  roomIdRef.current = roomId;
  useEffect(() => {
    if (initialState) return;
    if (game.winner) { clearSavedGame(); return; }
    if (!started) return;
    const t = window.setTimeout(() => persistRef.current(), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, roomId]);
  useEffect(() => {
    const flush = () => persistRef.current();
    const warn = (e: BeforeUnloadEvent) => {
      flush();
      // ออนไลน์: ปิดแท็บแล้วเพื่อนหลุด จึงถามก่อน (เซฟไว้แล้ว กลับมาเล่นต่อห้องเดิมได้)
      if (mode === "multiplayer" && gameRef.current.mulligan?.host && gameRef.current.mulligan?.guest && !gameRef.current.winner) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", warn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function requestExit() {
    if (inProgress) { setExitAsk(true); return; }
    if (game.winner) clearSavedGame();
    onExit();
  }

  function changeBotDeck(id: string) {
    setGuestDeckId(id);
    const d = allDecks.find(x => x.id === id);
    if (!d) return;
    const f = allFlags.find(x => x.id === d.flagId) ?? hostFlag;
    commit(makeGame(hostDeck, d, hostFlag, f, allCards, rules));
  }

  const flagOf = (id: string) => allFlags.find(f => f.id === id) ?? _remoteFlagCache[id];
  const cardOf = (id: string) => getCard(id);

  // เปิดหน้าต่างดูรายละเอียดการ์ด (คลิกขวา / ดับเบิลคลิก / โหมดดูการ์ด / คลิกการ์ดที่ตอนนี้ใช้ไม่ได้)
  const openInspect = (card: Card, flagId?: string, fc?: FieldCard | null, note?: string) => setInspect({ card, flagId, fc, note });
  const openSoulView = (title: string, ids: string[], flagId?: string) => setSoulView({ title, ids: [...ids], flagId });

  // เหตุผลที่ตอนนี้ยังกระทำกับการ์ดไม่ได้ (แสดงในหน้าต่างดูการ์ด)
  function whyBlocked(): string | undefined {
    if (game.winner) return undefined;
    if (!started) return "ยังเริ่มเกมไม่ได้: รอทั้งสองฝั่งเลือก Mulligan ก่อน";
    if (myZoneCall) return "กำลังเลือกมอนสเตอร์ที่จะคอลจากสุสาน/เด็ค: เลือกให้เสร็จก่อน";
    if (oppZoneCall) return "กำลังรอฝั่งตรงข้ามเลือกมอนสเตอร์ที่จะคอล";
    if (myTargetPick) return "กำลังเลือกเป้าหมายมอนสเตอร์ศัตรู: เลือกให้เสร็จก่อน";
    if (oppTargetPick) return "กำลังรอฝั่งตรงข้ามเลือกเป้าหมายมอนสเตอร์";
    if (mySoulPick) return mySoulPick.mode === "add" ? "กำลังเลือกการ์ดที่จะรับ Soul: เลือกให้เสร็จก่อน" : "กำลังเลือกการ์ดที่จะถอด Soul: เลือกให้เสร็จก่อน";
    if (oppSoulPick) return "กำลังรอฝั่งตรงข้ามเลือกการ์ดที่จะถอด Soul";
    if (myLook) return "กำลังเลือกการ์ดหลังดูกอง: เลือกให้เสร็จก่อน";
    if (oppLooking) return "กำลังรอฝั่งตรงข้ามเลือกการ์ดหลังดูกอง";
    if (game.battle || sw) return iAmDefender ? "กำลังมี" + (sw ? "การร่ายเวท" : "การโจมตี") + ": เลือกใช้ Counter หรือกด 'ไม่ใช้ Counter' ก่อน" : "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter";
    if (!isMyTurn) return "ยังไม่ใช่เทิร์นของคุณ จึงสั่งการ์ดไม่ได้";
    return undefined;
  }

  /* ---------------- Drag & Drop ---------------- */
  function handleDropOnSlot(pos: number) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.kind === "hand") {
      const c = cardOf(me.hand[d.index] ?? "");
      if (c?.type === "Monster") tryCall(d.index, pos);
      else setNotice({ title: "วางไม่ได้", msg: "ช่องมอนสเตอร์ใช้วางการ์ดมอนสเตอร์เท่านั้น (ไอเทม/เวทลากไปวางที่ช่อง Flag/ไอเทม หรือ Set)" });
    } else {
      const m = me.monsters.find(x => x.uid === d.uid);
      if (m) tryMove(d.uid, pos);
    }
  }
  function handleDropOnGear() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.kind !== "hand") return;
    const c = cardOf(me.hand[d.index] ?? "");
    if (!c) return;
    if (c.type === "Item") tryEquip(d.index);
    else if (c.type === "Spell" || c.type === "Impact") tryCast(d.index);
    else if (isMonsterImpact(c)) setNotice({ title: "วางไม่ได้", msg: "มอนสเตอร์ไม้ตายต้อง Impact Call ลงช่องมอนสเตอร์ใน Final Phase (ลากไปวางที่ช่องมอนสเตอร์)" });
    else setNotice({ title: "วางไม่ได้", msg: "ช่องนี้ใช้ติดตั้งไอเทม หรือร่ายเวท/Impact" });
  }
  function handleDropOnSet() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.kind === "hand") trySet(d.index);
  }
  function handleDropAttack(target: AttackTarget) {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.kind === "unit") launchAttack(d.uid, target);
  }

  /* ---------------- Mat ---------------- */
  function renderMat(side: Side, isMine: boolean) {
    const p = game[side];
    const flag = flagOf(p.flagId);
    const color = getFlagColor(flag);
    const active = game.currentTurn === side && !game.winner && started;
    const mirror = !isMine;
    const legal = !isMine && atkSels.length > 0 ? legalTargets(game, mySide, atkSels[0], atkSels) : [];
    const fighterLegal = legal.some(t => t.kind === "fighter");
    const buddyList = deckBuddies(p).map(id => cardOf(id)).filter((c): c is Card => !!c);
    const calledBuddies = p.buddiesCalled ?? (p.buddyCalledThisGame && p.buddyId ? [p.buddyId] : []);
    // บัดดี้ที่เป็นมอนสเตอร์ไม้ตาย: หงายหน้าอยู่ = Stand วางแนวนอน · หลัง Buddy Call = Rest วางแนวตั้ง
    const buddyTilt = (c: Card): CSSProperties | undefined =>
      isMonsterImpact(c) && !calledBuddies.includes(c.id) ? { transform: "rotate(90deg) scale(0.72)" } : undefined;
    const buddyMsg = (c: Card) => c.type === "Item" ? (calledBuddies.includes(c.id) ? "Buddy (ไอเทม) ตัวนี้ถูก Buddy Call ไปแล้ว" : "Buddy ของคุณเป็นไอเทม: ติดตั้งลงช่องไอเทมคือ Buddy Call จะได้ Buddy Gift (Life +1) ครั้งเดียวต่อเกม") : calledBuddies.includes(c.id)
      ? "Buddy ตัวนี้ถูก Buddy Call ไปแล้ว (ทำได้ตัวละครั้งเดียวต่อเกม)"
      : buddyList.length > 1
        ? `Buddy ของคุณ (ช่องบัดดี้มี ${buddyList.length} ตัว): ลงสนามด้วยการ Buddy Call จะได้ Buddy Gift (Life +1) ตัวละครั้งเดียวต่อเกม`
        : "Buddy ของคุณ: ลงสนามด้วยการ Buddy Call จะได้ Buddy Gift (Life +1) ครั้งเดียวต่อเกม";
    const draggingAttack = canAttackNow && !isMine; // ให้ลากผู้โจมตีมาวางบนเป้าหมาย
    const dragLegal = (t: AttackTarget): boolean => {
      const d = dragRef.current;
      if (!d || d.kind !== "unit") return false;
      return legalTargets(game, mySide, d.uid).some(x => x.kind === t.kind && (t.kind === "fighter" || (x.kind === "monster" && t.kind === "monster" && x.position === t.position)));
    };
    void dragLegal;

    const hexPos = [
      place(17.5, 22, 21.67, 39, mirror),
      place(39.17, 12, 21.67, 39, mirror),
      place(60.8, 22, 21.67, 39, mirror),
    ];

    const monsterHex = (pos: number) => {
      const m = p.monsters.find(x => x.position === pos);
      const card = m ? cardOfFc(m) ?? null : null;
      const isTarget = !isMine && legal.some(t => t.kind === "monster" && t.position === pos);
      const selHand = isMine && handSel !== null ? cardOf(me.hand[handSel] ?? "") : undefined;
      const selCounterCall = !!selHand && !!callSelfEffect(selHand) && freeOpts.some(o => o.zone === "hand" && o.index === handSel) && callSelfSlots(game, mySide, selHand).includes(pos);
      const callable = isMine && handSel !== null && !m && selHand?.type === "Monster" && (selCounterCall || (isMonsterImpact(selHand) ? canImpactCallNow : canPlayNow));
      const moveTarget = isMine && canMoveNow && moveSel !== null && !m;
      const selected = isMine && !!m && atkSels.includes(m.uid);
      const glow = isTarget ? "glow-target" : (callable || moveTarget) ? "glow-slot" : selected ? "glow-sel" : "";
      const canMoveThis = isMine && !!m && !!card && canMoveNow && hasKeyword(card, "move") && movableMonsters(game, mySide).some(x => x.uid === m.uid);
      return (
        <HexZone
          key={pos}
          fx={`slot:${side}:${pos}`}
          style={hexPos[pos]}
          label={`มอนสเตอร์${POSITION_NAMES[pos]}`}
          glow={glow}
          onDrop={isMine ? () => handleDropOnSlot(pos) : draggingAttack ? () => handleDropAttack({ kind: "monster", position: pos }) : undefined}
          onClick={() => {
            if (inspectMode && m && card) return openInspect(card, p.flagId, m);
            if (isTarget) return tryAttack({ kind: "monster", position: pos });
            if (callable && handSel !== null) return tryCall(handSel, pos);
            if (moveTarget && moveSel) return tryMove(moveSel, pos);
            // เลือกผู้โจมตีไว้แล้วแต่กดช่องที่ตีไม่ได้ -> ให้กติกาบอกเหตุผล
            if (!isMine && atkSels.length > 0) return tryAttack({ kind: "monster", position: pos });
            if (m && card) {
              if (isMine && canMoveThis && moveMode) return setMoveSel(moveSel === m.uid ? null : m.uid);
              if (isMine && canAtk(m)) {
                if (linkMode) return setAtkSels(atkSels.includes(m.uid) ? atkSels.filter(u => u !== m.uid) : [...atkSels, m.uid]);
                return setAtkSels(atkSels.length === 1 && atkSels[0] === m.uid ? [] : [m.uid]);
              }
              if (isMine && canMoveThis) return setMoveSel(moveSel === m.uid ? null : m.uid);
              if (sandbox) return setMenuTarget({ kind: "field", side, uid: m.uid });
              // ไม่มีการกระทำที่ทำได้ -> เปิดดูการ์ด พร้อมบอกเหตุผล
              let note = whyBlocked();
              if (!note && isMine) {
                if (m.state === "rest") note = `${card.name} อยู่ในสถานะ Rest${isMonsterImpact(card) ? " (วางแนวตั้ง)" : ""} (โจมตีไปแล้วหรือถูก Rest) จะ Stand ตอนต้นเทิร์นของคุณ`;
                else if (game.rules.useAttackPhase && game.phase !== "attack" && !(game.phase === "final" && isMonsterImpact(card))) note = `โจมตีได้เฉพาะ Attack Phase (ตอนนี้คือ ${game.phase === "draw" ? "Draw" : game.phase === "charge" ? "Charge & Draw" : game.phase === "main" ? "Main" : "Final"}) — กดปุ่ม 'ไป Attack Phase'`;
                else if (game.phase === "final") note = isMonsterImpact(card) ? `${card.name} เป็นมอนสเตอร์ไม้ตาย โจมตีได้ใน Final Phase ตอนอยู่ในสถานะ Stand (วางแนวนอน)` : "ผ่านช่วงโจมตีมาแล้ว ตอนนี้เป็น Final Phase — มีแต่มอนสเตอร์ไม้ตายที่โจมตีได้";
              } else if (!note && !isMine && game.phase === attackPhaseName && canAttackNow) note = "เลือกผู้โจมตีของคุณก่อน (คลิกมอนสเตอร์ที่ Stand) แล้วค่อยเลือกเป้าหมาย";
              return openInspect(card, p.flagId, m, note);
            }
            if (!m && !isMine && atkSels.length === 0 && canAttackNow) setNotice({ title: "ช่องนี้ว่าง", msg: "ไม่มีมอนสเตอร์ในช่องนี้ให้โจมตี" });
          }}
        >
          {m && card && (
            <div key={m.uid} className="anim-call relative" data-fxcard={m.uid} style={{ visibility: hidden.includes(m.uid) ? "hidden" : "visible" }}>
              {m.soul.length > 0 && (
                <button
                  className="absolute -bottom-1 -left-1 z-20 bg-violet-700 hover:bg-violet-600 border border-violet-200 text-white font-bold rounded-full px-1.5 shadow-lg"
                  style={{ fontSize: "10px" }}
                  title="ดูการ์ดใน Soul"
                  onClick={e => { e.stopPropagation(); openSoulView(card.name, m.soul, p.flagId); }}
                >◆ {m.soul.length}</button>
              )}
              <div
                className="transition-transform duration-500 relative"
                style={{ transform: (isMonsterImpact(card) ? m.state === "stand" : m.state === "rest") ? "rotate(90deg)" : "none" }}
                onMouseEnter={() => setHovered({ card, flagId: p.flagId, stats: statsOf(m), soul: m.soul.length })}
              >
                <SoulStack n={m.soul.length} />
                <CardView
                  card={card} flag={flag} width="var(--cw)" hideText stats={statsOf(m)} soul={m.soul.length} sizeValue={sizeOfFc(m)} onStatHover={(stat, ev) => setStatTip(stat && ev ? { uid: m.uid, stat, x: ev.clientX, y: ev.clientY } : null)}
                  onInspect={() => openInspect(card, p.flagId, m)}
                  draggable={isMine && (canAtk(m) || canMoveThis)}
                  onDragStart={() => { dragRef.current = { kind: "unit", uid: m.uid }; if (canAttackNow && !atkSels.includes(m.uid)) setAtkSels([m.uid]); }}
                  onDragEnd={() => { dragRef.current = null; }}
                >
                  {(m.tempPower !== 0 || m.tempCritical !== 0 || m.tempDefense !== 0 || !!m.manualPower || !!m.manualCritical || !!m.manualDefense || !!m.manualSize) && (
                    <div className="absolute top-[2.6em] right-0 bg-cyan-500 text-white font-bold px-1 rounded-l z-20" style={{ fontSize: "0.7em" }}>BUFF</div>
                  )}
                  {m.nullified && (
                    <div className="absolute inset-x-0 top-[40%] text-center bg-fuchsia-700/90 text-white font-bold tracking-wider z-20 border-y border-fuchsia-200" style={{ fontSize: "0.8em" }}>NULLIFY</div>
                  )}
                  {maxAttacks(card) > 1 && (
                    <div className="absolute top-[0.3em] right-[0.3em] bg-rose-600 text-white font-bold px-1 rounded z-20" style={{ fontSize: "0.75em" }}>{m.attacks}/{maxAttacks(card)}</div>
                  )}
                  {sandbox && (
                    <button type="button" title="เมนู Sandbox (ปรับค่า / Soul / ย้ายการ์ด) — ใช้ได้ทุกเฟส"
                      onClick={e => { e.stopPropagation(); setMenuTarget({ kind: "field", side, uid: m.uid }); }}
                      onMouseDown={e => e.stopPropagation()}
                      className="absolute bottom-[0.3em] right-[0.3em] z-30 pointer-events-auto bg-slate-900/90 hover:bg-cyan-700 border border-cyan-400 text-cyan-200 rounded-full leading-none flex items-center justify-center" style={{ width: "1.6em", height: "1.6em", fontSize: "0.9em" }}>⚙</button>
                  )}
                </CardView>
              </div>
            </div>
          )}
        </HexZone>
      );
    };

    const lifeIdx = (() => { let idx = -1; LIFE_TRACK.forEach((v, i) => { if (v <= p.life) idx = i; }); return idx; })();
    const gaugeCards = Math.min(p.gauge, 14);

    return (
      <div
        data-fx={`mat:${side}`}
        className="relative rounded-2xl overflow-hidden transition-shadow duration-500"
        style={{
          width: "var(--mw)", height: "var(--mh)",
          background: `radial-gradient(ellipse at 50% 90%, ${color}55, transparent 60%), repeating-linear-gradient(45deg, #9aa0ab 0 6px, #8d93a0 6px 12px)`,
          border: `3px solid ${active ? color : "#475569"}`,
          boxShadow: active ? `0 0 26px ${color}66` : "none",
        }}
      >
        {/* Life track */}
        <div data-fx={`life:${side}`} style={{ ...place(10, 0, 81, 8.5, mirror), background: "linear-gradient(180deg,#7f1d1d,#5b1414)", borderRadius: mirror ? "0 0 10px 10px" : "10px 10px 0 0" }}
          className={`flex items-center gap-[1%] px-[1.2%] ${fighterLegal ? "glow-target cursor-crosshair" : "cursor-pointer"}`} title="กดเพื่อดูความสามารถของ Flag"
          onClick={() => { if (!isMine && atkSels.length > 0) tryAttack({ kind: "fighter" }); else if (flag) setFlagInfo(flag); }}
          onDragOver={draggingAttack ? (e) => e.preventDefault() : undefined}
          onDrop={draggingAttack ? (e) => { e.preventDefault(); handleDropAttack({ kind: "fighter" }); } : undefined}>
          <span className="font-display font-bold text-white shrink-0" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>พลังชีวิต</span>
          <div className="flex-1 flex items-center justify-between">
            {LIFE_TRACK.map((v, i) => (
              <span key={v} className={`rounded-full flex items-center justify-center font-display font-bold ${i === lifeIdx ? "bg-yellow-300 text-red-900 scale-125 shadow-lg" : i < lifeIdx ? "bg-yellow-500/80 text-red-900" : "bg-red-950 text-red-300/60"}`}
                style={{ width: "calc(var(--mh) * 0.055)", height: "calc(var(--mh) * 0.055)", fontSize: "calc(var(--mh) * 0.032)" }}>{v}</span>
            ))}
          </div>
        </div>

        {/* Gauge */}
        <RectZone fx={`gauge:${side}`} style={place(2, 11, 14.5, 50, mirror)} label={p.gauge === 0 ? "เกจ" : undefined} className="relative">
          <div className="absolute inset-x-[14%] flex flex-col items-center" style={{ top: mirror ? "auto" : "6%", bottom: mirror ? "6%" : "auto" }}>
            {Array.from({ length: gaugeCards }).map((_, i) => (
              <div key={i} className="rounded-sm bg-slate-600 border border-slate-400/70" style={{ width: "100%", height: "calc(var(--mh) * 0.05)", marginTop: i === 0 ? 0 : "calc(var(--mh) * -0.012)" }} />
            ))}
          </div>
          <div className="absolute inset-x-0 flex flex-col items-center font-display font-bold text-amber-300 drop-shadow-lg" style={{ top: mirror ? "6%" : "auto", bottom: mirror ? "auto" : "5%", fontSize: "calc(var(--mh) * 0.1)" }}>
            <span className="flex items-center gap-1"><Zap size={14} fill="currentColor" /><span key={p.gauge} className="num-pop">{p.gauge}</span></span>
          </div>
          {sandbox && (
            <div className="absolute top-0.5 right-0.5 flex gap-0.5 z-20">
              <button title="Charge +1" onClick={() => doAction(s => addGauge(s, side, 1))} className="p-0.5 bg-amber-800 hover:bg-amber-600 rounded"><Plus size={11} /></button>
              <button title="จ่ายเกจ 1" onClick={() => doAction(s => sandboxPayGauge(s, side, 1))} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Minus size={11} /></button>
            </div>
          )}
        </RectZone>

        {monsterHex(0)}
        {monsterHex(1)}
        {monsterHex(2)}

        {/* Deck */}
        <RectZone fx={`deck:${side}`} style={place(85.5, 11, 12.5, 31, mirror)} onClick={() => sandbox && setMenuTarget({ kind: "deck", side })} label={undefined}>
          <CardView faceDown width="calc(var(--mh) * 0.2)">
            <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow" style={{ fontSize: "2.4em" }}><span key={p.deck.length} className="num-pop">{p.deck.length}</span></div>
          </CardView>
        </RectZone>
        {/* Drop */}
        <RectZone fx={`drop:${side}`} style={place(85.5, 45, 12.5, 31, mirror)} onClick={() => p.dropZone.length > 0 && setMenuTarget({ kind: "drop", side })}>
          {p.dropZone.length > 0 && cardOf(p.dropZone[p.dropZone.length - 1]) ? (
            <div className="relative opacity-90">
              <CardView card={cardOf(p.dropZone[p.dropZone.length - 1])} flag={flag} width="calc(var(--mh) * 0.2)" hideText />
              <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow bg-black/45 rounded" style={{ fontSize: "2em" }}>{p.dropZone.length}</div>
            </div>
          ) : <span className="font-display font-bold text-slate-300/60" style={{ fontSize: "calc(var(--mh) * 0.05)" }}>ดรอป</span>}
        </RectZone>

        {/* Set */}
        <RectZone style={place(2, 66, 24, 29, mirror)} onDrop={isMine ? handleDropOnSet : undefined} label={p.setZone.length === 0 ? "เซ็ท" : undefined}>
          <div className="flex gap-1 items-center justify-center flex-wrap">
            {p.setZone.map((id, i) => {
              const c = cardOf(id);
              const faceUp = !!c && hasSetKeyword(c);
              if (faceUp && c) {
                // การ์ด Set (เวทผลต่อเนื่อง): เปิดหน้าให้ทั้งสองฝั่งเห็น
                return (
                  <div key={i} className="relative" onMouseEnter={() => setHovered({ card: c, flagId: p.flagId, soul: setSoulOf(p, i).length })}>
                    <CardView card={c} flag={flag} width="calc(var(--mh) * 0.17)" hideText soul={setSoulOf(p, i).length}
                      onClick={() => sandbox ? setMenuTarget({ kind: "set", side, index: i }) : openInspect(c, p.flagId, null, `การ์ด Set: ผลต่อเนื่องทำงานตลอดที่อยู่ในช่อง Set จนกว่าจะถูกทำลาย${sandbox ? "" : ""}`)}
                      onInspect={() => openInspect(c, p.flagId)} />
                    <span className="absolute -top-1 -left-1 bg-violet-600 text-white font-bold rounded px-1" style={{ fontSize: "9px" }}>SET</span>
                    {setSoulOf(p, i).length > 0 && <button className="absolute -bottom-1 -right-1 bg-violet-700 hover:bg-violet-600 border border-violet-200 text-white font-bold rounded-full px-1.5 z-10" style={{ fontSize: "10px" }} title="ดูการ์ดใน Soul ของการ์ด Set" onClick={e => { e.stopPropagation(); openSoulView(c.name, setSoulOf(p, i), p.flagId); }}>◆{setSoulOf(p, i).length}</button>}
                  </div>
                );
              }
              return (
                <div key={i} onMouseEnter={() => (isMine || sandbox) && c && setHovered({ card: c, flagId: p.flagId })}>
                  <div className="relative">
                    <CardView faceDown width="calc(var(--mh) * 0.17)" onClick={sandbox && c ? () => setMenuTarget({ kind: "set", side, index: i }) : isMine && c ? () => openInspect(c, p.flagId, null, "การ์ด Set (คว่ำ): ใช้เป็น Counter ได้ตอนศัตรูโจมตีหรือร่ายเวท") : undefined} />
                    {setSoulOf(p, i).length > 0 && <button className="absolute -bottom-1 -right-1 bg-violet-700 hover:bg-violet-600 border border-violet-200 text-white font-bold rounded-full px-1.5 z-10" style={{ fontSize: "10px" }} title="ดูการ์ดใน Soul ของการ์ด Set" onClick={e => { e.stopPropagation(); openSoulView(c?.name ?? "การ์ด Set", setSoulOf(p, i), p.flagId); }}>◆{setSoulOf(p, i).length}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </RectZone>

        {/* Flag / Item / Buddy */}
        <RectZone style={place(29, 58, 54, 40, mirror)} onDrop={isMine ? handleDropOnGear : undefined} className="relative" glow={""}>
          <span className="absolute left-2 top-1 font-display font-bold text-slate-300/40" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>แฟลก / ไอเทม</span>
          <span className="absolute right-2 top-1 font-display font-bold text-slate-300/40" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>บัดดี้</span>
          <div className="flex items-center justify-around w-full px-2" style={{ flexDirection: mirror ? "row-reverse" : "row" }}>
            {/* Flag */}
            <div data-fx={`fighter:${side}`} className={`relative rounded-md overflow-hidden ${fighterLegal ? "glow-target cursor-crosshair" : ""}`} style={{ width: "calc(var(--mh) * 0.23)", aspectRatio: "63 / 88", border: `3px solid ${color}` }}
              onClick={() => !isMine && atkSels.length > 0 && tryAttack({ kind: "fighter" })}
              onDragOver={draggingAttack ? (e) => e.preventDefault() : undefined}
              onDrop={draggingAttack ? (e) => { e.preventDefault(); handleDropAttack({ kind: "fighter" }); } : undefined}>
              {flag?.image ? <img src={flag.image} className="w-full h-full object-cover" draggable={false} /> : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${color}, #111827)` }} />}
              <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 text-center font-display font-semibold truncate px-1" style={{ color, fontSize: "calc(var(--mh) * 0.035)" }}>{flag?.name ?? "Flag"}</div>
              <div className="absolute top-0 left-0 bg-rose-600 text-white font-display font-bold px-1 rounded-br flex items-center gap-0.5" style={{ fontSize: "calc(var(--mh) * 0.045)" }}><Heart size={10} fill="currentColor" /><span key={p.life} className="num-pop">{p.life}</span></div>
            </div>
            {/* Item */}
            <div
              data-fx={`item:${side}`}
              className={`relative flex items-center justify-center ${isMine && p.item && atkSels.includes(p.item.uid) ? "glow-sel" : ""}`}
              style={{ width: "calc(var(--mh) * 0.23)", aspectRatio: "63 / 88", border: "2px dashed #64748b", borderRadius: 8 }}
              onClick={() => {
                if (!p.item) return;
                const itemCard = cardOfFc(p.item);
                if (inspectMode && itemCard) return openInspect(itemCard, p.flagId, p.item);
                if (!isMine && atkSels.length > 0) return;
                if (isMine && canAtk(p.item, true)) {
                  if (linkMode) return setAtkSels(atkSels.includes(p.item.uid) ? atkSels.filter(u => u !== p.item!.uid) : [...atkSels, p.item.uid]);
                  return setAtkSels(atkSels.length === 1 && atkSels[0] === p.item.uid ? [] : [p.item.uid]);
                }
                if (sandbox) return setMenuTarget({ kind: "field", side, uid: p.item.uid });
                if (itemCard) openInspect(itemCard, p.flagId, p.item, whyBlocked() ?? (p.item.state === "rest" ? `${itemCard.name} อยู่ในสถานะ Rest จะ Stand ตอนต้นเทิร์นของเจ้าของ` : game.phase !== attackPhaseName ? "ไอเทมโจมตีได้ใน Attack Phase" : undefined));
              }}
            >
              {p.item && cardOfFc(p.item) ? (
                <div key={p.item.uid} className="anim-call relative" style={{ visibility: hidden.includes(p.item.uid) ? "hidden" : "visible" }}>
                {p.item.soul.length > 0 && (
                  <button
                    className="absolute -bottom-1 -left-1 z-20 bg-violet-700 hover:bg-violet-600 border border-violet-200 text-white font-bold rounded-full px-1.5 shadow-lg"
                    style={{ fontSize: "10px" }}
                    title="ดูการ์ดใน Soul"
                    onClick={e => { e.stopPropagation(); openSoulView(cardOfFc(p.item!)?.name ?? "ไอเทม", p.item!.soul, p.flagId); }}
                  >◆ {p.item.soul.length}</button>
                )}
                <div className="transition-transform duration-500 relative" style={{ transform: p.item.state === "rest" ? "rotate(90deg)" : "none" }} onMouseEnter={() => setHovered({ card: cardOfFc(p.item!)!, flagId: p.flagId, stats: statsOf(p.item!), soul: p.item!.soul.length })}>
                  <SoulStack n={p.item.soul.length} />
                  <CardView card={cardOfFc(p.item)!} flag={flag} width="calc(var(--mh) * 0.22)" hideText stats={statsOf(p.item)} soul={p.item.soul.length} onStatHover={(stat, ev) => setStatTip(stat && ev ? { uid: p.item!.uid, stat, x: ev.clientX, y: ev.clientY } : null)}
                    onInspect={() => openInspect(cardOfFc(p.item!)!, p.flagId, p.item)}
                    draggable={isMine && canAtk(p.item, true)}
                    onDragStart={() => { dragRef.current = { kind: "unit", uid: p.item!.uid }; if (!atkSels.includes(p.item!.uid)) setAtkSels([p.item!.uid]); }}
                    onDragEnd={() => { dragRef.current = null; }}>
                    {sandbox && p.item && (
                      <button type="button" title="เมนู Sandbox — ใช้ได้ทุกเฟส"
                        onClick={e => { e.stopPropagation(); setMenuTarget({ kind: "field", side, uid: p.item!.uid }); }}
                        onMouseDown={e => e.stopPropagation()}
                        className="absolute bottom-[0.3em] right-[0.3em] z-30 pointer-events-auto bg-slate-900/90 hover:bg-cyan-700 border border-cyan-400 text-cyan-200 rounded-full leading-none flex items-center justify-center" style={{ width: "1.6em", height: "1.6em", fontSize: "0.9em" }}>⚙</button>
                    )}
                  </CardView>
                </div>
                </div>
              ) : <span className="font-display font-bold text-slate-300/40" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>ไอเทม</span>}
            </div>
            {/* Buddy */}
            <div className="flex items-center justify-center" style={{ width: "calc(var(--mh) * 0.23)", aspectRatio: "63 / 88", border: "2px dashed #f59e0b88", borderRadius: 8 }}>
              {buddyList.length === 1 ? (
                <div className={calledBuddies.includes(buddyList[0].id) ? "opacity-40" : ""} style={buddyTilt(buddyList[0])} onMouseEnter={() => setHovered({ card: buddyList[0], flagId: p.flagId })}>
                  <CardView card={buddyList[0]} flag={flag} width="calc(var(--mh) * 0.22)" hideText onClick={() => openInspect(buddyList[0], p.flagId, null, buddyMsg(buddyList[0]))} onInspect={() => openInspect(buddyList[0], p.flagId)} />
                </div>
              ) : buddyList.length > 1 ? (
                // Buddy 2-4 ตัว: วางเป็นตาราง 2 คอลัมน์ในช่องบัดดี้ (ตัวที่ Buddy Call แล้วจางลง)
                <div className="grid w-full h-full content-center justify-items-center" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 2, padding: 2 }}>
                  {buddyList.map(b => (
                    <div key={b.id} className={calledBuddies.includes(b.id) ? "opacity-40" : ""} style={buddyTilt(b)} onMouseEnter={() => setHovered({ card: b, flagId: p.flagId })}>
                      <CardView card={b} flag={flag} width="calc(var(--mh) * 0.105)" hideText onClick={() => openInspect(b, p.flagId, null, buddyMsg(b))} onInspect={() => openInspect(b, p.flagId)} />
                    </div>
                  ))}
                </div>
              ) : <span className="text-slate-400/50" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>ไม่มี</span>}
            </div>
          </div>
          {sandbox && (
            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 z-20">
              <button onClick={() => doAction(s => changeLife(s, side, 1))} className="p-0.5 bg-rose-800 hover:bg-rose-600 rounded"><Plus size={11} /></button>
              <button onClick={() => doAction(s => changeLife(s, side, -1))} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Minus size={11} /></button>
            </div>
          )}
        </RectZone>
      </div>
    );
  }

  function renderHand(isMine: boolean) {
    const p = isMine ? me : foe;
    const flag = flagOf(p.flagId);
    const hw = isMine ? "calc(var(--cw) * 0.95)" : "calc(var(--cw) * 0.5)";
    const overlap = p.hand.length > 8 ? "-0.4" : p.hand.length > 6 ? "-0.2" : "0.08";
    return (
      <div className="flex justify-center items-end px-2" style={{ minHeight: isMine ? "calc(var(--cw) * 1.3)" : "calc(var(--cw) * 0.45)", paddingTop: isMine ? "1rem" : 0 }}>
        {p.hand.length === 0 && <span className="text-slate-600 text-xs py-3">ไม่มีการ์ดในมือ</span>}
        {p.hand.map((cid, i) => {
          const style: CSSProperties = { marginLeft: i === 0 ? 0 : `calc(${hw} * ${overlap})` };
          if (!isMine) return <CardView key={i} faceDown width={hw} style={style} />;
          const card = cardOf(cid);
          if (!card) return <CardView key={i} faceDown width={hw} style={style} />;
          const sel = handSel === i;
          const play = !game.winner && !chargePick ? playOf(game, mySide, i) : { ok: false, reason: "" };
          const isCounterNow = freeOpts.some(o => o.zone === "hand" && o.index === i);
          const turnActive = isMyTurn && (game.phase === "main" || game.phase === "final") && !busy;
          const hint = play.ok || !isMyTurn ? "" : (play.reason || ""); // เหตุผลที่เล่นไม่ได้ แสดงเฉพาะเทิร์นของเรา
          const glow = chargePick ? "ring-2 ring-amber-400"
            : sel ? "ring-4 ring-cyan-400 -translate-y-3"
            : play.ok ? "hand-playable"
            : isCounterNow ? "hand-counter"
            : turnActive && hint ? "opacity-70" : "";
          return (
            <div key={i} className={`hand-card anim-draw group relative ${glow} rounded-lg`} style={{ ...style, animationDelay: `${Math.min(i, 8) * 45}ms` }} onMouseEnter={() => setHovered({ card, flagId: p.flagId })} title={hint || undefined}>
              {(hint || play.ok || isCounterNow) && !sel && (
                <div className={`pointer-events-none hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-40 w-max max-w-[16rem] rounded-lg px-2.5 py-1.5 text-xs leading-snug shadow-xl border ${play.ok ? "bg-emerald-900/95 border-emerald-400 text-emerald-100" : isCounterNow && !hint ? "bg-sky-900/95 border-sky-400 text-sky-100" : "bg-slate-900/95 border-amber-500 text-amber-200"}`}>
                  {play.ok ? "✓ เล่นการ์ดใบนี้ได้ตอนนี้" : isCounterNow && !hint ? "⚡ ใช้เป็น Counter ได้ตอนนี้" : `✗ ${hint}${isCounterNow ? " (แต่ใช้เป็น Counter ได้)" : ""}`}
                </div>
              )}
              <CardView
                card={card} flag={flag} width={hw} hideText
                draggable={canPlayNow || (isMyTurn && game.phase === "final") || freeOpts.some(o => o.zone === "hand" && o.index === i)}
                onDragStart={() => { dragRef.current = { kind: "hand", index: i }; setHandSel(i); }}
                onDragEnd={() => { dragRef.current = null; }}
                onInspect={() => openInspect(card, p.flagId)}
                onClick={() => {
                  if (inspectMode) return openInspect(card, p.flagId);
                  // การ์ด Counter ในมือที่ใช้ได้ตอนนี้: เลือกได้ทุกเฟส ทั้งเทิร์นเราและเทิร์นคู่ต่อสู้
                  if (freeOpts.some(o => o.zone === "hand" && o.index === i) && !(isMyTurn && game.phase === "charge" && chargePick)) { setHandSel(sel ? null : i); return; }
                  // Impact ที่ตั้งให้ร่ายได้ใน Final Phase ของคู่แข่ง (และเงื่อนไข Life ครบ): เลือกได้ในเทิร์นคู่ต่อสู้
                  if (!isMyTurn && card.type === "Impact" && !impactCastProblem(game, mySide, card)) { setHandSel(sel ? null : i); return; }
                  if (!isMyTurn) return openInspect(card, p.flagId, null, whyBlocked() ?? "ยังไม่ใช่เทิร์นของคุณ");
                  if (game.phase === "draw") return openInspect(card, p.flagId, null, "ตอนนี้เป็น Draw Phase — กำลังจั่วการ์ดประจำเทิร์น (กดปุ่ม 'Draw' ถ้ายังไม่จั่ว) จากนั้นจึงถึง Charge & Draw");
                  if (game.phase === "charge" && chargePick) return doCharge(i);
                  if (game.phase === "charge") return openInspect(card, p.flagId, null, "ตอนนี้เป็นช่วง Charge & Draw — กดปุ่ม 'Charge & Draw' แล้วเลือกการ์ดเพื่อใส่เกจ หรือกด 'ข้าม' เพื่อเข้า Main Phase ก่อนจึงลงการ์ดได้");
                  if (game.phase === "final" && card.type !== "Impact" && !isMonsterImpact(card)) return openInspect(card, p.flagId, null, "ตอนนี้เป็น Final Phase (ช่วงสุดท้าย) ใช้ได้เฉพาะไม้ตาย (Impact) และ Impact Call มอนสเตอร์ไม้ตาย — ลงมอนสเตอร์/ร่ายเวทได้เฉพาะ Main Phase");
                  if (game.phase === "main" && isMonsterImpact(card)) return openInspect(card, p.flagId, null, "มอนสเตอร์ไม้ตายลงสนามใน Main Phase ไม่ได้ — ต้อง Impact Call ใน Final Phase (เทิร์นละ 1 ใบ)");
                  setHandSel(sel ? null : i);
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  function renderHandBar() {
    if (handSel === null) return null;
    const card = cardOf(me.hand[handSel] ?? "");
    if (!card) return null;
    const counterNow = freeOpts.some(o => o.zone === "hand" && o.index === handSel);
    const impactNow = card.type === "Impact" && !isMyTurn && !impactCastProblem(game, mySide, card);
    if (!isMyTurn && !counterNow && !impactNow) return null;
    const cs = callSelfEffect(card);
    const csSlots = cs && counterNow ? callSelfSlots(game, mySide, card) : [];
    // การ์ดที่ต้องมีการ์ดเงื่อนไขบนสนามก่อน (callRequires): ลงทับช่องของการ์ดเงื่อนไขได้ เพราะการ์ดเหล่านั้นจะเข้า Soul
    const reqMatch = (card.callRequires ?? []).length > 0 ? matchCallRequires(me, card.callRequires ?? []) : null;
    const absorbPos = new Set(me.monsters.filter(m => reqMatch?.uids.includes(m.uid)).map(m => m.position));
    const empty = [0, 1, 2].filter(p => !me.monsters.some(m => m.position === p) || absorbPos.has(p));
    const hasCast = card.autoSkills.some(s => s.trigger === "onCast");
    const counterOnly = hasCounter(card) && !hasCast && card.type !== "Monster" && card.type !== "Item";
    const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold";
    return (
      <div className="mx-auto max-w-3xl w-full bg-slate-900/95 border border-cyan-600 rounded-xl p-3 flex gap-3 items-start">
        <CardView card={card} flag={flagOf(me.flagId)} size="md" onClick={() => openInspect(card, me.flagId)} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-cyan-300">{card.name}</div>
          <div className="text-xs text-slate-400 mb-2">Cost {callCostLabel(effCostCard(game, mySide, card))}{card.type === "Monster" ? ` · Size ${card.size}` : ""}{isMonsterImpact(card) ? " · มอนสเตอร์ไม้ตาย" : ""}{hasCounter(card) ? " · มี Counter Act" : ""} · ลากการ์ดไปวางบนสนามได้{reqMatch && reqMatch.missing.length > 0 ? ` · ยังขาดบนสนาม: ${reqMatch.missing.join(", ")}` : reqMatch ? " · เงื่อนไขครบ (การ์ดเงื่อนไขจะเข้า Soul)" : ""}</div>
          <div className="flex flex-wrap gap-2 items-center">
            {isMyTurn && card.type === "Monster" && !isMonsterImpact(card) && game.phase !== "final" && empty.map(pos => (
              <button key={pos} onClick={() => tryCall(handSel, pos)} className={`${btn} bg-cyan-600 hover:bg-cyan-500`}>ลงช่อง{POSITION_NAMES[pos]}</button>
            ))}
            {isMyTurn && card.type === "Monster" && !isMonsterImpact(card) && game.phase !== "final" && empty.length === 0 && <button onClick={() => tryCall(handSel, 1)} className={`${btn} bg-slate-700`}>ลงมอนสเตอร์</button>}
            {isMyTurn && isMonsterImpact(card) && game.phase === "final" && empty.map(pos => (
              <button key={pos} onClick={() => tryCall(handSel, pos)} className={`${btn} bg-rose-600 hover:bg-rose-500`}>🔥 Impact Call ช่อง{POSITION_NAMES[pos]}</button>
            ))}
            {isMyTurn && isMonsterImpact(card) && game.phase === "final" && empty.length === 0 && <button onClick={() => tryCall(handSel, 1)} className={`${btn} bg-slate-700`}>🔥 Impact Call</button>}
            {isMyTurn && isMonsterImpact(card) && game.phase !== "final" && <span className="text-xs text-rose-300 self-center">มอนสเตอร์ไม้ตายลงสนามได้เฉพาะ Impact Call ใน Final Phase (เทิร์นละ 1 ใบ)</span>}
            {card.type === "Spell" && <button onClick={() => tryCast(handSel)} className={`${btn} ${counterOnly ? "bg-slate-700" : "bg-sky-600 hover:bg-sky-500"}`}>{hasSetKeyword(card) ? "ร่าย → วางลงช่อง Set" : "ร่ายเวท"}</button>}
            {canTransform(card) && <button onClick={() => tryTransform({ zone: "hand", index: handSel })} className={`${btn} bg-fuchsia-600 hover:bg-fuchsia-500`}>🔄 Transform (จ่าย {transformCostLabel(card)})</button>}
            {card.type === "Item" && <button onClick={() => tryEquip(handSel)} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>ติดตั้งไอเทม</button>}
            {card.type === "Impact" && (isMyTurn || impactNow) && <button onClick={() => tryCast(handSel)} title={impactCastCondText(card)} className={`${btn} ${impactCastProblem(game, mySide, card) ? "bg-rose-900 hover:bg-rose-800" : "bg-rose-600 hover:bg-rose-500"}`}>ใช้ Impact ({impactCastCondText(card) || "Final Phase"})</button>}
            {counterNow && !cs && <button onClick={() => { const o = freeOpts.find(x => x.zone === "hand" && x.index === handSel); if (o) { doFreeCounter(o); setHandSel(null); } }} className={`${btn} bg-sky-600 hover:bg-sky-500`}>⚡ ใช้ Counter ทันที</button>}
            {counterNow && cs && csSlots.map(pos => (
              <button key={`cs${pos}`} onClick={() => { const o = freeOpts.find(x => x.zone === "hand" && x.index === handSel); if (o) { requestCounter({ ...o, position: pos }, true); setHandSel(null); } }} className={`${btn} bg-sky-600 hover:bg-sky-500`}>⚡ Counter คอลลงช่อง{POSITION_NAMES[pos]}{cs.payCallCost ? ` (จ่าย ${callCostLabel(effCostCard(game, mySide, card))})` : " (ฟรี)"}</button>
            ))}
            {cs && !counterNow && <span className="text-xs text-amber-300 self-center">ใช้ Counter คอลตอนนี้ไม่ได้ (เกจ/Life ไม่พอ ไม่มีช่องว่าง หรือ Size เกิน)</span>}
            {((hasCounter(card) && !callSelfEffect(card)) || (card.type === "Spell" && hasSetKeyword(card))) && <button onClick={() => trySet(handSel)} className={`${btn} bg-violet-600 hover:bg-violet-500`}>{card.type === "Spell" && hasSetKeyword(card) ? "Set (ลงช่อง Set)" : "Set (วางคว่ำ)"}</button>}
            {sandbox && (<>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "dropZone", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700 flex items-center gap-1`}><Trash2 size={12} /> สุสาน</button>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "gauge", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700 flex items-center gap-1`}><Zap size={12} /> เกจ</button>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "deckBottom", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700`}>⬇ ใต้เด็ค</button>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "deck", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700`}>⬆ บนเด็ค</button>
            </>)}
            <button onClick={() => setHandSel(null)} className={`${btn} bg-slate-800 hover:bg-slate-700`}>ยกเลิก</button>
          </div>
        </div>
      </div>
    );
  }

  function renderPhaseStrip() {
    const phases: { key: GameState["phase"]; label: string }[] = [
      { key: "draw", label: "Draw" },
      { key: "charge", label: "Charge & Draw" },
      { key: "main", label: "Main" },
      ...(game.rules.useAttackPhase ? [{ key: "attack" as const, label: "Attack" }] : []),
      { key: "final", label: "Final" },
    ];
    const turnColor = getFlagColor(flagOf(game[game.currentTurn].flagId));
    let hint = "";
    if (game.winner) hint = "";
    else if (!started) hint = "รอทั้งสองฝั่งเลือก Mulligan...";
    else if (myTargetPick) hint = "เลือกมอนสเตอร์ศัตรูเป้าหมาย แล้วกดยืนยัน";
    else if (oppTargetPick) hint = "รอฝั่งตรงข้ามเลือกเป้าหมายมอนสเตอร์...";
    else if (mySoulPick) hint = mySoulPick.mode === "self" ? "เลือกการ์ดของคุณที่จะรับการ์ดนี้เข้า Soul (หรือเลือกไม่นำเข้า)" : mySoulPick.mode === "add" ? "เลือกการ์ดของคุณที่จะรับ Soul (หรือเลือกไม่ใส่)" : "เลือกการ์ดของคุณที่จะถอด Soul (หรือเลือกไม่ถอด)";
    else if (oppSoulPick) hint = "รอฝั่งตรงข้ามเลือกการ์ดเกี่ยวกับ Soul...";
    else if (myLook) hint = "เลือกการ์ดจากการดูกอง แล้วกดยืนยัน";
    else if (oppLooking) hint = "รอฝั่งตรงข้ามเลือกการ์ดหลังดูกอง...";
    else if (waitingCounter) hint = "รอฝั่งตรงข้ามเลือกว่าจะใช้ Counter หรือไม่...";
    else if (moveWindowMine) hint = "ศัตรูเริ่ม Attack Phase — คลิกมอนสเตอร์ [Move] ของคุณ แล้วเลือกช่องว่างเพื่อย้ายได้ (หรือกด 'จบช่วง Move')";
    else if (game.moveWindow === oppSide) hint = "รอฝั่งตรงข้ามเลือกว่าจะใช้ Move หรือไม่ (ก่อนเริ่มโจมตี)...";
    else if (!isMyTurn) hint = "เทิร์นของฝั่งตรงข้าม";
    else if (game.phase === "draw") hint = "Draw Phase: จั่วการ์ด 1 ใบ แล้วไป Charge & Draw";
    else if (game.phase === "charge") hint = chargePick ? "เลือกการ์ดในมือ 1 ใบเพื่อใส่เกจ (แล้วจั่ว 1)" : "Charge & Draw: ใส่การ์ดจากมือลงเกจแล้วจั่ว 1 ใบ (ข้ามได้)";
    else if (game.phase === "main") hint = handSel !== null ? "เลือกช่องว่างเพื่อลงมอนสเตอร์ หรือใช้ปุ่มด้านล่าง" : "Main: ลงมอนสเตอร์ / ติดตั้งไอเทม / ร่ายเวท / Set แล้วกด 'ไป Attack'";
    else if (game.phase === "attack") hint = moveSel ? "เลือก \"ช่องว่าง\" ที่จะ Move ไป" : atkSels.length > 0 ? `เลือกเป้าหมาย (${atkSels.length > 1 ? `Link Attack ${atkSels.length} ตัว — ` : ""}ช่องศัตรูที่เรืองแสงแดง หรือ Life/Flag) หรือลากผู้โจมตีไปวางบนเป้า` : game.attacksThisTurn === 0 && movableMonsters(game, mySide).length > 0 ? "Attack: มีมอนสเตอร์ [Move] — คลิกเพื่อ Move ไปช่องว่างก่อนโจมตีได้ หรือคลิกมอนสเตอร์ที่ Stand เพื่อโจมตี" : "Attack: คลิกมอนสเตอร์ที่ Stand เพื่อเลือกผู้โจมตี (เปิด Link Attack เพื่อเลือกหลายตัว)";
    else if (game.phase === "final") hint = me.impactCalledTurn === game.turn ? "Final (ช่วงสุดท้าย): Impact Call ไปแล้ว 1 ใบ — มอนสเตอร์ไม้ตายที่ Stand โจมตีได้ แล้วกดจบเทิร์น" : "Final (ช่วงสุดท้าย): ใช้ไม้ตาย (Impact) หรือ Impact Call มอนสเตอร์ไม้ตายได้เทิร์นละ 1 ใบ แล้วกดจบเทิร์น";

    const standCount = [...me.monsters, ...(me.item ? [me.item] : [])].filter(m => canAtk(m, m === me.item) || (m.state === "stand" && game.phase !== "final")).length;
    const b = "px-3 py-1.5 rounded-lg text-sm font-bold";
    return (
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2 flex flex-wrap items-center justify-center gap-2" style={{ width: "min(100%, max(var(--mw), 760px))" }}>
        <span className="font-display font-bold text-sm" style={{ color: turnColor }}>เทิร์น {game.turn} · {game.currentTurn === mySide ? "ของคุณ" : "ฝั่งตรงข้าม"}</span>
        <div className="flex items-center">
          {phases.map((ph, i) => {
            const cur = phases.findIndex(x => x.key === game.phase);
            const done = i < cur, act = i === cur;
            return (
              <div key={ph.key} className="flex items-center">
                {i > 0 && <div className={`h-0.5 w-3 md:w-7 transition-colors duration-500 ${done || act ? "bg-cyan-400" : "bg-slate-700"}`} />}
                <span className={`px-3 py-1 rounded-full text-xs border transition-all duration-300 ${act ? "bg-cyan-500/25 border-cyan-300 text-cyan-100 font-bold scale-110 shadow-[0_0_14px_rgba(34,211,238,.65)]" : done ? "border-cyan-700 text-cyan-500" : "border-slate-700 text-slate-500"}`}>{done ? "✓ " : ""}{ph.label}</span>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => doAction(st => setSoulguardAuto(st, mySide, !!me.soulguardOff))}
          title="เปิด: การ์ด Soulguard ที่จะออกจากสนามจะถอด Soul 1 ใบกันให้ทันที · ปิด: ไม่ใช้ Soulguard (ปล่อยให้ออกจากสนามตามปกติ)"
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${me.soulguardOff ? "bg-slate-800 border-slate-600 text-slate-400" : "bg-violet-700/80 border-violet-300 text-white shadow-[0_0_10px_rgba(168,85,247,.6)]"}`}
        >🛡 Soulguard {me.soulguardOff ? "ปิด" : "ใช้อัตโนมัติ"}</button>
        {mySoulCalls.length > 0 && !game.winner && !busy && (
          <button
            onClick={() => setShowSoulCall(true)}
            title="การ์ดที่เพิ่งออกจาก Soul และมีความสามารถคอลลงสนาม — ใช้ได้ภายในเทิร์นนี้"
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-emerald-700/80 border-emerald-300 text-white shadow-[0_0_10px_rgba(52,211,153,.6)] hover:bg-emerald-600 transition"
          >✨ คอลจาก Soul ({mySoulCalls.length})</button>
        )}
        {freeOpts.length > 0 && !game.winner && (
          <button
            onClick={() => setShowFreeCounter(true)}
            title="การ์ด Counter / Counter Act ใช้ได้ทุกเวลา ไม่ว่าจะเป็น Main / Attack / Final Phase"
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-sky-700/80 border-sky-300 text-white shadow-[0_0_10px_rgba(56,189,248,.6)] hover:bg-sky-600 transition"
          >⚡ Counter ({freeOpts.length})</button>
        )}
        {isMyTurn && !game.battle && game.phase === "draw" && (
          <button onClick={doDraw} className={`${b} bg-cyan-600 hover:bg-cyan-500 btn-nudge transition`}>Draw</button>
        )}
        {isMyTurn && !game.battle && game.phase === "charge" && (<>
          <button onClick={() => setChargePick(v => !v)} className={`${b} ${chargePick ? "bg-amber-400 text-slate-900" : "bg-amber-600 hover:bg-amber-500 btn-nudge"} transition`}>{chargePick ? "เลือกการ์ด..." : "Charge & Draw"}</button>
          <button onClick={() => doCharge(null)} className={`${b} bg-slate-700 hover:bg-slate-600`}>ข้าม</button>
        </>)}
        {isMyTurn && !game.battle && game.phase === "main" && game.rules.useAttackPhase && (
          <button onClick={doGoAttack} className={`${b} bg-rose-600 hover:bg-rose-500 flex items-center gap-1 transition`}><Swords size={14} /> ไป Attack Phase</button>
        )}
        {canMoveNow && isMyTurn && movableMonsters(game, mySide).length > 0 && (
          <button onClick={() => { setMoveMode(v => !v); setMoveSel(null); setAtkSels([]); }} title="Move: ย้ายมอนสเตอร์ที่มีคีย์เวิร์ด Move ไปช่องว่าง (ตอนเริ่ม Attack Phase ก่อนโจมตี)" className={`${b} flex items-center gap-1 ${moveMode ? "bg-cyan-500 text-slate-900" : "bg-cyan-800 hover:bg-cyan-700"}`}>Move {moveMode ? "ON" : "OFF"}</button>
        )}
        {isMyTurn && !game.battle && game.phase === "main" && me.monsters.filter(m => { const c = cardOf(m.cardId); return !!c && canTransform(c); }).map(m => {
          const c = cardOf(m.cardId)!;
          return (
            <button key={m.uid} onClick={() => tryTransform({ zone: "field", uid: m.uid })} title={`Transform ${c.name} → กลายเป็นไอเทม`} className={`${b} bg-fuchsia-700 hover:bg-fuchsia-600 flex items-center gap-1`}>🔄 Transform {c.name} ({transformCostLabel(c)})</button>
          );
        })}
        {canAttackNow && standCount >= 2 && (
          <button onClick={() => setLinkMode(v => !v)} className={`${b} flex items-center gap-1 ${linkMode ? "bg-violet-500 text-white" : "bg-violet-800 hover:bg-violet-700"}`}><Link2 size={14} /> Link Attack {linkMode ? "ON" : "OFF"}</button>
        )}
        {isMyTurn && !game.battle && (game.phase === "main" || game.phase === "attack") && (
          <button onClick={doGoFinal} className={`${b} bg-fuchsia-700 hover:bg-fuchsia-600`}>ไป Final Phase</button>
        )}
        {isMyTurn && !game.battle && game.phase !== "charge" && game.phase !== "draw" && (
          <button onClick={doEndTurn} className={`${b} bg-amber-600 hover:bg-amber-500 transition ${game.phase === "final" ? "btn-nudge" : ""}`}>จบเทิร์น</button>
        )}
        {(atkSels.length > 0 || moveSel) && <button onClick={() => { setAtkSels([]); setMoveSel(null); }} className={`${b} bg-slate-700 hover:bg-slate-600 flex items-center gap-1`}><X size={14} /> ยกเลิกเลือก</button>}
        {sandbox && started && !game.winner && game.phase !== "draw" && (() => {
          const seq = ["charge", "main", "attack", "final"] as const;
          const names: Record<string, string> = { charge: "Charge", main: "Main", attack: "Attack", final: "Final" };
          const idx = seq.indexOf(game.phase as typeof seq[number]);
          return (
            <div className="basis-full flex items-center justify-center gap-1.5 flex-wrap" title="Sandbox: ตั้งเฟสของเทิร์นปัจจุบัน (ไม่รันเอฟเฟกต์ของเฟส)">
              <span className="text-[11px] text-cyan-300 mr-1">🛠 เฟส</span>
              <button disabled={idx <= 0} onClick={() => doAction(s => sandboxSetPhase(s, seq[idx - 1]))} className="px-2 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-30 transition">◀ ย้อนเฟส</button>
              {seq.map(ph => (
                <button key={ph} onClick={() => doAction(s => sandboxSetPhase(s, ph))}
                  className={`phase-pill px-2.5 py-1 rounded-full text-xs font-bold border ${game.phase === ph ? "phase-pill-on bg-cyan-500 text-slate-900 border-cyan-200" : "bg-slate-800 text-slate-300 border-slate-600 hover:border-cyan-400"}`}>{names[ph]}</button>
              ))}
            </div>
          );
        })()}
        {hint && <div className="basis-full text-center text-xs text-slate-300">{hint}</div>}
      </div>
    );
  }

  function renderMulligan() {
    if (game.mulligan[mySide] || game.winner) return null;
    if (mode === "multiplayer" && !synced) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-cyan-500 rounded-2xl p-5 max-w-4xl w-full max-h-[94vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-cyan-300 mb-1">Mulligan — เปลี่ยนมือเริ่มต้น</h3>
          <p className="text-sm text-slate-400 mb-4">คลิกเลือกการ์ดที่อยากเปลี่ยน (เอาคืนเด็ค สับ แล้วจั่วใหม่เท่าเดิม) ทำได้ครั้งเดียว · {game.firstPlayer === mySide ? "คุณเริ่มก่อน" : "ฝั่งตรงข้ามเริ่มก่อน"}</p>
          <div className="flex flex-wrap gap-3 justify-center mb-5">
            {me.hand.map((id, i) => {
              const c = cardOf(id);
              if (!c) return null;
              const on = mullSel.includes(i);
              return (
                <div key={i} className={`rounded-lg transition ${on ? "ring-4 ring-rose-500 opacity-60 -translate-y-2" : "hover:ring-2 hover:ring-cyan-400"}`}>
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => setMullSel(on ? mullSel.filter(x => x !== i) : [...mullSel, i])} onInspect={() => openInspect(c, me.flagId)} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { act("Mulligan ไม่ได้", s => mulligan(s, mySide, mullSel)); setMullSel([]); }} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold">
              {mullSel.length > 0 ? `เปลี่ยน ${mullSel.length} ใบ` : "เก็บมือเดิม"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSoulCallModal() {
    if (!showSoulCall) return null;
    if (mySoulCalls.length === 0 || busy) { return null; }
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-emerald-300 mb-1">✨ การ์ดที่ออกจาก Soul — คอลลงสนามได้</h3>
          <div className="text-xs text-slate-400 mb-4">เลือกช่องที่จะคอล (ช่องไหนก็ได้ที่ว่างและ Size ไม่เกิน) · ใช้ได้ภายในเทิร์นนี้เท่านั้น</div>
          <div className="flex flex-wrap gap-4 mb-4">
            {mySoulCalls.map(o => {
              const c = cardOf(o.cardId);
              if (!c) return null;
              const slots = callSelfSlots(game, mySide, c);
              return (
                <div key={o.index} className="flex flex-col items-center gap-1.5">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onInspect={() => openInspect(c, me.flagId)} />
                  <span className="text-[11px] text-slate-300">อยู่ใน{o.from === "hand" ? "มือ" : "สุสาน"} · {o.pay ? `จ่าย Call Cost ${callCostLabel(effCostCard(game, mySide, c))}` : "ไม่ต้องจ่าย Call Cost"}</span>
                  <div className="flex gap-1.5">
                    {slots.map(pos => (
                      <button key={pos} onClick={() => { const ok = act("คอลไม่ได้", s => useSoulCall(s, mySide, o.index, pos)); if (ok) setShowSoulCall(false); }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold">ลงช่อง{POSITION_NAMES[pos]}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => setShowSoulCall(false)} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ปิด</button>
        </div>
      </div>
    );
  }

  function renderSlotPick() {
    if (!slotPick) return null;
    const { opt, free } = slotPick;
    const c = counterCardOf(game, mySide, opt);
    const eff = callSelfEffect(c);
    if (!c || !eff) return null;
    const slots = callSelfSlots(game, mySide, c);
    const choose = (pos: number) => { setSlotPick(null); requestCounter({ ...opt, position: pos }, free); };
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-sky-500 rounded-2xl p-5 max-w-xl w-full">
          <h3 className="font-display text-xl font-bold text-sky-300 mb-1">คอล {c.name} ลงช่องไหน?</h3>
          <div className="text-xs text-slate-400 mb-4">Counter คอลการ์ดจากมือ · {eff.payCallCost ? `จ่าย Call Cost ${callCostLabel(effCostCard(game, mySide, c))}` : "ไม่ต้องจ่าย Call Cost"} · Size {c.size}</div>
          <div className="flex gap-2 mb-3">
            {[0, 1, 2].map(pos => (
              <button key={pos} disabled={!slots.includes(pos)} onClick={() => choose(pos)}
                className="flex-1 py-3 rounded-xl font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-30 disabled:hover:bg-sky-600">
                ช่อง{POSITION_NAMES[pos]}{!slots.includes(pos) ? " (ลงไม่ได้)" : ""}
              </button>
            ))}
          </div>
          <button onClick={() => setSlotPick(null)} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ยกเลิก</button>
        </div>
      </div>
    );
  }

  function renderDiscardPick() {
    if (!discardPick) return null;
    const { opt, free, need, sel } = discardPick;
    const src = counterCardOf(game, mySide, opt);
    const toggle = (i: number) => setDiscardPick({ ...discardPick, sel: sel.includes(i) ? sel.filter(x => x !== i) : sel.length < need ? [...sel, i] : sel });
    const confirm = () => {
      const o: CounterOption = { ...opt, discard: sel };
      setDiscardPick(null);
      if (free) doFreeCounterRaw(o); else doCounterRaw(o);
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-amber-300 mb-1">เลือกการ์ดในมือที่จะทิ้ง {need} ใบ</h3>
          <div className="text-xs text-slate-400 mb-4">เป็นค่าใช้จ่ายของ Counter{src ? `: ${src.name}` : ""} · เลือกแล้ว {sel.length}/{need}</div>
          <div className="flex flex-wrap gap-3 mb-4">
            {me.hand.map((id, i) => {
              const c = cardOf(id);
              if (!c) return null;
              const self = opt.zone === "hand" && opt.index === i;
              const on = sel.includes(i);
              return (
                <div key={i} className={`flex flex-col items-center gap-1 ${self ? "opacity-30" : ""}`}>
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={self ? undefined : () => toggle(i)} className={on ? "ring-4 ring-amber-400" : self ? "" : "hover:ring-4 hover:ring-amber-300"} />
                  <span className="text-[11px] text-slate-400">{self ? "การ์ดที่กำลังใช้" : on ? "✔ จะทิ้งใบนี้" : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setDiscardPick(null)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ยกเลิก</button>
            <button disabled={sel.length !== need} onClick={confirm} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-xl font-bold">ยืนยันและใช้ Counter</button>
          </div>
        </div>
      </div>
    );
  }

  // เลือกมอนสเตอร์จากสุสาน/เด็คเพื่อคอลลงสนาม (callFromZone)
  function renderZoneCallModal() {
    const pz = myZoneCall;
    if (!pz || game.winner) return null;
    const src = cardOf(pz.cardId);
    const opts = zoneCallOptions(game, pz);
    const selOpt = zcSel ? opts.find(o => o.from === zcSel.from && o.cardId === zcSel.cardId) : undefined;
    const zname = (z: string) => (z === "drop" ? "สุสาน" : "เด็ค");
    const cond = pz.condText ? `ที่มี${pz.condMatch === "name" ? "ชื่อ" : "คุณสมบัติ"} “${pz.condText}” ` : "";
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 text-slate-100 border-2 border-emerald-400 rounded-2xl p-5 max-w-3xl w-full max-h-[94vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-emerald-300 mb-1">คอลมอนสเตอร์{cond}จาก{pz.zones.map(zname).join("หรือ")}{src ? ` — ${src.name}` : ""}</h3>
          <p className="text-sm text-slate-300 mb-3">เลือกการ์ด แล้วเลือกช่องที่จะลง (คอลได้อีกสูงสุด {pz.n} ตัว · {pz.pay ? "จ่าย Call Cost" : "ไม่ต้องจ่าย Call Cost"}){pz.zones.includes("deck") && pz.shuffle ? " · สับเด็คหลังค้นจากเด็ค" : ""}</p>
          <div className="flex flex-wrap gap-3 justify-center mb-4">
            {opts.map(o => {
              const c = cardOf(o.cardId);
              if (!c) return null;
              const on = zcSel?.from === o.from && zcSel.cardId === o.cardId;
              return (
                <div key={`${o.from}-${o.cardId}`} className="flex flex-col items-center gap-1">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => setZcSel({ from: o.from, cardId: o.cardId })} onInspect={() => openInspect(c, me.flagId)} className={on ? "ring-4 ring-emerald-400" : "hover:ring-4 hover:ring-emerald-300"} />
                  <span className="chip">{zname(o.from)}{o.count > 1 ? ` × ${o.count}` : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {selOpt
              ? selOpt.positions.map(pos => (
                  <button key={pos} onClick={() => act("คอลไม่ได้", st => resolveZoneCall(st, mySide, { from: selOpt.from, cardId: selOpt.cardId, position: pos }))} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold">Call ช่อง{POSITION_NAMES[pos]}</button>
                ))
              : <div className="flex-1 text-center text-sm text-slate-400 py-2.5">เลือกการ์ดด้านบนก่อน</div>}
          </div>
          <button onClick={() => act("ผิดพลาด", st => resolveZoneCall(st, mySide, null))} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ไม่คอล / จบการเลือก</button>
        </div>
      </div>
    );
  }

  function renderFreeCallModal() {
    const head = game.pendingFreeCall?.queue[0];
    if (!head || head.side !== mySide || game.winner) return null;
    const c = cardOf(head.cardId);
    if (!c) return null;
    const positions = freeCallPositions(game, mySide, head.cardId);
    const turnTxt = game.currentTurn === mySide ? "ตอนเริ่มเทิร์นของคุณ" : "ตอนเริ่มเทิร์นของศัตรู";
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 text-slate-100 border-2 border-emerald-400 rounded-2xl p-5 max-w-md w-full">
          <h3 className="font-display text-xl font-bold text-emerald-300 mb-1">Call จากสุสานโดยไม่จ่าย Call Cost</h3>
          <p className="text-sm text-slate-300 mb-3">{turnTxt}: {c.name} ในสุสานของคุณ Call ลงสนามได้โดยไม่ต้องจ่าย Call Cost ต้องการ Call ไหม?</p>
          <div className="flex justify-center mb-4"><CardView card={c} flag={flagOf(me.flagId)} size="md" onInspect={() => openInspect(c, me.flagId)} /></div>
          <div className="flex flex-wrap gap-2 mb-2">
            {positions.map(pos => (
              <button key={pos} onClick={() => act("Call ไม่ได้", st => resolveFreeCall(st, mySide, pos))} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold">Call ช่อง{POSITION_NAMES[pos]}</button>
            ))}
          </div>
          <button onClick={() => act("ผิดพลาด", st => resolveFreeCall(st, mySide, null))} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ไม่ Call</button>
        </div>
      </div>
    );
  }

  function renderFreeCounterModal() {
    if (!showFreeCounter || game.winner) return null;
    if (freeOpts.length === 0) return null;
    const zoneLabel = (o: CounterOption) => o.zone === "hand" ? "【Counter】 จากมือ" : o.zone === "set" ? "【Counter】 จากช่อง Set" : o.zone === "setAct" ? "Counter 【Act】 ของการ์ด Set" : "Counter 【Act】 บนสนาม";
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setShowFreeCounter(false)}>
        <div className="bg-slate-900 border-2 border-sky-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h3 className="font-display text-xl font-bold text-sky-300 flex items-center gap-2 mb-1"><Shield size={20} /> ใช้ Counter</h3>
          <div className="text-xs text-slate-400 mb-4">Counter / Counter 【Act】 ใช้ได้ทุกเวลา (Main / Attack / Final) ทั้งเทิร์นคุณและเทิร์นศัตรู</div>
          <div className="flex flex-wrap gap-3 mb-4">
            {freeOpts.map((o, k) => {
              const c = counterCardOf(game, mySide, o);
              if (!c) return null;
              return (
                <div key={k} className="flex flex-col items-center gap-1">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => doFreeCounter(o)} onInspect={() => openInspect(c, me.flagId)} className="hover:ring-4 hover:ring-sky-400" />
                  <span className="text-[11px] text-sky-300">{zoneLabel(o)}</span>
                  {counterSkillLabel(c, o) && <span className="text-[11px] text-slate-200 max-w-[180px] text-center leading-snug bg-slate-800 rounded px-2 py-1">{counterSkillLabel(c, o)}</span>}
                  <button onClick={() => doFreeCounter(o)} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold">{callSelfEffect(c) && o.zone === "hand" ? "คอลลงสนามด้วย Counter" : "ใช้ Counter"}{o.zone === "hand" ? ` (${callSelfEffect(c) && !callSelfEffect(c)!.payCallCost ? "ไม่จ่าย Cost" : `Cost ${callCostLabel(effCostCard(game, mySide, c))}`})` : ""}</button>
                  {counterExtraCostLabel(c, o, null) && <span className="text-[11px] text-amber-300">เพิ่ม: {counterExtraCostLabel(c, o, null)}</span>}
                </div>
              );
            })}
          </div>
          <button onClick={() => setShowFreeCounter(false)} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ปิด</button>
        </div>
      </div>
    );
  }

  function renderCounterModal() {
    const b = game.battle;
    if ((!b && !sw) || !iAmDefender || game.winner || game.pendingLook || game.pendingSoul || game.pendingTarget) return null;
    const opts = counterOptions(game, mySide);
    const zoneLabel = (o: CounterOption) => o.zone === "hand" ? "【Counter】 จากมือ" : o.zone === "set" ? "【Counter】 จากช่อง Set" : o.zone === "setAct" ? "Counter 【Act】 ของการ์ด Set" : "Counter 【Act】 บนสนาม";
    let header: React.ReactNode;
    let sub: React.ReactNode;
    let cardsRow: React.ReactNode = null;
    if (b) {
      const atkP = game[b.attackerSide];
      const parts = b.linkUids.map(u => atkP.monsters.find(m => m.uid === u) ?? (atkP.item?.uid === u ? atkP.item : null)).filter(Boolean);
      const tgtText = b.target.kind === "fighter" ? "คุณ (ผู้เล่น)" : `มอนสเตอร์ช่อง${POSITION_NAMES[b.target.position]}ของคุณ`;
      const total = parts.reduce((a2, fc) => { const st = statsOf(fc!); return { p: a2.p + st.power, c: a2.c + st.critical }; }, { p: 0, c: 0 });
      header = <>ศัตรูโจมตี!{parts.length > 1 ? " (Link Attack)" : ""}</>;
      cardsRow = parts.map(fc => {
        const c = cardOf(fc!.cardId);
        return c ? <CardView key={fc!.uid} card={c} flag={flagOf(atkP.flagId)} size="sm" stats={statsOf(fc!)} /> : null;
      });
      sub = (<>
        <div>กำลังโจมตี <span className="font-bold text-white">{tgtText}</span></div>
        <div className="text-xs text-slate-400 mt-1">Power รวม {total.p} · Critical รวม {total.c}</div>
        <div className="text-xs text-slate-400 mt-2">เลือกใช้ Counter หรือปล่อยให้ต่อสู้ตามปกติ</div>
      </>);
    } else if (sw) {
      const sc = cardOf(sw.cardId);
      header = <>ศัตรูกำลังร่ายเวท!</>;
      cardsRow = sc ? <CardView card={sc} flag={flagOf(game[sw.casterSide].flagId)} size="sm" /> : null;
      sub = (<>
        <div>ศัตรูร่าย <span className="font-bold text-white">{sc?.name}</span></div>
        <div className="text-xs text-slate-400 mt-2">เลือกใช้ Counter เพื่อยกเลิกเวท หรือปล่อยให้เวทมีผลตามปกติ</div>
      </>);
    }
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-sky-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-sky-300 flex items-center gap-2 mb-2"><Shield size={20} /> {header}</h3>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {cardsRow}
            <div className="text-sm text-slate-300">{sub}</div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {opts.map((o, k) => {
              const c = counterCardOf(game, mySide, o);
              if (!c) return null;
              return (
                <div key={k} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => doCounter(o)} onInspect={() => openInspect(c, me.flagId)} className="counter-glow hover:scale-105 transition-transform" />
                    <span className="absolute -top-2 -right-2 z-10 px-1.5 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-bold shadow">✓ ใช้ได้</span>
                  </div>
                  <span className="text-[11px] text-sky-300">{zoneLabel(o)}</span>
                  {counterSkillLabel(c, o) && <span className="text-[11px] text-slate-200 max-w-[180px] text-center leading-snug bg-slate-800 rounded px-2 py-1">{counterSkillLabel(c, o)}</span>}
                  <button onClick={() => doCounter(o)} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold">ใช้ Counter{o.zone === "hand" ? ` (Cost ${callCostLabel(c)})` : ""}</button>
                  {counterExtraCostLabel(c, o, b ? "attack" : "cast") && <span className="text-[11px] text-amber-300">เพิ่ม: {counterExtraCostLabel(c, o, b ? "attack" : "cast")}</span>}
                </div>
              );
            })}
          </div>
          {opts.length === 0 && <div className="text-sm text-slate-400 mb-3">ตอนนี้ไม่มี Counter ที่ใช้ได้</div>}
          {counterBlockedHand(game, mySide).length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-slate-400 mb-2">Counter ในมือที่ใช้ไม่ได้ตอนนี้</div>
              <div className="flex flex-wrap gap-3">
                {counterBlockedHand(game, mySide).map(bk => {
                  const bc = cardOf(me.hand[bk.index]);
                  if (!bc) return null;
                  return (
                    <div key={bk.index} className="flex flex-col items-center gap-1 opacity-60" title={bk.reason}>
                      <CardView card={bc} flag={flagOf(me.flagId)} size="sm" onInspect={() => openInspect(bc, me.flagId)} />
                      <span className="text-[11px] text-amber-300 max-w-[140px] text-center leading-snug">✗ {bk.reason}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <button onClick={doPassCounter} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ไม่ใช้ Counter — {b ? "ต่อสู้เลย" : "ให้เวทมีผล"}</button>
        </div>
      </div>
    );
  }

  // เลือกมอนสเตอร์ศัตรูเป็นเป้าหมาย (ทำลาย / Rest / ยกเลิกความสามารถ ฯลฯ)
  function renderTargetModal() {
    const pt = myTargetPick;
    if (!pt || game.winner) return null;
    const src = cardOf(pt.cardId);
    const oppSide: "host" | "guest" = mySide === "host" ? "guest" : "host";
    const op = game[oppSide];
    const need = Math.min(pt.n, pt.candidates.length);
    const cands = op.monsters.filter(m => pt.candidates.includes(m.uid));
    const toggle = (uid: string) => setTargetSel(sel => sel.includes(uid) ? sel.filter(x => x !== uid) : sel.length < need ? [...sel, uid] : need === 1 ? [uid] : sel);
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-rose-400 rounded-2xl p-5 max-w-3xl w-full max-h-[94vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-rose-300 mb-1">เลือกเป้าหมาย: {targetEffectLabel(pt.effType)} มอนสเตอร์ศัตรู {need} ตัว{src ? ` — ${src.name}` : ""}</h3>
          <p className="text-sm text-slate-400 mb-4">เลือกแล้ว {targetSel.length}/{need}</p>
          <div className="flex flex-wrap gap-4 justify-center mb-5">
            {cands.map(m => {
              const c = cardOf(m.cardId);
              if (!c) return null;
              const on = targetSel.includes(m.uid);
              return (
                <div key={m.uid} className="flex flex-col items-center gap-2">
                  <CardView card={c} flag={flagOf(op.flagId)} size="md" stats={statsOf(m)} onClick={() => toggle(m.uid)} onInspect={() => openInspect(c, op.flagId, m)} className={on ? "ring-4 ring-rose-400" : "hover:ring-4 hover:ring-rose-300"} />
                  <span className="chip !text-rose-300">{POSITION_NAMES[m.position]}{m.state === "rest" ? " · Rest" : ""}</span>
                  <button onClick={() => toggle(m.uid)} className={`btn !py-1 !text-xs ${on ? "btn-primary" : ""}`}>{on ? "✔ เลือกแล้ว" : "เลือกใบนี้"}</button>
                </div>
              );
            })}
          </div>
          <button disabled={targetSel.length !== need} onClick={() => act("เลือกเป้าหมายไม่ได้", st => resolveTargetChoice(st, mySide, targetSel))} className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-xl font-bold">ยืนยันเป้าหมาย</button>
        </div>
      </div>
    );
  }

  // เลือกการ์ดของเราที่จะถอด Soul (หรือเลือกไม่ถอด)
  function renderSoulModal() {
    const ps = mySoulPick;
    if (!ps || game.winner) return null;
    const src = cardOf(ps.cardId);
    const cands = [...me.monsters, ...(me.item ? [me.item] : [])].filter(m => ps.candidates.includes(m.uid));
    const adding = ps.mode === "add";
    const selfMode = ps.mode === "self"; // เลือกการ์ดที่จะรับ "การ์ดใบนี้" เข้า Soul
    const fromTxt = ps.src === "deck" ? "บนกองเด็ค" : ps.src === "hand" ? "มือ" : ps.src === "handDrop" ? "มือหรือสุสาน" : "สุสาน";
    const manual = adding && (ps.src === "hand" || ps.src === "handDrop"); // ผู้เล่นเลือกใบเองจากมือ/สุสาน
    if (manual && soulTarget) {
      const tFc = cands.find(m => m.uid === soulTarget);
      const tCard = tFc ? cardOf(tFc.cardId) : undefined;
      const selfIdx = src && (src.type === "Spell" || src.type === "Impact") ? me.dropZone.lastIndexOf(ps.cardId) : -1;
      const typeOk = (id: string) => matchesType(cardOf(id), ps.filter);
      const isOn = (zone: "hand" | "drop", index: number) => soulPicks.some(x => x.zone === zone && x.index === index);
      const toggle = (zone: "hand" | "drop", index: number) => setSoulPicks(prev => isOn(zone, index) ? prev.filter(x => !(x.zone === zone && x.index === index)) : prev.length >= ps.n ? prev : [...prev, { zone, index }]);
      const grid = (zone: "hand" | "drop", ids: string[]) => (
        <div className="flex flex-wrap gap-2 justify-center">
          {ids.map((id, i) => {
            const c = cardOf(id);
            if (!c || !typeOk(id) || (zone === "drop" && i === selfIdx)) return null;
            return <CardView key={`${zone}-${i}`} card={c} flag={flagOf(me.flagId)} size="sm" onClick={() => toggle(zone, i)} onInspect={() => openInspect(c, me.flagId)} className={isOn(zone, i) ? "ring-4 ring-violet-400" : "hover:ring-2 hover:ring-violet-300"} />;
          })}
        </div>
      );
      return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-violet-400 rounded-2xl p-5 max-w-3xl w-full max-h-[94vh] overflow-y-auto">
            <h3 className="font-display text-xl font-bold text-violet-300 mb-1">เลือกการ์ดจาก{fromTxt}เข้า Soul ของ {tCard?.name ?? "การ์ดที่เลือก"}{src ? ` — ${src.name}` : ""}</h3>
            <p className="text-sm text-slate-400 mb-3">เลือกได้ไม่เกิน {ps.n} ใบ (เลือกแล้ว {soulPicks.length}/{ps.n}) กดการ์ดเพื่อเลือก/ยกเลิก</p>
            <div className="text-sm font-bold text-slate-200 mb-1">มือ ({me.hand.length})</div>
            {grid("hand", me.hand)}
            {ps.src === "handDrop" && (<>
              <div className="text-sm font-bold text-slate-200 mt-4 mb-1">สุสาน ({me.dropZone.length})</div>
              {grid("drop", me.dropZone)}
            </>)}
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setSoulTarget(null); setSoulPicks([]); }} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">← เลือกการ์ดใหม่</button>
              <button disabled={soulPicks.length === 0} onClick={() => act("ใส่ Soul ไม่ได้", st => resolveSoulChoice(st, mySide, soulTarget, soulPicks))} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl font-bold">นำเข้า Soul ({soulPicks.length})</button>
            </div>
            <button onClick={() => act("ผิดพลาด", st => resolveSoulChoice(st, mySide, null))} className="w-full mt-2 py-2 text-sm text-slate-300 hover:text-white">ไม่ใส่ Soul</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-violet-400 rounded-2xl p-5 max-w-3xl w-full max-h-[94vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-violet-300 mb-1">{selfMode ? `เลือกการ์ดที่จะรับ ${src?.name ?? "การ์ดนี้"} เข้า Soul` : adding ? `เลือกการ์ดที่จะรับ Soul ${ps.n} ใบจาก${fromTxt}` : `เลือกการ์ดที่จะถอด Soul ${ps.n} ใบ`}{src && !selfMode ? ` — ${src.name}` : ""}</h3>
          {selfMode ? <p className="text-sm text-slate-400 mb-4">เลือกการ์ดบนสนามของคุณ 1 ใบที่มีคุณสมบัติตามที่กำหนด เพื่อนำ {src?.name ?? "การ์ดนี้"} ออกจากสนามเข้า Soul ของการ์ดใบนั้น ถ้าไม่ต้องการให้กด "ไม่นำเข้า Soul"</p> : adding ? <p className="text-sm text-slate-400 mb-4">เลือกการ์ดบนสนามของคุณ 1 ใบ เพื่อนำการ์ด {ps.n} ใบจาก{fromTxt}เข้า Soul ของการ์ดใบนั้น ถ้าไม่ต้องการให้กด "ไม่ใส่ Soul"</p> : <p className="text-sm text-slate-400 mb-4">เลือกการ์ดของคุณ 1 ใบที่มี Soul พอ ถ้าถอดได้ เอฟเฟกต์ถัดไปของการ์ดนี้ (เช่น Life / Attack / Defense / จั่ว) จะทำงานกับการ์ดใบที่เลือก ถ้าไม่ต้องการให้กด "ไม่ถอด"</p>}
          <div className="flex flex-wrap gap-4 justify-center mb-5">
            {cands.map(m => {
              const c = cardOf(m.cardId);
              if (!c) return null;
              return (
                <div key={m.uid} className="flex flex-col items-center gap-2">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" stats={statsOf(m)} onClick={() => manual ? setSoulTarget(m.uid) : act("ถอด Soul ไม่ได้", st => resolveSoulChoice(st, mySide, m.uid))} onInspect={() => openInspect(c, me.flagId, m)} className="hover:ring-4 hover:ring-violet-400" />
                  <span className="chip !text-violet-300">SOUL {m.soul.length}</span>
                  <button onClick={() => manual ? setSoulTarget(m.uid) : act(selfMode ? "นำเข้า Soul ไม่ได้" : adding ? "ใส่ Soul ไม่ได้" : "ถอด Soul ไม่ได้", st => resolveSoulChoice(st, mySide, m.uid))} className="btn btn-primary !py-1 !text-xs">{selfMode ? "นำเข้า Soul ของการ์ดใบนี้" : adding ? (manual ? "เลือกการ์ดใบนี้ → เลือกใบที่จะนำเข้า" : "ใส่ Soul ให้การ์ดใบนี้") : "ถอด Soul การ์ดใบนี้"}</button>
                </div>
              );
            })}
          </div>
          <button onClick={() => act("ผิดพลาด", st => resolveSoulChoice(st, mySide, null))} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">{selfMode ? "ไม่นำเข้า Soul" : adding ? "ไม่ใส่ Soul" : "ไม่ถอด Soul"}</button>
        </div>
      </div>
    );
  }

  // เลือกการ์ดหลังดูกอง: ขึ้นมือ / ลงดรอป / ใต้สุดของกอง (ที่ไม่ได้เลือกจะวางกลับบนกอง)
  function renderLookModal() {
    const pl = myLook;
    if (!pl || game.winner) return null;
    const src = cardOf(pl.cardId);
    const cnt = { hand: lookSel.hand.length, drop: lookSel.drop.length, bottom: lookSel.bottom.length };
    const setDest = (i: number, dest: "hand" | "drop" | "bottom" | null) => {
      const next = { hand: lookSel.hand.filter(x => x !== i), drop: lookSel.drop.filter(x => x !== i), bottom: lookSel.bottom.filter(x => x !== i) };
      if (dest) next[dest] = [...next[dest], i];
      setLookSel(next);
    };
    const lim = { hand: pl.toHand, drop: pl.toDrop, bottom: pl.toBottom };
    const btn = (i: number, dest: "hand" | "drop" | "bottom", label: string, color: string) => {
      const on = lookSel[dest].includes(i);
      const full = !on && cnt[dest] >= lim[dest];
      if (lim[dest] <= 0) return null;
      return (
        <button key={dest} disabled={full} onClick={() => setDest(i, on ? null : dest)} className={`px-2 py-1 rounded-md text-[11px] font-bold border transition ${on ? `${color} text-white border-white/60` : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400"} ${full ? "opacity-40" : ""}`}>{label}</button>
      );
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-amber-400 rounded-2xl p-5 max-w-4xl w-full max-h-[94vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-amber-300 mb-1">ดูการ์ดบนสุดของกอง {pl.cards.length} ใบ{src ? ` — ${src.name}` : ""}</h3>
          <p className="text-sm text-slate-400 mb-4">
            เลือกได้สูงสุด:
            {pl.toHand > 0 && <> ขึ้นมือ <b className="text-emerald-300">{cnt.hand}/{pl.toHand}</b></>}
            {pl.toDrop > 0 && <> · ลงดรอป <b className="text-rose-300">{cnt.drop}/{pl.toDrop}</b></>}
            {pl.toBottom > 0 && <> · ใต้สุดของกอง <b className="text-sky-300">{cnt.bottom}/{pl.toBottom}</b></>}
            {pl.toHand + pl.toDrop + pl.toBottom === 0 && " (ดูอย่างเดียว)"} · ใบที่ไม่ได้เลือกจะวางกลับบนกองตามลำดับเดิม
          </p>
          <div className="flex flex-wrap gap-4 justify-center mb-5">
            {pl.cards.map((id, i) => {
              const c = cardOf(id);
              if (!c) return null;
              const dest = lookSel.hand.includes(i) ? "hand" : lookSel.drop.includes(i) ? "drop" : lookSel.bottom.includes(i) ? "bottom" : null;
              return (
                <div key={i} className={`flex flex-col items-center gap-2 rounded-xl p-1 ${dest === "hand" ? "ring-4 ring-emerald-400" : dest === "drop" ? "ring-4 ring-rose-500 opacity-70" : dest === "bottom" ? "ring-4 ring-sky-400" : ""}`}>
                  <span className="text-[11px] text-slate-500">ใบที่ {i + 1} จากบน</span>
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onInspect={() => openInspect(c, me.flagId)} onClick={() => openInspect(c, me.flagId)} />
                  <div className="flex gap-1">
                    {btn(i, "hand", "ขึ้นมือ", "bg-emerald-600")}
                    {btn(i, "drop", "ลงดรอป", "bg-rose-600")}
                    {btn(i, "bottom", "ใต้กอง", "bg-sky-600")}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => { act("เลือกการ์ดไม่ได้", st => resolveLook(st, mySide, lookSel)); }} className="btn btn-primary w-full btn-lg">
            ยืนยัน {cnt.hand + cnt.drop + cnt.bottom > 0 ? `(ขึ้นมือ ${cnt.hand} · ดรอป ${cnt.drop} · ใต้กอง ${cnt.bottom})` : "(ไม่เลือก วางกลับทั้งหมด)"}
          </button>
        </div>
      </div>
    );
  }

  // ---- อธิบายที่มาของตัวเลข: "8000 = พื้นฐาน 5000 + Fruzel 3000 (โซล 3 ใบ)" ----
  const STAT_NAMES = { power: "Power", defense: "Defense", critical: "Critical", size: "Size" } as const;
  const fmtExplain = (ex: StatExplain) => `${ex.total} = ` + ex.lines.map((l, i) => `${i === 0 ? "" : l.value < 0 ? " − " : " + "}${l.label} ${Math.abs(l.value)}`).join("");
  const liveFc = (uid: string): FieldCard | null => {
    for (const sd of ["host", "guest"] as const) {
      const pl = game[sd];
      const f = [...pl.monsters, ...(pl.item ? [pl.item] : [])].find(x => x.uid === uid);
      if (f) return f;
    }
    return null;
  };
  const abilityTextOf = (base: Card, sk: AutoSkill) => {
    const l = skillLines({ ...base, callRequires: undefined, autoSkills: [sk] } as Card);
    return l[0] ?? (keywordBadges({ ...base, autoSkills: [sk] } as Card).join(", ") || "สกิล");
  };
  // รายการความสามารถพร้อมที่มา และจำนวนครั้งที่ใช้ Counter 【Act】 ไปแล้วในเทิร์นนี้
  function renderAbilityList(fc: FieldCard, max = 99) {
    const ex = explainFc(fc, game.turn);
    const base = getCard(fc.cardId);
    if (!ex || !base || ex.abilities.length === 0) return null;
    return (
      <div className="space-y-1">
        {ex.abilities.slice(0, max).map(a => (
          <div key={a.idx} className="leading-snug">
            <span className="text-amber-100">▪ {abilityTextOf(base, a.skill)}</span>
            <span className={a.source ? "text-violet-300" : "text-slate-500"}> ← {a.source ? `ได้จาก ${a.source}${a.temp ? "" : ""}` : "ของการ์ดนี้เอง"}</span>
            {a.act && <span className={a.act.used >= a.act.max ? "text-rose-300" : "text-emerald-300"}> · Counter Act ใช้แล้ว {a.act.used}/{a.act.max} ครั้งในเทิร์นนี้</span>}
          </div>
        ))}
        {ex.abilities.length > max && <div className="text-slate-500">…และอีก {ex.abilities.length - max} สกิล (ดูทั้งหมดในหน้ารายละเอียดการ์ด)</div>}
      </div>
    );
  }
  function renderStatTip() {
    if (!statTip) return null;
    const fc = liveFc(statTip.uid);
    const ex = fc ? explainFc(fc, game.turn) : null;
    if (!fc || !ex) return null;
    const st = ex[statTip.stat];
    const color = statTip.stat === "power" ? "text-rose-300" : statTip.stat === "defense" ? "text-sky-300" : statTip.stat === "size" ? "text-amber-300" : "text-white";
    const left = Math.max(8, Math.min(statTip.x + 16, window.innerWidth - 372));
    const top = Math.max(8, Math.min(statTip.y + 16, window.innerHeight - 340));
    return (
      <div className="fixed z-[70] pointer-events-none w-[356px] max-h-[80vh] overflow-hidden rounded-xl border border-cyan-500 bg-slate-950/95 p-3 text-xs shadow-2xl" style={{ left, top }}>
        <div className={`font-bold text-sm mb-1 ${color}`}>{STAT_NAMES[statTip.stat]} {st.total}</div>
        <div className="text-slate-100 font-semibold leading-snug mb-1.5">{fmtExplain(st)}</div>
        <div className="space-y-0.5 text-slate-300">
          {st.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3"><span className="min-w-0">{i === 0 ? "" : "• "}{l.label}</span><b className={l.value < 0 ? "text-rose-300" : "text-emerald-300"}>{i === 0 ? l.value : `${l.value > 0 ? "+" : "−"}${Math.abs(l.value)}`}</b></div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-slate-700 text-[11px]">
          <div className="font-bold text-cyan-300 mb-1">ความสามารถของการ์ดนี้ และที่มา</div>
          {renderAbilityList(fc, 6)}
        </div>
      </div>
    );
  }

  // หน้าต่างดูการ์ดใน Soul ของการ์ดใบหนึ่ง (เปิดจากปุ่ม ◆ ที่การ์ด หรือจากหน้าดูการ์ด) กดการ์ดเพื่อดูรายละเอียด
  function renderSoulView() {
    if (!soulView) return null;
    const flag = flagOf(soulView.flagId);
    return (
      <div className="fixed inset-0 bg-black/70 z-[54] flex items-center justify-center p-4" onClick={() => setSoulView(null)}>
        <div className="bg-slate-900 border-2 border-violet-500 rounded-2xl p-5 max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-display text-lg font-bold text-violet-300">Soul ของ {soulView.title} <span className="text-sm text-slate-400 font-normal">({soulView.ids.length} ใบ)</span></h3>
            <button onClick={() => setSoulView(null)} className="p-1 hover:bg-slate-800 rounded"><X size={18} /></button>
          </div>
          {soulView.ids.length === 0 ? (
            <div className="text-slate-500 text-center py-6">ไม่มีการ์ดใน Soul</div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {soulView.ids.map((id, i) => {
                const c = cardOf(id);
                return (
                  <div key={`${i}-${id}`} className="flex flex-col items-center gap-1" style={{ width: 128 }}>
                    {c
                      ? <CardView card={c} flag={flagOf(c.flagId) ?? flag} width="128px" hideText onClick={() => openInspect(c, c.flagId, null, `การ์ดใบนี้อยู่ใน Soul ของ ${soulView.title}`)} />
                      : <CardView faceDown width="128px" />}
                    <span className="text-[11px] text-slate-300 text-center leading-tight">{i + 1}. {c?.name ?? "ไม่ทราบการ์ด"}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-3 text-center">กดที่การ์ดเพื่อดูรายละเอียด · ใบแรกคือใบที่เข้า Soul ก่อน</p>
        </div>
      </div>
    );
  }

  function renderInspect() {
    if (!inspect) return null;
    const { card, flagId, fc, note } = inspect;
    const flag = flagOf(flagId ?? card.flagId);
    const st = fc ? statsOf(fc) : undefined;
    const lines = skillLines(card);
    const badges = keywordBadges(card);
    const cost = costText(card);
    return (
      <div className="fixed inset-0 bg-black/75 z-[55] flex items-center justify-center p-4" onClick={() => setInspect(null)}>
        <div className="bg-slate-900 border-2 border-cyan-500 rounded-2xl p-5 max-w-3xl w-full max-h-[94vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-display text-xl font-bold text-cyan-300">{card.name}</h3>
            <button onClick={() => setInspect(null)} className="p-1 hover:bg-slate-800 rounded"><X size={18} /></button>
          </div>
          {fc && canTransform(card) && isMyTurn && me.monsters.some(m => m.uid === fc.uid) && (
            <button onClick={() => tryTransform({ zone: "field", uid: fc.uid })} className="mb-3 w-full py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl font-bold">🔄 Transform → กลายเป็นไอเทม (จ่าย {transformCostLabel(card)})</button>
          )}
          {note && (
            <div className="mb-3 flex gap-2 items-start bg-amber-900/30 border border-amber-600 text-amber-200 text-sm rounded-lg px-3 py-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{note}</span>
            </div>
          )}
          <div className="flex gap-5 flex-wrap md:flex-nowrap">
            <div className="mx-auto md:mx-0"><CardView card={card} flag={flag} size="xl" stats={st} soul={fc?.soul.length} /></div>
            <div className="flex-1 min-w-[220px] space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                <span>ประเภท: <b className="text-white">{card.type}</b></span>
                <span>สังกัด: <b className="text-white">{flag?.name ?? "-"}</b></span>
                <span>Cost: <b className="text-white">{callCostLabel(card)}</b></span>
                {card.type === "Monster" && <span>Size: <b className="text-white">{card.size}</b></span>}
                {(card.type === "Monster" || card.type === "Item" || card.type === "Impact") && (<>
                  <span>Power: <b className="text-rose-400">{st ? st.power : card.power}</b>{st && st.power !== card.power ? <span className="text-slate-500"> (ปกติ {card.power})</span> : null}</span>
                  <span>Critical: <b className="text-rose-300">{st ? st.critical : card.critical}</b></span>
                  {(card.type === "Monster" || (card.type === "Item" && (st ? st.defense : card.defense) > 0)) && <span>Defense: <b className="text-sky-300">{st ? st.defense : card.defense}</b></span>}
                </>)}
                {card.attribute && <span className="col-span-2">สายพันธุ์: <b className="text-white">{card.attribute}</b></span>}
              </div>
              {fc && (
                <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2">
                  สถานะบนสนาม: <b className="text-white">{fc.state === "stand" ? "Stand" : "Rest"}</b>
                  {" · "}Soul: <b className="text-violet-300">{fc.soul.length}</b>
                  {fc.soul.length > 0 && <button onClick={() => { setInspect(null); openSoulView(card.name, fc.soul, flagId); }} className="ml-2 px-2 py-0.5 rounded bg-violet-700 hover:bg-violet-600 text-white text-[11px] font-bold">ดูการ์ดใน Soul</button>}
                  {fc.soul.length > 0 && <span className="inline-flex gap-1 ml-2 align-middle">{fc.soul.slice(0, 10).map((_, i) => <span key={i} className="soul-orb soul-bob" style={{ width: 12, height: 12, animationDelay: `${i * 0.15}s` }} />)}</span>}
                  {keywordValue(card, "soulguard") > 0 && <span className="ml-2 text-violet-200">🛡 Soulguard กันออกจากสนามได้อีก <b>{fc.nullified ? 0 : fc.soul.length}</b> ครั้ง{fc.nullified ? " (ถูก Nullify)" : ""}</span>}
                  {maxAttacks(card) > 1 ? <> · โจมตีแล้ว <b className="text-white">{fc.attacks}/{maxAttacks(card)}</b></> : null}
                </div>
              )}
              {fc && (() => {
                const lf = liveFc(fc.uid) ?? fc;
                const ex = explainFc(lf, game.turn);
                if (!ex) return null;
                return (
                  <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs space-y-1.5">
                    <div className="font-bold text-cyan-300">ที่มาของค่าสถานะ</div>
                    {(["power", "critical", "defense", "size"] as const).map(k => (
                      <div key={k} className="leading-snug"><b className="text-slate-200">{STAT_NAMES[k]}</b> <span className="text-slate-300">{fmtExplain(ex[k])}</span></div>
                    ))}
                    <div className="font-bold text-cyan-300 pt-1">ความสามารถและที่มา</div>
                    {renderAbilityList(lf)}
                  </div>
                );
              })()}
              {cost && <div><div className="text-xs font-bold text-slate-400 mb-1">Call Cost</div><div className="text-slate-200">{cost}</div></div>}
              {(card.autoSkills.length > 0 || customTextList(card).length > 0) ? (
                <div>
                  <div className="text-xs font-bold text-slate-400 mb-1">ความสามารถ</div>
                  <div className="space-y-2">
                    {card.autoSkills.map((sk, i) => {
                      const keywordOnly = (sk.trigger === "continuous" || sk.trigger === "onAttack") && keywordBadges({ ...card, autoSkills: [sk] }).length === sk.effects.length;
                      if (keywordOnly) return null;
                      return (
                        <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                          <div className="text-amber-200">【{TRIGGER_LABELS.find(t => t.value === sk.trigger)?.label ?? sk.trigger}】{sk.effects.map(effectText).join("、")}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{TRIGGER_HELP[sk.trigger]}</div>
                        </div>
                      );
                    })}
                    {customTextList(card).map((t, i) => <div key={`ct${i}`} className="bg-slate-800/60 rounded-lg px-3 py-2 text-slate-200 whitespace-pre-wrap">{t}</div>)}
                  </div>
                </div>
              ) : lines.length === 0 && badges.length === 0 ? <div className="text-slate-500">การ์ดใบนี้ไม่มีความสามารถพิเศษ</div> : null}
              {card.flavorText?.trim() && <div className="italic text-slate-400 border-l-2 border-slate-600 pl-3 whitespace-pre-wrap">“{card.flavorText.trim()}”</div>}
              {badges.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-400 mb-1">คีย์เวิร์ด</div>
                  <div className="space-y-1">
                    {badges.map(b => (
                      <div key={b} className="flex gap-2 items-start">
                        <span className="bg-red-600 text-white rounded px-2 text-xs font-bold shrink-0">{b}</span>
                        <span className="text-slate-300 text-xs">{KEYWORD_HELP[b.replace(/ \d+$/, "")]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderNotice() {
    if (!notice) return null;
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setNotice(null)}>
        <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <AlertTriangle size={22} />
            <h3 className="font-display text-lg font-bold">{notice.title}</h3>
          </div>
          <p className="text-slate-200 text-sm leading-relaxed mb-4 whitespace-pre-line">{notice.msg}</p>
          <button autoFocus onClick={() => setNotice(null)} className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold">ตกลง</button>
        </div>
      </div>
    );
  }

  // เป้าหมาย Soul แบบรวม: uid ของมอนสเตอร์/ไอเทม หรือ "set:<index>" = การ์ดในช่อง Set
  const setIdxOfUid = (uid: string) => (uid.startsWith("set:") ? parseInt(uid.slice(4)) : -1);
  const addSoulAny = (st: GameState, sd: Side, uid: string, from: "hand" | "dropZone" | "gauge" | "deck", idx: number) => {
    const si = setIdxOfUid(uid);
    return si >= 0 ? sandboxAddSetSoul(st, sd, si, from, idx) : sandboxAddSoul(st, sd, uid, from, idx);
  };
  const removeSoulAny = (st: GameState, sd: Side, uid: string, soulIdx: number, to: "hand" | "dropZone" | "gauge" | "deckTop" | "deckBottom") => {
    const si = setIdxOfUid(uid);
    return si >= 0 ? sandboxRemoveSetSoul(st, sd, si, soulIdx, to) : sandboxRemoveSoul(st, sd, uid, soulIdx, to);
  };

  function renderMenus() {
    if (!menuTarget) return null;
    const p = game[menuTarget.side];
    const box = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-cyan-600 rounded-xl p-4 z-50 shadow-2xl";
    const sb = "p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs flex items-center gap-1";

    if (menuTarget.kind === "field") {
      const fc = p.monsters.find(m => m.uid === menuTarget.uid) ?? (p.item?.uid === menuTarget.uid ? p.item : null);
      const card = fc ? cardOf(fc.cardId) : null;
      if (!fc || !card) return null;
      const isItem = p.item?.uid === fc.uid;
      const side = menuTarget.side;
      const st = statsOf(fc);
      const adj = (stat: "power" | "defense" | "critical", d: number) => doAction(s => sandboxAdjustStat(s, side, fc.uid, stat, d));
      const statRow = (label: string, color: string, val: number, stat: "power" | "defense" | "critical", steps: number[]) => (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className={`w-16 text-xs font-bold ${color}`}>{label} {val}</span>
          {steps.map(d => (
            <button key={d} onClick={() => adj(stat, d)} className={`${sb} !px-1.5 ${d < 0 ? "text-rose-300" : "text-emerald-300"}`}>{d > 0 ? "+" : ""}{d}</button>
          ))}
        </div>
      );
      return (
        <div ref={menuRef} className={`${box} min-w-[300px]`}>
          <h4 className="font-bold text-cyan-400 mb-2 text-sm">{card.name} <span className="text-xs text-slate-500">(Sandbox · Soul {fc.soul.length})</span></h4>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => { doAction(s => sandboxFlipRest(s, side, fc.uid)); setMenuTarget(null); }} className={sb}><RotateCw size={12} /> Stand/Rest</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "hand", fc.uid)); setMenuTarget(null); }} className={sb}><Hand size={12} /> ไปมือ</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "dropZone", fc.uid)); setMenuTarget(null); }} className={sb}><Trash2 size={12} /> สุสาน</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "gauge", fc.uid)); setMenuTarget(null); }} className={sb}><Zap size={12} /> เกจ</button>
          </div>
          <div className="mt-2 border-t border-slate-700 pt-2">
            {statRow("Critical", "text-white", st.critical, "critical", [-2, -1, 1, 2])}
            {statRow("Power", "text-rose-300", st.power, "power", [-10000, -5000, -1000, -500, 500, 1000, 5000, 10000])}
            {statRow("Defense", "text-sky-300", st.defense, "defense", [-10000, -5000, -1000, -500, 500, 1000, 5000, 10000])}
            {!isItem && (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-16 text-xs font-bold text-amber-300">Size {sizeOfFc(fc)}</span>
                {[-1, 1].map(d => (
                  <button key={d} onClick={() => doAction(s => sandboxAdjustSize(s, side, fc.uid, d))} className={`${sb} !px-1.5 ${d < 0 ? "text-rose-300" : "text-emerald-300"}`}>{d > 0 ? "+" : ""}{d}</button>
                ))}
                {!!fc.manualSize && <button onClick={() => doAction(s => sandboxAdjustSize(s, side, fc.uid, 0, true))} className={`${sb} !px-1.5`}>รีเซ็ต</button>}
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1">ค่าที่ปรับเองคงอยู่ตราบที่การ์ดอยู่บนสนาม</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button onClick={() => setMenuTarget({ kind: "soul", side, uid: fc.uid })} className={`${sb} !bg-violet-800 hover:!bg-violet-700`}>＋ ใส่ Soul…</button>
            <button onClick={() => setMenuTarget({ kind: "soul", side, uid: fc.uid })} className={`${sb} !bg-violet-900 hover:!bg-violet-800`}>－ ถอด Soul ({fc.soul.length})…</button>
          </div>
          {!isItem && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {[0, 1, 2].map(pos => (
                <button key={pos} onClick={() => { doAction(s => sandboxMoveToPosition(s, side, fc.uid, pos)); setMenuTarget(null); }} className={sb}>ย้ายไป{POSITION_NAMES[pos]}</button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ---- Sandbox: จัดการ Soul ของการ์ดที่เลือก (ใส่จากมือ/สุสาน/เกจ/เด็ค · ถอดใบที่เลือกไปที่ต่างๆ)
    // ---- Sandbox: จัดการการ์ดในช่อง Set (ย้ายไปมือ/สุสาน/เกจ/เด็ค/Soul ได้เหมือนการ์ดบนสนาม)
    if (menuTarget.kind === "set") {
      const side = menuTarget.side;
      const idx = menuTarget.index;
      const id = p.setZone[idx];
      const card = id ? cardOf(id) : null;
      if (!id || !card) return null;
      const hosts = [
        ...p.monsters.map(m => ({ uid: m.uid, cardId: m.cardId })),
        ...(p.item ? [{ uid: p.item.uid, cardId: p.item.cardId }] : []),
      ];
      const go = (to: "hand" | "dropZone" | "gauge" | "deck" | "deckBottom") => { doAction(s => sandboxMoveSet(s, side, idx, to)); setMenuTarget(null); };
      return (
        <div ref={menuRef} className={`${box} min-w-[300px] max-w-[420px] max-h-[80vh] overflow-y-auto`}>
          <h4 className="font-bold text-violet-300 mb-2 text-sm">{card.name} <span className="text-xs text-slate-500">(Sandbox · การ์ด Set · Soul {setSoulOf(p, idx).length})</span></h4>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => go("hand")} className={sb}><Hand size={12} /> ไปมือ</button>
            <button onClick={() => go("dropZone")} className={sb}><Trash2 size={12} /> สุสาน (ทำลาย)</button>
            <button onClick={() => go("gauge")} className={sb}><Zap size={12} /> เกจ</button>
            <button onClick={() => go("deck")} className={sb}>บนสุดของเด็ค</button>
            <button onClick={() => go("deckBottom")} className={sb}>ใต้เด็ค</button>
            <button onClick={() => { openInspect(card, p.flagId); setMenuTarget(null); }} className={sb}>ดูรายละเอียด</button>
            <button onClick={() => setMenuTarget({ kind: "soul", side, uid: `set:${idx}` })} className={`${sb} !bg-violet-800 hover:!bg-violet-700`}>＋ ใส่ Soul…</button>
            <button onClick={() => setMenuTarget({ kind: "soul", side, uid: `set:${idx}` })} className={`${sb} !bg-violet-900 hover:!bg-violet-800`}>－ ถอด Soul ({setSoulOf(p, idx).length})…</button>
          </div>
          <div className="mt-2 border-t border-slate-700 pt-2">
            <div className="text-xs font-bold text-violet-300 mb-1">ใส่เป็น Soul ของ</div>
            {hosts.length === 0 ? <div className="text-xs text-slate-500">ฝั่งนี้ไม่มีการ์ดบนสนาม</div> : (
              <div className="flex flex-wrap gap-1">
                {hosts.map(h => (
                  <button key={h.uid} onClick={() => { doAction(s => sandboxMoveSet(s, side, idx, "soul", h.uid)); setMenuTarget(null); }} className={`${sb} !bg-violet-900 hover:!bg-violet-800`}>
                    {cardOf(h.cardId)?.name ?? "การ์ด"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (menuTarget.kind === "soul") {
      const setIdx = setIdxOfUid(menuTarget.uid);
      const fc = setIdx >= 0 ? null : (p.monsters.find(m => m.uid === menuTarget.uid) ?? (p.item?.uid === menuTarget.uid ? p.item : null));
      const card = setIdx >= 0 ? (p.setZone[setIdx] ? cardOf(p.setZone[setIdx]) : null) : fc ? cardOf(fc.cardId) : null;
      if ((!fc && setIdx < 0) || !card) return null;
      const soulList = setIdx >= 0 ? setSoulOf(p, setIdx) : fc!.soul;
      const tUid = menuTarget.uid;
      const side = menuTarget.side;
      const mine = side === mySide;
      const mini = (id: string, i: number, onPick: () => void, title: string) => {
        const c = cardOf(id);
        return (
          <div key={i} className="relative shrink-0" title={title} onMouseEnter={() => c && setHovered({ card: c, flagId: p.flagId })}>
            {c ? <CardView card={c} flag={flagOf(c.flagId) ?? flagOf(p.flagId)} width="64px" hideText onClick={onPick} />
               : <CardView faceDown width="64px" onClick={onPick} />}
          </div>
        );
      };
      const moveBtn = "px-1.5 py-0.5 bg-slate-800 hover:bg-slate-600 rounded text-[10px]";
      return (
        <div ref={menuRef} className={`${box} w-[min(94vw,640px)] max-h-[82vh] overflow-y-auto`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-violet-300 text-sm">Soul ของ {card.name}{setIdx >= 0 ? " (การ์ด Set)" : ""} <span className="text-xs text-slate-500">(Sandbox · {soulList.length} ใบ)</span></h4>
            <button onClick={() => closeMenuRef.current()} className="p-1 hover:bg-slate-800 rounded"><X size={14} /></button>
          </div>

          <div className="text-xs text-slate-400 mb-1">ถอด Soul — เลือกใบแล้วเลือกปลายทาง</div>
          <div className="flex flex-wrap gap-3 mb-3 min-h-[40px]">
            {soulList.length === 0 && <span className="text-xs text-slate-500">ยังไม่มี Soul</span>}
            {soulList.map((id, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                {mini(id, i, () => {}, "ชี้เพื่อดูรายละเอียด")}
                <div className="flex flex-wrap justify-center gap-0.5 max-w-[96px]">
                  <button className={moveBtn} onClick={() => doAction(s => removeSoulAny(s, side, tUid, i, "hand"))}>มือ</button>
                  <button className={moveBtn} onClick={() => doAction(s => removeSoulAny(s, side, tUid, i, "dropZone"))}>สุสาน</button>
                  <button className={moveBtn} onClick={() => doAction(s => removeSoulAny(s, side, tUid, i, "gauge"))}>เกจ</button>
                  <button className={moveBtn} onClick={() => doAction(s => removeSoulAny(s, side, tUid, i, "deckTop"))}>บนเด็ค</button>
                  <button className={moveBtn} onClick={() => doAction(s => removeSoulAny(s, side, tUid, i, "deckBottom"))}>ใต้เด็ค</button>
                </div>
              </div>
            ))}
          </div>

          {mine && (<>
            <div className="text-xs text-slate-400 mb-1 border-t border-slate-700 pt-2">ใส่ Soul — คลิกการ์ดเพื่อใส่</div>
            <div className="text-[11px] text-slate-500 mb-1">จากมือ ({p.hand.length})</div>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {p.hand.length === 0 && <span className="text-xs text-slate-600">ไม่มี</span>}
              {p.hand.map((id, i) => mini(id, i, () => doAction(s => addSoulAny(s, side, tUid, "hand", i)), "ใส่เข้า Soul"))}
            </div>
            <div className="text-[11px] text-slate-500 mb-1">จากสุสาน ({p.dropZone.length})</div>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {p.dropZone.length === 0 && <span className="text-xs text-slate-600">ไม่มี</span>}
              {p.dropZone.map((id, i) => mini(id, i, () => doAction(s => addSoulAny(s, side, tUid, "dropZone", i)), "ใส่เข้า Soul"))}
            </div>
            <div className="text-[11px] text-slate-500 mb-1">จากเกจ ({p.gaugePile.length})</div>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {p.gaugePile.length === 0 && <span className="text-xs text-slate-600">ไม่มี</span>}
              {p.gaugePile.map((id, i) => mini(id, i, () => doAction(s => addSoulAny(s, side, tUid, "gauge", i)), "ใส่เข้า Soul"))}
            </div>
            <div className="text-[11px] text-slate-500 mb-1">จากเด็ค ({p.deck.length}) — ไม่เห็นการ์ดจนกว่าจะค้นหา</div>
            <div className="flex gap-2 flex-wrap">
              <button className={`${sb} !bg-violet-800 hover:!bg-violet-700`} onClick={() => doAction(s => addSoulAny(s, side, tUid, "deck", 0))}>ใส่ใบบนสุดของเด็ค (ไม่ดู)</button>
              <button className={`${sb} !bg-cyan-900 hover:!bg-cyan-800`} onClick={() => { setDeckFilter(""); setMenuTarget({ kind: "deckView", side, mode: "search", n: 0, soulUid: tUid }); }}>🔍 ค้นหาในเด็ค…</button>
            </div>
          </>)}
        </div>
      );
    }

    // ---- Sandbox: ค้นหา / ดูบนสุดของเด็ค (เห็นเฉพาะเจ้าของ) — ปิดแล้วสับอัตโนมัติ
    if (menuTarget.kind === "deckView") {
      const side = menuTarget.side;
      if (side !== mySide) return null;
      const mt = menuTarget;
      const entries = p.deck.map((id, i) => ({ id, i, c: cardOf(id) }));
      let list = mt.mode === "top" ? entries.slice(0, mt.n) : [...entries].sort((x, y) => (x.c?.type ?? "").localeCompare(y.c?.type ?? "") || (x.c?.name ?? "").localeCompare(y.c?.name ?? ""));
      const q = deckFilter.trim().toLowerCase();
      if (q) list = list.filter(e => (e.c?.name ?? "").toLowerCase().includes(q) || (e.c?.type ?? "").toLowerCase().includes(q));
      // ดูบนสุด: หลังหยิบใบหนึ่งออก ลดจำนวนที่แสดง จะไม่เผยใบถัดไปที่ยังไม่ได้ดู
      const take = (fn: (s: GameState) => GameState) => {
        doAction(fn);
        if (mt.mode === "top") setMenuTarget({ ...mt, n: Math.max(0, mt.n - 1) });
      };
      const targets = [...p.monsters.map(m => ({ uid: m.uid, name: cardOf(m.cardId)?.name ?? "?" })), ...(p.item ? [{ uid: p.item.uid, name: `${cardOf(p.item.cardId)?.name ?? "ไอเทม"} (ไอเทม)` }] : []), ...p.setZone.map((id, i) => ({ uid: `set:${i}`, name: `${cardOf(id)?.name ?? "การ์ด Set"} (Set ${i + 1})` }))];
      const soulUid = mt.soulUid && targets.some(t => t.uid === mt.soulUid) ? mt.soulUid : targets[0]?.uid;
      const act = "px-1.5 py-0.5 bg-slate-800 hover:bg-slate-600 rounded text-[10px]";
      return (
        <div ref={menuRef} className={`${box} w-[min(96vw,760px)] max-h-[86vh] flex flex-col`}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h4 className="font-bold text-cyan-300 text-sm">
              {mt.mode === "top" ? `ดูการ์ดบนสุดของเด็ค (${list.length} ใบ)` : `ค้นหาในเด็ค (${p.deck.length} ใบ)`} <span className="text-xs text-slate-500">(Sandbox · เห็นเฉพาะคุณ)</span>
            </h4>
            <button onClick={() => closeMenuRef.current()} className="p-1 hover:bg-slate-800 rounded"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-3 mb-2 flex-wrap text-xs">
            {mt.mode === "search" && <input value={deckFilter} onChange={e => setDeckFilter(e.target.value)} placeholder="ค้นหาชื่อ/ประเภทการ์ด" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-52" />}
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={autoShuffle} onChange={e => setAutoShuffle(e.target.checked)} /> สับเด็คอัตโนมัติเมื่อปิดหน้าต่างนี้</label>
            <span className="text-slate-500">{autoShuffle ? "เมื่อปิด เด็คจะถูกสับให้ทันที" : "ปิดอยู่: เด็คจะไม่ถูกสับ"}</span>
          </div>
          <div className="overflow-y-auto pr-1">
            {list.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{p.deck.length === 0 ? "เด็คว่าง" : "ไม่พบการ์ดที่ตรงกับคำค้น"}</p>}
            <div className="gap-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
              {list.map(e => (
                <div key={e.i} className="flex flex-col items-center gap-1 bg-slate-950/60 rounded-lg p-1.5">
                  <div onMouseEnter={() => e.c && setHovered({ card: e.c, flagId: p.flagId })}>
                    {e.c ? <CardView card={e.c} flag={flagOf(e.c.flagId) ?? flagOf(p.flagId)} width="84px" hideText /> : <CardView faceDown width="84px" />}
                  </div>
                  <div className="flex flex-wrap justify-center gap-0.5">
                    <button className={act} onClick={() => take(s => sandboxMoveCard(s, side, "deck", "hand", e.i))}>มือ</button>
                    <button className={act} onClick={() => take(s => sandboxMoveCard(s, side, "deck", "dropZone", e.i))}>สุสาน</button>
                    <button className={act} onClick={() => take(s => sandboxMoveCard(s, side, "deck", "gauge", e.i))}>เกจ</button>
                    {e.c?.type === "Monster" && <button className={act} onClick={() => take(s => sandboxMoveCard(s, side, "deck", "field", e.i))}>ลงสนาม</button>}
                    <button className={act} onClick={() => take(s => sandboxMoveCard(s, side, "deck", "deckBottom", e.i))}>ใต้เด็ค</button>
                    {soulUid && <button className={`${act} !bg-violet-800`} onClick={() => take(s => addSoulAny(s, side, soulUid, "deck", e.i))}>→Soul</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {targets.length > 0 && (
            <div className="mt-2 text-xs text-slate-300 flex items-center gap-2 border-t border-slate-700 pt-2">
              <span>ปุ่ม “→Soul” ใส่เข้า:</span>
              <select value={soulUid} onChange={e => setMenuTarget({ ...mt, soulUid: e.target.value })} className="bg-slate-800 border border-slate-700 rounded px-2 py-1">
                {targets.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      );
    }

    if (menuTarget.kind === "drop") {
      return (
        <div ref={menuRef} className={`${box} max-w-[520px] max-h-[70vh] overflow-y-auto`}>
          <h4 className="font-bold text-slate-300 mb-3 text-sm">สุสาน ({p.dropZone.length})</h4>
          <div className="flex flex-wrap gap-2">
            {p.dropZone.map((id, i) => {
              const c = cardOf(id);
              if (!c) return null;
              return (
                <div key={i} className="relative group" onMouseEnter={() => setHovered({ card: c, flagId: p.flagId })}>
                  <CardView card={c} flag={flagOf(c.flagId) ?? flagOf(p.flagId)} size="sm" onClick={() => openInspect(c, p.flagId)} />
                  {sandbox && (
                    <div className="flex gap-1 justify-center mt-1">
                      <button title="ไปมือ" onClick={() => doAction(s => sandboxMoveCard(s, menuTarget.side, "dropZone", "hand", i))} className="bg-cyan-700 hover:bg-cyan-600 rounded px-1.5 py-0.5 text-[10px] leading-none"><Hand size={10} /></button>
                      <button title="ใส่ใต้กองเด็ค" onClick={() => doAction(s => sandboxMoveCard(s, menuTarget.side, "dropZone", "deckBottom", i))} className="bg-slate-700 hover:bg-slate-600 rounded px-1.5 py-0.5 text-[10px] leading-none">⬇ ใต้เด็ค</button>
                      <button title="ใส่บนกองเด็ค" onClick={() => doAction(s => sandboxMoveCard(s, menuTarget.side, "dropZone", "deck", i))} className="bg-slate-700 hover:bg-slate-600 rounded px-1.5 py-0.5 text-[10px] leading-none">⬆ บนเด็ค</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const mineDeck = menuTarget.side === mySide;
    return (
      <div ref={menuRef} className={`${box} min-w-[240px]`}>
        <h4 className="font-bold text-slate-300 mb-1 text-sm">กองการ์ด ({p.deck.length}) <span className="text-xs text-slate-500">(Sandbox)</span></h4>
        <p className="text-[11px] text-slate-500 mb-2">{mineDeck ? "คุณไม่เห็นการ์ดในเด็คจนกว่าจะกดค้นหา/ดูบนสุด" : "เด็คของฝั่งตรงข้าม — ดูการ์ดไม่ได้"}</p>
        <div className="space-y-2">
          <button onClick={() => { doAction(s => sandboxFreeDraw(s, menuTarget.side)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><RotateCw size={14} /> จั่ว 1 ใบ</button>
          <button onClick={() => { doAction(s => sandboxMoveCard(s, menuTarget.side, "deck", "dropZone", 0)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><Trash2 size={14} /> ทิ้งใบบนสุดลงสุสาน</button>
          <button onClick={() => { doAction(s => sandboxMoveCard(s, menuTarget.side, "deck", "gauge", 0)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><Zap size={14} /> ใส่เกจ 1 ใบ (ไม่ดู)</button>
          {mineDeck && (<>
            <button onClick={() => { setDeckFilter(""); setMenuTarget({ kind: "deckView", side: menuTarget.side, mode: "search", n: 0 }); }} className={`${sb} w-full py-2 !bg-cyan-900 hover:!bg-cyan-800`}>🔍 ค้นหาการ์ดในเด็ค</button>
            <div className="flex items-center gap-1">
              <button onClick={() => setMenuTarget({ kind: "deckView", side: menuTarget.side, mode: "top", n: Math.min(lookN, p.deck.length) })} className={`${sb} flex-1 py-2 !bg-cyan-900 hover:!bg-cyan-800`}>👁 ดูบนสุด</button>
              <input type="number" min={1} max={20} value={lookN} onChange={e => setLookN(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs" />
              <span className="text-xs text-slate-400">ใบ</span>
            </div>
            <button onClick={() => doAction(s => sandboxShuffleDeck(s, menuTarget.side))} className={`${sb} w-full py-2`}>🔀 สับเด็ค</button>
            <label className="flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={autoShuffle} onChange={e => setAutoShuffle(e.target.checked)} /> สับเด็คอัตโนมัติหลังดู/ค้นการ์ดในเด็ค</label>
          </>)}
        </div>
      </div>
    );
  }

  /* ---------------- Winner ---------------- */
  if (game.winner) {
    const myWin = game.winner === mySide;
    const col = myWin ? "#22d3ee" : "#f43f5e";
    return (
      <div className="min-h-screen arena-bg flex items-center justify-center text-white relative overflow-hidden">
        {myWin && Array.from({ length: 36 }).map((_, i) => (
          <span key={i} className="confetti" style={{ left: `${(i * 97) % 100}%`, background: ["#22d3ee", "#fbbf24", "#f43f5e", "#a78bfa", "#4ade80"][i % 5], animationDuration: `${2.4 + (i % 7) * 0.45}s`, animationDelay: `${(i % 9) * 0.25}s` }} />
        ))}
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${col}33, transparent 60%)` }} />
        <div className="text-center relative">
          <Crown size={84} className="mx-auto mb-4 crown-float" style={{ color: myWin ? "#fbbf24" : "#64748b", filter: myWin ? "drop-shadow(0 0 22px #fbbf24)" : "none" }} />
          <h2 className="result-in font-display text-6xl font-extrabold mb-3" style={{ color: col, textShadow: `0 0 30px ${col}` }}>{myWin ? "ชนะ!" : "แพ้!"}</h2>
          <p className="text-slate-300 mb-2">{game.log[game.log.length - 1]}</p>
          <button onClick={() => { clearSavedGame(); onExit(); }} className="mt-4 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl transition font-bold hover:scale-105">กลับเมนู</button>
        </div>
      </div>
    );
  }

  const previewFlag = hovered ? flagOf(hovered.flagId ?? hovered.card.flagId) : undefined;

  return (
    <div className="bf-root arena-bg min-h-screen text-white flex flex-col lg:flex-row">
      {/* Main column */}
      <div className="flex-1 min-w-0 p-2 flex flex-col items-center gap-2">
        <div className="panel !rounded-2xl flex items-center justify-between gap-2 flex-wrap w-full px-3 py-2" style={{ maxWidth: "min(100%, max(var(--mw), 760px))" }}>
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={requestExit} title="ออกจากเกม" className="btn !py-1.5 !px-3 !text-xs"><LogOut size={14} /> ออก</button>
            <div className="hidden sm:flex items-center gap-2 text-sm font-display font-bold min-w-0">
              <button className="truncate max-w-[10rem] hover:underline" title="ดูความสามารถของ Flag" onClick={() => { const f = flagOf(me.flagId); if (f) setFlagInfo(f); }} style={{ color: getFlagColor(flagOf(me.flagId)) }}>{flagOf(me.flagId)?.name ?? "คุณ"}</button>
              <span className="text-slate-500 text-xs">VS</span>
              <button className="truncate max-w-[10rem] hover:underline" title="ดูความสามารถของ Flag" onClick={() => { const f = flagOf(foe.flagId); if (f) setFlagInfo(f); }} style={{ color: getFlagColor(flagOf(foe.flagId)) }}>{flagOf(foe.flagId)?.name ?? "ศัตรู"}</button>
            </div>
            {mode === "bot" && (
              <select value={guestDeckId} onChange={e => changeBotDeck(e.target.value)} title="เปลี่ยนเด็คของบอท (เริ่มเกมใหม่)" className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                {allDecks.map(d => <option key={d.id} value={d.id}>บอทใช้: {d.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {mode === "multiplayer" && !connected && (
              <button onClick={() => setShowRoomDialog(true)} className="btn btn-primary !py-1.5 !px-3 !text-xs"><Users size={14} /> เชื่อมต่อเพื่อน</button>
            )}
            {mode === "multiplayer" && connected && (<>
              <span className="chip !text-emerald-300 !border-emerald-500/40">● ห้อง {roomId}</span>
              <button onClick={requestSync} title="ซิงค์เกมกับเพื่อนใหม่" className="btn !py-1.5 !px-2.5 !text-xs"><RefreshCw size={14} /></button>
            </>)}
            <button onClick={() => askUndo("last")} disabled={histN === 0 || !!game.winner} title="ย้อนการกระทำล่าสุด (Ctrl+Z) — ย้อนได้ทั้งของเราและของเพื่อน" className="btn !py-1.5 !px-2.5 !text-xs disabled:opacity-40 disabled:cursor-not-allowed">↩ ย้อน{histN > 0 ? ` (${histN})` : ""}</button>
          <button onClick={() => askUndo("turn")} disabled={histN === 0 || !!game.winner} title="กลับไปต้นเทิร์นนี้ (ล้างทุกการกระทำในเทิร์นนี้)" className="btn !py-1.5 !px-2.5 !text-xs disabled:opacity-40 disabled:cursor-not-allowed">⏮ ต้นเทิร์น</button>
          <button onClick={() => setInspectMode(v => !v)} title="โหมดดูการ์ด: คลิกการ์ดใบไหนก็ได้เพื่อดูความสามารถ (หรือคลิกขวา/ดับเบิลคลิก)" className={`btn !py-1.5 !px-2.5 !text-xs ${inspectMode ? "btn-primary" : ""}`}><Eye size={14} /> <span className="hidden md:inline">ดูการ์ด</span></button>
            <button onClick={() => setSandbox(v => !v)} title="Sandbox: เครื่องมือแก้เกมด้วยมือ" className={`btn !py-1.5 !px-2.5 !text-xs ${sandbox ? "!bg-fuchsia-700 !border-fuchsia-400/60" : ""}`}><Wrench size={14} /> <span className="hidden md:inline">Sandbox</span></button>
            <AudioControl variant="inline" />
          </div>
        </div>

        {mode === "multiplayer" && !synced && (
          <div className="text-center text-sm text-amber-300 bg-amber-900/20 border border-amber-700 rounded-lg py-2 px-3 w-full flex items-center justify-center gap-3 flex-wrap" style={{ maxWidth: "var(--mw)" }}>
            <span>
              {dropped || (started && liveGameRef.current)
                ? `การเชื่อมต่อหลุด — เกมถูกบันทึกไว้อัตโนมัติแล้ว ${role === "host" ? `รอเพื่อนกลับเข้าห้องเดิม ${roomId}` : `กดเชื่อมต่อใหม่เพื่อกลับเข้าห้อง ${roomId}`}`
                : role === "host" ? "รอเพื่อนเข้าห้องก่อน จึงจะเริ่มเล่นได้" : "กำลังเชื่อมต่อกับเจ้าของห้อง..."}
            </span>
            {(dropped || (started && liveGameRef.current)) && <button onClick={reconnect} className="btn btn-primary !py-1 !px-3 !text-xs"><RefreshCw size={12} /> เชื่อมต่อใหม่</button>}
          </div>
        )}
        {mode === "multiplayer" && mpStatus && <div className="text-center text-xs text-slate-500">{mpStatus}</div>}

        {renderHand(false)}
        {renderMat(oppSide, false)}
        {renderPhaseStrip()}
        {renderMat(mySide, true)}
        {renderHandBar()}
        {renderHand(true)}
      </div>

      <aside className="lg:w-80 lg:min-h-screen shrink-0 bg-slate-900/70 border-t lg:border-t-0 lg:border-l border-slate-800 p-3 flex flex-col gap-3">
        <div className="flex justify-center">
          {hovered ? (
            <CardView card={hovered.card} flag={previewFlag} size="xl" stats={hovered.stats} soul={hovered.soul} />
          ) : (
            <div className="w-[288px] max-w-full aspect-[63/88] rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-sm text-center p-6">ชี้การ์ดเพื่อดูรายละเอียดแบบเต็ม</div>
          )}
        </div>
        <div className="flex-1 min-h-[8rem] max-h-64 lg:max-h-none overflow-y-auto bg-slate-950/60 rounded-xl border border-slate-800 p-2">
          <h4 className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Star size={10} /> Battle Log</h4>
          {(() => {
            const seen: Record<string, number> = {};
            const rows = game.log.map(l => { seen[l] = (seen[l] ?? 0) + 1; return { l, k: `${l}#${seen[l]}` }; });
            return rows.slice(-40).reverse().map(({ l, k }, i) => {
              const tone = l.startsWith("⚔") ? "text-rose-300" : l.startsWith("🛡") ? "text-sky-300" : /Soul/.test(l) ? "text-violet-300" : /ทำลาย|แพ้/.test(l) ? "text-orange-300" : /ฟื้น/.test(l) ? "text-emerald-300" : /Life/.test(l) ? "text-red-300" : l.startsWith("—") ? "text-cyan-300 font-bold" : i === 0 ? "text-white" : "text-slate-400";
              return <div key={k} className={`log-in text-xs py-0.5 ${tone}`}>{l}</div>;
            });
          })()}
        </div>
      </aside>

      <FxLayer game={game} cardOf={cardOf} flagOf={flagOf} onHide={hideUnits} />
      {banner && <Banner key={banner.key} text={banner.text} sub={banner.sub} color={banner.color} back={banner.back} />}
      {renderMenus()}
      {renderMulligan()}
      {moveWindowMine && !game.battle && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[45] panel !rounded-2xl px-4 py-3 flex items-center gap-3 border-cyan-500/60 shadow-2xl">
          <div className="text-sm"><b className="text-cyan-300">ช่วง Move</b> — ศัตรูเริ่ม Attack Phase คุณย้ายมอนสเตอร์ [Move] ไปช่องว่างได้ก่อนเริ่มโจมตี</div>
          <button onClick={() => { act("ปิดช่วง Move ไม่ได้", st => closeMoveWindow(st, mySide)); setMoveSel(null); }} className="btn btn-primary !py-1.5 whitespace-nowrap">จบช่วง Move</button>
        </div>
      )}
      {renderCounterModal()}
      {renderFreeCounterModal()}
      {renderFreeCallModal()}
      {renderZoneCallModal()}
      {oppZoneCall && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[44] panel !rounded-2xl px-4 py-2 text-sm text-emerald-200 border-emerald-500/50">ศัตรูกำลังเลือกมอนสเตอร์ที่จะคอลลงสนาม...</div>
      )}
      {flagInfo && <FlagInfoDialog flag={flagInfo} buddies={(flagInfo.buddyIds ?? []).map(id => cardOf(id)).filter((c): c is Card => !!c)} onClose={() => setFlagInfo(null)} />}
      {renderSoulCallModal()}
      {renderSlotPick()}
      {renderDiscardPick()}
      {renderLookModal()}
      {renderSoulModal()}
      {renderTargetModal()}
      {oppTargetPick && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[44] panel !rounded-2xl px-4 py-2 text-sm text-rose-200 border-rose-500/50">ศัตรูกำลังเลือกเป้าหมายมอนสเตอร์...</div>
      )}
      {oppSoulPick && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[44] panel !rounded-2xl px-4 py-2 text-sm text-violet-200 border-violet-500/50">ศัตรูกำลังเลือกการ์ดที่จะถอด Soul...</div>
      )}
      {oppLooking && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[44] panel !rounded-2xl px-4 py-2 text-sm text-amber-200 border-amber-500/50">ศัตรูกำลังดูการ์ดบนกองและเลือกการ์ด...</div>
      )}
      {renderSoulView()}
      {renderStatTip()}
      {renderInspect()}
      {renderNotice()}
      {undoAsk && (
        <div className="fixed inset-0 bg-black/60 z-[65] flex items-center justify-center p-4" onClick={() => setUndoAsk(null)}>
          <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-amber-300 mb-2">{undoAsk === "turn" ? "กลับไปต้นเทิร์นนี้?" : "ย้อนการกระทำล่าสุด?"}</h3>
            <p className="text-sm text-slate-200 mb-4 leading-relaxed">
              {undoAsk === "turn"
                ? `ทุกการกระทำในเทิร์น ${game.turn} จะถูกยกเลิก และสถานะเกมกลับไปเหมือนตอนเริ่มเทิร์นนี้`
                : `ย้อนกลับไปก่อน: ${histRef.current[histRef.current.length - 1]?.label ?? "การกระทำล่าสุด"}`}
              {mode === "multiplayer" ? " (เพื่อนจะเห็นการย้อนนี้ด้วย)" : ""}
            </p>
            <div className="flex gap-2">
              <button onClick={() => doUndo(undoAsk)} className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold">ยืนยัน</button>
              <button onClick={() => setUndoAsk(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {exitAsk && (
        <div className="fixed inset-0 bg-black/75 z-[70] flex items-center justify-center p-4" onClick={() => setExitAsk(false)}>
          <div className="bg-slate-900 border-2 border-cyan-600 rounded-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-cyan-300 mb-1">ออกจากเกมที่กำลังเล่นอยู่?</h3>
            <p className="text-sm text-slate-300 mb-4">
              เกมถูกบันทึกอัตโนมัติทุกครั้งที่ทำอะไร จึงออกไปแล้วกลับมา <b>“เล่นต่อ”</b> ที่หน้าแรกได้
              {mode === "multiplayer" && <span className="block mt-1 text-amber-300">ออนไลน์: เพื่อนจะหลุดจากห้อง ต้องรอคุณกลับเข้าห้องเดิม ({roomId}) แล้วเล่นต่อจากสถานะนี้</span>}
            </p>
            <div className="space-y-2">
              <button onClick={() => { persistNow(); onExit(); }} className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold">ออกและเก็บเซฟไว้เล่นต่อ</button>
              <button onClick={() => { clearSavedGame(); onExit(); }} className="w-full py-2.5 bg-rose-700 hover:bg-rose-600 rounded-xl font-bold">ออกและทิ้งเกมนี้ (ลบเซฟ)</button>
              <button onClick={() => setExitAsk(false)} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">อยู่ในเกมต่อ</button>
            </div>
          </div>
        </div>
      )}

      {showRoomDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowRoomDialog(false)}>
          <div className="bg-slate-900 border border-cyan-600 rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-cyan-400 mb-4">เล่นออนไลน์กับเพื่อน</h3>
            {!connected ? (
              <div className="space-y-4">
                <div className="bg-slate-800 rounded-xl p-4">
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><Users size={16} /> สร้างห้อง</h4>
                  <button onClick={createRoom} className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition">สร้างห้องใหม่</button>
                  {roomId && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-center font-mono text-lg tracking-widest text-cyan-400">{roomId}</div>
                      <button onClick={() => navigator.clipboard.writeText(roomId)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><Copy size={16} /></button>
                    </div>
                  )}
                </div>
                <div className="bg-slate-800 rounded-xl p-4">
                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><LogIn size={16} /> เข้าห้อง</h4>
                  <div className="flex gap-2">
                    <input value={joinId} onChange={e => setJoinId(e.target.value.toUpperCase())} placeholder="กรอกรหัส 5 ตัว" maxLength={5} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-lg tracking-widest text-center focus:border-cyan-500 outline-none" />
                    <button onClick={joinRoom} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition">เข้า</button>
                  </div>
                </div>
                {mpStatus && <p className="text-xs text-center text-slate-400">{mpStatus}</p>}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-green-400 mb-2">เชื่อมต่อสำเร็จ!</p>
                <p className="text-sm text-slate-400">ห้อง: {roomId}</p>
                <button onClick={() => setShowRoomDialog(false)} className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg">เริ่มเล่น</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
