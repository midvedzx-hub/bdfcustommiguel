import { useState } from "react";
import { Plus, Save, Trash2, Download, Upload, Edit3, Copy } from "lucide-react";
import type { Flag } from "@/types";
import { getFlags, saveFlags, getCards, uid, downloadJSON, importAll } from "@/storage";
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
    downloadJSON(JSON.stringify(flags, null, 2), "flags.json");
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
      } catch {
        alert("ไฟล์ไม่ถูกต้อง");
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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400">Flag Maker</h2>
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(flags, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm">{copied ? <Copy size={14} /> : <Copy size={14} />} ก๊อปปี้</button>
            <button onClick={exportFlags} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm"><Download size={14} /> Export</button>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
            <button onClick={startNew} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Plus size={16} /> สร้าง Flag</button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">กลับ</button>
          </div>
        </div>

        {flags.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <p className="text-lg">ยังไม่มี Flag</p>
            <p className="text-sm mt-2">กด "สร้าง Flag" เพื่อเริ่มสร้างธงประจำตัวของคุณ</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {flags.map(f => (
              <div key={f.id} className="bg-slate-900 border-2 rounded-xl p-4 flex flex-col items-center hover:scale-105 transition" style={{ borderColor: clampColor(f.color) }}>
                <div className="w-24 h-24 rounded-lg overflow-hidden mb-3 flex items-center justify-center bg-slate-800">
                  {f.image ? <img src={f.image} alt={f.name} className="w-full h-full object-cover" /> : <span className="text-slate-600 text-xs">No Image</span>}
                </div>
                <h3 className="font-bold text-center" style={{ color: clampColor(f.color) }}>{f.name}</h3>
                <div className="text-xs text-slate-400 mt-1 text-center">Life {f.life} | จั่ว {f.startHand} | เกจ {f.startGauge}{(f.buddyIds?.length ?? 0) > 0 ? ` | Buddy ${f.buddyIds!.length}` : ""}</div>
                {f.effect && <p className="text-xs text-slate-500 mt-2 line-clamp-3 text-center">{f.effect}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEditing(f)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"><Edit3 size={14} /></button>
                  <button onClick={() => del(f.id)} className="p-2 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
