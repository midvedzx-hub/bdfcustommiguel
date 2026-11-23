import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, Star, X } from "lucide-react";
import type { AutoEffect, AutoEffectType, AutoSkill } from "@/types";
import { EFFECT_LABELS } from "@/types";

/* ตัวเลือกความสามารถ (เอฟเฟกต์) แบบค้นหาได้
 * - พิมพ์ค้นหาได้ทั้งภาษาไทย/อังกฤษ (เช่น "ทำลาย", "destroy", "soul", "จั่ว")
 * - แบ่งหมวดหมู่ + ปุ่มกรองหมวด
 * - จำ "ใช้ล่าสุด" ไว้ด้านบน
 * - ใช้คีย์บอร์ดได้: ↑ ↓ เลือก · Enter ยืนยัน · Esc ปิด
 */

export const EFFECT_GROUPS = [
  "พื้นฐาน (จั่ว / เกจ / Life)",
  "บัฟ / สถานะ",
  "คีย์เวิร์ดโจมตี",
  "ป้องกัน / ทนทาน",
  "จัดการมอนสเตอร์ศัตรู",
  "Counter (ตอบโต้)",
  "Soul (โซล)",
  "สุสาน / เด็ค / มือ",
  "ลงสนาม / Set / เงื่อนไข",
] as const;
type Group = (typeof EFFECT_GROUPS)[number];
const [G_BASE, G_BUFF, G_ATK, G_DEF, G_ENEMY, G_COUNTER, G_SOUL, G_ZONE, G_OTHER] = EFFECT_GROUPS;

// หมวดหมู่ + คำค้นเพิ่มเติม (ไทย/อังกฤษ) ของแต่ละเอฟเฟกต์
const META: Record<string, { g: Group; q: string }> = {
  draw: { g: G_BASE, q: "จั่ว draw ไพ่ การ์ด" },
  addGauge: { g: G_BASE, q: "ชาร์จ charge เกจ gauge เด็คไปเกจ" },
  addLife: { g: G_BASE, q: "ฟื้น heal life พลังชีวิต เพิ่มไลฟ์" },
  reduceLife: { g: G_BASE, q: "ดาเมจ damage ตรง ลด life ผู้เล่น" },
  opponentDiscard: { g: G_BASE, q: "ทิ้งการ์ด discard ศัตรู มือ" },

  buffPower: { g: G_BUFF, q: "power attack พลังโจมตี บัฟ เพิ่ม" },
  buffCritical: { g: G_BUFF, q: "critical crit คริติคอล บัฟ เพิ่ม" },
  buffDefense: { g: G_BUFF, q: "defense def ป้องกัน บัฟ เพิ่ม" },
  powerPerSoul: { g: G_BUFF, q: "power ต่อ soul ตามจำนวนโซล ถาวร" },
  criticalPerSoul: { g: G_BUFF, q: "critical ต่อ soul ตามจำนวนโซล ถาวร" },
  condBuff: { g: G_BUFF, q: "เงื่อนไข condition ถ้ามีการ์ด บัฟถาวร" },
  callCostAura: { g: G_BUFF, q: "ลด call cost การ์ดอื่น ออร่า aura ขณะอยู่ในสนาม คุณสมบัติ ชื่อ ลดต้นทุน" },
  callCostReduce: { g: G_BUFF, q: "ลด call cost ค่าลง ลดต้นทุน" },
  soulCond: { g: G_BUFF, q: "soul โซล ถ้ามีการ์ด X ใบ บัฟ คีย์เวิร์ด เงื่อนไขโซล" },

  penetrate: { g: G_ATK, q: "ทะลวง penetrate โจมตีผู้เล่น" },
  doubleAttack: { g: G_ATK, q: "double attack โจมตี 2 ครั้ง สองครั้ง" },
  tripleAttack: { g: G_ATK, q: "triple attack โจมตี 3 ครั้ง สามครั้ง" },
  quadrupleAttack: { g: G_ATK, q: "quadruple attack โจมตี 4 ครั้ง สี่ครั้ง" },
  hextupleAttack: { g: G_ATK, q: "hextuple attack โจมตี 6 ครั้ง หกครั้ง" },
  multiAttack: { g: G_ATK, q: "โจมตีหลายครั้ง multi attack กำหนดเอง" },
  ignoreCenter: { g: G_ATK, q: "ตีผู้เล่น ข้ามมอนกลาง ignore center" },
  counterattack: { g: G_ATK, q: "ตอบโต้ counterattack ผู้โจมตี" },
  move: { g: G_ATK, q: "ย้ายช่อง move เปลี่ยนตำแหน่ง" },
  lifelink: { g: G_ATK, q: "lifelink ตายแล้ว เจ้าของโดนดาเมจ" },
  kw: { g: G_ATK, q: "ป้าย คีย์เวิร์ด keyword badge" },

  soulguard: { g: G_DEF, q: "soulguard กันออกจากสนาม ถอด soul" },
  indestructibleBattle: { g: G_DEF, q: "ไม่ถูกทำลาย ในการต่อสู้ indestructible battle" },
  indestructible: { g: G_DEF, q: "ไม่ถูกทำลาย จากความสามารถ indestructible" },
  nullifyProofSelf: { g: G_DEF, q: "ความสามารถนี้ไม่สามารถถูกยกเลิกด้วยความสามารถได้ กัน nullify เฉพาะสกิลนี้ nullify proof ไม่ถูกยกเลิก" },
  unnullifiable: { g: G_DEF, q: "ไม่ถูกยกเลิก nullify proof กัน nullify" },

  destroyWeaker: { g: G_ENEMY, q: "ทำลาย destroy ที่ค่าน้อยกว่า เทียบ power defense" },
  destroyOpponentMonster: { g: G_ENEMY, q: "ทำลาย destroy ฆ่า มอนสเตอร์ศัตรู" },
  restOpponent: { g: G_ENEMY, q: "rest นอน ล้ม มอนสเตอร์ศัตรู" },
  nullifyOpponentMonster: { g: G_ENEMY, q: "nullify ยกเลิกความสามารถ ศัตรู" },
  bounceOpponentMonster: { g: G_ENEMY, q: "bounce ดึงกลับมือ ศัตรู" },
  opponentMonsterToDrop: { g: G_ENEMY, q: "ส่งลงสุสาน ไม่ใช่ทำลาย ศัตรู" },
  opponentMonsterToDeck: { g: G_ENEMY, q: "ใส่กลับเด็ค ศัตรู" },
  noStandOpponentMonster: { g: G_ENEMY, q: "ห้าม stand ไม่ลุก ศัตรู" },
  destroyOpponentSet: { g: G_ENEMY, q: "ทำลายการ์ด set ศัตรู" },

  negateAttack: { g: G_COUNTER, q: "counter ยกเลิกการโจมตี negate attack กันโจมตี" },
  destroyAttacker: { g: G_COUNTER, q: "counter ทำลายผู้โจมตี destroy attacker" },
  restAttacker: { g: G_COUNTER, q: "counter rest ผู้โจมตี" },
  negateSpell: { g: G_COUNTER, q: "counter ยกเลิกเวท negate spell" },

  addSoul: { g: G_SOUL, q: "เพิ่ม soul เด็คเข้าโซล" },
  removeSoul: { g: G_SOUL, q: "ถอด soul ลงสุสาน ค่าใช้จ่าย cost" },
  dropToSoul: { g: G_SOUL, q: "สุสานเข้าโซล drop to soul" },
  soulToHand: { g: G_SOUL, q: "ถอด soul ขึ้นมือ" },
  chooseRemoveSoul: { g: G_SOUL, q: "เลือก ถอด soul การ์ดที่เลือก" },
  chooseAddSoul: { g: G_SOUL, q: "เลือก เพิ่ม soul จากมือ สุสาน บนกอง" },
  soulGrant: { g: G_SOUL, q: "อยู่ใน soul ให้ความสามารถ เจ้าของโซล soulbound" },
  selfToSoul: { g: G_SOUL, q: "นำการ์ดนี้เข้า soul ของการ์ดอื่น ตัวเองเข้าโซล counter act คุณสมบัติ ชื่อ" },

  recoverFromDrop: { g: G_ZONE, q: "เก็บ สุสานขึ้นมือ recover salvage" },
  dropToDeckBottom: { g: G_ZONE, q: "สุสานกลับใต้เด็ค สับเด็ค shuffle deck bottom" },
  shuffleDeck: { g: G_ZONE, q: "สับเด็ค shuffle" },
  lookTop: { g: G_ZONE, q: "ดูการ์ดบนสุด look top ค้นเด็ค" },
  namedToHand: { g: G_ZONE, q: "ค้นการ์ดตามชื่อ ขึ้นมือ search" },

  standSelf: { g: G_OTHER, q: "stand ลุก ยืน ตัวเอง" },
  callSelf: { g: G_OTHER, q: "call คอลตัวเอง ลงสนาม" },
  set: { g: G_OTHER, q: "set ช่องเซ็ต คงผลต่อเนื่อง" },
  requireOnField: { g: G_OTHER, q: "เงื่อนไข ต้องมีการ์ด require" },
};

const groupOf = (t: string): Group => META[t]?.g ?? G_OTHER;

const RECENT_KEY = "cbf_recent_effects";
function loadRecent(): AutoEffectType[] {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
}
function pushRecent(t: AutoEffectType) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...loadRecent().filter(x => x !== t)].slice(0, 8))); } catch { /* ignore */ }
}

/** สร้างเอฟเฟกต์ใหม่ของชนิดที่เลือก พร้อมค่าเริ่มต้นที่ใช้บ่อย */
export function newEffect(type: AutoEffectType): AutoEffect {
  const defaults: Partial<Record<AutoEffectType, number>> = { buffPower: 5000, buffDefense: 5000, powerPerSoul: 1000, soulCond: 2, lookTop: 3, lifelink: 1000 };
  return { type, value: defaults[type] ?? 1 };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKC");

interface Entry { value: AutoEffectType; label: string; hint?: string; group: Group; hay: string }
const ENTRIES: Entry[] = EFFECT_LABELS.map(e => ({
  value: e.value, label: e.label, hint: e.hint, group: groupOf(e.value),
  hay: norm(`${e.label} ${e.value} ${META[e.value]?.q ?? ""} ${groupOf(e.value)}`),
}));

// ---------- แผงเลือก (popup) ----------
function Panel({ anchor, current, onPick, onClose }: { anchor: HTMLElement; current?: AutoEffectType; onPick: (t: AutoEffectType) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group | "all">("all");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean }>({ left: 0, top: 0, width: 380, maxH: 420, up: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recent = useMemo(loadRecent, []);

  // วางแผงใต้ (หรือเหนือ) ปุ่ม และอัปเดตตำแหน่งเมื่อเลื่อนหน้า/ย่อขยายหน้าต่าง
  const place = () => {
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { onClose(); return; } // ปุ่มเลื่อนพ้นจอแล้ว
    const width = Math.min(Math.max(r.width, 400), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 300 && above > below;
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, maxH: Math.max(240, Math.min(520, up ? above : below)), up });
  };
  useLayoutEffect(place, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", down);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", place); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, onClose]);

  const tokens = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const filtered = useMemo(() => ENTRIES.filter(e => (group === "all" || e.group === group) && tokens.every(t => e.hay.includes(t))), [tokens, group]);
  const showRecent = tokens.length === 0 && group === "all" && recent.length > 0;
  // รายการที่แสดงตามลำดับจริง (ใช้กับคีย์บอร์ด)
  const flat: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    if (showRecent) recent.forEach(t => { const e = ENTRIES.find(x => x.value === t); if (e) out.push(e); });
    if (tokens.length > 0) out.push(...filtered);
    else EFFECT_GROUPS.forEach(g => out.push(...filtered.filter(e => e.group === g)));
    return out;
  }, [filtered, tokens, showRecent, recent]);

  useEffect(() => { setActive(0); }, [q, group]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const choose = (t: AutoEffectType) => { pushRecent(t); onPick(t); onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[active]) choose(flat[active].value); }
  };

  let idx = -1;
  const row = (e: Entry, withGroup: boolean) => {
    idx++;
    const i = idx;
    const isCur = e.value === current;
    return (
      <button key={`${i}-${e.value}`} type="button" data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => choose(e.value)}
        className={`w-full text-left px-3 py-1.5 rounded-lg flex flex-col gap-0.5 ${i === active ? "bg-cyan-800/60" : "hover:bg-slate-800"} ${isCur ? "ring-1 ring-cyan-400" : ""}`}>
        <span className="text-sm text-slate-100 flex items-center gap-1.5">{isCur && <span className="text-cyan-300">✓</span>}{e.label}</span>
        <span className="text-[11px] text-slate-400 flex gap-2 flex-wrap">
          {withGroup && <span className="text-cyan-400">{e.group}</span>}
          {e.hint && <span>ค่า: {e.hint}</span>}
        </span>
      </button>
    );
  };

  return createPortal(
    <div ref={panelRef} onKeyDown={onKey} className="fixed z-[200] bg-slate-900 border border-cyan-500/60 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
      <div className="p-2 border-b border-slate-800 flex items-center gap-2">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาความสามารถ เช่น ทำลาย, จั่ว, soul, destroy, double…"
          className="flex-1 bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500" />
        {q && <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="p-0.5 text-slate-400 hover:text-white"><X size={14} /></button>}
      </div>
      <div className="px-2 py-1.5 border-b border-slate-800 flex flex-wrap gap-1">
        {(["all", ...EFFECT_GROUPS] as const).map(g => (
          <button key={g} type="button" onClick={() => setGroup(g)}
            className={`px-2 py-0.5 rounded-full text-[11px] border ${group === g ? "bg-cyan-600 border-cyan-300 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:border-cyan-500"}`}>{g === "all" ? "ทั้งหมด" : g.replace(/ \(.*\)$/, "")}</button>
        ))}
      </div>
      <div ref={listRef} className="overflow-y-auto p-1.5 flex-1">
        {flat.length === 0 && <div className="text-sm text-slate-400 text-center py-6">ไม่พบความสามารถที่ตรงกับ “{q}”<br /><span className="text-xs">ลองใช้คำอื่น หรือกด “ทั้งหมด” เพื่อดูทุกหมวด</span></div>}
        {showRecent && (
          <>
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-bold text-amber-300 flex items-center gap-1"><Star size={11} /> ใช้ล่าสุด</div>
            {recent.map(t => { const e = ENTRIES.find(x => x.value === t); return e ? row(e, true) : null; })}
          </>
        )}
        {tokens.length > 0
          ? filtered.map(e => row(e, true))
          : EFFECT_GROUPS.map(g => {
              const list = filtered.filter(e => e.group === g);
              if (list.length === 0) return null;
              return (
                <div key={g}>
                  <div className="px-2 pt-2 pb-0.5 text-[11px] font-bold text-cyan-300 sticky top-0 bg-slate-900/95">{g} <span className="text-slate-500 font-normal">({list.length})</span></div>
                  {list.map(e => row(e, false))}
                </div>
              );
            })}
      </div>
      <div className="px-3 py-1 border-t border-slate-800 text-[10px] text-slate-500">↑ ↓ เลือก · Enter ยืนยัน · Esc ปิด · ทั้งหมด {ENTRIES.length} ความสามารถ</div>
    </div>,
    document.body
  );
}

// ---------- ปุ่ม + แผงเลือก ----------
function usePicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return { open, setOpen, ref };
}

/** แทน <select> ชนิดเอฟเฟกต์เดิม: แสดงชื่อที่เลือกอยู่ กดแล้วเปิดแผงค้นหา */
export function EffectSelect({ value, onChange, className = "" }: { value: AutoEffectType; onChange: (t: AutoEffectType) => void; className?: string }) {
  const { open, setOpen, ref } = usePicker();
  const label = EFFECT_LABELS.find(e => e.value === value)?.label ?? value;
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} title="กดเพื่อค้นหา/เปลี่ยนความสามารถ"
        className={`bg-slate-800 border ${open ? "border-cyan-400" : "border-slate-700"} hover:border-cyan-500 rounded-lg px-2 py-1.5 text-sm text-left flex items-center gap-2 ${className}`}>
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      {open && ref.current && <Panel anchor={ref.current} current={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

/** ปุ่ม "+ เพิ่มผลลัพธ์": เลือกความสามารถจากแผงค้นหา แล้วเพิ่มทันที */
export function AddEffectButton({ onPick, label = "เพิ่มผลลัพธ์", className = "" }: { onPick: (t: AutoEffectType) => void; label?: string; className?: string }) {
  const { open, setOpen, ref } = usePicker();
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)}
        className={className || "text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"}><Plus size={12} /> {label}</button>
      {open && ref.current && <Panel anchor={ref.current} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------- เทมเพลตสกิล: ค้นหา + ย่อ/ขยาย ----------
export function TemplateChips({ templates, onAdd, extra }: { templates: { label: string; skill: AutoSkill }[]; onAdd: (i: number) => void; extra?: ReactNode }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  const list = templates.map((t, i) => ({ t, i })).filter(({ t }) => tokens.every(k => norm(t.label).includes(k)));
  const LIMIT = 14;
  const shown = all || tokens.length > 0 ? list : list.slice(0, LIMIT);
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <p className="text-xs text-slate-500">เทมเพลตสกิล (กดเพื่อเพิ่มทันที):</p>
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5">
          <Search size={12} className="text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเทมเพลต…" className="bg-transparent outline-none text-xs w-40 placeholder:text-slate-500" />
          {q && <button type="button" onClick={() => setQ("")} className="text-slate-400 hover:text-white"><X size={12} /></button>}
        </div>
        {extra}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(({ t, i }) => (
          <button key={i} type="button" onClick={() => onAdd(i)} className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-700 border border-slate-700 rounded-full text-xs">{t.label}</button>
        ))}
        {list.length === 0 && <span className="text-xs text-slate-500">ไม่พบเทมเพลตที่ตรงกับ “{q}”</span>}
        {tokens.length === 0 && list.length > LIMIT && (
          <button type="button" onClick={() => setAll(a => !a)} className="px-2.5 py-1 text-xs text-cyan-300 hover:text-cyan-200 underline">{all ? "ย่อรายการ" : `ดูทั้งหมด (${list.length})`}</button>
        )}
      </div>
    </div>
  );
}
