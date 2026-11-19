import { useState } from "react";
import { Plus, Save, Trash2, Download, Upload, Edit3, Copy, Heart, Hand as HandIcon, Zap, Star, Flag as FlagIcon } from "lucide-react";
import { ScreenShell, EmptyState } from "@/components/ui";
import type { Flag } from "@/types";
import { getFlags, saveFlags, getCards, uid, downloadJSON, importAll, exportFlags as exportFlagsJSON } from "@/storage";
import { CardView } from "@/components/CardView";
import { ImageUpload } from "@/components/ImageUpload";
import { clampColor } from "@/game/helpers";

const DEFAULT_FLAG: Flag = {
  id: "",
  name: "",
  image: "",
  color: "#0891b2",
  life: 10,
  startHand: 6,
  startGauge: 2,
  effect: "",
};

export function FlagMaker({ onBack }: { onBack: () => void }) {
  const [flags, setFlags] = useState<Flag[]>(getFlags());
  const [editing, setEditing] = useState<Flag | null>(null);
  const [copied, setCopied] = useState(false);
  const [monsters] = useState(() => getCards().filter(c => c.type === "Monster"));

  function toggleBuddy(id: string) {
    if (!editing) return;
    const cur = editing.buddyIds ?? [];
    setEditing({ ...editing, buddyIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  }

  function persist(next: Flag[]) {
    setFlags(next);
    saveFlags(next);
  }

  function startNew() {
    setEditing({ ...DEFAULT_FLAG, id: uid() });
  }

  function saveEdit() {
    if (!editing || !editing.name.trim()) return;
    const exists = flags.some(f => f.id === editing.id);
    const next = exists ? flags.map(f => f.id === editing.id ? editing : f) : [...flags, editing];
    persist(next);
    setEditing(null);
  }

  function del(id: string) {
    persist(flags.filter(f => f.id !== id));
  }

  function exportFlags() {
    downloadJSON(exportFlagsJSON(flags), "flags.json");
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importAll(reader.result as string);
        setFlags(getFlags());
        alert(`นำเข้าสำเร็จ: ${result.flags} Flag, ${result.cards} การ์ด, ${result.decks} เด็ค`);
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : "ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold" style={{ color: clampColor(editing.color) }}>สร้าง Flag</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">ยกเลิก</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Save size={16} /> บันทึก</button>
            </div>
          </div>

          <div className="grid md:grid-cols-[200px_1fr] gap-6">
            <div>
              <ImageUpload image={editing.image} onChange={img => setEditing({ ...editing, image: img })} className="w-48 h-48 mx-auto" rounded="rounded-xl" placeholder="อัปโหลดสัญลักษณ์" />
              <div className="mt-4">
                <label className="text-sm text-slate-400">สีธีม Flag</label>
                <input type="color" value={editing.color} onChange={e => setEditing({ ...editing, color: e.target.value })} className="w-full h-10 mt-1 rounded cursor-pointer bg-slate-800" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400">ชื่อ Flag</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น Dragon World" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-slate-400">Life เริ่มต้น</label>
                  <input type="number" value={editing.life} onChange={e => setEditing({ ...editing, life: parseInt(e.target.value) || 10 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="text-sm text-slate-400">จั่วเริ่มต้น</label>
                  <input type="number" value={editing.startHand} onChange={e => setEditing({ ...editing, startHand: parseInt(e.target.value) || 6 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="text-sm text-slate-400">เกจเริ่มต้น</label>
                  <input type="number" value={editing.startGauge} onChange={e => setEditing({ ...editing, startGauge: parseInt(e.target.value) || 2 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1 focus:border-cyan-500 outline-none" />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-400">กฎพิเศษ (Flag Effect)</label>
                <textarea value={editing.effect} onChange={e => setEditing({ ...editing, effect: e.target.value })} placeholder="เขียนความสามารถประจำ Flag ได้ตามใจ..." rows={4} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 mt-1 focus:border-cyan-500 outline-none resize-none" />
              </div>

              <div>
                <label className="text-sm text-slate-400">Buddy ประจำโลกนี้ (เลือกได้หลายตัว — ตอนสร้างเด็คจะเลือกตัวที่ชอบจากรายการนี้)</label>
                {monsters.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-2">ยังไม่มีการ์ดมอนสเตอร์ สร้างใน Card Studio ก่อน แล้วกลับมาเลือก Buddy ได้</p>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2 max-h-72 overflow-y-auto p-2 bg-slate-900 rounded-lg border border-slate-800">
                    {monsters.map(m => {
                      const on = (editing.buddyIds ?? []).includes(m.id);
                      return (
                        <div key={m.id} className={`relative rounded-lg ${on ? "ring-4 ring-amber-400" : "opacity-70 hover:opacity-100"}`}>
                          <CardView card={m} flag={editing} size="sm" onClick={() => toggleBuddy(m.id)} />
                          {on && <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-900 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">★</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-amber-400 mt-1">เลือกแล้ว {(editing.buddyIds ?? []).length} ตัว</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allCards = getCards();
  return (
    <ScreenShell
      title="Flag Maker" subtitle="สร้างโลก/ธงประจำเด็ค กำหนด Life เกจ และ Buddy ประจำโลก" icon={FlagIcon} accent="#22d3ee" onBack={onBack}
      actions={<>
        <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(flags, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn"><Copy size={14} /> {copied ? "คัดลอกแล้ว" : "ก๊อปปี้"}</button>
        <button onClick={exportFlags} className="btn"><Download size={14} /> Export</button>
        <label className="btn cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
        <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้าง Flag</button>
      </>}
    >
      {flags.length === 0 ? (
        <EmptyState icon={FlagIcon} title="ยังไม่มี Flag" hint='กด "สร้าง Flag" เพื่อสร้างธงประจำโลกของคุณ' action={<button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้าง Flag แรก</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {flags.map(f => {
            const col = clampColor(f.color);
            const buddies = (f.buddyIds ?? []).map(id => allCards.find(c => c.id === id)).filter(Boolean);
            return (
              <div key={f.id} className="panel lift group overflow-hidden" style={{ borderColor: `${col}66`, ["--glow" as string]: `${col}66` }}>
                <div className="relative h-36 overflow-hidden cursor-pointer" onClick={() => setEditing(f)}>
                  {f.image
                    ? <img src={f.image} alt={f.name} className="w-full h-full object-cover transition duration-500 group-hover:scale-110" />
                    : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${col}, #0f172a)` }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                  <h3 className="absolute bottom-2 left-3 right-3 font-display text-xl font-bold truncate" style={{ color: col, textShadow: "0 2px 8px #000" }}>{f.name}</h3>
                </div>
                <div className="p-3.5">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="chip text-rose-300"><Heart size={11} fill="currentColor" /> Life {f.life}</span>
                    <span className="chip"><HandIcon size={11} /> จั่ว {f.startHand}</span>
                    <span className="chip text-amber-300"><Zap size={11} fill="currentColor" /> เกจ {f.startGauge}</span>
                  </div>
                  {f.effect && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{f.effect}</p>}
                  {buddies.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Star size={12} className="text-amber-400" fill="currentColor" />
                      <div className="flex -space-x-2">
                        {buddies.slice(0, 5).map(b => <CardView key={b!.id} card={b!} flag={f} width="34px" hideText />)}
                      </div>
                      {buddies.length > 5 && <span className="text-xs text-slate-500">+{buddies.length - 5}</span>}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(f)} className="btn flex-1 !py-1.5"><Edit3 size={14} /> แก้ไข</button>
                    <button onClick={() => del(f.id)} className="btn btn-danger !py-1.5 !px-3"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScreenShell>
  );
}
