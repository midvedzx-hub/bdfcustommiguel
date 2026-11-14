import { useState } from "react";
import { Plus, Save, Trash2, Download, Upload, Edit3, Copy, Zap } from "lucide-react";
import type { Card, Flag, CardType, AutoTrigger, AutoEffectType, AutoEffect, AutoSkill } from "@/types";
import { TRIGGER_LABELS, EFFECT_LABELS } from "@/types";
import { getCards, saveCards, getFlags, uid, downloadJSON, importAll } from "@/storage";
import { ImageUpload } from "@/components/ImageUpload";
import { CardView } from "@/components/CardView";
import { SKILL_TEMPLATES } from "@/game/helpers";

const TYPES: CardType[] = ["Monster", "Spell", "Item", "Impact"];
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

export function CardStudio({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<Card[]>(getCards());
  const [flags] = useState<Flag[]>(getFlags());
  const [editing, setEditing] = useState<Card | null>(null);
  const [filter, setFilter] = useState<string>("all");
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
  const filtered = filter === "all" ? cards : cards.filter(c => c.type === filter);

  if (editing) {
    const flag = flags.find(f => f.id === editing.flagId);
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-cyan-400">สร้างการ์ด</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">ยกเลิก</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Save size={16} /> บันทึก</button>
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
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400">Card Studio</h2>
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(cards, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm"><Copy size={14} /> ก๊อปปี้</button>
            <button onClick={() => downloadJSON(JSON.stringify(cards, null, 2), "cards.json")} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm"><Download size={14} /> Export</button>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
            <button onClick={startNew} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Plus size={16} /> สร้างการ์ด</button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">กลับ</button>
          </div>
        </div>

        {flags.length === 0 && (
          <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 text-amber-300 text-sm mb-4">ควรสร้าง Flag ก่อน เพื่อให้การ์ดมีสังกัด</div>
        )}

        <div className="flex gap-2 mb-4">
          <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-lg text-sm transition ${filter === "all" ? "bg-cyan-600" : "bg-slate-800 hover:bg-slate-700"}`}>ทั้งหมด ({cards.length})</button>
          {TYPES.map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-sm transition ${filter === t ? "bg-cyan-600" : "bg-slate-800 hover:bg-slate-700"}`}>{t} ({cards.filter(c => c.type === t).length})</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <p className="text-lg">ยังไม่มีการ์ด</p>
            <p className="text-sm mt-2">กด "สร้างการ์ด" เพื่อเริ่มสร้างการ์ดของคุณ</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center">
            {filtered.map(c => (
              <div key={c.id} className="relative group">
                <CardView card={c} flag={flagOf(c)} size="md" />
                <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
                  <button onClick={() => setEditing(c)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><Edit3 size={16} /></button>
                  <button onClick={() => del(c.id)} className="p-2 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
