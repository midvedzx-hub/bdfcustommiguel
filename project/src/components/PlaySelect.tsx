import { useState } from "react";
import { Cpu, Users, Swords, AlertTriangle, Settings2, ChevronDown, Check, RotateCcw, Star } from "lucide-react";
import type { Deck, RuleSet } from "@/types";
import { DEFAULT_RULES } from "@/types";
import { getDecks, getFlags, getCards, getRules, saveRules } from "@/storage";
import { ScreenShell, Switch } from "@/components/ui";
import { CardView } from "@/components/CardView";

interface Props {
  onExit: () => void;
  onPlay: (mode: "bot" | "multiplayer", deck: Deck, rules: RuleSet) => void;
}

export function PlaySelect({ onExit, onPlay }: Props) {
  const decks = getDecks();
  const flags = getFlags();
  const cards = getCards();
  const [selectedDeck, setSelectedDeck] = useState<string>(decks[0]?.id ?? "");
  const [mode, setMode] = useState<"bot" | "multiplayer">("bot");
  const [rules, setRules] = useState<RuleSet>(getRules);
  const [showRules, setShowRules] = useState(false);
  const setRule = (patch: Partial<RuleSet>) => { const n = { ...rules, ...patch }; setRules(n); saveRules(n); };
  const num = "w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center";

  if (decks.length === 0 || flags.length === 0) {
    return (
      <ScreenShell title="เข้าสนามแข่ง" icon={Swords} accent="#fb7185" onBack={onExit} maxW="max-w-3xl">
        <div className="panel text-center py-14 px-6">
          <AlertTriangle size={48} className="mx-auto text-amber-400 mb-4" />
          <h3 className="font-display text-xl font-bold mb-2">ยังไม่พร้อมเล่น</h3>
          <p className="text-slate-400 mb-4">คุณต้องสร้าง Flag, การ์ด และเด็คอย่างน้อย 1 ชุดก่อน</p>
          <button onClick={onExit} className="btn btn-primary">กลับเมนู</button>
        </div>
      </ScreenShell>
    );
  }

  const deck = decks.find(d => d.id === selectedDeck) ?? decks[0];
  const flag = flags.find(f => f.id === deck.flagId);
  const buddy = deck.buddyId ? cards.find(c => c.id === deck.buddyId) : null;

  const modes = [
    { key: "bot" as const, title: "เล่นกับบอท", sub: "ทดสอบเด็คกับ AI อัตโนมัติ", icon: Cpu, color: "#22d3ee" },
    { key: "multiplayer" as const, title: "เล่นออนไลน์กับเพื่อน", sub: "สร้างห้อง ส่งรหัส 5 ตัวให้เพื่อน", icon: Users, color: "#34d399" },
  ];
  const toggles: { key: keyof RuleSet; label: string }[] = [
    { key: "useAttackPhase", label: "แยก Attack Phase" },
    { key: "enableCounter", label: "เปิดระบบ Counter Act" },
    { key: "deckOutLose", label: "เด็คหมดแล้วแพ้" },
  ];
  const summary = [
    `Size ≤ ${rules.maxSize}`,
    rules.useAttackPhase ? "มี Attack Phase" : "โจมตีใน Main",
    rules.enableCounter ? "Counter เปิด" : "Counter ปิด",
    rules.firstPlayer === "random" ? "สุ่มคนเริ่ม" : rules.firstPlayer === "host" ? "เราเริ่มก่อน" : "อีกฝ่ายเริ่มก่อน",
  ];

  return (
    <ScreenShell title="เข้าสนามแข่ง" subtitle="เลือกเด็ค เลือกโหมด แล้วลุยเลย" icon={Swords} accent="#fb7185" onBack={onExit} maxW="max-w-4xl">
      {/* 1. เลือกเด็ค */}
      <section className="mb-7">
        <h3 className="font-display font-bold text-slate-300 mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-cyan-600 text-xs flex items-center justify-center">1</span> เลือกเด็ค</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {decks.map(d => {
            const f = flags.find(x => x.id === d.flagId);
            const col = f?.color || "#475569";
            const on = d.id === deck.id;
            return (
              <button key={d.id} onClick={() => setSelectedDeck(d.id)} className={`panel lift text-left flex overflow-hidden relative ${on ? "ring-2" : "opacity-80 hover:opacity-100"}`} style={{ borderColor: on ? col : undefined, ["--glow" as string]: `${col}66`, ["--tw-ring-color" as string]: col }}>
                <div className="relative w-20 shrink-0">
                  {f?.image ? <img src={f.image} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${col}, #0f172a)` }} />}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-950/70" />
                </div>
                <div className="p-3 min-w-0 flex-1">
                  <div className="font-display font-bold text-lg truncate" style={{ color: col }}>{d.name}</div>
                  <div className="text-xs text-slate-400 truncate">{f?.name ?? "ไม่มี Flag"} · {d.cardIds.length} ใบ</div>
                </div>
                {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-900" style={{ background: col }}><Check size={14} /></span>}
              </button>
            );
          })}
        </div>
        {buddy && (
          <div className="flex items-center gap-3 mt-3 text-sm text-amber-300"><Star size={14} fill="currentColor" /> Buddy: {buddy.name}
            <CardView card={buddy} flag={flag} width="42px" hideText />
          </div>
        )}
      </section>

      {/* 2. เลือกโหมด */}
      <section className="mb-7">
        <h3 className="font-display font-bold text-slate-300 mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-cyan-600 text-xs flex items-center justify-center">2</span> เลือกโหมด</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {modes.map(m => {
            const Icon = m.icon;
            const on = mode === m.key;
            return (
              <button key={m.key} onClick={() => setMode(m.key)} className={`panel lift group p-5 text-left flex items-center gap-4 ${on ? "ring-2" : "opacity-75 hover:opacity-100"}`} style={{ borderColor: on ? m.color : undefined, ["--glow" as string]: `${m.color}66`, ["--tw-ring-color" as string]: m.color }}>
                <div className="rounded-2xl p-3 transition group-hover:scale-110" style={{ background: `${m.color}22`, border: `1px solid ${m.color}55` }}><Icon size={30} style={{ color: m.color }} /></div>
                <div>
                  <div className="font-display text-xl font-bold" style={{ color: m.color }}>{m.title}</div>
                  <div className="text-sm text-slate-400">{m.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
        {mode === "multiplayer" && (
          <div className="bg-blue-900/20 border border-blue-700/60 rounded-xl p-3 mt-3 text-sm text-blue-300">
            หลังเข้าสนาม กดปุ่ม "เชื่อมต่อเพื่อน" เพื่อสร้างห้องหรือเข้าห้อง ระบบจะสร้างรหัส 5 ตัวให้ส่งเพื่อน (ใช้กติกาของเจ้าของห้อง)
          </div>
        )}
      </section>

      {/* 3. กติกา */}
      <section className="panel mb-7 overflow-hidden">
        <button onClick={() => setShowRules(v => !v)} className="w-full flex items-center justify-between gap-3 p-4 text-left bg-transparent hover:bg-slate-800/40 transition">
          <span className="font-display font-bold text-slate-300 flex items-center gap-2"><Settings2 size={18} className="text-fuchsia-300" /> กติกาของเกมนี้</span>
          <span className="flex items-center gap-2 flex-wrap justify-end">
            {summary.map(s => <span key={s} className="chip hidden sm:inline-flex">{s}</span>)}
            <ChevronDown size={18} className={`transition ${showRules ? "rotate-180" : ""}`} />
          </span>
        </button>
        {showRules && (
          <div className="p-4 pt-1 border-t border-slate-800">
            <div className="flex justify-end mb-2">
              <button onClick={() => { setRules({ ...DEFAULT_RULES }); saveRules({ ...DEFAULT_RULES }); }} className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><RotateCcw size={12} /> คืนค่ามาตรฐาน Buddyfight</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">Size รวมสูงสุดในสนาม<input type="number" min={1} max={9} value={rules.maxSize} onChange={e => setRule({ maxSize: Math.max(1, parseInt(e.target.value) || 3) })} className={num} /></label>
              <label className="flex items-center justify-between gap-3">Life ที่ได้ตอน Buddy Call<input type="number" min={0} max={9} value={rules.buddyCallLife} onChange={e => setRule({ buddyCallLife: Math.max(0, parseInt(e.target.value) || 0) })} className={num} /></label>
              <label className="flex items-center justify-between gap-3">โจมตีเทิร์นแรกได้กี่ครั้ง (0 = ไม่จำกัด)<input type="number" min={0} max={9} value={rules.firstTurnAttacks} onChange={e => setRule({ firstTurnAttacks: Math.max(0, parseInt(e.target.value) || 0) })} className={num} /></label>
              <label className="flex items-center justify-between gap-3">ช่อง Set เก็บการ์ดได้สูงสุด<input type="number" min={0} max={9} value={rules.maxSet} onChange={e => setRule({ maxSet: Math.max(0, parseInt(e.target.value) || 0) })} className={num} /></label>
              {toggles.map(t => (
                <div key={t.key} className="flex items-center justify-between gap-3">{t.label}<Switch on={rules[t.key] as boolean} onChange={v => setRule({ [t.key]: v } as Partial<RuleSet>)} /></div>
              ))}
              <label className="flex items-center justify-between gap-3">ใครเริ่มก่อน
                <select value={rules.firstPlayer} onChange={e => setRule({ firstPlayer: e.target.value as RuleSet["firstPlayer"] })} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                  <option value="random">สุ่ม (ตามกฏจริง)</option>
                  <option value="host">เจ้าของห้อง / เรา</option>
                  <option value="guest">อีกฝ่าย</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </section>

      <button onClick={() => onPlay(mode, deck, rules)} className="btn btn-primary btn-lg w-full glow-pulse">
        <Swords size={24} /> เข้าสนาม — {deck.name}
      </button>
    </ScreenShell>
  );
}
