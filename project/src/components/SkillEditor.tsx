import { Trash2 } from "lucide-react";
import type { AutoEffect, AutoEffectType, AutoSkill, CardFilter, CounterCost, CounterTiming } from "@/types";
import { EFFECT_LABELS, DROP_FILTERS } from "@/types";
import { KEYWORD_DEFS } from "@/game/keywords";

const sel = "bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm";
const num = "bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm";

// แถวเอฟเฟกต์ 1 รายการ (ใช้ร่วมกันใน Card Studio และตัวสร้างคีย์เวิร์ดกำหนดเอง)
export function EffectRow({ eff, onChange, onRemove }: { eff: AutoEffect; onChange: (e: AutoEffect) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-2 flex-wrap">
      <select value={eff.type} onChange={e => onChange({ ...eff, type: e.target.value as AutoEffectType })} className={`${sel} flex-1 min-w-[10rem]`}>
        {EFFECT_LABELS.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
      </select>
      {eff.type === "kw" && (
        <select value={eff.name ?? ""} onChange={e => onChange({ ...eff, name: e.target.value })} className={sel}>
          <option value="">เลือกคีย์เวิร์ด…</option>
          {KEYWORD_DEFS.filter(k => !k.engine).map(k => <option key={k.id} value={k.id}>{k.id}</option>)}
        </select>
      )}
      {(eff.type === "dropToSoul" || eff.type === "recoverFromDrop") && (
        <select value={eff.filter ?? "any"} onChange={e => onChange({ ...eff, filter: e.target.value as CardFilter })} className={sel} title="เลือกชนิดการ์ดที่จะดึงจากสุสาน (เอาใบที่ลงสุสานล่าสุดก่อน)">
          {DROP_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}
      <input type="number" min={1} title={EFFECT_LABELS.find(x => x.value === eff.type)?.hint} value={eff.value} onChange={e => onChange({ ...eff, value: parseInt(e.target.value) || 1 })} className={`${num} w-16`} />
      <button onClick={onRemove} className="p-1 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={12} /></button>
      {eff.type === "lookTop" && (
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-400 pl-1">
          <span>หลังดูแล้วเลือกได้สูงสุด:</span>
          {([["toHand", "ขึ้นมือ"], ["toDrop", "ลงดรอป"], ["toBottom", "ใต้สุดของกอง"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">{label}
              <input type="number" min={0} max={9} value={eff[k] ?? 0} onChange={e => onChange({ ...eff, [k]: Math.max(0, parseInt(e.target.value) || 0) })} className={`${num} w-14 !py-0.5`} />
              ใบ
            </label>
          ))}
          <span className="text-slate-500">(ใบที่ไม่ได้เลือกวางกลับบนกองตามเดิม)</span>
        </div>
      )}
    </div>
  );
}

const TIMING_LABEL: Record<CounterTiming, string> = { attack: "ตอนศัตรูโจมตี", cast: "ตอนศัตรูร่ายเวท", any: "ทั้งตอนโจมตีและร่ายเวท" };

// ตัวเลือกจังหวะ + คำอธิบาย สำหรับสกิล Counter / Counter 【Act】
export function CounterOptions({ skill, onChange }: { skill: AutoSkill; onChange: (s: AutoSkill) => void }) {
  if (skill.trigger !== "onCounter" && skill.trigger !== "onCounterAct") return null;
  const act = skill.trigger === "onCounterAct";
  return (
    <div className="mb-2 text-[11px] text-sky-300 space-y-1">
      <div className="flex items-center gap-2">
        <span>จังหวะที่ใช้ได้:</span>
        <select value={skill.timing ?? "attack"} onChange={e => onChange({ ...skill, timing: e.target.value as CounterTiming })} className={`${sel} !py-0.5 text-xs`}>
          {(Object.keys(TIMING_LABEL) as CounterTiming[]).map(t => <option key={t} value={t}>{TIMING_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span>ค่าใช้จ่ายเพื่อใช้:</span>
        {([["gauge", "จ่ายเกจ"], ["life", "เสียพลังชีวิต"], ["deckToDrop", "ทิ้งการ์ดบนเด็คลงสุสาน"], ["handToDrop", "ทิ้งการ์ดบนมือ"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1">{label}
            <input type="number" min={0} max={9} value={skill.cost?.[k] ?? 0}
              onChange={e => {
                const v = Math.max(0, Math.min(9, parseInt(e.target.value) || 0));
                const cost: CounterCost = { ...skill.cost, [k]: v };
                if (!cost.gauge && !cost.life && !cost.deckToDrop && !cost.handToDrop) onChange({ ...skill, cost: undefined });
                else onChange({ ...skill, cost });
              }}
              className={`${num} w-14 !py-0.5 text-xs`} />
          </label>
        ))}
        <span className="text-slate-500">(0 = ไม่มี · ถ้าจ่ายไม่ไหวจะใช้ไม่ได้ · Life ต้องเหลืออย่างน้อย 1 · ทิ้งการ์ดบนมือ: ผู้เล่นเลือกใบที่ทิ้งตอนกดใช้)</span>
      </div>
      <p>{act
        ? "Counter 【Act】: ความสามารถของการ์ด \"บนสนาม\" กดใช้ได้ 1 ครั้งต่อเทิร์น (การ์ดยังอยู่บนสนาม) จ่ายตามที่เขียน เช่น เอฟเฟกต์แรกเป็น \"ถอด Soul\" ถ้าจ่ายไม่ได้ก็ใช้ไม่ได้"
        : "【Counter】: ใช้จาก \"มือ\" หรือช่อง Set (ใช้แล้วการ์ดลงสุสาน) จ่าย Cost ตามปกติ ใช้ได้ในเทิร์นของศัตรูตอนเขาโจมตีหรือร่ายเวท ตามจังหวะที่เลือก ใช้ได้กับทุกประเภทการ์ด"}
        {" "}ตอนศัตรูโจมตีใช้เอฟเฟกต์อย่าง "ยกเลิกการโจมตี" ได้ ตอนร่ายเวทใช้ "ยกเลิกเวท" ได้</p>
    </div>
  );
}
