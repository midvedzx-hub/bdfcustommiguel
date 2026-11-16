import { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, ChevronUp, Wrench, Trash2, RotateCw, Search } from "lucide-react";
import type { Card, GameState, FieldCard } from "@/types";
import {
  POSITION_NAMES,
  sandboxMove, sandboxSpawn, sandboxRemoveCard, sandboxEditField, sandboxAdjustStat,
  sandboxSetPlayer, sandboxSetGame, sandboxStandAll, sandboxClearBuffs, sandboxShuffleDeck,
  sandboxSwapSlot, sandboxFreeDraw, sandboxPayGauge,
  type Side, type Result, type SbDest, type SbRef,
} from "@/game/engine";

export type SbTab = "overview" | "zones" | "field" | "library";
export type SbListZone = "hand" | "deck" | "gauge" | "drop" | "set";
export type SbFocus = { tab: SbTab; side: Side; zone?: SbListZone; uid?: string };

interface Props {
  game: GameState;
  mySide: Side;
  cardOf: (id: string) => Card | undefined;
  libraryCards: Card[];
  doAction: (fn: (s: GameState) => GameState) => void;
  act: (title: string, fn: (s: GameState) => Result) => boolean;
  focus: SbFocus | null;
  onClose: () => void;
}

const ZONE_LABEL: Record<SbListZone, string> = { hand: "มือ", deck: "เด็ค", gauge: "เกจ", drop: "สุสาน", set: "Set" };
const PHASES: { v: GameState["phase"]; l: string }[] = [
  { v: "draw", l: "Draw" }, { v: "charge", l: "Charge" }, { v: "main", l: "Main" }, { v: "attack", l: "Attack" }, { v: "final", l: "Final" },
];
const btn = "px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] leading-tight";
const btnOn = "px-2 py-1 rounded bg-fuchsia-700 hover:bg-fuchsia-600 border border-fuchsia-400/60 text-[11px] leading-tight";
const sectionTitle = "text-[11px] font-bold text-fuchsia-300 mb-1";

function Thumb({ card, id, selected, onClick, badge }: { card?: Card; id: string; selected?: boolean; onClick?: () => void; badge?: string }) {
  return (
    <button
      onClick={onClick}
      title={card?.name ?? id}
      className={`relative w-12 h-[68px] shrink-0 rounded border overflow-hidden bg-slate-800 ${selected ? "border-fuchsia-400 ring-2 ring-fuchsia-400" : "border-slate-600 hover:border-slate-400"}`}
    >
      {card?.image ? <img src={card.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-400 p-0.5 text-center">{card?.name ?? id.slice(0, 5)}</div>}
      <div className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] truncate px-0.5">{card?.name ?? "?"}</div>
      {badge && <div className="absolute top-0 left-0 bg-fuchsia-700/90 text-[8px] px-0.5 rounded-br">{badge}</div>}
    </button>
  );
}

// แถบเลือกปลายทาง: ใช้ทั้งย้ายการ์ด / สร้างการ์ดจากคลัง
function MoveBar({ game, defaultSide, mySide, cardOf, onMove, onRemove, label }: {
  game: GameState; defaultSide: Side; mySide: Side; cardOf: (id: string) => Card | undefined;
  onMove: (to: SbDest) => void; onRemove?: () => void; label: string;
}) {
  const [destSide, setDestSide] = useState<Side>(defaultSide);
  const [soulHost, setSoulHost] = useState("");
  useEffect(() => setDestSide(defaultSide), [defaultSide]);
  const dp = game[destSide];
  const hosts = [...dp.monsters.map(m => ({ uid: m.uid, cardId: m.cardId })), ...(dp.item ? [{ uid: dp.item.uid, cardId: dp.item.cardId }] : [])];
  const hostUid = hosts.some(h => h.uid === soulHost) ? soulHost : hosts[0]?.uid ?? "";
  const d = (zone: SbDest["zone"], extra: Partial<SbDest> = {}): SbDest => ({ side: destSide, zone, ...extra });

  return (
    <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-fuchsia-500/40 space-y-1.5">
      <div className="font-bold text-fuchsia-200 truncate">{label}</div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">ไปที่ฝั่ง:</span>
        <button className={destSide === mySide ? btnOn : btn} onClick={() => setDestSide(mySide)}>เรา</button>
        <button className={destSide !== mySide ? btnOn : btn} onClick={() => setDestSide(mySide === "host" ? "guest" : "host")}>คู่ต่อสู้</button>
      </div>
      <div className="flex flex-wrap gap-1">
        <button className={btn} onClick={() => onMove(d("hand"))}>มือ</button>
        <button className={btn} onClick={() => onMove(d("deck"))}>เด็ค (บนสุด)</button>
        <button className={btn} onClick={() => onMove(d("deck", { deckBottom: true }))}>เด็ค (ล่างสุด)</button>
        <button className={btn} onClick={() => onMove(d("gauge"))}>เกจ</button>
        <button className={btn} onClick={() => onMove(d("drop"))}>สุสาน</button>
        <button className={btn} onClick={() => onMove(d("set"))}>Set</button>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-slate-400">ลงสนาม:</span>
        {[0, 1, 2].map(pos => <button key={pos} className={btn} onClick={() => onMove(d("monster", { pos }))}>{POSITION_NAMES[pos]}</button>)}
        <button className={btn} onClick={() => onMove(d("item"))}>ช่องไอเทม</button>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-slate-400">ใส่ Soul ของ:</span>
        {hosts.length === 0 ? <span className="text-slate-500">(ฝั่งนี้ไม่มีการ์ดบนสนาม)</span> : (<>
          <select value={hostUid} onChange={e => setSoulHost(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 max-w-[140px]">
            {hosts.map(h => <option key={h.uid} value={h.uid}>{cardOf(h.cardId)?.name ?? "?"}</option>)}
          </select>
          <button className={btn} onClick={() => onMove(d("soul", { uid: hostUid }))}>ใส่ Soul</button>
        </>)}
      </div>
      {onRemove && (
        <button className="px-2 py-1 rounded bg-red-900 hover:bg-red-800 border border-red-500/50 text-[11px] flex items-center gap-1" onClick={onRemove}>
          <Trash2 size={11} /> ลบออกจากเกม
        </button>
      )}
    </div>
  );
}

function NumRow({ label, value, steps, onStep, onReset }: { label: string; value: number; steps: number[]; onStep: (d: number) => void; onReset?: () => void }) {
  const neg = [...steps].reverse().map(s => -s);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="w-16 text-slate-300">{label}</span>
      {neg.map(d => <button key={d} className={btn} onClick={() => onStep(d)}>{d}</button>)}
      <span className="min-w-[44px] text-center font-bold text-white">{value}</span>
      {steps.map(d => <button key={d} className={btn} onClick={() => onStep(d)}>+{d}</button>)}
      {onReset && <button className={btn} onClick={onReset} title="รีเซ็ต"><RotateCw size={10} /></button>}
    </div>
  );
}

export function SandboxPanel({ game, mySide, cardOf, libraryCards, doAction, act, focus, onClose }: Props) {
  const [tab, setTab] = useState<SbTab>("overview");
  const [side, setSide] = useState<Side>(mySide);
  const [zone, setZone] = useState<SbListZone>("hand");
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [selUid, setSelUid] = useState<string | null>(null);
  const [selSoul, setSelSoul] = useState<number | null>(null);
  const [selLib, setSelLib] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!focus) return;
    setTab(focus.tab);
    setSide(focus.side);
    if (focus.zone) setZone(focus.zone);
    setSelIdx(null);
    setSelSoul(null);
    setSelUid(focus.uid ?? null);
    setCollapsed(false);
  }, [focus]);

  const p = game[side];
  const oppSide: Side = mySide === "host" ? "guest" : "host";
  const sideName = (s: Side) => (s === mySide ? "ฝั่งเรา" : "ฝั่งคู่ต่อสู้");

  const zoneCards: string[] = zone === "hand" ? p.hand : zone === "deck" ? p.deck : zone === "gauge" ? p.gaugePile : zone === "drop" ? p.dropZone : p.setZone;
  const fieldCards: FieldCard[] = [...[...p.monsters].sort((a, b) => a.position - b.position), ...(p.item ? [p.item] : [])];
  const selFc = fieldCards.find(f => f.uid === selUid) ?? null;
  const selFcIsItem = !!selFc && p.item?.uid === selFc.uid;

  const lib = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...libraryCards].sort((a, b) => a.name.localeCompare(b.name));
    return (q ? list.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)) : list).slice(0, 80);
  }, [libraryCards, search]);

  const run = (fn: (s: GameState) => Result) => act("Sandbox", fn);
  const setLife = (d: number) => doAction(s => sandboxSetPlayer(s, side, { life: s[side].life + d }));

  const tabBtn = (t: SbTab, l: string) => (
    <button key={t} onClick={() => setTab(t)} className={`flex-1 ${tab === t ? btnOn : btn}`}>{l}</button>
  );

  return (
    <div className="fixed right-2 bottom-2 z-40 w-[min(400px,96vw)] max-h-[80vh] flex flex-col rounded-xl border border-fuchsia-500/60 bg-slate-950/95 backdrop-blur shadow-2xl text-white text-xs">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-fuchsia-500/30">
        <Wrench size={14} className="text-fuchsia-300" />
        <span className="font-bold text-fuchsia-200">Sandbox</span>
        <span className="text-slate-500 hidden sm:inline">แก้เกมได้ทุกอย่าง</span>
        <div className="ml-auto flex items-center gap-1">
          <button className={side === mySide ? btnOn : btn} onClick={() => { setSide(mySide); setSelIdx(null); setSelUid(null); setSelSoul(null); }}>เรา</button>
          <button className={side === oppSide ? btnOn : btn} onClick={() => { setSide(oppSide); setSelIdx(null); setSelUid(null); setSelSoul(null); }}>คู่ต่อสู้</button>
          <button className={btn} onClick={() => setCollapsed(v => !v)} title={collapsed ? "ขยาย" : "ย่อ"}>{collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
          <button className={btn} onClick={onClose} title="ปิด Sandbox"><X size={12} /></button>
        </div>
      </div>

      {!collapsed && (<>
        <div className="flex gap-1 p-1.5 border-b border-slate-800">
          {tabBtn("overview", "ภาพรวม")}
          {tabBtn("zones", "โซนการ์ด")}
          {tabBtn("field", "สนาม")}
          {tabBtn("library", "คลังการ์ด")}
        </div>

        <div className="p-2 overflow-y-auto space-y-3">
          <div className="text-slate-400">กำลังแก้: <b className="text-fuchsia-300">{sideName(side)}</b></div>

          {tab === "overview" && (<>
            <div>
              <div className={sectionTitle}>ผู้เล่น</div>
              <div className="space-y-1">
                <NumRow label="Life" value={p.life} steps={[1, 5]} onStep={setLife} />
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="w-16 text-slate-300">เกจ</span>
                  <span className="min-w-[44px] text-center font-bold">{p.gauge}</span>
                  <button className={btn} onClick={() => run(s => sandboxMove(s, { side, zone: "deck", index: 0 }, { side, zone: "gauge" }))}>Charge +1 (เด็ค→เกจ)</button>
                  <button className={btn} onClick={() => doAction(s => sandboxPayGauge(s, side, 1))}>จ่ายเกจ 1</button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="w-16 text-slate-300">เด็ค ({p.deck.length})</span>
                  <button className={btn} onClick={() => doAction(s => sandboxFreeDraw(s, side))}>จั่ว 1</button>
                  <button className={btn} onClick={() => doAction(s => sandboxShuffleDeck(s, side))}>สับเด็ค</button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button className={p.buddyCalledThisGame ? btnOn : btn} onClick={() => doAction(s => sandboxSetPlayer(s, side, { buddyCalledThisGame: !s[side].buddyCalledThisGame }))}>Buddy Call แล้ว</button>
                  <button className={p.soulguardOff ? btnOn : btn} onClick={() => doAction(s => sandboxSetPlayer(s, side, { soulguardOff: !s[side].soulguardOff }))}>ปิด Soulguard อัตโนมัติ</button>
                </div>
              </div>
            </div>

            <div>
              <div className={sectionTitle}>เกม (มีผลทั้งสองฝั่ง)</div>
              <div className="space-y-1">
                <NumRow label="เทิร์นที่" value={game.turn} steps={[1]} onStep={d => doAction(s => sandboxSetGame(s, { turn: s.turn + d }))} />
                <NumRow label="โจมตีไปแล้ว" value={game.attacksThisTurn} steps={[1]} onStep={d => doAction(s => sandboxSetGame(s, { attacksThisTurn: s.attacksThisTurn + d }))} onReset={() => doAction(s => sandboxSetGame(s, { attacksThisTurn: 0 }))} />
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="w-16 text-slate-300">ตาของ</span>
                  <button className={game.currentTurn === mySide ? btnOn : btn} onClick={() => doAction(s => sandboxSetGame(s, { currentTurn: mySide }))}>เรา</button>
                  <button className={game.currentTurn === oppSide ? btnOn : btn} onClick={() => doAction(s => sandboxSetGame(s, { currentTurn: oppSide }))}>คู่ต่อสู้</button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="w-16 text-slate-300">เฟส</span>
                  {PHASES.map(ph => <button key={ph.v} className={game.phase === ph.v ? btnOn : btn} onClick={() => doAction(s => sandboxSetGame(s, { phase: ph.v }))}>{ph.l}</button>)}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button className={btn} onClick={() => doAction(s => sandboxSetGame(s, { clearBattle: true }))}>ยกเลิกการโจมตี/Counter ที่ค้าง</button>
                  <button className={btn} onClick={() => doAction(s => sandboxSetGame(s, { winner: mySide }))}>ให้เราชนะ</button>
                  <button className={btn} onClick={() => doAction(s => sandboxSetGame(s, { winner: oppSide }))}>ให้คู่ต่อสู้ชนะ</button>
                </div>
              </div>
            </div>

            <div>
              <div className={sectionTitle}>สนามของ{sideName(side)}</div>
              <div className="flex gap-1 flex-wrap">
                <button className={btn} onClick={() => doAction(s => sandboxStandAll(s, side))}>Stand ทุกใบ + รีเซ็ตจำนวนโจมตี</button>
                <button className={btn} onClick={() => doAction(s => sandboxClearBuffs(s, side))}>ล้างบัฟชั่วคราว</button>
              </div>
            </div>
          </>)}

          {tab === "zones" && (<>
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(ZONE_LABEL) as SbListZone[]).map(z => {
                const n = z === "hand" ? p.hand.length : z === "deck" ? p.deck.length : z === "gauge" ? p.gaugePile.length : z === "drop" ? p.dropZone.length : p.setZone.length;
                return <button key={z} className={zone === z ? btnOn : btn} onClick={() => { setZone(z); setSelIdx(null); }}>{ZONE_LABEL[z]} ({n})</button>;
              })}
            </div>
            {zone === "deck" && <div className="text-slate-500">ลำดับ #1 = ใบบนสุดของเด็ค (ใบที่จะจั่วต่อไป)</div>}
            {zoneCards.length === 0 ? <div className="text-slate-500 py-3 text-center">ไม่มีการ์ดในโซนนี้</div> : (
              <div className="flex flex-wrap gap-1.5 max-h-[240px] overflow-y-auto">
                {zoneCards.map((id, i) => (
                  <Thumb key={`${i}-${id}`} id={id} card={cardOf(id)} badge={zone === "deck" ? `#${i + 1}` : undefined} selected={selIdx === i} onClick={() => setSelIdx(selIdx === i ? null : i)} />
                ))}
              </div>
            )}
            {selIdx !== null && zoneCards[selIdx] !== undefined && (
              <MoveBar
                game={game} mySide={mySide} defaultSide={side} cardOf={cardOf}
                label={`ย้าย: ${cardOf(zoneCards[selIdx])?.name ?? "การ์ด"} (${sideName(side)} / ${ZONE_LABEL[zone]})`}
                onMove={to => { const ref: SbRef = { side, zone, index: selIdx }; if (run(s => sandboxMove(s, ref, to))) setSelIdx(null); }}
                onRemove={() => { const ref: SbRef = { side, zone, index: selIdx }; if (run(s => sandboxRemoveCard(s, ref))) setSelIdx(null); }}
              />
            )}
          </>)}

          {tab === "field" && (<>
            {fieldCards.length === 0 ? <div className="text-slate-500 py-3 text-center">ไม่มีการ์ดบนสนาม (ใช้แท็บ 'โซนการ์ด' หรือ 'คลังการ์ด' เพื่อวางการ์ด)</div> : (
              <div className="flex flex-wrap gap-1.5">
                {fieldCards.map(f => (
                  <Thumb key={f.uid} id={f.cardId} card={cardOf(f.cardId)} badge={p.item?.uid === f.uid ? "ไอเทม" : POSITION_NAMES[f.position]} selected={selUid === f.uid} onClick={() => { setSelUid(selUid === f.uid ? null : f.uid); setSelSoul(null); }} />
                ))}
              </div>
            )}

            {selFc && (<div className="space-y-2 p-2 rounded-lg bg-slate-900 border border-slate-700">
              <div className="font-bold text-fuchsia-200">{cardOf(selFc.cardId)?.name ?? "การ์ด"} <span className="text-slate-500 font-normal">({selFc.state === "rest" ? "Rest" : "Stand"})</span></div>
              <div className="flex gap-1 flex-wrap">
                <button className={btn} onClick={() => doAction(s => sandboxEditField(s, side, selFc.uid, { state: selFc.state === "stand" ? "rest" : "stand" }))}>สลับ Stand/Rest</button>
                <button className={selFc.nullified ? btnOn : btn} onClick={() => doAction(s => sandboxEditField(s, side, selFc.uid, { nullified: !selFc.nullified }))}>Nullify</button>
                <button className={selFc.guardUsed ? btnOn : btn} onClick={() => doAction(s => sandboxEditField(s, side, selFc.uid, { guardUsed: !selFc.guardUsed }))}>ใช้ Guard แล้ว</button>
              </div>
              <NumRow label="Power" value={selFc.tempPower} steps={[1000, 5000]} onStep={d => doAction(s => sandboxAdjustStat(s, side, selFc.uid, "tempPower", d))} onReset={() => doAction(s => sandboxEditField(s, side, selFc.uid, { tempPower: 0 }))} />
              <NumRow label="Defense" value={selFc.tempDefense} steps={[1000, 5000]} onStep={d => doAction(s => sandboxAdjustStat(s, side, selFc.uid, "tempDefense", d))} onReset={() => doAction(s => sandboxEditField(s, side, selFc.uid, { tempDefense: 0 }))} />
              <NumRow label="Critical" value={selFc.tempCritical} steps={[1]} onStep={d => doAction(s => sandboxAdjustStat(s, side, selFc.uid, "tempCritical", d))} onReset={() => doAction(s => sandboxEditField(s, side, selFc.uid, { tempCritical: 0 }))} />
              <NumRow label="โจมตีแล้ว" value={selFc.attacks} steps={[1]} onStep={d => doAction(s => sandboxEditField(s, side, selFc.uid, { attacks: Math.max(0, selFc.attacks + d) }))} onReset={() => doAction(s => sandboxEditField(s, side, selFc.uid, { attacks: 0 }))} />
              {!selFcIsItem && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="w-16 text-slate-300">สลับช่อง</span>
                  {[0, 1, 2].map(pos => <button key={pos} className={selFc.position === pos ? btnOn : btn} onClick={() => doAction(s => sandboxSwapSlot(s, side, selFc.uid, pos))}>{POSITION_NAMES[pos]}</button>)}
                </div>
              )}

              <div>
                <div className={sectionTitle}>Soul ({selFc.soul.length})</div>
                {selFc.soul.length === 0 ? <div className="text-slate-500">ไม่มี Soul (เพิ่มได้จากแถบย้ายการ์ด → 'ใส่ Soul ของ')</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {selFc.soul.map((id, i) => <Thumb key={`${i}-${id}`} id={id} card={cardOf(id)} selected={selSoul === i} onClick={() => setSelSoul(selSoul === i ? null : i)} />)}
                  </div>
                )}
                {selSoul !== null && selFc.soul[selSoul] !== undefined && (
                  <MoveBar
                    game={game} mySide={mySide} defaultSide={side} cardOf={cardOf}
                    label={`ถอด Soul: ${cardOf(selFc.soul[selSoul])?.name ?? "การ์ด"}`}
                    onMove={to => { const ref: SbRef = { side, zone: "soul", uid: selFc.uid, index: selSoul }; if (run(s => sandboxMove(s, ref, to))) setSelSoul(null); }}
                    onRemove={() => { const ref: SbRef = { side, zone: "soul", uid: selFc.uid, index: selSoul }; if (run(s => sandboxRemoveCard(s, ref))) setSelSoul(null); }}
                  />
                )}
              </div>

              <MoveBar
                game={game} mySide={mySide} defaultSide={side} cardOf={cardOf}
                label={`ย้ายการ์ดใบนี้ออกจากสนาม (Soul จะลงสุสาน)`}
                onMove={to => { const ref: SbRef = { side, zone: selFcIsItem ? "item" : "monster", uid: selFc.uid }; if (run(s => sandboxMove(s, ref, to))) setSelUid(null); }}
                onRemove={() => { const ref: SbRef = { side, zone: selFcIsItem ? "item" : "monster", uid: selFc.uid }; if (run(s => sandboxRemoveCard(s, ref))) setSelUid(null); }}
              />
            </div>)}
          </>)}

          {tab === "library" && (<>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
              <Search size={12} className="text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อการ์ด / ประเภท" className="flex-1 bg-transparent outline-none" />
            </div>
            <div className="text-slate-500">สร้างสำเนาการ์ดจากคลัง (ของเรา + ของเพื่อนที่ส่งมา) ไปวางที่ไหนก็ได้ {libraryCards.length === 0 && "— ยังไม่มีการ์ดในคลัง"}</div>
            <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto">
              {lib.map(c => <Thumb key={c.id} id={c.id} card={c} selected={selLib === c.id} onClick={() => setSelLib(selLib === c.id ? null : c.id)} />)}
            </div>
            {selLib && cardOf(selLib) && (
              <MoveBar
                game={game} mySide={mySide} defaultSide={side} cardOf={cardOf}
                label={`สร้าง: ${cardOf(selLib)!.name}`}
                onMove={to => { run(s => sandboxSpawn(s, selLib, to)); }}
              />
            )}
          </>)}
        </div>
      </>)}
    </div>
  );
}
