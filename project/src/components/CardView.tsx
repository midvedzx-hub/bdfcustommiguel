import type { CSSProperties, ReactNode } from "react";
import type { Card, Flag } from "@/types";
import { getFlagColor, skillLines } from "@/game/helpers";

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";

interface Props {
  card?: Card | null;
  flag?: Flag;
  size?: CardSize;
  width?: string; // กำหนดความกว้างเองได้ (CSS length) เช่น "var(--cw)"
  stats?: { power: number; defense: number; critical: number }; // ค่าที่รวมบัฟแล้ว (ในสนาม)
  faceDown?: boolean;
  hideText?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode; // ซ้อนทับ เช่น ป้ายบัฟ
}

const WIDTHS: Record<CardSize, string> = { xs: "56px", sm: "84px", md: "124px", lg: "208px", xl: "288px" };

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  Monster: { label: "Monster", color: "#f59e0b" },
  Spell: { label: "Spell", color: "#38bdf8" },
  Item: { label: "Item", color: "#34d399" },
  Impact: { label: "Impact Monster/Spell", color: "#fb7185" },
};

// การ์ดหน้าตาแบบ Buddyfight: ชื่อบน, Cost/Size ซ้ายบน, รูปกลาง, กล่องข้อความ, Power/Defense/Critical ล่าง
// ทุกอย่างใช้หน่วย em และ font-size = ความกว้าง/16 จึงย่อ-ขยายได้ทุกขนาด
export function CardView({ card, flag, size = "md", width, stats, faceDown, hideText, onClick, className = "", style, children }: Props) {
  const w = width ?? WIDTHS[size];
  const color = getFlagColor(flag);
  const base: CSSProperties = {
    width: w,
    aspectRatio: "63 / 88",
    fontSize: `calc(${w} / 16)`,
    ...style,
  };

  if (faceDown || !card) {
    return (
      <div onClick={onClick} className={`relative rounded-[0.7em] overflow-hidden shadow-lg shrink-0 ${className}`} style={{ ...base, border: "0.25em solid #1e293b", background: "radial-gradient(circle at 50% 40%, #334155, #0f172a 70%)" }}>
        <div className="absolute inset-[12%] rounded-[50%] border-[0.2em] border-slate-600/60 flex items-center justify-center font-display text-slate-500" style={{ fontSize: "2.2em" }}>BF</div>
        {children}
      </div>
    );
  }

  const t = TYPE_STYLE[card.type] ?? TYPE_STYLE.Monster;
  const showStats = card.type === "Monster" || card.type === "Item" || card.type === "Impact";
  const st = stats ?? { power: card.power, defense: card.defense, critical: card.critical };
  const lines = skillLines(card);
  const compact = hideText ?? (parseFloat(w) < 100 && !w.startsWith("var") && !w.startsWith("min"));
  const textHidden = compact;

  return (
    <div
      onClick={onClick}
      className={`relative rounded-[0.7em] overflow-hidden shadow-lg shrink-0 flex flex-col select-none ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ ...base, border: `0.3em solid ${color}`, background: `linear-gradient(160deg, ${color}40, #0b1220 55%)` }}
    >
      {/* Header: cost + size + name */}
      <div className="flex items-center gap-[0.3em] px-[0.4em] pt-[0.35em] pb-[0.2em]" style={{ background: `${color}55` }}>
        <div className="flex items-center justify-center rounded-full bg-amber-400 text-slate-900 font-display font-bold leading-none shrink-0" style={{ width: "1.7em", height: "1.7em", fontSize: "1em" }} title={card.callCostType === "Life" ? "Cost: Life" : "Cost: Gauge"}>
          {card.callCost}
        </div>
        {card.type === "Monster" && (
          <div className="flex items-center justify-center bg-emerald-400 text-slate-900 font-display font-bold leading-none shrink-0" style={{ width: "1.6em", height: "1.6em", clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", fontSize: "0.95em" }} title="Size">
            {card.size}
          </div>
        )}
        <div className="font-display font-semibold truncate text-white leading-tight min-w-0" style={{ fontSize: "1.05em" }}>{card.name}</div>
        <div className="ml-auto shrink-0 text-amber-300" style={{ fontSize: "0.75em" }}>{card.callCostType === "Life" ? "❤" : "⚡"}</div>
      </div>

      {/* Type line */}
      <div className="flex items-center justify-between px-[0.5em] py-[0.12em] bg-slate-950/80" style={{ fontSize: "0.62em" }}>
        <span className="font-bold" style={{ color: t.color }}>{t.label}</span>
        <span className="text-slate-300 truncate ml-2">{card.attribute || flag?.name || ""}</span>
      </div>

      {/* Art */}
      <div className="relative bg-slate-900 flex-[11] min-h-0 overflow-hidden mx-[0.35em] rounded-[0.3em]" style={{ border: "0.12em solid #475569" }}>
        {card.image ? (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600" style={{ fontSize: "0.8em" }}>No Image</div>
        )}
      </div>

      {/* Text box */}
      {!textHidden && (
        <div className="mx-[0.35em] mt-[0.3em] rounded-[0.3em] bg-slate-950/90 px-[0.5em] py-[0.3em] flex-[6] min-h-0 overflow-hidden text-slate-100 leading-snug" style={{ fontSize: "0.68em", border: "0.1em solid #334155" }}>
          {lines.map((l, i) => <div key={i} className="text-amber-200">{l}</div>)}
          {card.customText && <div className="text-slate-300">{card.customText}</div>}
          {lines.length === 0 && !card.customText && <div className="text-slate-600">—</div>}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-end justify-between px-[0.5em] py-[0.3em] font-display font-bold" style={{ fontSize: "0.95em", minHeight: "1.8em" }}>
        {showStats ? (
          <>
            <span className="text-orange-300" title="Power">⚔ {st.power}</span>
            <span className="text-sky-300" title="Defense">🛡 {st.defense}</span>
            <span className="text-rose-300" title="Critical">✦ {st.critical}</span>
          </>
        ) : (
          <span className="text-slate-500" style={{ fontSize: "0.7em" }}>{card.type}</span>
        )}
      </div>
      {children}
    </div>
  );
}
