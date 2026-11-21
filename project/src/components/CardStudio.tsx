import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { Plus, Save, Trash2, Download, Upload, Edit3, Copy, Zap, Search, Layers, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { ScreenShell, EmptyState } from "@/components/ui";
import type { Card, Flag, CardType, AutoTrigger, AutoEffectType, AutoEffect, AutoSkill } from "@/types";
import { TRIGGER_LABELS, EFFECT_LABELS, DROP_FILTERS, callCostLabel, transformCostLabel, deckBuddies } from "@/types";
import type { CardFilter } from "@/types";
import { getCards, saveCards, getFlags, saveFlags, getDecks, saveDecks, uid, downloadJSON, parseImport, applyImport, exportCards } from "@/storage";
import type { ParsedImport } from "@/storage";
import { TransferDialog } from "@/components/TransferDialog";
import { ImageUpload } from "@/components/ImageUpload";
import { CardView } from "@/components/CardView";
import { SKILL_TEMPLATES } from "@/game/helpers";
import { EffectRow, CounterOptions, NullifyProofToggle } from "@/components/SkillEditor";
import { CustomKeywordPanel } from "@/components/CustomKeywords";
import { KEYWORD_DEFS, KW_CATEGORIES, type KeywordDef } from "@/game/keywords";

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
  customTexts: [""],
  flavorText: "",
  autoSkills: [],
  attribute: "",
};

// ช่องข้อความที่ขยายความสูงตามเนื้อหาอัตโนมัติ (ไม่ต้องเลื่อนในช่อง)
function AutoTextarea({ value, onChange, placeholder, className = "", minRows = 2 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit); // ความกว้างเปลี่ยน -> ตัดบรรทัดใหม่
    return () => window.removeEventListener("resize", fit);
  }, []);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={minRows} className={`${className} overflow-hidden resize-none`} />;
}

export function CardStudio({ onBack, startEditing }: { onBack: () => void; startEditing?: Card }) {
  const [cards, setCards] = useState<Card[]>(getCards());
  const [transfer, setTransfer] = useState<null | { mode: "export" } | { mode: "import"; parsed: ParsedImport }>(null);
  const [flags] = useState<Flag[]>(getFlags());
  const [editing, setEditing] = useState<Card | null>(null);

  // สกิลอิสระหลายข้อ: เก็บเป็น customTexts และอัปเดต customText (รวมด้วยบรรทัดใหม่) ให้เข้ากับของเก่า
  const getCustomTexts = (c: Card): string[] => {
    if (c.customTexts && c.customTexts.length > 0) return c.customTexts;
    return [c.customText ?? ""];
  };
  const setCustomTexts = (list: string[]) => {
    setEditing(prev => prev ? { ...prev, customTexts: list, customText: list.map(t => t.trim()).filter(Boolean).join("\n") } : prev);
  };
  // สลับลำดับข้อความ: ย้ายข้อที่ from ไปอยู่ตำแหน่ง to
  const moveCustomText = (from: number, to: number) => {
    setEditing(prev => {
      if (!prev) return prev;
      const list = [...getCustomTexts(prev)];
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return prev;
      const [it] = list.splice(from, 1);
      list.splice(to, 0, it);
      return { ...prev, customTexts: list, customText: list.map(t => t.trim()).filter(Boolean).join("\n") };
    });
  };
  const [dragText, setDragText] = useState<number | null>(null);
  const [overText, setOverText] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [worldFilter, setWorldFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null); // การ์ดที่กำลังลากเพื่อจัดลำดับ
  const [overId, setOverId] = useState<string | null>(null);

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
    const cleanTexts = getCustomTexts(editing).map(t => t.trim()).filter(Boolean);
    const toSave: Card = { ...editing, customTexts: cleanTexts, customText: cleanTexts.join("\n"), flavorText: (editing.flavorText ?? "").trim(), buddyPartners: (editing.buddyPartners ?? []).map(t => t.trim()).filter(Boolean), callRequires: (editing.callRequires ?? []).map(t => t.trim()).filter(Boolean) };
    const exists = cards.some(c => c.id === toSave.id);
    const next = exists ? cards.map(c => c.id === toSave.id ? toSave : c) : [...cards, toSave];
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
    saveDecks(getDecks().map(d => {
      const left = deckBuddies(d).filter(x => x !== id);
      return { ...d, cardIds: d.cardIds.filter(x => x !== id), buddyId: left[0] ?? null, buddyIds: left };
    }));
    saveFlags(getFlags().map(f => ({ ...f, buddyIds: (f.buddyIds ?? []).filter(x => x !== id) })));
  }

  // ---- คีย์เวิร์ด: เก็บเป็นสกิลถาวร (continuous) 1 เอฟเฟกต์ต่อคีย์เวิร์ด ----
  const kwMatch = (e: AutoEffect, d: KeywordDef) => (d.engine ? (e.type === d.effect || (d.id === "Set" && e.type === "kw" && e.name === "Set")) : e.type === "kw" && e.name === d.id);
  const findKw = (d: KeywordDef): AutoEffect | undefined => {
    for (const sk of editing?.autoSkills ?? []) {
      if (sk.trigger !== "continuous" && sk.trigger !== "onAttack") continue;
      const e = sk.effects.find(x => kwMatch(x, d));
      if (e) return e;
    }
    return undefined;
  };
  function toggleKw(d: KeywordDef) {
    if (!editing) return;
    if (findKw(d)) {
      const skills = editing.autoSkills
        .map(sk => (sk.trigger === "continuous" || sk.trigger === "onAttack") ? { ...sk, effects: sk.effects.filter(e => !kwMatch(e, d)) } : sk)
        .filter(sk => sk.effects.length > 0);
      setEditing({ ...editing, autoSkills: skills });
    } else {
      const eff: AutoEffect = d.engine ? { type: d.effect as AutoEffectType, value: 1 } : { type: "kw", name: d.id, value: 1 };
      setEditing({ ...editing, autoSkills: [...editing.autoSkills, { trigger: "continuous", effects: [eff] }] });
    }
  }
  function setKwValue(d: KeywordDef, v: number) {
    if (!editing) return;
    setEditing({
      ...editing,
      autoSkills: editing.autoSkills.map(sk => ({ ...sk, effects: sk.effects.map(e => (kwMatch(e, d) ? { ...e, value: Math.max(1, v) } : e)) })),
    });
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
        const parsed = parseImport(reader.result as string);
        if (parsed.cards.length === 0) throw new Error("ไม่พบการ์ดในไฟล์นี้ (ถ้าเป็นไฟล์เด็ค ให้ Import ที่หน้า Deck Builder)");
        setTransfer({ mode: "import", parsed });
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : "ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function confirmTransfer(sel: Record<string, Set<string>>) {
    if (!transfer) return;
    try {
      if (transfer.mode === "export") {
        downloadJSON(exportCards(cards.filter(c => sel.cards.has(c.id))), "cards.json");
      } else {
        const r = applyImport({ ...transfer.parsed, decks: [] }, { cards: sel.cards });
        setCards(getCards());
        alert(`นำเข้าสำเร็จ: ${r.cards} การ์ด${r.flags ? `, ${r.flags} Flag` : ""}`);
        if (r.flags > 0) window.location.reload(); // โหลด Flag ใหม่เข้าตัวเลือกของการ์ด
      }
      setTransfer(null);
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : "ทำรายการไม่สำเร็จ");
    }
  }

  const flagOf = (c: Card) => flags.find(f => f.id === c.flagId);
  const q = search.trim().toLowerCase();
  const filtered = cards.filter(c =>
    (filter === "all" || c.type === filter) &&
    (worldFilter === "all" || c.flagId === worldFilter) &&
    (!q || c.name.toLowerCase().includes(q) || (c.attribute ?? "").toLowerCase().includes(q))
  );
  // จัดลำดับการ์ดเอง: ย้ายการ์ด fromId ไปแทนที่ตำแหน่งของ toId (ลำดับใน cards = ลำดับที่แสดง และถูกบันทึกไว้)
  function moveCard(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = cards.findIndex(c => c.id === fromId);
    const to = cards.findIndex(c => c.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...cards];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persist(next);
  }

  // ปุ่มลูกศร: เลื่อนไปทางซ้าย/ขวาเทียบกับการ์ดข้างเคียงที่เห็นอยู่ (ใช้ได้ทั้งตอนกรองอยู่และบนจอสัมผัส)
  function shiftCard(id: string, dir: -1 | 1) {
    const i = filtered.findIndex(c => c.id === id);
    const nb = filtered[i + dir];
    if (i < 0 || !nb) return;
    moveCard(id, nb.id);
  }

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

              {(editing.type === "Monster" || editing.type === "Item") && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400">Buddy ร่วม (ชื่อการ์ดที่อยู่ในช่องบัดดี้ร่วมกับใบนี้ได้ · ช่องบัดดี้มีได้ 2-4 ตัว)</label>
                    <button onClick={() => setEditing({ ...editing, buddyPartners: [...(editing.buddyPartners ?? []), ""] })} className="btn !py-1 !px-2 text-xs"><Plus size={12} /> เพิ่ม</button>
                  </div>
                  {(editing.buddyPartners ?? []).map((n, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1">
                      <input value={n} onChange={e => setEditing({ ...editing, buddyPartners: (editing.buddyPartners ?? []).map((x, j) => (j === i ? e.target.value : x)) })} placeholder="ชื่อการ์ดให้ตรงกับชื่อที่ตั้งไว้ เช่น เทพปีศาจแห่งการทำลาย, เดสทรอยย่า" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none" />
                      <button onClick={() => setEditing({ ...editing, buddyPartners: (editing.buddyPartners ?? []).filter((_, j) => j !== i) })} className="btn !p-2 text-red-400" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {(editing.buddyPartners ?? []).length > 0 && <p className="text-[11px] text-slate-500 mt-1">ใน Deck Builder ถ้าเลือกการ์ดนี้เป็น Buddy ระบบจะเติมการ์ดตามชื่อเหล่านี้ (ถ้ามีในคลัง) ให้อยู่ช่องบัดดี้ร่วมกัน รวมไม่เกิน 4 ตัว · ระบุจากฝั่งใดฝั่งหนึ่งก็พอ</p>}
                </div>
              )}

              {(editing.type === "Monster" || editing.type === "Item") && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400">เงื่อนไขการลง: ต้องมีการ์ดเหล่านี้บนสนามก่อน (ลงแล้วนำเข้า Soul ของใบนี้)</label>
                    <button onClick={() => setEditing({ ...editing, callRequires: [...(editing.callRequires ?? []), ""] })} className="btn !py-1 !px-2 text-xs"><Plus size={12} /> เพิ่ม</button>
                  </div>
                  {(editing.callRequires ?? []).map((n, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1">
                      <input value={n} onChange={e => setEditing({ ...editing, callRequires: (editing.callRequires ?? []).map((x, j) => (j === i ? e.target.value : x)) })} placeholder="ชื่อการ์ดที่ต้องมีบนสนาม (ใส่ชื่อซ้ำ = ต้องมีหลายใบ)" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none" />
                      <button onClick={() => setEditing({ ...editing, callRequires: (editing.callRequires ?? []).filter((_, j) => j !== i) })} className="btn !p-2 text-red-400" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {(editing.callRequires ?? []).length > 0 && <p className="text-[11px] text-slate-500 mt-1">ตอนลง การ์ดเหล่านี้ต้องอยู่บนสนามของเราครบทุกใบ (ลงทับช่องของมันได้) เมื่อลงแล้วทุกใบเข้า Soul ของการ์ดนี้ Soul เดิมของมันลงสุสาน · ชื่อที่ตรงทั้งหมดมาก่อน ไม่ตรงจึงดูแบบมีข้อความนั้นอยู่ในชื่อ</p>}
                </div>
              )}

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
                <div className="col-span-2 sm:col-span-3">
                  <label className="text-sm text-slate-400">จ่ายเพิ่มด้วย {editing.callCostType === "Life" ? "Gauge" : "Life"} (ใส่เพื่อให้จ่ายทั้งสองอย่างพร้อมกัน · 0 = ไม่จ่ายเพิ่ม)</label>
                  <input type="number" min={0} max={9} value={editing.callCostExtra ?? 0}
                    onChange={e => setEditing({ ...editing, callCostExtra: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                  <div className="text-[11px] text-sky-300 mt-1">ตอนนี้จ่าย: {callCostLabel(editing)}</div>
                </div>
                {(editing.type === "Spell" || editing.type === "Impact" || (editing.autoSkills ?? []).some(sk => sk.trigger === "onCounter")) && (
                  <div className="col-span-2 sm:col-span-3">
                    <label className="text-sm text-slate-400">ใช้การ์ดนี้ได้กี่ครั้งต่อเทิร์น (ร่ายเวท / ใช้ Counter · นับรวมทุกใบที่ชื่อเดียวกัน · 0 = ไม่จำกัด)</label>
                    <input type="number" min={0} max={9} value={editing.limitPerTurn ?? 0}
                      onChange={e => setEditing({ ...editing, limitPerTurn: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) || undefined })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                    <div className="text-[11px] text-slate-500 mt-1">เช่น ใส่ 1 = ในเทิร์นหนึ่งใช้การ์ดชื่อนี้ได้แค่ครั้งเดียว ต่อให้มีการ์ดชื่อเดียวกันหลายใบในมือ</div>
                  </div>
                )}
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

              {editing.type === "Monster" && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-100 cursor-pointer">
                    <input type="checkbox" checked={typeof editing.transformCost === "number"}
                      onChange={e => setEditing(e.target.checked
                        ? { ...editing, transformCost: 1, transformCostType: editing.transformCostType ?? "Gauge" }
                        : { ...editing, transformCost: undefined, transformCostType: undefined, transformCostExtra: undefined })} />
                    Transform ได้ (จ่ายแล้วกลายเป็นไอเทม · ใช้ได้จากมือหรือบนสนาม)
                  </label>
                  {typeof editing.transformCost === "number" && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="text-xs text-slate-400">Transform Cost</label>
                        <input type="number" min={0} max={9} value={editing.transformCost} onChange={e => setEditing({ ...editing, transformCost: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">จ่ายด้วย</label>
                        <select value={editing.transformCostType ?? "Gauge"} onChange={e => setEditing({ ...editing, transformCostType: e.target.value as "Gauge" | "Life" })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none">
                          <option value="Gauge">Gauge</option>
                          <option value="Life">Life</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">จ่ายเพิ่มด้วย {(editing.transformCostType ?? "Gauge") === "Life" ? "Gauge" : "Life"}</label>
                        <input type="number" min={0} max={9} value={editing.transformCostExtra ?? 0} onChange={e => setEditing({ ...editing, transformCostExtra: Math.max(0, Math.min(9, parseInt(e.target.value) || 0)) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                      </div>
                      <div className="col-span-3 text-[11px] text-sky-300">ตอนนี้ Transform จ่าย: {transformCostLabel(editing)}</div>
                    </div>
                  )}
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
                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-400">คำอธิบายสกิลอิสระ (Custom Text)</label>
                  <button type="button" onClick={() => setCustomTexts([...getCustomTexts(editing), ""])} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-1"><Plus size={14} /> เพิ่มข้อความ</button>
                </div>
                <div className="space-y-2 mt-1">
                  {getCustomTexts(editing).map((t, i, arr) => (
                    <div
                      key={i}
                      className={`flex gap-2 items-start rounded-lg transition ${dragText !== null && overText === i && dragText !== i ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950" : ""} ${dragText === i ? "opacity-50" : ""}`}
                      onDragOver={e => { if (dragText !== null) { e.preventDefault(); if (overText !== i) setOverText(i); } }}
                      onDrop={e => { e.preventDefault(); if (dragText !== null) moveCustomText(dragText, i); setDragText(null); setOverText(null); }}
                    >
                      <div className="flex flex-col items-center mt-1 w-6 shrink-0">
                        <span className="text-xs text-slate-500 leading-none mb-1">{i + 1}</span>
                        {arr.length > 1 && (
                          <>
                            <button type="button" disabled={i === 0} onClick={() => moveCustomText(i, i - 1)} className="p-0.5 text-slate-400 hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400" title="เลื่อนขึ้น"><ChevronUp size={16} /></button>
                            <span
                              draggable
                              onDragStart={e => { setDragText(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); const row = (e.currentTarget as HTMLElement).closest("[data-ctrow]"); if (row) e.dataTransfer.setDragImage(row as HTMLElement, 20, 20); }}
                              onDragEnd={() => { setDragText(null); setOverText(null); }}
                              className="p-0.5 text-slate-500 hover:text-cyan-300 cursor-grab active:cursor-grabbing" title="ลากเพื่อสลับลำดับ"
                            ><GripVertical size={16} /></span>
                            <button type="button" disabled={i === arr.length - 1} onClick={() => moveCustomText(i, i + 1)} className="p-0.5 text-slate-400 hover:text-cyan-300 disabled:opacity-25 disabled:hover:text-slate-400" title="เลื่อนลง"><ChevronDown size={16} /></button>
                          </>
                        )}
                      </div>
                      <div data-ctrow className="flex-1 min-w-0">
                        <AutoTextarea value={t} onChange={v => setCustomTexts(arr.map((x, j) => (j === i ? v : x)))} placeholder="เขียนความสามารถพิสดารตามจินตนาการ..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none" />
                      </div>
                      {arr.length > 1 && (
                        <button type="button" onClick={() => setCustomTexts(arr.filter((_, j) => j !== i))} className="p-2 mt-1 bg-red-900 hover:bg-red-800 rounded-lg" title="ลบข้อความนี้"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-400">ฟลาเวอร์เท็กซ์ / คำพูดของการ์ด (Flavor Text)</label>
                <AutoTextarea value={editing.flavorText ?? ""} onChange={v => setEditing({ ...editing, flavorText: v })} placeholder='เช่น "ข้าจะไม่ถอยแม้แต่ก้าวเดียว!" (ไม่มีผลต่อเกม แค่แสดงบนการ์ด)' className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none italic" />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="font-bold text-amber-300 flex items-center gap-2 mb-1"><Zap size={16} /> คีย์เวิร์ด</h3>
                <p className="text-xs text-slate-500 mb-3">กดเพื่อเปิด/ปิด · <span className="text-emerald-300">● เกมบังคับผลอัตโนมัติ</span> · <span className="text-slate-400">○ ป้ายคีย์เวิร์ด (ใส่สกิลอัตโนมัติควบคู่เพื่อให้ทำงานจริง)</span> · ชี้ที่ปุ่มเพื่ออ่านคำอธิบาย</p>
                <div className="space-y-3 mb-5">
                  {KW_CATEGORIES.map(cat => (
                    <div key={cat.key}>
                      <div className="text-xs font-bold text-slate-400 mb-1.5">{cat.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {KEYWORD_DEFS.filter(k => k.cat === cat.key).map(k => {
                          const on = findKw(k);
                          return (
                            <span key={k.id} className="inline-flex items-center gap-1">
                              <button type="button" title={k.help} onClick={() => toggleKw(k)} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${on ? "bg-red-600 border-red-300 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                                <span className={k.engine ? "text-emerald-300" : "text-slate-500"}>{k.engine ? "●" : "○"}</span> {k.id}
                              </button>
                              {on && k.param && (
                                <input type="number" min={1} value={on.value} title="ตัวเลขกำกับ" onChange={e => setKwValue(k, parseInt(e.target.value) || 1)} className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-xs" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <CustomKeywordPanel skills={editing.autoSkills} onChange={sk => setEditing({ ...editing, autoSkills: sk })} />

                <div className="flex items-center justify-between mb-3 border-t border-slate-800 pt-4">
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
                    <CounterOptions skill={skill} onChange={sk => updateSkill(si, sk)} />
                    <NullifyProofToggle skill={skill} onChange={sk => updateSkill(si, sk)} />
                    {skill.effects.map((eff, ei) => (
                      <EffectRow key={ei} eff={eff} onChange={e2 => updateEffect(si, ei, e2)} onRemove={() => removeEffect(si, ei)} />
                    ))}
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
        <button onClick={() => setTransfer({ mode: "export" })} className="btn"><Upload size={14} /> Export</button>
        <label className="btn cursor-pointer"><Download size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
        <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างการ์ด</button>
        {transfer && (
          <TransferDialog
            mode={transfer.mode}
            title={transfer.mode === "export" ? "Export การ์ด (เลือกได้)" : "Import การ์ด (เลือกได้)"}
            note={transfer.mode === "export" ? "ไฟล์จะแนบ Flag ที่การ์ดเหล่านี้ใช้ไปด้วย" : "id ซ้ำจะทับของเดิมเฉพาะใบนั้น ใบอื่นที่มีอยู่ไม่ถูกลบ"}
            groups={[{ key: "cards", label: "การ์ด", items: (transfer.mode === "export" ? cards : transfer.parsed.cards).map(c => ({ id: c.id, name: c.name, sub: c.type })) }]}
            onConfirm={confirmTransfer}
            onClose={() => setTransfer(null)}
          />
        )}
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

      {filtered.length > 1 && <p className="text-xs text-slate-500 mb-3">ลากการ์ดไปวางทับใบอื่นเพื่อจัดลำดับเอง · หรือเอาเมาส์ชี้การ์ดแล้วกดลูกศร ◀ ▶ · ลำดับถูกบันทึกอัตโนมัติ</p>}

      {filtered.length === 0 ? (
        <EmptyState icon={Layers} title={cards.length === 0 ? "ยังไม่มีการ์ด" : "ไม่พบการ์ดที่ตรงกับเงื่อนไข"} hint={cards.length === 0 ? 'กด "สร้างการ์ด" เพื่อเริ่มออกแบบการ์ดใบแรก' : "ลองเปลี่ยนตัวกรองหรือคำค้นหา"} action={cards.length === 0 ? <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างการ์ดใบแรก</button> : undefined} />
      ) : (
        <div className="grid gap-x-5 gap-y-7 justify-items-center" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {filtered.map(c => (
            <div
              key={c.id}
              draggable
              onDragStart={e => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
              onDragOver={e => { if (dragId) { e.preventDefault(); if (overId !== c.id) setOverId(c.id); } }}
              onDragLeave={() => { if (overId === c.id) setOverId(null); }}
              onDrop={e => { e.preventDefault(); if (dragId) moveCard(dragId, c.id); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              className={`relative group lift rounded-xl cursor-grab active:cursor-grabbing transition ${dragId === c.id ? "opacity-40" : ""} ${overId === c.id && dragId !== c.id ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950" : ""}`}
              style={{ ["--glow" as string]: `${flagOf(c)?.color ?? "#22d3ee"}88` }}
            >
              <CardView card={c} flag={flagOf(c)} size="md" onClick={() => setEditing(c)} />
              <div className="absolute -bottom-3 inset-x-0 z-30 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                <button title="เลื่อนไปทางซ้าย" onClick={() => shiftCard(c.id, -1)} className="btn !p-1.5 !rounded-lg"><ChevronLeft size={14} /></button>
                <button title="แก้ไข" onClick={() => setEditing(c)} className="btn !p-1.5 !rounded-lg"><Edit3 size={14} /></button>
                <button title="เลื่อนไปทางขวา" onClick={() => shiftCard(c.id, 1)} className="btn !p-1.5 !rounded-lg"><ChevronRight size={14} /></button>
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
