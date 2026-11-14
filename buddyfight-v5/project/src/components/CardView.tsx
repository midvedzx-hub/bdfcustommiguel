import type { CSSProperties, ReactNode } from "react";
import type { Card, Flag } from "@/types";
import { getFlagColor, skillLines, keywordBadges, costText } from "@/game/helpers";

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";

interface Props {
  card?: Card | null;
  flag?: Flag;
  size?: CardSize;
  width?: string; // ความกว้างเอง (CSS length) เช่น "var(--cw)"
  stats?: { power: number; defense: number; critical: number }; // ค่ารวมบัฟแล้ว (ในสนาม)
  faceDown?: boolean;
  hideText?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onInspect?: () => void; // คลิกขวา / ดับเบิลคลิก เพื่อดูรายละเอียดการ์ด
  children?: ReactNode;
}

const WIDTHS: Record<CardSize, string> = { xs: "56px", sm: "84px", md: "124px", lg: "208px", xl: "288px" };

const TYPE_LABEL: Record<string, string> = {
  Monster: "มอนสเตอร์",
  Spell: "เวทมนตร์",
  Item: "ไอเทม",
  Impact: "ท่าไม้ตาย",
};

// เลย์เอาต์ตามการ์ด Buddyfight จริง
//  - มอนสเตอร์: รูปเต็มใบ, Size มุมซ้ายบน, Power/Critical/Defense แนวตั้งซ้าย, กล่องข้อความโปร่งแสงด้านล่าง, ป้ายคีย์เวิร์ดสีแดง
//  - เวทมนตร์/ไอเทม/Impact: กรอบทอง รูปมุมมน กล่องข้อความสีน้ำตาล แถบชื่อด้านล่าง
// ทุกอย่างใช้หน่วย em และ font-size = ความกว้าง/16 จึงย่อ-ขยายได้ทุกขนาด
export function CardView({
  card, flag, size = "md", width, stats, faceDown, hideText, onClick, className = "", style,
  draggable, onDragStart, onDragEnd, onInspect, children,
}: Props) {
  const w = width ?? WIDTHS[size];
  const color = getFlagColor(flag);
  const base: CSSProperties = {
    width: w,
    aspectRatio: "63 / 88",
    fontSize: `calc(${w} / 16)`,
    ...style,
  };
  const common = `relative rounded-[0.7em] overflow-hidden shadow-lg shrink-0 select-none ${onClick ? "cursor-pointer" : ""} ${className}`;
  const dnd = {
    draggable, onDragStart, onDragEnd,
    onContextMenu: onInspect ? (e: React.MouseEvent) => { e.preventDefault(); onInspect(); } : undefined,
    onDoubleClick: onInspect,
  };

  if (faceDown || !card) {
    return (
      <div onClick={onClick} {...dnd} className={common} style={{ ...base, border: "0.25em solid #1e293b", background: "radial-gradient(circle at 50% 40%, #334155, #0f172a 70%)" }}>
        <div className="absolute inset-[14%] rounded-[50%] border-[0.2em] border-slate-600/60 flex items-center justify-center font-display text-slate-500" style={{ fontSize: "2.2em" }}>BF</div>
        {children}
      </div>
    );
  }

  const compact = hideText ?? (parseFloat(w) < 100 && !w.startsWith("var") && !w.startsWith("min") && !w.startsWith("calc"));
  const st = stats ?? { power: card.power, defense: card.defense, critical: card.critical };
  const lines = skillLines(card);
  const badges = keywordBadges(card);
  const cost = costText(card);
  const tagA = card.attribute?.trim();
  const tagB = flag?.name;

  /* ---------------- Monster ---------------- */
  if (card.type === "Monster") {
    const stroke: CSSProperties = { WebkitTextStroke: "0.07em #000", paintOrder: "stroke fill" } as CSSProperties;
    return (
      <div onClick={onClick} {...dnd} className={common} style={{ ...base, border: `0.22em solid ${color}`, background: "#0b1220" }}>
        {card.image
          ? <img src={card.image} alt={card.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          : <div className="absolute inset-0 flex items-center justify-center text-slate-600" style={{ fontSize: "0.9em", background: `linear-gradient(160deg, ${color}55, #0b1220)` }}>No Image</div>}

        {/* Size + type label */}
        <div className="absolute top-0 left-0 flex flex-col items-center text-center z-10" style={{ width: "4.4em", padding: "0.2em 0 0.5em", background: "linear-gradient(180deg, rgba(8,12,24,.92), rgba(8,12,24,.7))", clipPath: "polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)" }}>
          <span className="font-display font-bold text-amber-300 leading-none" style={{ fontSize: "2.5em", ...stroke }}>{card.size}</span>
          <span className="text-white font-semibold leading-none" style={{ fontSize: "0.58em" }}>{TYPE_LABEL.Monster}</span>
        </div>

        {/* Power / Critical / Defense แนวตั้ง */}
        <div className="absolute left-0 flex flex-col items-center justify-between font-display font-bold z-10" style={{ top: "5em", bottom: compact ? "3.4em" : "10.8em", width: "2.3em", background: "linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,0))" }}>
          <span className="text-sky-300" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: compact ? "1.3em" : "1.15em", lineHeight: 1, ...stroke }} title="Power">{st.power}</span>
          <span className="text-white" style={{ fontSize: compact ? "2.2em" : "1.9em", lineHeight: 1, ...stroke }} title="Critical">{st.critical}</span>
          <span className="text-rose-400" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: compact ? "1.3em" : "1.15em", lineHeight: 1, ...stroke }} title="Defense">{st.defense}</span>
        </div>

        {/* กล่องข้อความ (ขวาของแถบสถิติ ไม่ทับกัน) */}
        {!compact && (
          <div className="absolute z-10" style={{ left: "2.7em", right: "0.7em", bottom: tagA || tagB ? "5em" : "2.7em" }}>
            <div className="rounded-[0.5em] text-white leading-snug overflow-hidden" style={{ fontSize: "0.62em", background: "rgba(5,8,18,.72)", padding: "0.4em 0.6em", maxHeight: "11.5em", border: "0.08em solid rgba(255,255,255,.18)" }}>
              {cost && <div><span className="inline-block bg-white/90 text-slate-900 rounded px-1 mr-1 font-bold">Call Cost</span>{cost}</div>}
              {lines.map((l, i) => <div key={i} className="text-amber-100">▪ {l}</div>)}
              {card.customText && <div className="text-slate-200">▪ {card.customText}</div>}
              {badges.length > 0 && (
                <div className="flex flex-wrap justify-end gap-[0.3em] mt-[0.3em]">
                  {badges.map(b => <span key={b} className="bg-red-600 text-white rounded px-[0.5em] font-bold border border-white/70">{b}</span>)}
                </div>
              )}
            </div>
          </div>
        )}
        {compact && badges.length > 0 && (
          <div className="absolute z-10 right-[0.4em] flex gap-[0.2em]" style={{ bottom: "3.3em" }}>
            <span className="bg-red-600 text-white rounded px-[0.4em] font-bold border border-white/70" style={{ fontSize: "0.6em" }}>{badges.length} KW</span>
          </div>
        )}

        {/* ป้าย Tag: อยู่เหนือแถบชื่อ ไม่ทับกัน */}
        {!compact && (tagA || tagB) && (
          <div className="absolute z-10 left-[0.9em] right-[0.5em] flex flex-col items-start" style={{ bottom: "2.55em", gap: "0.15em" }}>
            {tagA && <span className="px-[1.2em] rounded-r-full text-white font-semibold truncate max-w-full" style={{ fontSize: "0.6em", background: `linear-gradient(90deg, ${color}, ${color}99)`, border: "0.08em solid rgba(255,255,255,.5)" }}>{tagA}</span>}
            {tagB && <span className="px-[1.6em] rounded-r-full text-white font-semibold truncate max-w-full" style={{ fontSize: "0.6em", background: "linear-gradient(90deg, #1d4ed8, #3b82f6aa)", border: "0.08em solid rgba(255,255,255,.5)" }}>{tagB}</span>}
          </div>
        )}

        {/* Name bar */}
        <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center px-[0.5em] text-center" style={{ height: compact ? "2.6em" : "2.3em", background: `linear-gradient(180deg, ${color}cc, #0b1220f2)`, borderTop: "0.1em solid rgba(255,255,255,.5)" }}>
          <span className="font-display font-bold italic text-white truncate" style={{ fontSize: compact ? "1em" : "1.1em", textShadow: "0 0 0.3em #000" }}>{card.name}</span>
        </div>
        {children}
      </div>
    );
  }

  /* ---------------- Spell / Item / Impact: กรอบทอง ---------------- */
  const frame = card.type === "Impact"
    ? { a: "#f43f5e", b: "#7f1d1d", text: "#fff1f2", box: "#4c0519" }
    : card.type === "Item"
      ? { a: "#5eead4", b: "#0f766e", text: "#f0fdfa", box: "#134e4a" }
      : { a: "#fcd34d", b: "#a16207", text: "#fffbeb", box: "#4a3512" };
  const showStats = card.type === "Item" || card.type === "Impact";
  return (
    <div onClick={onClick} {...dnd} className={`${common} flex flex-col`} style={{ ...base, border: `0.3em solid ${frame.a}`, background: `linear-gradient(160deg, ${frame.a}, ${frame.b})`, padding: "0.45em" }}>
      {/* Art */}
      <div className="relative overflow-hidden flex-[10] min-h-0 rounded-[0.9em]" style={{ border: `0.15em solid ${frame.b}`, background: "#1e293b" }}>
        {card.image
          ? <img src={card.image} alt={card.name} className="w-full h-full object-cover" draggable={false} />
          : <div className="w-full h-full flex items-center justify-center text-slate-500" style={{ fontSize: "0.8em" }}>No Image</div>}
        <div className="absolute top-0 left-0 px-[0.9em] py-[0.2em] text-white font-bold rounded-br-[0.8em]" style={{ fontSize: "0.85em", background: "linear-gradient(180deg, rgba(8,12,24,.92), rgba(8,12,24,.75))" }}>
          {TYPE_LABEL[card.type] ?? card.type}
        </div>
        <div className="absolute top-[0.3em] right-[0.3em] flex items-center justify-center rounded-full bg-amber-400 text-slate-900 font-display font-bold" style={{ width: "1.9em", height: "1.9em", fontSize: "0.95em", border: "0.12em solid #78350f" }} title={card.callCostType === "Life" ? "Cost: Life" : "Cost: Gauge"}>
          {card.callCost}
        </div>
        {showStats && (
          <div className="absolute bottom-0 inset-x-0 flex justify-around font-display font-bold text-white bg-black/55" style={{ fontSize: "0.9em" }}>
            <span title="Power">⚔ {st.power}</span><span title="Critical">✦ {st.critical}</span>
          </div>
        )}
      </div>

      {/* Text box */}
      {!compact && (
        <div className="relative mt-[0.35em] flex-[6.5] min-h-0 overflow-hidden rounded-[0.6em] leading-snug" style={{ background: `linear-gradient(180deg, ${frame.box}, #1c1305)`, border: `0.15em solid ${frame.a}`, padding: "0.4em 0.6em", fontSize: "0.66em", color: frame.text }}>
          {lines.map((l, i) => <div key={i} className="text-amber-100">■ {l}</div>)}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-[0.3em] mt-[0.2em]">
              {badges.map(b => <span key={b} className="bg-red-600 text-white rounded px-[0.5em] font-bold">{b}</span>)}
            </div>
          )}
          {card.customText && <div className="italic text-right mt-[0.3em]" style={{ color: frame.a }}>{card.customText}</div>}
          {lines.length === 0 && !card.customText && badges.length === 0 && <div style={{ opacity: 0.4 }}>—</div>}
        </div>
      )}

      {/* Tags */}
      {!compact && (tagA || tagB) && (
        <div className="relative z-10 -mt-[0.2em] flex flex-col items-start" style={{ fontSize: "0.6em", gap: "0.15em" }}>
          {tagA && <span className="px-[1.2em] rounded-full font-semibold text-slate-900 truncate max-w-full" style={{ background: `linear-gradient(90deg, ${frame.a}, #fff8)`, border: `0.1em solid ${frame.b}` }}>{tagA}</span>}
          {tagB && <span className="px-[1.6em] rounded-full font-semibold text-slate-900 truncate max-w-full ml-[1.2em]" style={{ background: `linear-gradient(90deg, ${frame.a}, #fff8)`, border: `0.1em solid ${frame.b}` }}>{tagB}</span>}
        </div>
      )}

      {/* Name */}
      <div className="mt-[0.3em] rounded-[0.5em] flex items-center justify-center px-[0.4em] shrink-0" style={{ height: "2.1em", background: `linear-gradient(180deg, ${frame.a}, ${frame.b})`, border: `0.12em solid ${frame.b}` }}>
        <span className="font-display font-bold text-slate-900 truncate" style={{ fontSize: "1.05em" }}>{card.name}</span>
      </div>
      {children}
    </div>
  );
}
