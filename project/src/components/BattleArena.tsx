import { useState, useRef, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Swords, Heart, Zap, Skull, LogOut, Plus, Minus, Hand, Trash2, RotateCw, Crown,
  Copy, LogIn, Users, RefreshCw, Wrench, X, Shield, Star, AlertTriangle, Link2, Eye,
} from "lucide-react";
import type { GameState, Card, Flag, Deck, SyncMessage, RuleSet, FieldCard } from "@/types";
import { TRIGGER_LABELS } from "@/types";
import { DEFAULT_RULES } from "@/types";
import { keywordValue,
  createInitialState, setCardCache, setCardSizeCache, getCard, registerCards, setCardImage,
  callMonster, castSpell, equipItem, setCard, moveMonster, declareAttack, endTurn, drawPhase, chargeAndDraw,
  goToAttack, goToFinal, mulligan, legalTargets, statsOf, counterOptions, counterCardOf, counterAct,
  passCounter, maxAttacks, hasKeyword, changeLife, addGauge, addLog, POSITION_NAMES,
  sandboxMoveCard, sandboxFlipRest, sandboxAdjustPower, sandboxMoveToPosition, sandboxFreeDraw, sandboxPayGauge,
  type AttackTarget, type CounterOption, type Result,
  setSoulguardAuto, closeMoveWindow, movableMonsters, allCachedCards, sandboxSetGame,
} from "@/game/engine";
import { getFlags, getCards, getDecks } from "@/storage";
import { getFlagColor, hasCounter, skillLines, keywordBadges, costText, effectText, KEYWORD_HELP, TRIGGER_HELP } from "@/game/helpers";
import { mp } from "@/game/multiplayer";
import { CardView } from "@/components/CardView";
import { FxLayer, Banner } from "@/components/FxLayer";
import { playSfx } from "@/game/sfx";
import { AudioControl } from "@/components/AudioControl";
import { SandboxPanel, type SbFocus } from "@/components/SandboxPanel";

interface Props {
  mode: "bot" | "multiplayer";
  hostDeck: Deck;
  rules?: RuleSet;
  initialState?: GameState; // ใช้ทดสอบ/แสดงตัวอย่าง
  onExit: () => void;
}

type Side = "host" | "guest";
type MenuTarget =
  | { kind: "field"; side: Side; uid: string }
  | { kind: "drop"; side: Side }
  | { kind: "deck"; side: Side }
  | null;
type Drag = { kind: "hand"; index: number } | { kind: "unit"; uid: string } | null;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ตัดการ์ดที่ไม่มีข้อมูลแล้ว (เช่น ถูกลบจาก Card Studio แต่ยังค้างในเด็ค) ออก ไม่งั้นจะกลายเป็นการ์ดคว่ำที่ใช้ไม่ได้
const cleanDeck = (d: Deck): Deck => ({ ...d, cardIds: d.cardIds.filter(id => !!getCard(id)), buddyId: d.buddyId && getCard(d.buddyId) ? d.buddyId : null });

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
  const ids = [...deck.cardIds, ...(deck.buddyId ? [deck.buddyId] : [])];
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
  [...deck.cardIds, ...(deck.buddyId ? [deck.buddyId] : [])].forEach(id => {
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

export function botStep(s: GameState): GameState {
  if (s.winner) return s;
  if (!s.mulligan.guest) return mulligan(s, "guest", []).state;
  if (!s.mulligan.host) return s; // รอมนุษย์เลือก Mulligan
  if (s.moveWindow === "host") return s; // รอมนุษย์เลือก Move
  if (s.moveWindow === "guest") return closeMoveWindow(s, "guest").state;

  // บอทเป็นฝ่ายป้องกัน: ตัดสินใจ Counter
  if (s.battle) {
    if (s.battle.attackerSide === "guest") return s; // รอมนุษย์
    const opts = counterOptions(s, "guest");
    if (opts.length > 0) {
      const r = counterAct(s, "guest", opts[0]);
      if (r.ok) return r.state.battle ? passCounter(r.state, "guest").state : r.state;
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
      for (let i = state.guest.hand.length - 1; i >= 0; i--) {
        const card = getCard(state.guest.hand[i]);
        if (!card) continue;
        const free = [1, 0, 2].filter(p => !state.guest.monsters.some(m => m.position === p));
        const counterOnly = hasCounter(card) && !card.autoSkills.some(k => k.trigger === "onCast");
        if (card.type === "Monster" && free.length > 0) {
          const r = callMonster(state, "guest", i, free[0]);
          if (r.ok) state = r.state;
        } else if (card.type === "Item" && !state.guest.item && !counterOnly) {
          const r = equipItem(state, "guest", i);
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
export function BattleArena({ mode, hostDeck, rules = DEFAULT_RULES, initialState, onExit }: Props) {
  const [allCards] = useState<Card[]>(() => getCards());
  const [allFlags] = useState<Flag[]>(() => getFlags());
  const [allDecks] = useState<Deck[]>(() => getDecks());

  useState(() => {
    setCardCache(allCards);
    setCardSizeCache(allCards);
    return true;
  });

  const hostFlag = allFlags.find(f => f.id === hostDeck.flagId) ?? allFlags[0];
  const [guestDeckId, setGuestDeckId] = useState<string>(allDecks[0]?.id ?? hostDeck.id);
  const guestDeck = allDecks.find(d => d.id === guestDeckId) ?? hostDeck;
  const guestFlag = allFlags.find(f => f.id === guestDeck.flagId) ?? hostFlag;

  const [game, setGame] = useState<GameState>(() => initialState ?? makeGame(hostDeck, guestDeck, hostFlag, guestFlag, allCards, rules));
  const gameRef = useRef<GameState>(game);

  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null);
  const [hovered, setHovered] = useState<{ card: Card; flagId?: string; stats?: { power: number; defense: number; critical: number }; soul?: number } | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(mode === "multiplayer");
  const [roomId, setRoomId] = useState("");
  const [joinId, setJoinId] = useState("");
  const [mpStatus, setMpStatus] = useState("");
  const [role, setRole] = useState<Side>("host");
  const roleRef = useRef<Side>("host");
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(mode !== "multiplayer");
  const syncedRef = useRef(mode !== "multiplayer");
  const menuRef = useRef<HTMLDivElement>(null);
  const [sandbox, setSandbox] = useState(false);
  const [sbFocus, setSbFocus] = useState<SbFocus | null>(null);
  const [atkSels, setAtkSels] = useState<string[]>([]);
  const [linkMode, setLinkMode] = useState(false);
  const [moveSel, setMoveSel] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [handSel, setHandSel] = useState<number | null>(null);
  const [chargePick, setChargePick] = useState(false);
  const [mullSel, setMullSel] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ title: string; msg: string } | null>(null);
  const [, setImgTick] = useState(0);
  const dragRef = useRef<Drag>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [banner, setBanner] = useState<{ key: number; text: string; sub?: string; color: string } | null>(null);
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
  const canAttackNow = isMyTurn && game.phase === attackPhaseName && !game.battle;
  const canPlayNow = isMyTurn && game.phase === "main" && !game.battle;
  // Move: ตอนเริ่ม Attack Phase ของทั้งสองฝั่ง ก่อนมีการโจมตี (ฝั่งป้องกันย้ายได้ในช่วงที่ระบบเปิดให้)
  const canMoveNow = started && !game.winner && !game.battle && game.phase === attackPhaseName && game.attacksThisTurn === 0 &&
    (isMyTurn || game.moveWindow === mySide);
  const moveWindowMine = game.moveWindow === mySide;
  const iAmDefender = !!game.battle && game.battle.attackerSide !== mySide;
  const waitingCounter = !!game.battle && game.battle.attackerSide === mySide;

  function commit(next: GameState) {
    gameRef.current = next;
    setGame(next);
  }

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
        const gDeck = msg.deck;
        const gFlag = msg.flags?.[gDeck.flagId] ?? Object.values(msg.flags ?? {})[0] ?? hostFlag;
        const gs = makeGame(hostDeck, gDeck, hostFlag, gFlag, allCards, rules);
        commit(gs);
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
        const accept = (inc.rev ?? 0) > (cur.rev ?? 0) ||
          ((inc.rev ?? 0) === (cur.rev ?? 0) && roleRef.current === "guest") || !syncedRef.current;
        if (!accept) return;
        commit(inc);
        if (roleRef.current === "guest") {
          syncedRef.current = true;
          setSynced(true);
          setConnected(true);
          setShowRoomDialog(false);
        }
      }
    };
    mp.onStatus = (s) => setMpStatus(s);
    return () => { mp.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuTarget(null);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAtkSels([]); setHandSel(null); setChargePick(false); setMenuTarget(null); setMoveSel(null); setNotice(null); setLinkMode(false); setInspect(null);
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

  function doAction(fn: (s: GameState) => GameState) {
    if (mode === "multiplayer" && !syncedRef.current) {
      setNotice({ title: "ยังเล่นไม่ได้", msg: "ยังไม่ได้เชื่อมต่อกับเพื่อน กรุณารอให้เพื่อนเข้าห้องหรือกดปุ่ม 'ซิงค์'" });
      return;
    }
    const next = fn(gameRef.current);
    if (next === gameRef.current) return;
    next.rev = (gameRef.current.rev ?? 0) + 1;
    commit(next);
    if (mode === "multiplayer") mp.send({ type: "state", state: next });
  }

  // ทำ action ที่อาจล้มเหลว: ถ้าไม่ผ่านจะแสดง popup บอกเหตุผล (ไม่ส่งอะไรไปให้เพื่อน)
  function act(title: string, fn: (s: GameState) => Result): boolean {
    if (mode === "multiplayer" && !syncedRef.current) {
      setNotice({ title: "ยังเล่นไม่ได้", msg: "ยังไม่ได้เชื่อมต่อกับเพื่อน กรุณารอให้เพื่อนเข้าห้องหรือกดปุ่ม 'ซิงค์'" });
      return false;
    }
    const r = fn(gameRef.current);
    if (!r.ok) { setNotice({ title, msg: r.msg }); return false; }
    doAction(() => r.state);
    return true;
  }

  /* ---------------- แบนเนอร์เปลี่ยนเทิร์น / เฟส ---------------- */
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = { turn: game.turn, phase: game.phase, started };
    if (game.winner || !started) return;
    const mine = game.currentTurn === mySide;
    let nb: { text: string; sub?: string; color: string } | null = null;
    if (!prev.started || game.turn !== prev.turn) {
      nb = mine
        ? { text: "เทิร์นของคุณ", sub: `TURN ${game.turn}`, color: "#0891b2" }
        : { text: "เทิร์นฝั่งตรงข้าม", sub: `TURN ${game.turn}`, color: "#be123c" };
    } else if (mine && game.phase !== prev.phase && game.phase === "attack") {
      nb = { text: "ATTACK PHASE", sub: "เลือกผู้โจมตี แล้วเลือกเป้าหมาย", color: "#dc2626" };
    } else if (mine && game.phase !== prev.phase && game.phase === "final") {
      nb = { text: "FINAL PHASE", sub: "ใช้ Impact ได้ แล้วจบเทิร์น", color: "#a21caf" };
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

  const hideUnits = (uids: string[], ms: number) => {
    setHidden(h => [...h, ...uids]);
    window.setTimeout(() => setHidden(h => h.filter(u => !uids.includes(u))), ms);
  };

  /* ---------------- Draw Phase: จั่วให้อัตโนมัติหลังเห็นเฟส Draw สั้นๆ ---------------- */
  useEffect(() => {
    if (game.winner || !started || game.phase !== "draw" || game.battle) return;
    if (game.currentTurn !== mySide) return; // ฝั่งตรงข้าม/บอทจัดการเอง
    const t = setTimeout(() => act("จั่วไม่ได้", s => (s.phase === "draw" && s.currentTurn === mySide ? drawPhase(s, mySide) : { state: s, ok: true, msg: "" })), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.currentTurn, game.turn, started]);

  /* ---------------- แจ้งเตือนการ์ดที่ถูกลบแต่ยังค้างในเด็ค ---------------- */
  useEffect(() => {
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
    const botDefending = !!game.battle && game.battle.attackerSide === "host";
    const botTurn = game.currentTurn === "guest" && !game.battle && game.mulligan.host && game.mulligan.guest;
    if (!botMull && !botDefending && !botTurn) return;
    const t = setTimeout(() => doAction(s => botStep(s)), botMull ? 100 : botDefending ? 900 : 850);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game]);

  /* ---------------- Actions ---------------- */
  const tryCall = (i: number, pos: number) => { act("ลงมอนสเตอร์ไม่ได้", s => callMonster(s, mySide, i, pos)); setHandSel(null); };
  const tryCast = (i: number) => { act("ร่ายไม่ได้", s => castSpell(s, mySide, i)); setHandSel(null); };
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
  const doCounter = (opt: CounterOption) => act("ใช้ Counter ไม่ได้", s => counterAct(s, mySide, opt));
  const doPassCounter = () => act("ผิดพลาด", s => passCounter(s, mySide));
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

  function joinRoom() {
    const id = joinId.trim().toUpperCase();
    if (!id) return;
    roleRef.current = "guest";
    setRole("guest");
    mp.joinRoom(id)
      .then(() => {
        setRoomId(id);
        mp.send({ type: "hello", deck: hostDeck, cards: collectCards(hostDeck, allCards), flags: stripFlags(hostFlag) });
        sendImages(hostDeck, allCards, hostFlag);
      })
      .catch(() => { roleRef.current = "host"; setRole("host"); });
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

  // เหตุผลที่ตอนนี้ยังกระทำกับการ์ดไม่ได้ (แสดงในหน้าต่างดูการ์ด)
  function whyBlocked(): string | undefined {
    if (game.winner) return undefined;
    if (!started) return "ยังเริ่มเกมไม่ได้: รอทั้งสองฝั่งเลือก Mulligan ก่อน";
    if (game.battle) return iAmDefender ? "กำลังมีการโจมตี: เลือกใช้ Counter Act หรือกด 'ไม่ใช้ Counter' ก่อน" : "กำลังรอฝั่งตรงข้ามตัดสินใจ Counter";
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
    const buddy = p.buddyId ? cardOf(p.buddyId) : null;
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
      const card = m ? cardOf(m.cardId) : null;
      const isTarget = !isMine && legal.some(t => t.kind === "monster" && t.position === pos);
      const callable = isMine && canPlayNow && handSel !== null && !m && cardOf(me.hand[handSel] ?? "")?.type === "Monster";
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
              if (isMine && canAttackNow && m.state === "stand") {
                if (linkMode) return setAtkSels(atkSels.includes(m.uid) ? atkSels.filter(u => u !== m.uid) : [...atkSels, m.uid]);
                return setAtkSels(atkSels.length === 1 && atkSels[0] === m.uid ? [] : [m.uid]);
              }
              if (isMine && canMoveThis) return setMoveSel(moveSel === m.uid ? null : m.uid);
              if (sandbox) return setSbFocus({ tab: "field", side, uid: m.uid });
              // ไม่มีการกระทำที่ทำได้ -> เปิดดูการ์ด พร้อมบอกเหตุผล
              let note = whyBlocked();
              if (!note && isMine) {
                if (m.state === "rest") note = `${card.name} อยู่ในสถานะ Rest (โจมตีไปแล้วหรือถูก Rest) จะ Stand ตอนต้นเทิร์นของคุณ`;
                else if (game.rules.useAttackPhase && game.phase !== "attack") note = `โจมตีได้เฉพาะ Attack Phase (ตอนนี้คือ ${game.phase === "draw" ? "Draw" : game.phase === "charge" ? "Charge & Draw" : game.phase === "main" ? "Main" : "Final"}) — กดปุ่ม 'ไป Attack Phase'`;
                else if (game.phase === "final") note = "ผ่านช่วงโจมตีมาแล้ว ตอนนี้เป็น Final Phase";
              } else if (!note && !isMine && game.phase === attackPhaseName && canAttackNow) note = "เลือกผู้โจมตีของคุณก่อน (คลิกมอนสเตอร์ที่ Stand) แล้วค่อยเลือกเป้าหมาย";
              return openInspect(card, p.flagId, m, note);
            }
            if (!m && !isMine && atkSels.length === 0 && canAttackNow) setNotice({ title: "ช่องนี้ว่าง", msg: "ไม่มีมอนสเตอร์ในช่องนี้ให้โจมตี" });
          }}
        >
          {m && card && (
            <div key={m.uid} className="anim-call relative" data-fxcard={m.uid} style={{ visibility: hidden.includes(m.uid) ? "hidden" : "visible" }}>
              <div
                className="transition-transform duration-500 relative"
                style={{ transform: m.state === "rest" ? "rotate(90deg)" : "none" }}
                onMouseEnter={() => setHovered({ card, flagId: p.flagId, stats: statsOf(m), soul: m.soul.length })}
              >
                <SoulStack n={m.soul.length} />
                <CardView
                  card={card} flag={flag} width="var(--cw)" hideText stats={statsOf(m)} soul={m.soul.length}
                  onInspect={() => openInspect(card, p.flagId, m)}
                  draggable={isMine && ((canAttackNow && m.state === "stand") || canMoveThis)}
                  onDragStart={() => { dragRef.current = { kind: "unit", uid: m.uid }; if (canAttackNow && !atkSels.includes(m.uid)) setAtkSels([m.uid]); }}
                  onDragEnd={() => { dragRef.current = null; }}
                >
                  {(m.tempPower !== 0 || m.tempCritical !== 0 || m.tempDefense !== 0) && (
                    <div className="absolute top-[2.6em] right-0 bg-cyan-500 text-white font-bold px-1 rounded-l z-20" style={{ fontSize: "0.7em" }}>BUFF</div>
                  )}
                  {m.nullified && (
                    <div className="absolute inset-x-0 top-[40%] text-center bg-fuchsia-700/90 text-white font-bold tracking-wider z-20 border-y border-fuchsia-200" style={{ fontSize: "0.8em" }}>NULLIFY</div>
                  )}
                  {maxAttacks(card) > 1 && (
                    <div className="absolute top-[0.3em] right-[0.3em] bg-rose-600 text-white font-bold px-1 rounded z-20" style={{ fontSize: "0.75em" }}>{m.attacks}/{maxAttacks(card)}</div>
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
          className={`flex items-center gap-[1%] px-[1.2%] ${fighterLegal ? "glow-target cursor-crosshair" : ""}`}
          onClick={() => !isMine && atkSels.length > 0 && tryAttack({ kind: "fighter" })}
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
        <RectZone fx={`gauge:${side}`} style={place(2, 11, 14.5, 50, mirror)} label={p.gauge === 0 ? "เกจ" : undefined} className="relative" onClick={() => sandbox && setSbFocus({ tab: "zones", side, zone: "gauge" })}>
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
              <button title="Charge +1" onClick={(e) => { e.stopPropagation(); doAction(s => addGauge(s, side, 1)); }} className="p-0.5 bg-amber-800 hover:bg-amber-600 rounded"><Plus size={11} /></button>
              <button title="จ่ายเกจ 1" onClick={(e) => { e.stopPropagation(); doAction(s => sandboxPayGauge(s, side, 1)); }} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Minus size={11} /></button>
            </div>
          )}
        </RectZone>

        {monsterHex(0)}
        {monsterHex(1)}
        {monsterHex(2)}

        {/* Deck */}
        <RectZone fx={`deck:${side}`} style={place(85.5, 11, 12.5, 31, mirror)} onClick={() => sandbox && setSbFocus({ tab: "zones", side, zone: "deck" })} label={undefined}>
          <CardView faceDown width="calc(var(--mh) * 0.2)">
            <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow" style={{ fontSize: "2.4em" }}><span key={p.deck.length} className="num-pop">{p.deck.length}</span></div>
          </CardView>
        </RectZone>
        {/* Drop */}
        <RectZone fx={`drop:${side}`} style={place(85.5, 45, 12.5, 31, mirror)} onClick={() => { if (sandbox) setSbFocus({ tab: "zones", side, zone: "drop" }); else if (p.dropZone.length > 0) setMenuTarget({ kind: "drop", side }); }}>
          {p.dropZone.length > 0 && cardOf(p.dropZone[p.dropZone.length - 1]) ? (
            <div className="relative opacity-90">
              <CardView card={cardOf(p.dropZone[p.dropZone.length - 1])} flag={flag} width="calc(var(--mh) * 0.2)" hideText />
              <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow bg-black/45 rounded" style={{ fontSize: "2em" }}>{p.dropZone.length}</div>
            </div>
          ) : <span className="font-display font-bold text-slate-300/60" style={{ fontSize: "calc(var(--mh) * 0.05)" }}>ดรอป</span>}
        </RectZone>

        {/* Set */}
        <RectZone style={place(2, 66, 24, 29, mirror)} onDrop={isMine ? handleDropOnSet : undefined} onClick={() => sandbox && setSbFocus({ tab: "zones", side, zone: "set" })} label={p.setZone.length === 0 ? "เซ็ท" : undefined}>
          <div className="flex gap-1 items-center justify-center">
            {p.setZone.map((id, i) => (
              <div key={i} onMouseEnter={() => isMine && cardOf(id) && setHovered({ card: cardOf(id)!, flagId: p.flagId })}>
                <CardView faceDown width="calc(var(--mh) * 0.17)" onClick={isMine && cardOf(id) ? () => openInspect(cardOf(id)!, p.flagId, null, "การ์ด Set (คว่ำ): ใช้เป็น Counter Act ได้ตอนศัตรูโจมตี") : undefined} />
              </div>
            ))}
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
                const itemCard = cardOf(p.item.cardId);
                if (inspectMode && itemCard) return openInspect(itemCard, p.flagId, p.item);
                if (!isMine && atkSels.length > 0) return;
                if (isMine && canAttackNow && p.item.state === "stand") {
                  if (linkMode) return setAtkSels(atkSels.includes(p.item.uid) ? atkSels.filter(u => u !== p.item!.uid) : [...atkSels, p.item.uid]);
                  return setAtkSels(atkSels.length === 1 && atkSels[0] === p.item.uid ? [] : [p.item.uid]);
                }
                if (sandbox) return setSbFocus({ tab: "field", side, uid: p.item.uid });
                if (itemCard) openInspect(itemCard, p.flagId, p.item, whyBlocked() ?? (p.item.state === "rest" ? `${itemCard.name} อยู่ในสถานะ Rest จะ Stand ตอนต้นเทิร์นของเจ้าของ` : game.phase !== attackPhaseName ? "ไอเทมโจมตีได้ใน Attack Phase" : undefined));
              }}
            >
              {p.item && cardOf(p.item.cardId) ? (
                <div key={p.item.uid} className="anim-call" style={{ visibility: hidden.includes(p.item.uid) ? "hidden" : "visible" }}>
                <div className="transition-transform duration-500 relative" style={{ transform: p.item.state === "rest" ? "rotate(90deg)" : "none" }} onMouseEnter={() => setHovered({ card: cardOf(p.item!.cardId)!, flagId: p.flagId, stats: statsOf(p.item!), soul: p.item!.soul.length })}>
                  <SoulStack n={p.item.soul.length} />
                  <CardView card={cardOf(p.item.cardId)!} flag={flag} width="calc(var(--mh) * 0.22)" hideText stats={statsOf(p.item)} soul={p.item.soul.length}
                    onInspect={() => openInspect(cardOf(p.item!.cardId)!, p.flagId, p.item)}
                    draggable={isMine && canAttackNow && p.item.state === "stand"}
                    onDragStart={() => { dragRef.current = { kind: "unit", uid: p.item!.uid }; if (!atkSels.includes(p.item!.uid)) setAtkSels([p.item!.uid]); }}
                    onDragEnd={() => { dragRef.current = null; }} />
                </div>
                </div>
              ) : <span className="font-display font-bold text-slate-300/40" style={{ fontSize: "calc(var(--mh) * 0.04)" }}>ไอเทม</span>}
            </div>
            {/* Buddy */}
            <div className="flex items-center justify-center" style={{ width: "calc(var(--mh) * 0.23)", aspectRatio: "63 / 88", border: "2px dashed #f59e0b88", borderRadius: 8 }}>
              {buddy ? (
                <div className={p.buddyCalledThisGame ? "opacity-40" : ""} onMouseEnter={() => setHovered({ card: buddy, flagId: p.flagId })}>
                  <CardView card={buddy} flag={flag} width="calc(var(--mh) * 0.22)" hideText onClick={() => openInspect(buddy, p.flagId, null, p.buddyCalledThisGame ? "Buddy ตัวนี้ถูก Buddy Call ไปแล้ว (ทำได้ครั้งเดียวต่อเกม)" : "Buddy ของคุณ: ลงสนามด้วยการ Buddy Call จะได้ Buddy Gift (Life +1) ครั้งเดียวต่อเกม")} onInspect={() => openInspect(buddy, p.flagId)} />
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
          const glow = chargePick ? "ring-2 ring-amber-400" : sel ? "ring-4 ring-cyan-400 -translate-y-3" : "";
          return (
            <div key={i} className={`hand-card anim-draw ${glow} rounded-lg`} style={{ ...style, animationDelay: `${Math.min(i, 8) * 45}ms` }} onMouseEnter={() => setHovered({ card, flagId: p.flagId })}>
              <CardView
                card={card} flag={flag} width={hw} hideText
                draggable={canPlayNow || (isMyTurn && game.phase === "final")}
                onDragStart={() => { dragRef.current = { kind: "hand", index: i }; setHandSel(i); }}
                onDragEnd={() => { dragRef.current = null; }}
                onInspect={() => openInspect(card, p.flagId)}
                onClick={() => {
                  if (inspectMode) return openInspect(card, p.flagId);
                  if (!isMyTurn) return openInspect(card, p.flagId, null, whyBlocked() ?? "ยังไม่ใช่เทิร์นของคุณ");
                  if (game.phase === "draw") return openInspect(card, p.flagId, null, "ตอนนี้เป็น Draw Phase — กำลังจั่วการ์ดประจำเทิร์น (กดปุ่ม 'Draw' ถ้ายังไม่จั่ว) จากนั้นจึงถึง Charge & Draw");
                  if (game.phase === "charge" && chargePick) return doCharge(i);
                  if (game.phase === "charge") return openInspect(card, p.flagId, null, "ตอนนี้เป็นช่วง Charge & Draw — กดปุ่ม 'Charge & Draw' แล้วเลือกการ์ดเพื่อใส่เกจ หรือกด 'ข้าม' เพื่อเข้า Main Phase ก่อนจึงลงการ์ดได้");
                  if (game.phase === "final" && card.type !== "Impact") return openInspect(card, p.flagId, null, "ตอนนี้เป็น Final Phase ใช้ได้เฉพาะ Impact (ลงมอนสเตอร์/ร่ายเวทได้เฉพาะ Main Phase)");
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
    if (handSel === null || !isMyTurn) return null;
    const card = cardOf(me.hand[handSel] ?? "");
    if (!card) return null;
    const empty = [0, 1, 2].filter(p => !me.monsters.some(m => m.position === p));
    const hasCast = card.autoSkills.some(s => s.trigger === "onCast");
    const counterOnly = hasCounter(card) && !hasCast && card.type !== "Monster" && card.type !== "Item";
    const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold";
    return (
      <div className="mx-auto max-w-3xl w-full bg-slate-900/95 border border-cyan-600 rounded-xl p-3 flex gap-3 items-start">
        <CardView card={card} flag={flagOf(me.flagId)} size="md" onClick={() => openInspect(card, me.flagId)} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-cyan-300">{card.name}</div>
          <div className="text-xs text-slate-400 mb-2">Cost {card.callCost} {card.callCostType}{card.type === "Monster" ? ` · Size ${card.size}` : ""}{hasCounter(card) ? " · มี Counter Act" : ""} · ลากการ์ดไปวางบนสนามได้</div>
          <div className="flex flex-wrap gap-2 items-center">
            {card.type === "Monster" && empty.map(pos => (
              <button key={pos} onClick={() => tryCall(handSel, pos)} className={`${btn} bg-cyan-600 hover:bg-cyan-500`}>ลงช่อง{POSITION_NAMES[pos]}</button>
            ))}
            {card.type === "Monster" && empty.length === 0 && <button onClick={() => tryCall(handSel, 1)} className={`${btn} bg-slate-700`}>ลงมอนสเตอร์</button>}
            {card.type === "Spell" && <button onClick={() => tryCast(handSel)} className={`${btn} ${counterOnly ? "bg-slate-700" : "bg-sky-600 hover:bg-sky-500"}`}>ร่ายเวท</button>}
            {card.type === "Item" && <button onClick={() => tryEquip(handSel)} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>ติดตั้งไอเทม</button>}
            {card.type === "Impact" && <button onClick={() => tryCast(handSel)} className={`${btn} bg-rose-600 hover:bg-rose-500`}>ใช้ Impact (Final Phase)</button>}
            {hasCounter(card) && <button onClick={() => trySet(handSel)} className={`${btn} bg-violet-600 hover:bg-violet-500`}>Set (วางคว่ำ)</button>}
            {sandbox && (<>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "dropZone", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700 flex items-center gap-1`}><Trash2 size={12} /> สุสาน</button>
              <button onClick={() => { doAction(s => sandboxMoveCard(s, mySide, "hand", "gauge", handSel)); setHandSel(null); }} className={`${btn} bg-slate-800 hover:bg-slate-700 flex items-center gap-1`}><Zap size={12} /> เกจ</button>
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
    else if (waitingCounter) hint = "รอฝั่งตรงข้ามเลือกว่าจะใช้ Counter Act หรือไม่...";
    else if (moveWindowMine) hint = "ศัตรูเริ่ม Attack Phase — คลิกมอนสเตอร์ [Move] ของคุณ แล้วเลือกช่องว่างเพื่อย้ายได้ (หรือกด 'จบช่วง Move')";
    else if (game.moveWindow === oppSide) hint = "รอฝั่งตรงข้ามเลือกว่าจะใช้ Move หรือไม่ (ก่อนเริ่มโจมตี)...";
    else if (!isMyTurn) hint = "เทิร์นของฝั่งตรงข้าม";
    else if (game.phase === "draw") hint = "Draw Phase: จั่วการ์ด 1 ใบ แล้วไป Charge & Draw";
    else if (game.phase === "charge") hint = chargePick ? "เลือกการ์ดในมือ 1 ใบเพื่อใส่เกจ (แล้วจั่ว 1)" : "Charge & Draw: ใส่การ์ดจากมือลงเกจแล้วจั่ว 1 ใบ (ข้ามได้)";
    else if (game.phase === "main") hint = handSel !== null ? "เลือกช่องว่างเพื่อลงมอนสเตอร์ หรือใช้ปุ่มด้านล่าง" : "Main: ลงมอนสเตอร์ / ติดตั้งไอเทม / ร่ายเวท / Set แล้วกด 'ไป Attack'";
    else if (game.phase === "attack") hint = moveSel ? "เลือก \"ช่องว่าง\" ที่จะ Move ไป" : atkSels.length > 0 ? `เลือกเป้าหมาย (${atkSels.length > 1 ? `Link Attack ${atkSels.length} ตัว — ` : ""}ช่องศัตรูที่เรืองแสงแดง หรือ Life/Flag) หรือลากผู้โจมตีไปวางบนเป้า` : game.attacksThisTurn === 0 && movableMonsters(game, mySide).length > 0 ? "Attack: มีมอนสเตอร์ [Move] — คลิกเพื่อ Move ไปช่องว่างก่อนโจมตีได้ หรือคลิกมอนสเตอร์ที่ Stand เพื่อโจมตี" : "Attack: คลิกมอนสเตอร์ที่ Stand เพื่อเลือกผู้โจมตี (เปิด Link Attack เพื่อเลือกหลายตัว)";
    else if (game.phase === "final") hint = "Final: ใช้ Impact ได้ แล้วกดจบเทิร์น";

    const standCount = [...me.monsters, ...(me.item ? [me.item] : [])].filter(m => m.state === "stand").length;
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

  function renderCounterModal() {
    const b = game.battle;
    if (!b || !iAmDefender || game.winner) return null;
    const atkP = game[b.attackerSide];
    const leadFc = atkP.monsters.find(m => m.uid === b.attackerUid) ?? (atkP.item?.uid === b.attackerUid ? atkP.item : null);
    const parts = b.linkUids.map(u => atkP.monsters.find(m => m.uid === u) ?? (atkP.item?.uid === u ? atkP.item : null)).filter(Boolean);
    const tgtText = b.target.kind === "fighter" ? "คุณ (ผู้เล่น)" : `มอนสเตอร์ช่อง${POSITION_NAMES[b.target.position]}ของคุณ`;
    const opts = counterOptions(game, mySide);
    const total = parts.reduce((a, fc) => { const s = statsOf(fc!); return { p: a.p + s.power, c: a.c + s.critical }; }, { p: 0, c: 0 });
    const zoneLabel = (o: CounterOption) => o.zone === "hand" ? "จากมือ" : o.zone === "set" ? "จากช่อง Set" : "ความสามารถบนสนาม";
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-sky-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-sky-300 flex items-center gap-2 mb-2"><Shield size={20} /> ศัตรูโจมตี!{parts.length > 1 ? " (Link Attack)" : ""}</h3>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {parts.map(fc => {
              const c = cardOf(fc!.cardId);
              return c ? <CardView key={fc!.uid} card={c} flag={flagOf(atkP.flagId)} size="sm" stats={statsOf(fc!)} /> : null;
            })}
            <div className="text-sm text-slate-300">
              <div>กำลังโจมตี <span className="font-bold text-white">{tgtText}</span></div>
              {leadFc && <div className="text-xs text-slate-400 mt-1">Power รวม {total.p} · Critical รวม {total.c}</div>}
              <div className="text-xs text-slate-400 mt-2">เลือกใช้ Counter Act หรือปล่อยให้ต่อสู้ตามปกติ</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {opts.map((o, k) => {
              const c = counterCardOf(game, mySide, o);
              if (!c) return null;
              return (
                <div key={k} className="flex flex-col items-center gap-1">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => doCounter(o)} onInspect={() => openInspect(c, me.flagId)} className="hover:ring-4 hover:ring-sky-400" />
                  <span className="text-[11px] text-sky-300">{zoneLabel(o)}</span>
                  <button onClick={() => doCounter(o)} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold">ใช้ Counter{o.zone === "hand" ? ` (Cost ${c.callCost})` : ""}</button>
                </div>
              );
            })}
          </div>
          <button onClick={doPassCounter} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ไม่ใช้ Counter — ต่อสู้เลย</button>
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
                <span>Cost: <b className="text-white">{card.callCostType === "Life" ? "Life" : "เกจ"} {card.callCost}</b></span>
                {card.type === "Monster" && <span>Size: <b className="text-white">{card.size}</b></span>}
                {(card.type === "Monster" || card.type === "Item" || card.type === "Impact") && (<>
                  <span>Power: <b className="text-rose-400">{st ? st.power : card.power}</b>{st && st.power !== card.power ? <span className="text-slate-500"> (ปกติ {card.power})</span> : null}</span>
                  <span>Critical: <b className="text-rose-300">{st ? st.critical : card.critical}</b></span>
                  {card.type === "Monster" && <span>Defense: <b className="text-sky-300">{st ? st.defense : card.defense}</b></span>}
                </>)}
                {card.attribute && <span className="col-span-2">สายพันธุ์: <b className="text-white">{card.attribute}</b></span>}
              </div>
              {fc && (
                <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2">
                  สถานะบนสนาม: <b className="text-white">{fc.state === "stand" ? "Stand" : "Rest"}</b>
                  {" · "}Soul: <b className="text-violet-300">{fc.soul.length}</b>
                  {fc.soul.length > 0 && <span className="inline-flex gap-1 ml-2 align-middle">{fc.soul.slice(0, 10).map((_, i) => <span key={i} className="soul-orb soul-bob" style={{ width: 12, height: 12, animationDelay: `${i * 0.15}s` }} />)}</span>}
                  {keywordValue(card, "soulguard") > 0 && <span className="ml-2 text-violet-200">🛡 Soulguard กันออกจากสนามได้อีก <b>{fc.nullified ? 0 : fc.soul.length}</b> ครั้ง{fc.nullified ? " (ถูก Nullify)" : ""}</span>}
                  {maxAttacks(card) > 1 ? <> · โจมตีแล้ว <b className="text-white">{fc.attacks}/{maxAttacks(card)}</b></> : null}
                </div>
              )}
              {cost && <div><div className="text-xs font-bold text-slate-400 mb-1">Call Cost</div><div className="text-slate-200">{cost}</div></div>}
              {(card.autoSkills.length > 0 || card.customText) ? (
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
                    {card.customText && <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-slate-200">{card.customText}</div>}
                  </div>
                </div>
              ) : lines.length === 0 && badges.length === 0 ? <div className="text-slate-500">การ์ดใบนี้ไม่มีความสามารถพิเศษ</div> : null}
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
      return (
        <div ref={menuRef} className={`${box} min-w-[220px]`}>
          <h4 className="font-bold text-cyan-400 mb-2 text-sm">{card.name} <span className="text-xs text-slate-500">(Sandbox)</span></h4>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => { doAction(s => sandboxFlipRest(s, side, fc.uid)); setMenuTarget(null); }} className={sb}><RotateCw size={12} /> Stand/Rest</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "hand", fc.uid)); setMenuTarget(null); }} className={sb}><Hand size={12} /> ไปมือ</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "dropZone", fc.uid)); setMenuTarget(null); }} className={sb}><Trash2 size={12} /> สุสาน</button>
            <button onClick={() => { doAction(s => sandboxMoveCard(s, side, "field", "gauge", fc.uid)); setMenuTarget(null); }} className={sb}><Zap size={12} /> เกจ</button>
            {!isItem && <>
              <button onClick={() => { doAction(s => sandboxAdjustPower(s, side, fc.uid, 500)); setMenuTarget(null); }} className={sb}><Plus size={12} /> Power+500</button>
              <button onClick={() => { doAction(s => sandboxAdjustPower(s, side, fc.uid, -500)); setMenuTarget(null); }} className={sb}><Minus size={12} /> Power-500</button>
              {[0, 1, 2].map(pos => (
                <button key={pos} onClick={() => { doAction(s => sandboxMoveToPosition(s, side, fc.uid, pos)); setMenuTarget(null); }} className={sb}>ย้ายไป{POSITION_NAMES[pos]}</button>
              ))}
            </>}
          </div>
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
                    <button onClick={() => doAction(s => sandboxMoveCard(s, menuTarget.side, "dropZone", "hand", i))} className="absolute -top-1 -right-1 bg-cyan-600 hover:bg-cyan-500 rounded-full p-1"><Hand size={10} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div ref={menuRef} className={`${box} min-w-[200px]`}>
        <h4 className="font-bold text-slate-300 mb-3 text-sm">กองการ์ด ({p.deck.length}) <span className="text-xs text-slate-500">(Sandbox)</span></h4>
        <div className="space-y-2">
          <button onClick={() => { doAction(s => sandboxFreeDraw(s, menuTarget.side)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><RotateCw size={14} /> จั่ว 1 ใบ</button>
          <button onClick={() => { doAction(s => sandboxMoveCard(s, menuTarget.side, "deck", "dropZone", 0)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><Trash2 size={14} /> ทิ้ง 1 ใบ</button>
          <button onClick={() => { doAction(s => sandboxMoveCard(s, menuTarget.side, "deck", "gauge", 0)); setMenuTarget(null); }} className={`${sb} w-full py-2`}><Zap size={14} /> ใส่เกจ 1 ใบ</button>
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
          <button onClick={onExit} className="mt-4 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl transition font-bold hover:scale-105">กลับเมนู</button>
          {sandbox && (
            <div>
              <button onClick={() => doAction(s => sandboxSetGame(s, { winner: null }))} className="mt-3 px-6 py-2 bg-fuchsia-700 hover:bg-fuchsia-600 rounded-xl transition font-bold text-sm">Sandbox: ยกเลิกผลแพ้ชนะ แล้วเล่นต่อ</button>
            </div>
          )}
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
            <button onClick={onExit} title="ออกจากเกม" className="btn !py-1.5 !px-3 !text-xs"><LogOut size={14} /> ออก</button>
            <div className="hidden sm:flex items-center gap-2 text-sm font-display font-bold min-w-0">
              <span className="truncate max-w-[10rem]" style={{ color: getFlagColor(flagOf(me.flagId)) }}>{flagOf(me.flagId)?.name ?? "คุณ"}</span>
              <span className="text-slate-500 text-xs">VS</span>
              <span className="truncate max-w-[10rem]" style={{ color: getFlagColor(flagOf(foe.flagId)) }}>{flagOf(foe.flagId)?.name ?? "ศัตรู"}</span>
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
            <button onClick={() => setInspectMode(v => !v)} title="โหมดดูการ์ด: คลิกการ์ดใบไหนก็ได้เพื่อดูความสามารถ (หรือคลิกขวา/ดับเบิลคลิก)" className={`btn !py-1.5 !px-2.5 !text-xs ${inspectMode ? "btn-primary" : ""}`}><Eye size={14} /> <span className="hidden md:inline">ดูการ์ด</span></button>
            <button onClick={() => setSandbox(v => !v)} title="Sandbox: เครื่องมือแก้เกมด้วยมือ" className={`btn !py-1.5 !px-2.5 !text-xs ${sandbox ? "!bg-fuchsia-700 !border-fuchsia-400/60" : ""}`}><Wrench size={14} /> <span className="hidden md:inline">Sandbox</span></button>
            <AudioControl variant="inline" />
          </div>
        </div>

        {mode === "multiplayer" && !synced && (
          <div className="text-center text-sm text-amber-300 bg-amber-900/20 border border-amber-700 rounded-lg py-2 w-full" style={{ maxWidth: "var(--mw)" }}>
            {role === "host" ? "รอเพื่อนเข้าห้องก่อน จึงจะเริ่มเล่นได้" : "กำลังเชื่อมต่อกับเจ้าของห้อง..."}
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
      {banner && <Banner key={banner.key} text={banner.text} sub={banner.sub} color={banner.color} />}
      {renderMenus()}
      {sandbox && (
        <SandboxPanel
          game={game}
          mySide={mySide}
          cardOf={cardOf}
          libraryCards={allCachedCards()}
          doAction={doAction}
          act={act}
          focus={sbFocus}
          onClose={() => setSandbox(false)}
        />
      )}
      {renderMulligan()}
      {moveWindowMine && !game.battle && !game.winner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[45] panel !rounded-2xl px-4 py-3 flex items-center gap-3 border-cyan-500/60 shadow-2xl">
          <div className="text-sm"><b className="text-cyan-300">ช่วง Move</b> — ศัตรูเริ่ม Attack Phase คุณย้ายมอนสเตอร์ [Move] ไปช่องว่างได้ก่อนเริ่มโจมตี</div>
          <button onClick={() => { act("ปิดช่วง Move ไม่ได้", st => closeMoveWindow(st, mySide)); setMoveSel(null); }} className="btn btn-primary !py-1.5 whitespace-nowrap">จบช่วง Move</button>
        </div>
      )}
      {renderCounterModal()}
      {renderInspect()}
      {renderNotice()}

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
