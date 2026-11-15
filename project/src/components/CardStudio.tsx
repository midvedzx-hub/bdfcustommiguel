import { useState } from "react";
import { Plus, Save, Trash2, Download, Upload, Edit3, Copy, Zap, Search, Layers } from "lucide-react";
import { ScreenShell, EmptyState } from "@/components/ui";
import type { Card, Flag, CardType, AutoTrigger, AutoEffectType, AutoEffect, AutoSkill } from "@/types";
import { TRIGGER_LABELS, EFFECT_LABELS } from "@/types";
import { getCards, saveCards, getFlags, saveFlags, getDecks, saveDecks, uid, downloadJSON, importAll } from "@/storage";
import { ImageUpload } from "@/components/ImageUpload";
import { CardView } from "@/components/CardView";
import { SKILL_TEMPLATES } from "@/game/helpers";

const TYPES: CardType[] = ["Monster", "Spell", "Item", "Impact"];
const TYPE_DOT: Record<string, string> = { Monster: "#f59e0b", Spell: "#38bdf8", Item: "#34d399", Impact: "#fb7185" };
const TRIGGERS = TRIGGER_LABELS;
const EFFECT_TYPES = EFFECT_LABELS;

const DEFAULT_CARD: Card = {
  id: "",
  name: "",
  image: "",
  flagId: "",
  type: "Monster",
  size: 0,
  power: 0,
  defense: 0,
  critical: 0,
  callCost: 0,
  callCostType: "Gauge",
  customText: "",
  autoSkills: [],
  attribute: "",
};

export function CardStudio({ onBack, startEditing }: { onBack: () => void; startEditing?: Card }) {
  const [cards, setCards] = useState<Card[]>(getCards());
  const [flags] = useState<Flag[]>(getFlags());
  const [editing, setEditing] = useState<Card | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [worldFilter, setWorldFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  function persist(next: Card[]) {
    setCards(next);
    saveCards(next);
  }

  function startNew() {
    setEditing({ ...DEFAULT_CARD, id: uid(), flagId: flags[0]?.id ?? "" });
  }

  function saveEdit() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("ใส่ชื่อการ์ดก่อนบันทึก");
      return;
    }
    const exists = cards.some(c => c.id === editing.id);
    const next = exists ? cards.map(c => c.id === editing.id ? editing : c) : [...cards, editing];
    if (!saveCards(next)) {
      alert("บันทึกไม่สำเร็จ: พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม\nลองลบการ์ดเก่าที่ไม่ใช้ หรืออัปโหลดรูปใหม่ (ระบบจะย่อรูปให้อัตโนมัติ)");
      return;
    }
    setCards(next);
    setEditing(null);
  }

  function del(id: string) {
    persist(cards.filter(c => c.id !== id));
    // ลบการ์ดออกจากทุกเด็ค/Buddy ของ Flag ด้วย ไม่งั้นจะค้างเป็นการ์ดคว่ำที่ใช้ไม่ได้ตอนเล่น
    saveDecks(getDecks().map(d => ({ ...d, cardIds: d.cardIds.filter(x => x !== id), buddyId: d.buddyId === id ? null : d.buddyId })));
    saveFlags(getFlags().map(f => ({ ...f, buddyIds: (f.buddyIds ?? []).filter(x => x !== id) })));
  }

  function addTemplate(idx: number) {
    if (!editing) return;
    const t = SKILL_TEMPLATES[idx];
    setEditing({ ...editing, autoSkills: [...editing.autoSkills, structuredClone(t.skill)] });
  }

  function addSkill() {
    if (!editing) return;
    const newSkill: AutoSkill = { trigger: "onCall", effects: [{ type: "draw", value: 1 }] };
    setEditing({ ...editing, autoSkills: [...editing.autoSkills, newSkill] });
  }

  function updateSkill(idx: number, skill: AutoSkill) {
    if (!editing) return;
    const next = [...editing.autoSkills];
    next[idx] = skill;
    setEditing({ ...editing, autoSkills: next });
  }

  function removeSkill(idx: number) {
    if (!editing) return;
    setEditing({ ...editing, autoSkills: editing.autoSkills.filter((_, i) => i !== idx) });
  }

  function addEffect(skillIdx: number) {
    if (!editing) return;
    const skills = [...editing.autoSkills];
    skills[skillIdx] = { ...skills[skillIdx], effects: [...skills[skillIdx].effects, { type: "draw", value: 1 }] };
    setEditing({ ...editing, autoSkills: skills });
  }

  function updateEffect(skillIdx: number, effIdx: number, eff: AutoEffect) {
    if (!editing) return;
    const skills = [...editing.autoSkills];
    const effects = [...skills[skillIdx].effects];
    effects[effIdx] = eff;
    skills[skillIdx] = { ...skills[skillIdx], effects };
    setEditing({ ...editing, autoSkills: skills });
  }

  function removeEffect(skillIdx: number, effIdx: number) {
    if (!editing) return;
    const skills = [...editing.autoSkills];
    skills[skillIdx] = { ...skills[skillIdx], effects: skills[skillIdx].effects.filter((_, i) => i !== effIdx) };
    setEditing({ ...editing, autoSkills: skills });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importAll(reader.result as string);
        setCards(getCards());
        alert(`นำเข้าสำเร็จ: ${result.flags} Flag, ${result.cards} การ์ด, ${result.decks} เด็ค`);
      } catch {
        alert("ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const flagOf = (c: Card) => flags.find(f => f.id === c.flagId);
  const q = search.trim().toLowerCase();
  const filtered = cards.filter(c =>
    (filter === "all" || c.type === filter) &&
    (worldFilter === "all" || c.flagId === worldFilter) &&
    (!q || c.name.toLowerCase().includes(q) || (c.attribute ?? "").toLowerCase().includes(q))
  );
  function dup(c: Card) {
    persist([...cards, { ...structuredClone(c), id: uid(), name: `${c.name} (สำเนา)` }]);
  }

  if (editing) {
    const flag = flags.find(f => f.id === editing.flagId);
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-6xl mx-auto page-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-3xl font-bold text-emerald-300" style={{ textShadow: "0 0 24px #34d39955" }}>ออกแบบการ์ด</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="btn">ยกเลิก</button>
              <button onClick={saveEdit} className="btn btn-primary"><Save size={16} /> บันทึก</button>
            </div>
          </div>

          <div className="grid md:grid-cols-[320px_1fr] gap-6">
            <div className="space-y-4 md:sticky md:top-4 self-start">
              <div className="flex justify-center">
                <CardView card={editing} flag={flag} size="xl" />
              </div>
              <p className="text-xs text-slate-500 text-center">ตัวอย่างการ์ด (อัปเดตสด) — ข้อความสกิลถูกสร้างให้อัตโนมัติ</p>
              <ImageUpload image={editing.image} onChange={img => setEditing({ ...editing, image: img })} className="w-full h-32" rounded="rounded-xl" placeholder="อัปโหลดรูปการ์ด" />
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400">ชื่อการ์ด</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="ชื่อการ์ด" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none" />
              </div>

              <div>
                <label className="text-sm text-slate-400">คุณสมบัติ / สายพันธุ์ (เช่น Dragon / Warrior)</label>
                <input value={editing.attribute ?? ""} onChange={e => setEditing({ ...editing, attribute: e.target.value })} placeholder="แสดงใต้ชื่อการ์ด" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none" />
              </div>

              {editing.type === "Monster" && (
                <div>
                  <label className="text-sm text-slate-400">Call Cost แบบ Soul: นำการ์ดบนเด็คเข้า Soul ของการ์ดนี้ตอนลงสนาม (0 = ไม่ใช้)</label>
                  <input type="number" min={0} max={9} value={editing.callSoulFromDeck ?? 0} onChange={e => setEditing({ ...editing, callSoulFromDeck: Math.max(0, parseInt(e.target.value) || 0) })} className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-sm text-slate-400">ประเภท</label>
                  <select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as CardType })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none">
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-400">สังกัด Flag</label>
                  <select value={editing.flagId} onChange={e => setEditing({ ...editing, flagId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none">
                    <option value="">ไม่ระบุ</option>
                    {flags.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-400">ค่าจ่าย (Call Cost)</label>
                  <input type="number" value={editing.callCost} onChange={e => setEditing({ ...editing, callCost: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="text-sm text-slate-400">จ่ายด้วย</label>
                  <select value={editing.callCostType} onChange={e => setEditing({ ...editing, callCostType: e.target.value as "Gauge" | "Life" })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none">
                    <option value="Gauge">Gauge</option>
                    <option value="Life">Life</option>
                  </select>
                </div>
              </div>

              {editing.type === "Monster" && (
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-sm text-slate-400">Size (0-3)</label>
                    <input type="number" min={0} max={3} value={editing.size} onChange={e => setEditing({ ...editing, size: Math.min(3, Math.max(0, parseInt(e.target.value) || 0)) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Power</label>
                    <input type="number" value={editing.power} onChange={e => setEditing({ ...editing, power: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Defense</label>
                    <input type="number" value={editing.defense} onChange={e => setEditing({ ...editing, defense: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Critical</label>
                    <input type="number" value={editing.critical} onChange={e => setEditing({ ...editing, critical: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                </div>
              )}

              {(editing.type === "Impact") && (
                <div>
                  <label className="text-sm text-slate-400">Critical (ดาเมจ)</label>
                  <input type="number" value={editing.critical} onChange={e => setEditing({ ...editing, critical: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
              )}

              {(editing.type === "Item") && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm text-slate-400">Power</label>
                    <input type="number" value={editing.power} onChange={e => setEditing({ ...editing, power: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Defense</label>
                    <input type="number" value={editing.defense} onChange={e => setEditing({ ...editing, defense: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400">Critical</label>
                    <input type="number" value={editing.critical} onChange={e => setEditing({ ...editing, critical: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-slate-400">คำอธิบายสกิลอิสระ (Custom Text)</label>
                <textarea value={editing.customText} onChange={e => setEditing({ ...editing, customText: e.target.value })} placeholder="เขียนความสามารถพิสดารตามจินตนาการ..." rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none resize-none" />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Zap size={16} /> ระบบสกิลอัตโนมัติ (Auto-Trigger)</h3>
                  <button onClick={addSkill} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-1"><Plus size={14} /> เพิ่มสกิล</button>
                </div>

                <div className="mb-3">
                  <p className="text-xs text-slate-500 mb-1">เทมเพลตสกิล (กดเพื่อเพิ่มทันที):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_TEMPLATES.map((t, i) => (
                      <button key={i} onClick={() => addTemplate(i)} className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-700 border border-slate-700 rounded-full text-xs">{t.label}</button>
                    ))}
                  </div>
                </div>

                {editing.autoSkills.map((skill, si) => (
                  <div key={si} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <select value={skill.trigger} onChange={e => updateSkill(si, { ...skill, trigger: e.target.value as AutoTrigger })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
                        {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => removeSkill(si)} className="ml-auto p-1 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                    {skill.effects.map((eff, ei) => (
                      <div key={ei} className="flex items-center gap-2 mb-2">
                        <select value={eff.type} onChange={e => updateEffect(si, ei, { ...eff, type: e.target.value as AutoEffectType })} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm flex-1">
                          {EFFECT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                        </select>
                        <input type="number" min={1} title={EFFECT_TYPES.find(x => x.value === eff.type)?.hint} value={eff.value} onChange={e => updateEffect(si, ei, { ...eff, value: parseInt(e.target.value) || 1 })} className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" />
                        <button onClick={() => removeEffect(si, ei)} className="p-1 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={12} /></button>
                      </div>
                    ))}
                    {skill.trigger === "onCounter" && (
                      <p className="text-[11px] text-sky-300 mb-1">Counter Act: ใช้จากมือตอนศัตรูโจมตี ใช้ได้กับทุกประเภทการ์ด (ใช้แล้วการ์ดลงสุสาน) จ่ายค่า Cost ตามปกติ</p>
                    )}
                    <button onClick={() => addEffect(si)} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"><Plus size={12} /> เพิ่มผลลัพธ์</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScreenShell
      title="Card Studio" subtitle="ออกแบบ Monster / Spell / Item / Impact พร้อมสกิลอัตโนมัติ" icon={Layers} accent="#34d399" onBack={onBack} maxW="max-w-7xl"
      actions={<>
        <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(cards, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn"><Copy size={14} /> {copied ? "คัดลอกแล้ว" : "ก๊อปปี้"}</button>
        <button onClick={() => downloadJSON(JSON.stringify(cards, null, 2), "cards.json")} className="btn"><Download size={14} /> Export</button>
        <label className="btn cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
        <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างการ์ด</button>
      </>}
    >
      {flags.length === 0 && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 text-amber-300 text-sm mb-4">ควรสร้าง Flag ก่อน เพื่อให้การ์ดมีสังกัด</div>
      )}

      <div className="panel p-3 md:p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("all")} className={`btn !py-1.5 ${filter === "all" ? "btn-primary" : ""}`}>ทั้งหมด ({cards.length})</button>
          {TYPES.map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`btn !py-1.5 ${filter === t ? "btn-primary" : ""}`}>
              <span className="w-2 h-2 rounded-full" style={{ background: TYPE_DOT[t] }} /> {t} ({cards.filter(c => c.type === t).length})
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ/สายพันธุ์..." className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm w-52" />
          </div>
          <select value={worldFilter} onChange={e => setWorldFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm">
            <option value="all">ทุก Flag</option>
            {flags.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Layers} title={cards.length === 0 ? "ยังไม่มีการ์ด" : "ไม่พบการ์ดที่ตรงกับเงื่อนไข"} hint={cards.length === 0 ? 'กด "สร้างการ์ด" เพื่อเริ่มออกแบบการ์ดใบแรก' : "ลองเปลี่ยนตัวกรองหรือคำค้นหา"} action={cards.length === 0 ? <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างการ์ดใบแรก</button> : undefined} />
      ) : (
        <div className="grid gap-x-5 gap-y-7 justify-items-center" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {filtered.map(c => (
            <div key={c.id} className="relative group lift rounded-xl" style={{ ["--glow" as string]: `${flagOf(c)?.color ?? "#22d3ee"}88` }}>
              <CardView card={c} flag={flagOf(c)} size="md" onClick={() => setEditing(c)} />
              <div className="absolute -bottom-3 inset-x-0 z-30 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                <button title="แก้ไข" onClick={() => setEditing(c)} className="btn !p-1.5 !rounded-lg"><Edit3 size={14} /></button>
                <button title="ทำสำเนา" onClick={() => dup(c)} className="btn !p-1.5 !rounded-lg"><Copy size={14} /></button>
                <button title="ลบ" onClick={() => del(c.id)} className="btn btn-danger !p-1.5 !rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}
