import { useState } from "react";
import { Cpu, Users, ArrowLeft, Swords, AlertTriangle } from "lucide-react";
import type { Deck, RuleSet } from "@/types";
import { DEFAULT_RULES } from "@/types";
import { getDecks, getFlags, getRules, saveRules } from "@/storage";

interface Props {
  onExit: () => void;
  onPlay: (mode: "bot" | "multiplayer", deck: Deck, rules: RuleSet) => void;
}

export function PlaySelect({ onExit, onPlay }: Props) {
  const decks = getDecks();
  const flags = getFlags();
  const [selectedDeck, setSelectedDeck] = useState<string>(decks[0]?.id ?? "");
  const [mode, setMode] = useState<"bot" | "multiplayer" | null>(null);
  const [rules, setRules] = useState<RuleSet>(getRules);
  const setRule = (patch: Partial<RuleSet>) => { const n = { ...rules, ...patch }; setRules(n); saveRules(n); };
  const num = "w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-center";

  if (decks.length === 0 || flags.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle size={48} className="mx-auto text-amber-400 mb-4" />
          <h2 className="text-xl font-bold mb-2">ยังไม่พร้อมเล่น</h2>
          <p className="text-slate-400 mb-4">คุณต้องสร้าง Flag, การ์ด และเด็คอย่างน้อย 1 ชุดก่อน</p>
          <button onClick={onExit} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg">กลับเมนู</button>
        </div>
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-cyan-400">เข้าสนามแข่ง</h2>
            <button onClick={onExit} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-1"><ArrowLeft size={16} /> กลับ</button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <button
              onClick={() => setMode("bot")}
              className="group bg-slate-900 border-2 border-slate-700 hover:border-cyan-500 rounded-2xl p-8 text-center transition-all hover:scale-105"
            >
              <Cpu size={48} className="mx-auto text-cyan-400 mb-4 group-hover:scale-110 transition" />
              <h3 className="text-xl font-bold mb-2">เล่นกับบอท (VS AI)</h3>
              <p className="text-sm text-slate-400">ทดสอบเด็คกับ AI อัตโนมัติ</p>
            </button>

            <button
              onClick={() => setMode("multiplayer")}
              className="group bg-slate-900 border-2 border-slate-700 hover:border-emerald-500 rounded-2xl p-8 text-center transition-all hover:scale-105"
            >
              <Users size={48} className="mx-auto text-emerald-400 mb-4 group-hover:scale-110 transition" />
              <h3 className="text-xl font-bold mb-2">เล่นออนไลน์กับเพื่อน</h3>
              <p className="text-sm text-slate-400">สร้างห้อง ส่งรหัสให้เพื่อน เชื่อมต่อแบบเรียลไทม์</p>
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <label className="text-sm text-slate-400 block mb-2">เลือกเด็คที่จะใช้:</label>
            <select value={selectedDeck} onChange={e => setSelectedDeck(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
              {decks.map(d => <option key={d.id} value={d.id}>{d.name} ({d.cardIds.length} ใบ)</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  }

  const deck = decks.find(d => d.id === selectedDeck)!;
  const flag = flags.find(f => f.id === deck.flagId);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-cyan-400">
            {mode === "bot" ? "เล่นกับบอท" : "เล่นออนไลน์กับเพื่อน"}
          </h2>
          <button onClick={() => setMode(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-1"><ArrowLeft size={16} /> กลับ</button>
        </div>

        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-6">
          <h3 className="font-bold mb-3">เด็คที่เลือก</h3>
          <div className="flex items-center gap-3">
            {flag?.image && <img src={flag.image} className="w-16 h-16 rounded-lg object-cover" />}
            <div>
              <div className="font-bold text-lg" style={{ color: flag?.color }}>{deck.name}</div>
              <div className="text-sm text-slate-400">{flag?.name} | {deck.cardIds.length} ใบ</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">กติกาของเกมนี้ (ปรับเองได้)</h3>
            <button onClick={() => { setRules({ ...DEFAULT_RULES }); saveRules({ ...DEFAULT_RULES }); }} className="text-xs text-slate-400 hover:text-white underline">คืนค่ามาตรฐาน Buddyfight</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="flex items-center justify-between gap-3">Size รวมสูงสุดในสนาม<input type="number" min={1} max={9} value={rules.maxSize} onChange={e => setRule({ maxSize: Math.max(1, parseInt(e.target.value) || 3) })} className={num} /></label>
            <label className="flex items-center justify-between gap-3">Life ที่ได้ตอน Buddy Call<input type="number" min={0} max={9} value={rules.buddyCallLife} onChange={e => setRule({ buddyCallLife: Math.max(0, parseInt(e.target.value) || 0) })} className={num} /></label>
            <label className="flex items-center justify-between gap-3">โจมตีได้กี่ครั้งในเทิร์นแรก (0 = ไม่จำกัด)<input type="number" min={0} max={9} value={rules.firstTurnAttacks} onChange={e => setRule({ firstTurnAttacks: Math.max(0, parseInt(e.target.value) || 0) })} className={num} /></label>
            <label className="flex items-center justify-between gap-3">แยก Attack Phase<input type="checkbox" checked={rules.useAttackPhase} onChange={e => setRule({ useAttackPhase: e.target.checked })} className="w-5 h-5" /></label>
            <label className="flex items-center justify-between gap-3">เปิดระบบ Counter Act<input type="checkbox" checked={rules.enableCounter} onChange={e => setRule({ enableCounter: e.target.checked })} className="w-5 h-5" /></label>
            <label className="flex items-center justify-between gap-3">เด็คหมดแล้วแพ้<input type="checkbox" checked={rules.deckOutLose} onChange={e => setRule({ deckOutLose: e.target.checked })} className="w-5 h-5" /></label>
          </div>
          {mode === "multiplayer" && <p className="text-xs text-slate-500 mt-3">ออนไลน์: ใช้กติกาของ "เจ้าของห้อง" ทั้งสองฝั่ง</p>}
        </div>

        {mode === "multiplayer" && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-4 mb-6 text-sm text-blue-300">
            หลังเข้าสนาม กดปุ่ม "เชื่อมต่อเพื่อน" เพื่อสร้างห้องหรือเข้าห้อง ระบบจะสร้างรหัส 5 ตัวให้ส่งเพื่อน
          </div>
        )}

        <button
          onClick={() => onPlay(mode, deck, rules)}
          className="w-full px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition"
        >
          <Swords size={24} /> เข้าสนาม
        </button>
      </div>
    </div>
  );
}
