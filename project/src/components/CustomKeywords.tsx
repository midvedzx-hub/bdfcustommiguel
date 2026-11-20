import { useState } from "react";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import type { AutoEffect, AutoSkill, AutoTrigger, CustomKeyword } from "@/types";
import { TRIGGER_LABELS } from "@/types";
import { getCustomKeywords, saveCustomKeywords, uid } from "@/storage";
import { effectText } from "@/game/helpers";
import { EffectRow, CounterOptions } from "@/components/SkillEditor";

const QUICK: { label: string; eff: AutoEffect }[] = [
  { label: "+ ได้รับ Life", eff: { type: "addLife", value: 1 } },
  { label: "+ Attack (Power)", eff: { type: "buffPower", value: 5000 } },
  { label: "+ Defense", eff: { type: "buffDefense", value: 5000 } },
  { label: "+ จั่วการ์ด", eff: { type: "draw", value: 1 } },
  { label: "+ ถอด Soul (เป็นเงื่อนไข)", eff: { type: "removeSoul", value: 1 } },
  { label: "+ เลือกการ์ดถอด Soul", eff: { type: "chooseRemoveSoul", value: 1 } },
  { label: "+ ดูกอง", eff: { type: "lookTop", value: 3, toHand: 1, toDrop: 0, toBottom: 0 } },
];

const toSkill = (k: CustomKeyword): AutoSkill => ({ name: k.name, trigger: k.trigger, timing: k.timing, cost: k.cost, help: k.help?.trim() || undefined, effects: structuredClone(k.effects) });

// คีย์เวิร์ดกำหนดเอง: สร้างครั้งเดียว ใส่ในการ์ดกี่ใบก็ได้ (คัดลอกสกิลลงการ์ด)
export function CustomKeywordPanel({ skills, onChange }: { skills: AutoSkill[]; onChange: (s: AutoSkill[]) => void }) {
  const [list, setList] = useState<CustomKeyword[]>(getCustomKeywords);
  const [editing, setEditing] = useState<CustomKeyword | null>(null);
  const [err, setErr] = useState("");

  function persist(next: CustomKeyword[]) { setList(next); saveCustomKeywords(next); }
  const active = (k: CustomKeyword) => skills.some(s => s.name === k.name);

  function toggle(k: CustomKeyword) {
    if (active(k)) onChange(skills.filter(s => s.name !== k.name));
    else onChange([...skills, toSkill(k)]);
  }

  function save() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setErr("ใส่ชื่อคีย์เวิร์ดก่อน");
    if (editing.effects.length === 0) return setErr("เพิ่มเอฟเฟกต์อย่างน้อย 1 อย่าง");
    if (list.some(k => k.id !== editing.id && k.name === name)) return setErr("มีคีย์เวิร์ดชื่อนี้แล้ว");
    const old = list.find(k => k.id === editing.id);
    const kw = { ...editing, name };
    persist(old ? list.map(k => (k.id === kw.id ? kw : k)) : [...list, kw]);
    // ถ้าการ์ดใบนี้ใช้คีย์เวิร์ดนี้อยู่ ให้อัปเดตตามที่แก้ด้วย
    if (old && skills.some(s => s.name === old.name)) onChange(skills.map(s => (s.name === old.name ? toSkill(kw) : s)));
    setEditing(null);
    setErr("");
  }

  function remove(k: CustomKeyword) {
    persist(list.filter(x => x.id !== k.id));
  }

  return (
    <div className="mb-5 border border-fuchsia-900/60 bg-fuchsia-950/10 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="text-xs font-bold text-fuchsia-300">คีย์เวิร์ดกำหนดเอง (ตั้งชื่อเองได้ เช่น "พรแห่งเทพปีศาจ")</div>
        {!editing && (
          <button type="button" onClick={() => { setEditing({ id: uid(), name: "", trigger: "onCall", effects: [{ type: "addLife", value: 1 }] }); setErr(""); }} className="btn !py-1 !px-2.5 !text-xs"><Plus size={12} /> สร้างคีย์เวิร์ดใหม่</button>
        )}
      </div>

      {list.length === 0 && !editing && <p className="text-xs text-slate-500">ยังไม่มี กด "สร้างคีย์เวิร์ดใหม่" เพื่อกำหนดชื่อ จังหวะที่ทำงาน และเอฟเฟกต์ (Life / Attack / Defense / จั่ว ฯลฯ)</p>}

      <div className="flex flex-wrap gap-1.5">
        {list.map(k => (
          <span key={k.id} className="inline-flex items-center gap-0.5">
            <button type="button" onClick={() => toggle(k)} title={`${TRIGGER_LABELS.find(t => t.value === k.trigger)?.label}: ${k.effects.map(effectText).join("、")}${k.help ? ` — ${k.help}` : ""}`}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${active(k) ? "bg-fuchsia-600 border-fuchsia-300 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
              ✦ {k.name}
            </button>
            <button type="button" title="แก้ไข" onClick={() => { setEditing(structuredClone(k)); setErr(""); }} className="p-1 text-slate-400 hover:text-white"><Pencil size={11} /></button>
            <button type="button" title="ลบคีย์เวิร์ด (การ์ดที่ใส่ไว้แล้วไม่เปลี่ยน)" onClick={() => remove(k)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
          </span>
        ))}
      </div>

      {editing && (
        <div className="mt-3 bg-slate-900/80 border border-slate-700 rounded-xl p-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="ชื่อคีย์เวิร์ด เช่น พรแห่งเทพปีศาจ" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm" />
            <select value={editing.trigger} onChange={e => setEditing({ ...editing, trigger: e.target.value as AutoTrigger })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
              {TRIGGER_LABELS.map(t => <option key={t.value} value={t.value}>ทำงาน: {t.label}</option>)}
            </select>
          </div>
          <CounterOptions skill={{ trigger: editing.trigger, effects: [], timing: editing.timing, cost: editing.cost }} onChange={sk => setEditing({ ...editing, timing: sk.timing, cost: sk.cost })} />
          <div>
            {editing.effects.map((eff, i) => (
              <EffectRow key={i} eff={eff}
                onChange={e2 => setEditing({ ...editing, effects: editing.effects.map((x, j) => (j === i ? e2 : x)) })}
                onRemove={() => setEditing({ ...editing, effects: editing.effects.filter((_, j) => j !== i) })} />
            ))}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {QUICK.map(q => (
                <button type="button" key={q.label} onClick={() => setEditing({ ...editing, effects: [...editing.effects, structuredClone(q.eff)] })} className="px-2 py-0.5 text-[11px] rounded-full bg-slate-800 hover:bg-fuchsia-700 border border-slate-700">{q.label}</button>
              ))}
            </div>
          </div>
          <input value={editing.help ?? ""} onChange={e => setEditing({ ...editing, help: e.target.value })} placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm" />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="btn btn-primary !py-1.5"><Save size={13} /> บันทึกคีย์เวิร์ด</button>
            <button type="button" onClick={() => { setEditing(null); setErr(""); }} className="btn !py-1.5"><X size={13} /> ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}
