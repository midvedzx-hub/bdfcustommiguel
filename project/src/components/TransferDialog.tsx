import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Download, Search } from "lucide-react";

export interface TransferItem { id: string; name: string; sub?: string }
export interface TransferGroup { key: string; label: string; items: TransferItem[] }

// หน้าต่างเลือกรายการ (ใช้ทั้งตอน Export และ Import) — เลือกเฉพาะบางใบ/บางเด็คได้
export function TransferDialog({ mode, title, groups, onConfirm, onClose }: {
  mode: "export" | "import";
  title: string;
  groups: TransferGroup[];
  onConfirm: (selected: Record<string, Set<string>>) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    groups.forEach(g => { init[g.key] = new Set(g.items.map(i => i.id)); }); // เริ่มต้นเลือกทั้งหมด
    return init;
  });
  const [q, setQ] = useState("");
  const total = useMemo(() => Object.values(sel).reduce((a, s) => a + s.size, 0), [sel]);
  const ql = q.trim().toLowerCase();

  const toggle = (key: string, id: string) =>
    setSel(prev => { const s = new Set(prev[key]); if (s.has(id)) s.delete(id); else s.add(id); return { ...prev, [key]: s }; });
  const setAll = (g: TransferGroup, on: boolean) =>
    setSel(prev => ({ ...prev, [g.key]: new Set(on ? g.items.map(i => i.id) : []) }));

  const Icon = mode === "export" ? Upload : Download;
  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border-2 border-cyan-600 rounded-2xl p-5 max-w-xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl font-bold text-cyan-300 flex items-center gap-2"><Icon size={18} /> {title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg"><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ..." className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-cyan-500" />
        </div>
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {groups.map(g => {
            const shown = g.items.filter(i => !ql || i.name.toLowerCase().includes(ql));
            return (
              <div key={g.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-slate-300">{g.label} ({sel[g.key]?.size ?? 0}/{g.items.length})</span>
                  <span className="text-xs space-x-2">
                    <button onClick={() => setAll(g, true)} className="text-cyan-400 hover:underline">เลือกทั้งหมด</button>
                    <button onClick={() => setAll(g, false)} className="text-slate-400 hover:underline">ล้าง</button>
                  </span>
                </div>
                <div className="space-y-1">
                  {shown.map(i => (
                    <label key={i.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 cursor-pointer text-sm">
                      <input type="checkbox" checked={sel[g.key]?.has(i.id) ?? false} onChange={() => toggle(g.key, i.id)} />
                      <span className="flex-1 truncate">{i.name || "(ไม่มีชื่อ)"}</span>
                      {i.sub && <span className="text-xs text-slate-500">{i.sub}</span>}
                    </label>
                  ))}
                  {shown.length === 0 && <div className="text-xs text-slate-500 px-2">ไม่พบรายการ</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 mt-3">
          {mode === "export"
            ? "เด็คที่เลือกจะแนบการ์ดและ Flag ที่เด็คนั้นใช้ไปในไฟล์ด้วย"
            : "เด็คที่เลือกจะนำเข้าการ์ดของเด็คนั้นด้วย · id ซ้ำจะทับของเดิมเฉพาะใบนั้น"}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold">ยกเลิก</button>
          <button disabled={total === 0} onClick={() => onConfirm(sel)} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl font-bold">
            {mode === "export" ? "Export" : "Import"} ({total})
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
