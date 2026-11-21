import { createPortal } from "react-dom";
import { X, Heart, Hand as HandIcon, Zap, Star, Pencil } from "lucide-react";
import type { Card, Flag } from "@/types";
import { clampColor } from "@/game/helpers";
import { CardView } from "@/components/CardView";

// หน้าต่างดูรายละเอียด Flag: รูป · ค่าเริ่มต้น · ความสามารถ/กฎพิเศษ (Flag Effect) · Buddy ประจำโลก
export function FlagInfoDialog({ flag, buddies = [], onEdit, onClose }: {
  flag: Flag;
  buddies?: Card[];
  onEdit?: () => void;
  onClose: () => void;
}) {
  const col = clampColor(flag.color);
  const effect = (flag.effect ?? "").trim();
  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 text-slate-100 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border-2" style={{ borderColor: col, boxShadow: `0 0 36px ${col}55` }} onClick={e => e.stopPropagation()}>
        <div className="relative h-44 overflow-hidden rounded-t-2xl">
          {flag.image
            ? <img src={flag.image} alt={flag.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${col}, #0f172a)` }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
          <h3 className="absolute bottom-3 left-4 right-12 font-display text-2xl font-bold" style={{ color: col, textShadow: "0 2px 8px #000" }}>{flag.name || "Flag"}</h3>
          <button onClick={onClose} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-rose-600/20 border border-rose-500/40 text-rose-200 flex items-center gap-1"><Heart size={13} /> Life {flag.life}</span>
            <span className="px-3 py-1 rounded-full bg-sky-600/20 border border-sky-500/40 text-sky-200 flex items-center gap-1"><HandIcon size={13} /> จั่วเริ่มต้น {flag.startHand}</span>
            <span className="px-3 py-1 rounded-full bg-amber-600/20 border border-amber-500/40 text-amber-200 flex items-center gap-1"><Zap size={13} /> เกจเริ่มต้น {flag.startGauge}</span>
          </div>
          <div>
            <div className="text-base font-bold mb-1.5 text-white flex items-center gap-2"><span className="inline-block w-1.5 h-5 rounded-full" style={{ background: col }} />ความสามารถ / กฎพิเศษ (Flag Effect)</div>
            <div className="rounded-xl bg-slate-800 border border-slate-600 p-3.5 text-[15px] text-slate-50 whitespace-pre-wrap leading-relaxed min-h-[3.5rem]" style={{ borderLeft: `4px solid ${col}` }}>
              {effect || <span className="text-slate-400">Flag นี้ไม่มีความสามารถหรือกฎพิเศษ</span>}
            </div>
          </div>
          {buddies.length > 0 && (
            <div>
              <div className="text-base font-bold mb-2 text-amber-200 flex items-center gap-1.5"><Star size={14} /> Buddy ประจำโลก ({buddies.length})</div>
              <div className="flex flex-wrap gap-2">
                {buddies.map(c => <CardView key={c.id} card={c} flag={flag} size="sm" />)}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {onEdit && <button onClick={onEdit} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold flex items-center justify-center gap-1"><Pencil size={14} /> แก้ไข</button>}
            <button onClick={onClose} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold">ปิด</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
