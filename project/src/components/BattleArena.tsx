import { useState, useRef, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Swords, Heart, Zap, Skull, LogOut, Plus, Minus, Hand, Trash2, RotateCw, Layers, Crown,
  Copy, LogIn, Users, RefreshCw, Wrench, X, Shield, Star,
} from "lucide-react";
import type { GameState, PlayerState, Card, Flag, Deck, SyncMessage, RuleSet } from "@/types";
import { DEFAULT_RULES } from "@/types";
import {
  createInitialState, setCardCache, setCardSizeCache, getCard, registerCards, setCardImage,
  callMonster, castSpell, equipItem, declareAttack, endTurn, chargeAndDraw, goToAttack, goToFinal,
  legalTargets, statsOf, counterOptions, counterAct, passCounter, maxAttacks,
  changeLife, addGauge, addLog, POSITION_NAMES,
  sandboxMoveCard, sandboxFlipRest, sandboxAdjustPower, sandboxMoveToPosition, sandboxFreeDraw, sandboxPayGauge,
  type AttackTarget,
} from "@/game/engine";
import { getFlags, getCards, getDecks } from "@/storage";
import { getFlagColor, hasCounter } from "@/game/helpers";
import { mp } from "@/game/multiplayer";
import { CardView } from "@/components/CardView";

interface Props {
  mode: "bot" | "multiplayer";
  hostDeck: Deck;
  rules?: RuleSet;
  onExit: () => void;
}

type Side = "host" | "guest";
type MenuTarget =
  | { kind: "field"; side: Side; uid: string }
  | { kind: "drop"; side: Side }
  | { kind: "deck"; side: Side }
  | null;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeGame(hDeck: Deck, gDeck: Deck, hFlag: Flag, gFlag: Flag, cards: Card[], rules: RuleSet): GameState {
  return createInitialState(
    { ...hDeck, cardIds: shuffled(hDeck.cardIds) },
    { ...gDeck, cardIds: shuffled(gDeck.cardIds) },
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

// ช่องวางการ์ดบนสนาม (อยู่นอก component เพื่อไม่ให้ถูกสร้างใหม่ทุกครั้งที่เรนเดอร์ จะได้มีอนิเมชัน Rest/Stand ลื่นๆ)
function Zone({ label, w, h, children, onClick, ring, dim }: {
  label?: string; w: string; h: string; children?: ReactNode; onClick?: () => void; ring?: string; dim?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-lg border-2 border-dashed border-slate-700/70 bg-slate-900/40 flex items-center justify-center ${onClick ? "cursor-pointer" : ""} ${ring ?? ""} ${dim ? "opacity-60" : ""}`}
      style={{ width: w, height: h }}
    >
      {label && <span className="absolute top-0.5 left-1 text-[10px] text-slate-500 pointer-events-none z-10">{label}</span>}
      {children}
    </div>
  );
}

const _remoteFlagCache: { [id: string]: Flag } = {};

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
      return tm ? myPower >= statsOf(tm).defense && statsOf(tm).power < statsOf(m).defense : false;
    });
    const pick: AttackTarget = killable ?? targets.find(t => t.kind === "fighter") ?? targets[0];
    const r = declareAttack(s, "guest", m.uid, pick);
    if (r.ok) return r.state;
  }
  return null;
}

export function botStep(s: GameState): GameState {
  if (s.winner) return s;

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
        if (card.type === "Monster" && free.length > 0) {
          const r = callMonster(state, "guest", i, free[0]);
          if (r.ok) state = r.state;
        } else if (card.type === "Item" && !state.guest.item) {
          const r = equipItem(state, "guest", i);
          if (r.ok) state = r.state;
        } else if (card.type === "Spell" && card.autoSkills.some(k => k.trigger === "onCast")) {
          const r = castSpell(state, "guest", i);
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
export function BattleArena({ mode, hostDeck, rules = DEFAULT_RULES, onExit }: Props) {
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

  const [game, setGame] = useState<GameState>(() => makeGame(hostDeck, guestDeck, hostFlag, guestFlag, allCards, rules));
  const gameRef = useRef<GameState>(game);

  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null);
  const [hovered, setHovered] = useState<{ card: Card; flagId?: string } | null>(null);
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
  const [atkSel, setAtkSel] = useState<string | null>(null);
  const [handSel, setHandSel] = useState<number | null>(null);
  const [chargePick, setChargePick] = useState(false);
  const [, setImgTick] = useState(0);

  const mySide: Side = mode === "multiplayer" ? role : "host";
  const oppSide: Side = mySide === "host" ? "guest" : "host";
  const me = game[mySide];
  const foe = game[oppSide];
  const isMyTurn = game.currentTurn === mySide && !game.winner;
  const attackPhaseName = game.rules.useAttackPhase ? "attack" : "main";
  const canAttackNow = isMyTurn && game.phase === attackPhaseName && !game.battle;
  const canPlayNow = isMyTurn && game.phase === "main" && !game.battle;
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
      if (e.key === "Escape") { setAtkSel(null); setHandSel(null); setChargePick(false); setMenuTarget(null); }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, []);

  // เปลี่ยนเฟส/เทิร์น -> ล้างตัวเลือกที่ค้างอยู่
  useEffect(() => { setAtkSel(null); setHandSel(null); setChargePick(false); }, [game.phase, game.currentTurn]);
  useEffect(() => {
    if (!atkSel) return;
    const fc = me.monsters.find(m => m.uid === atkSel) ?? (me.item?.uid === atkSel ? me.item : null);
    if (!fc || fc.state !== "stand") setAtkSel(null);
  }, [game, atkSel, me]);

  function doAction(fn: (s: GameState) => GameState) {
    if (mode === "multiplayer" && !syncedRef.current) return;
    const next = fn(gameRef.current);
    if (next === gameRef.current) return;
    next.rev = (gameRef.current.rev ?? 0) + 1;
    commit(next);
    if (mode === "multiplayer") mp.send({ type: "state", state: next });
  }

  /* ---------------- Bot ---------------- */
  useEffect(() => {
    if (mode !== "bot" || game.winner) return;
    const botDefending = !!game.battle && game.battle.attackerSide === "host";
    const botTurn = game.currentTurn === "guest" && !game.battle;
    if (!botDefending && !botTurn) return;
    const t = setTimeout(() => doAction(s => botStep(s)), botDefending ? 900 : 850);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, game]);

  /* ---------------- Actions ---------------- */
  function fail(s: GameState, prefix: string, msg: string) {
    return addLog(s, `${prefix}: ${msg}`);
  }

  function tryCall(handIndex: number, position: number) {
    doAction(s => { const r = callMonster(s, mySide, handIndex, position); return r.ok ? r.state : fail(s, "เรียกไม่ได้", r.msg); });
    setHandSel(null);
  }
  function tryCast(handIndex: number) {
    doAction(s => { const r = castSpell(s, mySide, handIndex); return r.ok ? r.state : fail(s, "ร่ายไม่ได้", r.msg); });
    setHandSel(null);
  }
  function tryEquip(handIndex: number) {
    doAction(s => { const r = equipItem(s, mySide, handIndex); return r.ok ? r.state : fail(s, "ติดตั้งไม่ได้", r.msg); });
    setHandSel(null);
  }
  function tryAttack(target: AttackTarget) {
    if (!atkSel) return;
    const uid = atkSel;
    doAction(s => { const r = declareAttack(s, mySide, uid, target); return r.ok ? r.state : fail(s, "โจมตีไม่ได้", r.msg); });
    setAtkSel(null);
  }
  function doCharge(handIndex: number | null) {
    doAction(s => { const r = chargeAndDraw(s, mySide, handIndex); return r.ok ? r.state : fail(s, "Charge ไม่ได้", r.msg); });
    setChargePick(false);
  }
  function doGoAttack() {
    doAction(s => { const r = goToAttack(s, mySide); return r.ok ? r.state : fail(s, "เปลี่ยนเฟสไม่ได้", r.msg); });
  }
  function doGoFinal() {
    doAction(s => { const r = goToFinal(s, mySide); return r.ok ? r.state : fail(s, "เปลี่ยนเฟสไม่ได้", r.msg); });
  }
  function doEndTurn() {
    doAction(s => endTurn(s));
  }
  function doCounter(handIndex: number) {
    doAction(s => { const r = counterAct(s, mySide, handIndex); return r.ok ? r.state : fail(s, "Counter ไม่ได้", r.msg); });
  }
  function doPassCounter() {
    doAction(s => { const r = passCounter(s, mySide); return r.ok ? r.state : s; });
  }
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

  /* ---------------- Render pieces ---------------- */
  const CW = "var(--cw)";
  const ZW = "calc(var(--cw) * 0.8)";

  function renderBoard(side: Side, isMine: boolean) {
    const p: PlayerState = game[side];
    const flag = flagOf(p.flagId);
    const color = getFlagColor(flag);
    const active = game.currentTurn === side && !game.winner;
    const legal = atkSel && !isMine ? legalTargets(game, mySide, atkSel) : [];
    const fighterLegal = legal.some(t => t.kind === "fighter");
    const buddy = p.buddyId ? cardOf(p.buddyId) : null;
    const slotH = "calc(var(--cw) * 1.4)";
    const backH = "calc(var(--cw) * 1.1)";

    const targetRing = "ring-4 ring-rose-500 animate-pulse cursor-crosshair";
    const slotRing = "ring-4 ring-emerald-400 animate-pulse";

    const monsterSlot = (pos: number) => {
      const m = p.monsters.find(x => x.position === pos);
      const card = m ? cardOf(m.cardId) : null;
      const isTarget = !isMine && legal.some(t => t.kind === "monster" && t.position === pos);
      const callable = isMine && canPlayNow && handSel !== null && !m && cardOf(me.hand[handSel])?.type === "Monster";
      const selected = isMine && m && atkSel === m.uid;
      return (
        <Zone
          key={pos}
          label={m ? undefined : POSITION_NAMES[pos]}
          w={CW}
          h={slotH}
          ring={isTarget ? targetRing : callable ? slotRing : selected ? "ring-4 ring-amber-400" : ""}
          onClick={() => {
            if (isTarget) return tryAttack({ kind: "monster", position: pos });
            if (callable && handSel !== null) return tryCall(handSel, pos);
            if (m && isMine) {
              if (canAttackNow && m.state === "stand") return setAtkSel(atkSel === m.uid ? null : m.uid);
              if (sandbox) return setMenuTarget({ kind: "field", side, uid: m.uid });
            } else if (m && sandbox) {
              return setMenuTarget({ kind: "field", side, uid: m.uid });
            }
          }}
        >
          {m && card && (
            <div
              className="transition-transform duration-300"
              style={{ transform: m.state === "rest" ? "rotate(90deg) scale(0.71)" : "none" }}
              onMouseEnter={() => setHovered({ card, flagId: p.flagId })}
            >
              <CardView card={card} flag={flag} width={CW} hideText stats={statsOf(m)}>
                {(m.tempPower !== 0 || m.tempCritical !== 0 || m.tempDefense !== 0) && (
                  <div className="absolute top-8 left-0 bg-cyan-500 text-white text-[10px] px-1 rounded-r font-bold">BUFF</div>
                )}
                {maxAttacks(card) > 1 && (
                  <div className="absolute bottom-7 right-0 bg-rose-600 text-white text-[10px] px-1 rounded-l font-bold">{m.attacks}/{maxAttacks(card)}</div>
                )}
              </CardView>
            </div>
          )}
        </Zone>
      );
    };

    const row1 = (
      <div className="flex gap-2 items-center" style={{ flexDirection: isMine ? "row" : "row-reverse" }}>
        {/* Flag / World */}
        <Zone label="Flag" w={ZW} h={slotH} ring={fighterLegal ? targetRing : ""} onClick={() => fighterLegal && tryAttack({ kind: "fighter" })}>
          <div className="w-full h-full rounded-md overflow-hidden relative" style={{ border: `3px solid ${color}` }}>
            {flag?.image ? <img src={flag.image} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
            <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 text-center font-display text-[11px] font-semibold truncate px-1" style={{ color }}>{flag?.name ?? "Flag"}</div>
          </div>
        </Zone>
        {monsterSlot(0)}
        {monsterSlot(1)}
        {monsterSlot(2)}
        {/* Deck */}
        <Zone label="Deck" w={ZW} h={slotH} onClick={() => sandbox && setMenuTarget({ kind: "deck", side })}>
          <CardView faceDown width={ZW}>
            <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow" style={{ fontSize: "1.8em" }}>{p.deck.length}</div>
          </CardView>
        </Zone>
      </div>
    );

    const row2 = (
      <div className="flex gap-2 items-center" style={{ flexDirection: isMine ? "row" : "row-reverse" }}>
        {/* Item */}
        <Zone
          label="Item"
          w={ZW}
          h={backH}
          ring={isMine && canAttackNow && p.item?.state === "stand" && atkSel === p.item.uid ? "ring-4 ring-amber-400" : ""}
          onClick={() => {
            if (isMine && p.item && canAttackNow && p.item.state === "stand") setAtkSel(atkSel === p.item.uid ? null : p.item.uid);
            else if (p.item && sandbox) setMenuTarget({ kind: "field", side, uid: p.item.uid });
          }}
        >
          {p.item && cardOf(p.item.cardId) && (
            <div style={{ transform: p.item.state === "rest" ? "rotate(90deg) scale(0.7)" : "none" }} className="transition-transform duration-300" onMouseEnter={() => setHovered({ card: cardOf(p.item!.cardId)!, flagId: p.flagId })}>
              <CardView card={cardOf(p.item.cardId)!} flag={flag} width={`calc(var(--cw) * 0.7)`} hideText stats={statsOf(p.item)} />
            </div>
          )}
        </Zone>
        {/* Buddy */}
        <Zone label="Buddy ★" w={CW} h={backH}>
          {buddy ? (
            <div className={p.buddyCalledThisGame ? "opacity-40" : ""} onMouseEnter={() => setHovered({ card: buddy, flagId: p.flagId })}>
              <CardView card={buddy} flag={flag} width={`calc(var(--cw) * 0.7)`} hideText />
            </div>
          ) : <span className="text-[10px] text-slate-600">ไม่มี</span>}
        </Zone>
        {/* Gauge */}
        <Zone label="Gauge" w={CW} h={backH}>
          {Array.from({ length: Math.min(p.gauge, 6) }).map((_, i) => (
            <div key={i} className="absolute rounded bg-slate-700 border border-slate-500" style={{ width: "46%", height: "62%", left: `${8 + i * 8}%`, top: `${12 + i * 4}%` }} />
          ))}
          <span className="relative z-10 font-display font-bold text-amber-300 flex items-center gap-1 drop-shadow-lg" style={{ fontSize: "calc(var(--cw) * 0.32)" }}>
            <Zap size={16} fill="currentColor" />{p.gauge}
          </span>
        </Zone>
        {/* Life */}
        <Zone label="Life" w={CW} h={backH} ring={fighterLegal ? targetRing : ""} onClick={() => fighterLegal && tryAttack({ kind: "fighter" })}>
          <span className="font-display font-bold text-rose-400 flex items-center gap-1 drop-shadow-lg" style={{ fontSize: "calc(var(--cw) * 0.45)" }}>
            <Heart size={18} fill="currentColor" />{p.life}
          </span>
          {sandbox && (
            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); doAction(s => changeLife(s, side, 1)); }} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Plus size={11} /></button>
              <button onClick={(e) => { e.stopPropagation(); doAction(s => changeLife(s, side, -1)); }} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Minus size={11} /></button>
            </div>
          )}
          {sandbox && (
            <div className="absolute bottom-0.5 left-0.5 flex gap-0.5">
              <button title="Charge +1" onClick={(e) => { e.stopPropagation(); doAction(s => addGauge(s, side, 1)); }} className="p-0.5 bg-amber-800 hover:bg-amber-600 rounded"><Zap size={11} /></button>
              <button title="จ่ายเกจ 1" onClick={(e) => { e.stopPropagation(); doAction(s => sandboxPayGauge(s, side, 1)); }} className="p-0.5 bg-slate-800 hover:bg-slate-600 rounded"><Minus size={11} /></button>
            </div>
          )}
        </Zone>
        {/* Drop */}
        <Zone label="Drop" w={ZW} h={backH} onClick={() => p.dropZone.length > 0 && setMenuTarget({ kind: "drop", side })}>
          {p.dropZone.length > 0 && cardOf(p.dropZone[p.dropZone.length - 1]) ? (
            <div className="relative opacity-80">
              <CardView card={cardOf(p.dropZone[p.dropZone.length - 1])} flag={flagOf(p.flagId)} width={`calc(var(--cw) * 0.62)`} hideText />
              <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white drop-shadow bg-black/40 rounded" style={{ fontSize: "1.4em" }}>{p.dropZone.length}</div>
            </div>
          ) : <Skull size={18} className="text-slate-600" />}
        </Zone>
      </div>
    );

    return (
      <div
        className="rounded-2xl p-2 flex flex-col gap-2 items-center transition-all"
        style={{
          flexDirection: isMine ? "column" : "column-reverse",
          border: `2px solid ${active ? color : "#1e293b"}`,
          boxShadow: active ? `0 0 24px ${color}40` : "none",
          background: `linear-gradient(180deg, ${color}10, #0b1220)`,
        }}
      >
        {row1}
        {row2}
      </div>
    );
  }

  function renderHand(isMine: boolean) {
    const p = isMine ? me : foe;
    const flag = flagOf(p.flagId);
    const hw = isMine ? "calc(var(--cw) * 0.82)" : "calc(var(--cw) * 0.45)";
    const overlap = p.hand.length > 7 ? "-0.35" : p.hand.length > 5 ? "-0.15" : "0.1";
    return (
      <div className="flex justify-center items-end min-h-[3.5rem] px-2" style={{ paddingTop: isMine ? "1.2rem" : 0 }}>
        {p.hand.length === 0 && <span className="text-slate-600 text-xs py-3">ไม่มีการ์ดในมือ</span>}
        {p.hand.map((cid, i) => {
          const style: CSSProperties = { marginLeft: i === 0 ? 0 : `calc(${hw} * ${overlap})` };
          if (!isMine) return <CardView key={i} faceDown width={hw} style={style} />;
          const card = cardOf(cid);
          if (!card) return <CardView key={i} faceDown width={hw} style={style} />;
          const sel = handSel === i;
          const glow = chargePick ? "ring-2 ring-amber-400" : sel ? "ring-4 ring-cyan-400 -translate-y-3" : "";
          return (
            <div key={i} className={`hand-card ${glow} rounded-lg`} style={style}
              onMouseEnter={() => setHovered({ card, flagId: p.flagId })}>
              <CardView
                card={card} flag={flag} width={hw} hideText
                onClick={() => {
                  if (!isMyTurn) return;
                  if (game.phase === "charge" && chargePick) return doCharge(i);
                  if (game.phase === "charge") return;
                  setHandSel(sel ? null : i);
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // แถบเลือกการ์ดในมือ: โชว์การ์ดใหญ่ + ปุ่มใช้งาน
  function renderHandBar() {
    if (handSel === null || !isMyTurn) return null;
    const card = cardOf(me.hand[handSel] ?? "");
    if (!card) return null;
    const empty = [0, 1, 2].filter(p => !me.monsters.some(m => m.position === p));
    const hasCast = card.autoSkills.some(s => s.trigger === "onCast");
    const counterOnly = hasCounter(card) && !hasCast && card.type !== "Monster" && card.type !== "Item";
    const inMain = game.phase === "main";
    const btn = "px-3 py-1.5 rounded-lg text-sm font-semibold";
    return (
      <div className="mx-auto max-w-3xl w-full bg-slate-900/95 border border-cyan-600 rounded-xl p-3 flex gap-3 items-start">
        <CardView card={card} flag={flagOf(me.flagId)} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-cyan-300">{card.name}</div>
          <div className="text-xs text-slate-400 mb-2">Cost {card.callCost} {card.callCostType}{card.type === "Monster" ? ` · Size ${card.size}` : ""}{hasCounter(card) ? " · มี Counter Act" : ""}</div>
          {!inMain && <p className="text-xs text-amber-300 mb-2">ลงการ์ด/ร่ายเวทได้เฉพาะ Main Phase{card.type === "Impact" ? " (Impact ใช้ใน Final Phase)" : ""}</p>}
          <div className="flex flex-wrap gap-2 items-center">
            {card.type === "Monster" && empty.map(pos => (
              <button key={pos} disabled={!inMain} onClick={() => tryCall(handSel, pos)} className={`${btn} ${inMain ? "bg-cyan-600 hover:bg-cyan-500" : "bg-slate-700 opacity-50"}`}>ลงช่อง{POSITION_NAMES[pos]}</button>
            ))}
            {card.type === "Monster" && empty.length === 0 && <span className="text-xs text-slate-400">ช่องเต็ม</span>}
            {card.type === "Spell" && (
              <button disabled={!inMain || counterOnly} onClick={() => tryCast(handSel)} className={`${btn} ${inMain && !counterOnly ? "bg-sky-600 hover:bg-sky-500" : "bg-slate-700 opacity-50"}`}>ร่ายเวท</button>
            )}
            {card.type === "Item" && (
              <button disabled={!inMain} onClick={() => tryEquip(handSel)} className={`${btn} ${inMain ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-700 opacity-50"}`}>ติดตั้งไอเทม</button>
            )}
            {card.type === "Impact" && (
              <button disabled={game.phase !== "final" || counterOnly} onClick={() => tryCast(handSel)} className={`${btn} ${game.phase === "final" && !counterOnly ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-700 opacity-50"}`}>ใช้ Impact</button>
            )}
            {counterOnly && <span className="text-xs text-sky-300">ใบนี้เป็น Counter Act ใช้ตอนศัตรูโจมตี</span>}
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
      { key: "charge", label: "Charge & Draw" },
      { key: "main", label: "Main" },
      ...(game.rules.useAttackPhase ? [{ key: "attack" as const, label: "Attack" }] : []),
      { key: "final", label: "Final" },
    ];
    const turnColor = getFlagColor(flagOf(game[game.currentTurn].flagId));
    let hint = "";
    if (game.winner) hint = "";
    else if (waitingCounter) hint = "รอฝั่งตรงข้ามเลือกว่าจะใช้ Counter Act หรือไม่...";
    else if (!isMyTurn) hint = "เทิร์นของฝั่งตรงข้าม";
    else if (game.phase === "charge") hint = chargePick ? "เลือกการ์ดในมือ 1 ใบเพื่อใส่เกจ (แล้วจั่ว 1)" : "Charge & Draw: ใส่การ์ดจากมือลงเกจแล้วจั่ว 1 ใบ (ข้ามได้)";
    else if (game.phase === "main") hint = handSel !== null ? "เลือกช่องว่างเพื่อลงมอนสเตอร์ หรือใช้ปุ่มด้านล่าง" : "Main: ลงมอนสเตอร์ / ติดตั้งไอเทม / ร่ายเวท แล้วกด 'ไป Attack'";
    else if (game.phase === "attack" || !game.rules.useAttackPhase && game.phase === "main") hint = atkSel ? "เลือกเป้าหมาย: ช่องศัตรูที่เรืองแสงแดง หรือ Life/Flag ของศัตรู" : "Attack: คลิกมอนสเตอร์ที่ Stand เพื่อเลือกผู้โจมตี";
    else if (game.phase === "final") hint = "Final: ใช้ Impact ได้ แล้วกดจบเทิร์น";

    const b = "px-3 py-1.5 rounded-lg text-sm font-bold";
    return (
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-3 py-2 flex flex-wrap items-center justify-center gap-2">
        <span className="font-display font-bold text-sm" style={{ color: turnColor }}>เทิร์น {game.turn} · {game.currentTurn === mySide ? "ของคุณ" : "ฝั่งตรงข้าม"}</span>
        <div className="flex gap-1">
          {phases.map(ph => (
            <span key={ph.key} className={`px-2.5 py-1 rounded-full text-xs border ${game.phase === ph.key ? "bg-cyan-600/30 border-cyan-400 text-cyan-200 font-bold" : "border-slate-700 text-slate-500"}`}>{ph.label}</span>
          ))}
        </div>
        {isMyTurn && !game.battle && game.phase === "charge" && (<>
          <button onClick={() => setChargePick(v => !v)} className={`${b} ${chargePick ? "bg-amber-400 text-slate-900" : "bg-amber-600 hover:bg-amber-500"}`}>{chargePick ? "เลือกการ์ด..." : "Charge & Draw"}</button>
          <button onClick={() => doCharge(null)} className={`${b} bg-slate-700 hover:bg-slate-600`}>ข้าม</button>
        </>)}
        {isMyTurn && !game.battle && game.phase === "main" && game.rules.useAttackPhase && (
          <button onClick={doGoAttack} className={`${b} bg-rose-600 hover:bg-rose-500 flex items-center gap-1`}><Swords size={14} /> ไป Attack Phase</button>
        )}
        {isMyTurn && !game.battle && (game.phase === "main" || game.phase === "attack") && (
          <button onClick={doGoFinal} className={`${b} bg-fuchsia-700 hover:bg-fuchsia-600`}>ไป Final Phase</button>
        )}
        {isMyTurn && !game.battle && game.phase !== "charge" && (
          <button onClick={doEndTurn} className={`${b} bg-amber-600 hover:bg-amber-500`}>จบเทิร์น</button>
        )}
        {atkSel && <button onClick={() => setAtkSel(null)} className={`${b} bg-slate-700 hover:bg-slate-600 flex items-center gap-1`}><X size={14} /> ยกเลิกเลือก</button>}
        {hint && <div className="basis-full text-center text-xs text-slate-300">{hint}</div>}
      </div>
    );
  }

  // หน้าต่าง Counter Act ของฝั่งที่ถูกโจมตี
  function renderCounterModal() {
    const b = game.battle;
    if (!b || !iAmDefender || game.winner) return null;
    const atkP = game[b.attackerSide];
    const atkFc = atkP.monsters.find(m => m.uid === b.attackerUid) ?? (atkP.item?.uid === b.attackerUid ? atkP.item : null);
    const atkCard = atkFc ? cardOf(atkFc.cardId) : null;
    const tgtText = b.target.kind === "fighter" ? "คุณ (ผู้เล่น)" : `มอนสเตอร์ช่อง${POSITION_NAMES[b.target.position]}ของคุณ`;
    const opts = counterOptions(game, mySide);
    return (
      <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border-2 border-sky-500 rounded-2xl p-5 max-w-3xl w-full max-h-[92vh] overflow-y-auto">
          <h3 className="font-display text-xl font-bold text-sky-300 flex items-center gap-2 mb-1"><Shield size={20} /> ศัตรูโจมตี!</h3>
          <div className="flex items-center gap-4 mb-4">
            {atkCard && atkFc && <CardView card={atkCard} flag={flagOf(atkP.flagId)} size="md" stats={statsOf(atkFc)} />}
            <div className="text-sm text-slate-300">
              <div><span className="font-bold text-rose-300">{atkCard?.name}</span> กำลังโจมตี <span className="font-bold text-white">{tgtText}</span></div>
              {atkFc && <div className="text-xs text-slate-400 mt-1">Power {statsOf(atkFc).power} · Critical {statsOf(atkFc).critical}</div>}
              <div className="text-xs text-slate-400 mt-2">เลือกใช้ Counter Act จากมือ หรือปล่อยให้ต่อสู้ตามปกติ</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            {opts.map(i => {
              const c = cardOf(me.hand[i]);
              if (!c) return null;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <CardView card={c} flag={flagOf(me.flagId)} size="md" onClick={() => doCounter(i)} className="hover:ring-4 hover:ring-sky-400" />
                  <button onClick={() => doCounter(i)} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold">ใช้ Counter (Cost {c.callCost})</button>
                </div>
              );
            })}
          </div>
          <button onClick={doPassCounter} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ไม่ใช้ Counter — ต่อสู้เลย</button>
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
                  <CardView card={c} flag={flagOf(c.flagId) ?? flagOf(p.flagId)} size="sm" />
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
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <Crown size={72} className="mx-auto text-amber-400 mb-4" />
          <h2 className="font-display text-5xl font-bold mb-2" style={{ color: myWin ? "#22d3ee" : "#f43f5e" }}>{myWin ? "ชนะ!" : "แพ้!"}</h2>
          <p className="text-slate-400 mb-2">{game.log[game.log.length - 1]}</p>
          <button onClick={onExit} className="mt-4 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl transition font-bold">กลับเมนู</button>
        </div>
      </div>
    );
  }

  const previewFlag = hovered ? flagOf(hovered.flagId ?? hovered.card.flagId) : undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col lg:flex-row" style={{ "--cw": "min(8.6vw, 11.2vh)" } as CSSProperties}>
      {/* Main column */}
      <div className="flex-1 min-w-0 p-2 flex flex-col gap-2">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-1"><LogOut size={14} /> ออก</button>
            {mode === "bot" && (
              <select value={guestDeckId} onChange={e => changeBotDeck(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">
                {allDecks.map(d => <option key={d.id} value={d.id}>บอทใช้: {d.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode === "multiplayer" && !connected && (
              <button onClick={() => setShowRoomDialog(true)} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm flex items-center gap-1"><Users size={14} /> เชื่อมต่อเพื่อน</button>
            )}
            {mode === "multiplayer" && connected && (<>
              <span className="text-xs text-green-400">● ห้อง {roomId}</span>
              <button onClick={requestSync} title="ซิงค์เกมกับเพื่อนใหม่" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-1"><RefreshCw size={14} /> ซิงค์</button>
            </>)}
            <button onClick={() => setSandbox(v => !v)} title="เครื่องมือแก้เกมด้วยมือ" className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${sandbox ? "bg-fuchsia-700 hover:bg-fuchsia-600" : "bg-slate-800 hover:bg-slate-700"}`}><Wrench size={14} /> Sandbox {sandbox ? "ON" : "OFF"}</button>
          </div>
        </div>

        {mode === "multiplayer" && !synced && (
          <div className="text-center text-sm text-amber-300 bg-amber-900/20 border border-amber-700 rounded-lg py-2">
            {role === "host" ? "รอเพื่อนเข้าห้องก่อน จึงจะเริ่มเล่นได้" : "กำลังเชื่อมต่อกับเจ้าของห้อง..."}
          </div>
        )}
        {mode === "multiplayer" && mpStatus && <div className="text-center text-xs text-slate-500">{mpStatus}</div>}

        {/* Opponent */}
        {renderHand(false)}
        {renderBoard(oppSide, false)}

        {renderPhaseStrip()}

        {/* Me */}
        {renderBoard(mySide, true)}
        {renderHandBar()}
        {renderHand(true)}
      </div>

      {/* Sidebar: card preview + log */}
      <aside className="lg:w-80 lg:min-h-screen shrink-0 bg-slate-900/70 border-t lg:border-t-0 lg:border-l border-slate-800 p-3 flex flex-col gap-3">
        <div className="flex justify-center">
          {hovered ? (
            <CardView card={hovered.card} flag={previewFlag} size="xl" />
          ) : (
            <div className="w-[288px] max-w-full aspect-[63/88] rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-sm text-center p-6">ชี้การ์ดเพื่อดูรายละเอียดแบบเต็ม</div>
          )}
        </div>
        <div className="flex-1 min-h-[8rem] max-h-64 lg:max-h-none overflow-y-auto bg-slate-950/60 rounded-xl border border-slate-800 p-2">
          <h4 className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Star size={10} /> Battle Log</h4>
          {[...game.log].slice(-30).reverse().map((l, i) => (
            <div key={i} className={`text-xs py-0.5 ${i === 0 ? "text-white" : "text-slate-400"}`}>{l}</div>
          ))}
        </div>
      </aside>

      {renderMenus()}
      {renderCounterModal()}

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
