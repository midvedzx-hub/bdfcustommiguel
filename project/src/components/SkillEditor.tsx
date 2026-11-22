import { Trash2 } from "lucide-react";
import type { AutoEffect, AutoEffectType, AutoSkill, CardFilter, CounterCost, CounterTiming } from "@/types";
import { EFFECT_LABELS, DROP_FILTERS, SOUL_GRANT_KEYWORDS, condBuffAmounts } from "@/types";
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
      {eff.type === "chooseAddSoul" && (
        <select value={eff.soulSrc ?? "drop"} onChange={e => onChange({ ...eff, soulSrc: e.target.value as "drop" | "deck" | "hand" | "handDrop" })} className={sel} title="แหล่งที่นำการ์ดเข้า Soul">
          <option value="drop">จากสุสาน (ใบล่าสุดก่อน)</option>
          <option value="hand">จากมือ (เลือกใบเอง)</option>
          <option value="handDrop">จากมือหรือสุสาน (เลือกใบเอง)</option>
          <option value="deck">จากบนกองเด็ค</option>
        </select>
      )}
      {(eff.type === "dropToSoul" || eff.type === "recoverFromDrop" || eff.type === "dropToDeckBottom" || (eff.type === "chooseAddSoul" && (eff.soulSrc ?? "drop") !== "deck")) && (
        <select value={eff.filter ?? "any"} onChange={e => onChange({ ...eff, filter: e.target.value as CardFilter })} className={sel} title="เลือกชนิดการ์ดที่จะดึงจากสุสาน (เอาใบที่ลงสุสานล่าสุดก่อน)">
          {DROP_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}
      {eff.type === "dropToDeckBottom" && (
        <>
          <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={!!eff.allCards} onChange={e => onChange({ ...eff, allCards: e.target.checked || undefined })} /> ทั้งหมด</label>
          <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={!!eff.shuffleAfter} onChange={e => onChange({ ...eff, shuffleAfter: e.target.checked || undefined })} /> สับเด็คหลังใส่</label>
        </>
      )}
      {eff.type !== "condBuff" && eff.type !== "soulGrant" && eff.type !== "soulCond" && eff.type !== "destroyWeaker" && eff.type !== "callSelf" && eff.type !== "shuffleDeck" && !(eff.type === "dropToDeckBottom" && eff.allCards) && <input type="number" min={1} title={EFFECT_LABELS.find(x => x.value === eff.type)?.hint} value={eff.value} onChange={e => onChange({ ...eff, value: parseInt(e.target.value) || 1 })} className={`${num} w-16`} />}
      <button onClick={onRemove} className="p-1 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={12} /></button>
      {(eff.type === "nullifyOpponentMonster" || eff.type === "restOpponent") && (
        <label className="basis-full flex items-center gap-1.5 text-xs text-slate-300 pl-1 cursor-pointer">
          <input type="checkbox" checked={!!eff.noStand} onChange={e => onChange({ ...eff, noStand: e.target.checked })} />
          และการ์ดที่เลือกนั้นไม่สามารถ Stand ได้ในเทิร์นนี้ (ใช้ตัวเดียวกับที่เลือก ไม่ต้องเลือกซ้ำ)
        </label>
      )}
      {eff.type === "noStandOpponentMonster" && (
        <p className="basis-full text-xs text-slate-500 pl-1">เลือกมอนสเตอร์ศัตรู (ถ้ามีมากกว่าจำนวนที่ระบุ จะให้ผู้เล่นเลือกเอง) · ตัวที่ถูกห้ามจะ Stand กลับไม่ได้จนจบเทิร์นนี้ เช่น Stand กลับจาก Double Attack หรือจากเอฟเฟกต์ Stand · ถ้าอยากให้พ่วงกับ Nullify / Rest ตัวเดียวกัน ให้ติ๊กช่อง “ไม่สามารถ Stand ได้” ในเอฟเฟกต์นั้นแทน</p>
      )}
      {eff.type === "callCostReduce" && (
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
          <span>เมื่อมีการ์ดชื่อ</span>
          <input value={eff.redName ?? ""} onChange={e => onChange({ ...eff, redName: e.target.value })} placeholder="เช่น Albis Wis (หลายชื่อคั่นด้วย , พิมพ์บางส่วนได้)" className={`${num} !py-0.5 text-xs w-64`} />
          <span>หรือการ์ดที่มีคุณสมบัติ</span>
          <input value={eff.redAttr ?? ""} onChange={e => onChange({ ...eff, redAttr: e.target.value })} placeholder="เช่น Dragon (หลายค่าคั่นด้วย ,)" className={`${num} !py-0.5 text-xs w-56`} />
          <span>อยู่ใน</span>
          <select value={eff.condWhere ?? "own"} onChange={e => onChange({ ...eff, condWhere: e.target.value as "own" | "opponent" | "any" })} className={`${sel} !py-0.5 text-xs`}>
            <option value="own">สนามของเรา</option>
            <option value="opponent">สนามศัตรู</option>
            <option value="any">สนามฝั่งใดก็ได้</option>
          </select>
          <p className="basis-full text-slate-500">ใช้กับสกิลแบบ “ถาวร” · ช่องตัวเลขด้านบน = ลด Call Cost กี่หน่วย (ลดจากค่าหลักของ Call Cost ต่ำสุด 0) · เจอการ์ดที่ตรงชื่อ <b>หรือ</b> ตรงคุณสมบัติใบใดใบหนึ่ง = ลด · ใช้ตอนลงสนาม / Impact Call / Counter ที่ต้องจ่าย Call Cost · หลายสกิลที่เงื่อนไขครบจะลดรวมกัน</p>
        </div>
      )}
      {eff.type === "callSelf" && (
        <div className="basis-full flex flex-wrap items-center gap-3 text-xs text-slate-300 pl-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={!!eff.payCallCost} onChange={e => onChange({ ...eff, payCallCost: e.target.checked })} />
            จ่าย Call Cost ของการ์ดตอนคอล {eff.payCallCost ? "(จ่ายตาม Call Cost ของการ์ด)" : "(ไม่ต้องจ่าย — คอลฟรี)"}
          </label>
          <p className="basis-full text-slate-500">ใช้กับการ์ดมอนสเตอร์ที่มีสกิล “Counter (ใช้จากมือ/ช่อง Set)” หรือ “เมื่อการ์ดนี้ออกจาก Soul” · ตอนใช้ผู้เล่นเลือกช่องที่จะลงได้เอง (ช่องไหนก็ได้ที่ว่างและ Size ไม่เกิน) การ์ดลงสนามเป็นมอนสเตอร์แทนที่จะลงสุสาน และเอฟเฟกต์ “เมื่อลงสนาม” / Buddy Call ทำงานตามปกติ · แบบ Counter ใช้ได้เฉพาะจากมือ (Set คว่ำไม่ได้) · แบบ “ออกจาก Soul” ใช้ได้ภายในเทิร์นนั้น จากมือหรือสุสานที่การ์ดไปอยู่ (ถูกถอด Soul / เจ้าของ Soul ถูกทำลายหรือออกจากสนาม) · ถ้าเป็นมอนสเตอร์ไม้ตายจะไม่นับเป็น Impact Call</p>
        </div>
      )}
      {eff.type === "namedToHand" && (
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
          <span>นำการ์ดชื่อ</span>
          <input value={eff.refName ?? ""} onChange={e => onChange({ ...eff, refName: e.target.value })} placeholder="ชื่อการ์ดที่จะนำขึ้นมือ (พิมพ์บางส่วนได้)" className={`${num} !py-0.5 text-xs w-64`} />
          <span>จาก</span>
          <select value={eff.fromZone ?? "drop"} onChange={e => onChange({ ...eff, fromZone: e.target.value as "drop" | "deck" | "dropDeck" })} className={`${sel} !py-0.5 text-xs`}>
            <option value="drop">สุสาน</option>
            <option value="deck">กองเด็ค (ค้นแล้วสับเด็ค)</option>
            <option value="dropDeck">สุสานก่อน ถ้าไม่พอค่อยกองเด็ค</option>
          </select>
          <span>ขึ้นมือ (จำนวนใบตามช่องค่า)</span>
          <p className="basis-full text-slate-500">ทำงานทันทีโดยไม่ต้องเลือก (ถ้ามีหลายใบที่ชื่อตรง เอาใบที่ลงสุสานล่าสุด / ใบบนสุดของเด็คก่อน) · อยากให้ทำเฉพาะตอนมีการ์ดบางใบ ให้วาง “เงื่อนไข: ถ้ามีการ์ดที่กำหนด…” ไว้ก่อนเอฟเฟกต์นี้ · เวทที่กำลังร่ายไม่ถูกนับเป็นการ์ดในสุสานที่เก็บขึ้นมือได้</p>
        </div>
      )}
      {eff.type === "requireOnField" && (
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
          <span>ต้องมีการ์ดชื่อ</span>
          <input value={eff.refName ?? ""} onChange={e => onChange({ ...eff, refName: e.target.value })} placeholder="เช่น Albis Wis (หลายใบคั่นด้วย , ต้องมีครบทุกใบ)" className={`${num} !py-0.5 text-xs w-72`} />
          <span>อยู่ใน</span>
          {([["field", "สนาม"], ["hand", "มือ"], ["drop", "สุสาน"]] as const).map(([z, label]) => {
            const cur: ("field" | "hand" | "drop")[] = eff.reqZones && eff.reqZones.length ? [...eff.reqZones] : ["field"];
            const on = cur.includes(z);
            return (
              <button key={z} type="button" onClick={() => {
                const next = on ? cur.filter(x => x !== z) : [...cur, z];
                onChange({ ...eff, reqZones: next.length ? [...next] : ["field"] });
              }} className={`px-2 py-0.5 rounded-full border text-xs ${on ? "bg-cyan-700 border-cyan-400 text-white" : "bg-slate-800 border-slate-600 text-slate-300 hover:border-cyan-500"}`}>{label}</button>
            );
          })}
          <span>(เจอในโซนใดโซนหนึ่งที่เลือก = มี)</span>
          <p className="basis-full text-slate-500">เอฟเฟกต์นี้ทำหน้าที่เป็นเงื่อนไขกั้น: วางไว้ก่อนเอฟเฟกต์ที่อยากให้ทำได้เฉพาะตอนมีการ์ดนั้น (เช่น ตามด้วย “เลือกการ์ดบนสนาม → นำการ์ดจากมือ/สุสานเข้า Soul”) ถ้าไม่มีการ์ดนั้นในโซนที่เลือก เอฟเฟกต์ที่เหลือของสกิลนี้จะไม่ทำงาน (เวทที่กำลังร่ายไม่นับเป็นการ์ดในสุสาน) · ชื่อพิมพ์บางส่วนได้ ไม่สนตัวพิมพ์เล็กใหญ่ · เอฟเฟกต์ที่อยู่ก่อนหน้าเงื่อนไขทำงานตามปกติ</p>
        </div>
      )}
      {eff.type === "destroyWeaker" && (() => {
        const stats: ("power" | "critical" | "defense")[] = eff.cmpStats && eff.cmpStats.length ? [...eff.cmpStats] : ["power"];
        const toggle = (k: "power" | "critical" | "defense") => {
          const cur: ("power" | "critical" | "defense")[] = [...stats];
          const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
          onChange({ ...eff, cmpStats: next.length ? next : ["power"] });
        };
        return (
          <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
            <span>ทำลายการ์ดศัตรูที่</span>
            {([["power", "Power (Attack)"], ["critical", "Critical"], ["defense", "Defense"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => toggle(k)} className={`px-2 py-0.5 rounded-full border text-xs ${stats.includes(k) ? "bg-cyan-700 border-cyan-400 text-white" : "bg-slate-800 border-slate-600 text-slate-300 hover:border-cyan-500"}`}>{label}</button>
            ))}
            <span>น้อยกว่า</span>
            <select value={eff.cmpMode ?? "all"} onChange={e => onChange({ ...eff, cmpMode: e.target.value as "all" | "any" })} className={`${sel} !py-0.5 text-xs`}>
              <option value="all">ทุกค่าที่เลือก</option>
              <option value="any">ค่าใดค่าหนึ่งที่เลือก</option>
            </select>
            <span className="basis-full" />
            <span>ของการ์ดชื่อ</span>
            <input value={eff.refName ?? ""} onChange={e => onChange({ ...eff, refName: e.target.value })} placeholder="ว่าง = การ์ดใบนี้ / พิมพ์ชื่อการ์ดที่กำหนด" className={`${num} !py-0.5 text-xs w-64`} />
            <span className="basis-full" />
            <span>ทำลาย:</span>
            {(() => {
              const scope = eff.destroyScope ?? (eff.includeItem ? "all" : "monster");
              const pill = (v: "monster" | "all", label: string, tip: string) => (
                <button key={v} type="button" title={tip} onClick={() => onChange({ ...eff, destroyScope: v, includeItem: v === "all" })}
                  className={`px-3 py-0.5 rounded-full border text-xs ${scope === v ? "bg-rose-700 border-rose-300 text-white" : "bg-slate-800 border-slate-600 text-slate-300 hover:border-rose-400"}`}>{label}</button>
              );
              return <>
                {pill("monster", "มอนสเตอร์เท่านั้น", "ทำลายเฉพาะมอนสเตอร์ของศัตรู")}
                {pill("all", "การ์ดทั้งหมด", "มอนสเตอร์ + ไอเทม + การ์ด Set ของศัตรู (การ์ด Set เทียบกับค่าที่พิมพ์บนการ์ด ซึ่งเวทมักเป็น 0)")}
              </>;
            })()}
            <span className="basis-full" />
            <label className="flex items-center gap-1">ยิงดาเมจตรงใส่ Life ศัตรู
              <input type="number" min={0} max={9} value={eff.lifePerKill ?? 0} onChange={e => onChange({ ...eff, lifePerKill: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) })} className={`${num} w-14 !py-0.5 text-xs`} />
              ต่อการ์ด 1 ใบที่ถูกทำลาย <span className="text-slate-500">(0 = ไม่ยิง)</span>
            </label>
            <p className="basis-full text-slate-500">ตัวที่กำหนดต้องอยู่ในสนามของเราตอนใช้ ถ้าไม่อยู่ ความสามารถนี้ไม่ทำงาน · ชื่อพิมพ์บางส่วนได้ ไม่สนตัวพิมพ์เล็กใหญ่ · ถ้ามีหลายใบที่ชื่อตรง ใช้ค่าสูงสุดของแต่ละสถานะ · ใช้ค่าปัจจุบัน (รวมบัฟ) ของทั้งสองฝ่าย · ถ้าเลือกหลายค่า “ทุกค่า” = ต้องน้อยกว่าทุกค่าที่เลือก · การ์ดที่ไม่สามารถถูกทำลายจากความสามารถ / Soulguard จะรอดตามปกติ และไม่นับเป็นใบที่ถูกทำลาย (ไม่ถูกคิดดาเมจ)</p>
          </div>
        );
      })()}
      {eff.type === "soulGrant" && (
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
          <span>เมื่อการ์ดใบนี้อยู่ใน Soul ของการ์ดที่ชื่อหรือคุณสมบัติตรงกับ</span>
          <input value={eff.targetName ?? ""} onChange={e => onChange({ ...eff, targetName: e.target.value })} placeholder="เช่น Magia Vendar, Aelfa (ว่าง = ใบใดก็ได้)" className={`${num} !py-0.5 text-xs w-64`} />
          <span>→ การ์ดนั้นได้รับความสามารถทั้งหมดของการ์ดใบนี้</span>
          <p className="basis-full text-slate-500">ใช้ได้กับสกิลทุกทริกเกอร์ (ถาวร / เมื่อลงสนาม ฯลฯ) · ได้รับสกิลอัตโนมัติทุกอย่างของการ์ดใบนี้ (รวมคีย์เวิร์ด Counter Act ต้นเทิร์น ฯลฯ) (ยกเว้นสกิลให้ความสามารถนี้เอง) ตราบที่การ์ดใบนี้ยังอยู่ใน Soul · ใส่หลายค่าคั่นด้วย , ได้ (ตรงอย่างใดอย่างหนึ่ง · เทียบทั้งชื่อและคุณสมบัติของการ์ดเจ้าของโซล) พิมพ์บางส่วนได้ ไม่สนตัวพิมพ์เล็กใหญ่ · ค่าสถานะพื้นฐาน (Power/Defense/Critical/Size) ของการ์ดไม่ถูกส่งต่อ</p>
        </div>
      )}
      {eff.type === "soulCond" && (() => {
        const kws = eff.grantKw ?? [];
        const toggleKw = (t: AutoEffectType) => onChange({ ...eff, grantKw: kws.includes(t) ? kws.filter(x => x !== t) : [...kws, t] });
        const amtIn = (label: string, k: "bPower" | "bCritical" | "bDefense", w: string) => (
          <label className="flex items-center gap-1">{label} +
            <input type="number" min={0} value={eff[k] ?? 0} onChange={e => onChange({ ...eff, [k]: Math.max(0, parseInt(e.target.value) || 0) })} className={`${num} !py-0.5 text-xs ${w}`} />
          </label>
        );
        return (
          <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
            <span>ถ้าใน Soul ของการ์ดนี้มีการ์ด</span>
            <select value={eff.condMatch ?? "attr"} onChange={e => onChange({ ...eff, condMatch: e.target.value as "attr" | "name" })} className={`${sel} !py-0.5 text-xs`}>
              <option value="attr">ที่มีคุณสมบัติ</option>
              <option value="name">ที่ชื่อ</option>
            </select>
            <input value={eff.condText ?? ""} onChange={e => onChange({ ...eff, condText: e.target.value })} placeholder="เช่น เจ้าสาว, Aelfa (ว่าง = ใบใดก็ได้)" className={`${num} !py-0.5 text-xs w-56`} />
            <label className="flex items-center gap-1">อย่างน้อย
              <input type="number" min={1} max={20} value={eff.value} onChange={e => onChange({ ...eff, value: Math.max(1, parseInt(e.target.value) || 1) })} className={`${num} !py-0.5 text-xs w-14`} /> ใบ
            </label>
            <span className="basis-full" />
            <span>ผู้ได้รับ ได้รับ:</span>
            {amtIn("Power", "bPower", "w-20")}
            {amtIn("Critical", "bCritical", "w-14")}
            {amtIn("Defense", "bDefense", "w-20")}
            <label className="flex items-center gap-1" title="เช่น Power +5000 × จำนวนการ์ดใน Soul ที่ตรงเงื่อนไข"><input type="checkbox" checked={!!eff.perSoul} onChange={e => onChange({ ...eff, perSoul: e.target.checked })} /> คูณตามจำนวนการ์ดใน Soul (ต่อใบ)</label>
            <span className="basis-full" />
            <span>ผู้ได้รับ:</span>
            <select value={eff.targetMatch ?? "attr"} onChange={e => onChange({ ...eff, targetMatch: e.target.value as "attr" | "name" })} className={`${sel} !py-0.5 text-xs`}>
              <option value="attr">การ์ดของเราที่มีคุณสมบัติ</option>
              <option value="name">การ์ดของเราที่ชื่อ</option>
            </select>
            <input value={eff.targetText ?? ""} onChange={e => onChange({ ...eff, targetText: e.target.value })} placeholder="เช่น Magia Vendar, Lyzance (ว่าง = การ์ดใบนี้)" className={`${num} !py-0.5 text-xs w-64`} />
            {(eff.targetText ?? "").trim() !== "" && (
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!eff.includeSelf} onChange={e => onChange({ ...eff, includeSelf: e.target.checked })} /> รวมการ์ดใบนี้ด้วย</label>
            )}
            <span className="basis-full" />
            <span>และคีย์เวิร์ด:</span>
            {SOUL_GRANT_KEYWORDS.map(k => (
              <button key={k.value} type="button" onClick={() => toggleKw(k.value)} className={`px-2 py-0.5 rounded-full border text-xs ${kws.includes(k.value) ? "bg-cyan-700 border-cyan-400 text-white" : "bg-slate-800 border-slate-600 text-slate-300 hover:border-cyan-500"}`}>{kws.includes(k.value) ? "✔ " : ""}{k.label}</button>
            ))}
            <p className="basis-full text-slate-500">ใช้กับสกิลแบบ “ถาวร” · ผู้ได้รับว่าง = การ์ดใบนี้เอง · ถ้ามีหลายระดับ (เช่น โซล 3 ใบ / 5 ใบ) ให้เพิ่มเอฟเฟกต์นี้หลายอัน · มีผลตราบที่จำนวนการ์ดใน Soul ยังครบ (หายเมื่อ Soul ลดลง) · คุณสมบัติ = ช่อง attribute ของการ์ด · ใส่หลายค่าคั่นด้วย , ได้ (ตรงอย่างใดอย่างหนึ่ง) · พิมพ์บางส่วนได้ ไม่สนตัวพิมพ์เล็กใหญ่</p>
          </div>
        );
      })()}
      {eff.type === "condBuff" && (() => {
        const amt = condBuffAmounts(eff);
        const setAmt = (k: "bPower" | "bCritical" | "bDefense" | "bSize", v: number) => onChange({ ...eff, bPower: amt.power, bCritical: amt.critical, bDefense: amt.defense, bSize: amt.size, [k]: v });
        const amtIn = (label: string, k: "bPower" | "bCritical" | "bDefense", val: number, w: string) => (
          <label className="flex items-center gap-1">{label} +
            <input type="number" min={0} value={val} onChange={e => setAmt(k, Math.max(0, parseInt(e.target.value) || 0))} className={`${num} !py-0.5 text-xs ${w}`} />
          </label>
        );
        return (
          <div className="basis-full flex flex-wrap items-center gap-2 text-xs text-slate-300 pl-1">
            <span>ได้รับ:</span>
            {amtIn("Power (ดาเมจ)", "bPower", amt.power, "w-20")}
            {amtIn("Critical", "bCritical", amt.critical, "w-14")}
            {amtIn("Defense", "bDefense", amt.defense, "w-20")}
            <label className="flex items-center gap-1" title="ติดลบ = ลด Size เช่น -1">Size (ลบ = ลด)
              <input type="number" min={-9} max={9} value={amt.size} onChange={e => setAmt("bSize", Math.max(-9, Math.min(9, parseInt(e.target.value) || 0)))} className={`${num} !py-0.5 text-xs w-16`} />
            </label>
            <span className="basis-full" />
            <span>เมื่อในสนาม</span>
            <select value={eff.condWhere ?? "own"} onChange={e => onChange({ ...eff, condWhere: e.target.value as "own" | "opponent" | "any" })} className={`${sel} !py-0.5 text-xs`}>
              <option value="own">ของเรา</option>
              <option value="opponent">ฝั่งศัตรู</option>
              <option value="any">ทั้งสองฝั่ง</option>
            </select>
            <span>มีการ์ดใบอื่นที่</span>
            <select value={eff.condMatch ?? "attr"} onChange={e => onChange({ ...eff, condMatch: e.target.value as "attr" | "name" })} className={`${sel} !py-0.5 text-xs`}>
              <option value="attr">มีคุณสมบัติ</option>
              <option value="name">ชื่อ</option>
            </select>
            <input value={eff.condText ?? ""} onChange={e => onChange({ ...eff, condText: e.target.value })} placeholder='เช่น Magia Vendar, Aelfa' className={`${num} !py-0.5 text-xs w-52`} />
            <span className="basis-full" />
            <span>ผู้ได้รับบัฟ:</span>
            <input value={eff.targetName ?? ""} onChange={e => onChange({ ...eff, targetName: e.target.value })} placeholder="ว่าง = การ์ดใบนี้ / พิมพ์ชื่อการ์ด" className={`${num} !py-0.5 text-xs w-56`} />
            {(eff.targetName ?? "").trim() !== "" && (
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!eff.includeSelf} onChange={e => onChange({ ...eff, includeSelf: e.target.checked })} /> รวมการ์ดใบนี้ด้วย</label>
            )}
            <span className="basis-full" />
            <span>และความสามารถ/คีย์เวิร์ดเพิ่มเติม:</span>
            {SOUL_GRANT_KEYWORDS.map(k => {
              const on = (eff.grantKw ?? []).includes(k.value);
              return (
                <button key={k.value} type="button"
                  onClick={() => onChange({ ...eff, grantKw: on ? (eff.grantKw ?? []).filter(x => x !== k.value) : [...(eff.grantKw ?? []), k.value] })}
                  className={`px-2 py-0.5 rounded-full border text-xs ${on ? "bg-cyan-700 border-cyan-400 text-white" : "bg-slate-800 border-slate-600 text-slate-300 hover:border-cyan-500"}`}>{k.label}</button>
              );
            })}
            <p className="basis-full text-slate-500">
              เลือกตัวกระตุ้นของสกิลเป็น “ถาวร” = มีผลตลอดตราบที่เงื่อนไขครบ (หายเมื่อเงื่อนไขไม่ครบ) · เลือกตัวกระตุ้นอื่น เช่น “เมื่อลงสนาม” “เมื่อโจมตี” = ตรวจเงื่อนไขตอนสกิลทำงาน แล้วบัฟจนจบเทิร์น ·
              คุณสมบัติ = ข้อความช่อง attribute ของการ์ด · พิมพ์บางส่วนได้ ไม่สนตัวพิมพ์เล็กใหญ่ · ไม่นับการ์ดใบที่ถือสกิลนี้เอง · เว้นเงื่อนไขว่าง = ได้บัฟเสมอ · ความสามารถ/คีย์เวิร์ดเพิ่มเติมใช้ได้โดยไม่ต้องใส่ค่าบัฟ (ปล่อยเป็น 0) และผู้ได้รับคีย์เวิร์ดคือผู้ได้รับบัฟเดียวกัน · ถ้าผู้ได้รับถูก Nullify คีย์เวิร์ดที่ได้รับจะใช้ไม่ได้ในเทิร์นนั้น
            </p>
          </div>
        );
      })()}
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
      {act && (
        <div className="flex items-center gap-2 flex-wrap">
          <span>ใช้ได้กี่ครั้งต่อเทิร์น:</span>
          <input type="number" min={0} max={9} value={skill.maxPerTurn ?? 1}
            onChange={e => { const v = Math.max(0, Math.min(9, parseInt(e.target.value) || 0)); onChange({ ...skill, maxPerTurn: v === 1 ? undefined : v }); }}
            className={`${num} w-14 !py-0.5 text-xs`} />
          <span className="text-slate-500">(1 = ค่าเริ่มต้น · 0 = ไม่จำกัด · จ่ายค่าใช้จ่ายใหม่ทุกครั้งที่ใช้)</span>
        </div>
      )}
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
        ? "Counter 【Act】: ความสามารถของการ์ด \"บนสนาม\" กดใช้ได้ตามจำนวนครั้งต่อเทิร์นที่ตั้งไว้ (ค่าเริ่มต้น 1 ครั้ง, การ์ดยังอยู่บนสนาม) จ่ายตามที่เขียน เช่น เอฟเฟกต์แรกเป็น \"ถอด Soul\" ถ้าจ่ายไม่ได้ก็ใช้ไม่ได้"
        : "【Counter】: ใช้จาก \"มือ\" หรือช่อง Set (ใช้แล้วการ์ดลงสุสาน) จ่าย Cost ตามปกติ ใช้ได้ในเทิร์นของศัตรูตอนเขาโจมตีหรือร่ายเวท ตามจังหวะที่เลือก ใช้ได้กับทุกประเภทการ์ด"}
        {" "}ตอนศัตรูโจมตีใช้เอฟเฟกต์อย่าง "ยกเลิกการโจมตี" ได้ ตอนร่ายเวทใช้ "ยกเลิกเวท" ได้</p>
    </div>
  );
}

// สกิลนี้ไม่สามารถถูกยกเลิกด้วยความสามารถ (Nullify) ได้
export function NullifyProofToggle({ skill, onChange }: { skill: AutoSkill; onChange: (s: AutoSkill) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300 mb-2 cursor-pointer">
      <input type="checkbox" checked={!!skill.nullifyProof} onChange={e => onChange({ ...skill, nullifyProof: e.target.checked || undefined })} />
      ความสามารถนี้ไม่สามารถถูกยกเลิกด้วยความสามารถได้ (ถูก Nullify แล้วสกิลนี้ยังทำงาน)
    </label>
  );
}
