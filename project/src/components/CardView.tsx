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
  soul?: number; // จำนวน Soul ใต้การ์ด (ส่งมาเฉพาะการ์ดบนสนาม) — แสดงเป็นลูกแก้ว + โล่ Soulguard
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

// ค่า Soulguard (จำนวน Soul ที่ต้องถอดต่อครั้ง) 0 = ไม่มี
const soulguardCost = (card: Card) => {
  let v = 0;
  card.autoSkills?.forEach(s => {
    if (s.trigger !== "continuous" && s.trigger !== "onAttack") return;
    s.effects.forEach(e => { if (e.type === "soulguard") v = 1; }); // ถอด Soul 1 ใบเสมอ
  });
  return v;
};

// ขนาดตัวเลขแนวตั้ง: ยิ่งยาวยิ่งเล็ก จะได้ไม่ล้นแถบ
const vertSize = (v: number, compact: boolean) => {
  const len = String(v).length;
  const base = len >= 6 ? 0.7 : len === 5 ? 0.85 : len === 4 ? 1.0 : 1.15;
  return `${compact ? base * 1.15 : base}em`;
};

// แถบ Soul: ลูกแก้วม่วง 1 ลูก = Soul 1 ใบ + โล่ Soulguard ที่บอกจำนวนครั้งที่ยังกันตายได้
export function SoulRail({ count, guardCost }: { count: number; guardCost: number }) {
  const guard = guardCost > 0;
  const uses = guard ? Math.floor(count / guardCost) : 0; // กันได้อีกกี่ครั้ง
  const shown = Math.min(count, 4);
  return (
    <div className="absolute z-20 flex flex-col items-center pointer-events-none" style={{ right: "0.3em", top: "5.6em", gap: "0.3em" }}>
      {guard && (
        <div key={"g" + count} className={`soul-pop relative flex items-center justify-center ${uses > 0 ? "soul-guard-live" : ""}`} style={{ width: "2.5em", height: "2.8em" }} title={`Soulguard: ถอด Soul ${guardCost} ใบ กันออกจากสนามได้อีก ${uses} ครั้ง`}>
          <svg viewBox="0 0 24 28" className="absolute inset-0 w-full h-full" aria-hidden>
            <path d="M12 1 L22 5 V13 C22 20 17.5 24.5 12 27 C6.5 24.5 2 20 2 13 V5 Z"
              fill={uses > 0 ? "url(#sgGrad)" : "#1e293b"} stroke={uses > 0 ? "#e9d5ff" : "#64748b"} strokeWidth="1.6" strokeDasharray={uses > 0 ? "0" : "2.4 2"} />
            <defs><linearGradient id="sgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#4c1d95" /></linearGradient></defs>
          </svg>
          <span className="relative font-display font-extrabold text-white" style={{ fontSize: "1.25em", lineHeight: 1, textShadow: "0 0 0.3em #000", marginTop: "-0.1em" }}>{uses}</span>
        </div>
      )}
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="soul-orb soul-bob" style={{ width: "1.35em", height: "1.35em", animationDelay: `${i * 0.18}s` }} />
      ))}
      {count > shown && <span className="font-display font-bold text-violet-200" style={{ fontSize: "0.9em", textShadow: "0 0 0.3em #000" }}>+{count - shown}</span>}
      {!guard && count > 0 && (
        <span key={"n" + count} className="soul-pop font-display font-extrabold text-white rounded-full bg-violet-700/90 border border-violet-200/70 flex items-center justify-center" style={{ minWidth: "1.7em", height: "1.7em", fontSize: "0.95em", padding: "0 0.3em" }}>{count}</span>
      )}
    </div>
  );
}

// เลย์เอาต์ตามการ์ด Buddyfight จริง
//  - มอนสเตอร์: รูปเต็มใบ, Size มุมซ้ายบน, Power/Critical/Defense แนวตั้งซ้าย, กล่องข้อความโปร่งแสงด้านล่าง, ป้ายคีย์เวิร์ดสีแดง
//  - เวทมนตร์/ไอเทม/Impact: กรอบทอง รูปมุมมน กล่องข้อความสีน้ำตาล แถบชื่อด้านล่าง
// ทุกอย่างใช้หน่วย em และ font-size = ความกว้าง/16 จึงย่อ-ขยายได้ทุกขนาด
export function CardView({
  card, flag, size = "md", width, stats, soul, faceDown, hideText, onClick, className = "", style,
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
  const common = `relative isolate rounded-[0.7em] overflow-hidden shadow-lg shrink-0 select-none ${onClick ? "cursor-pointer" : ""} ${className}`;
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
    const guard = soulguardCost(card);
    const vert = (color: string, v: number): CSSProperties => ({ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: vertSize(v, compact), lineHeight: 1, whiteSpace: "nowrap", color, ...stroke });
    return (
      <div onClick={onClick} {...dnd} className={`${common} flex flex-col`} style={{ ...base, border: `0.22em solid ${color}`, background: "#0b1220" }}>
        {card.image
          ? <img src={card.image} alt={card.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          : <div className="absolute inset-0 flex items-center justify-center text-slate-600" style={{ fontSize: "0.9em", background: `linear-gradient(160deg, ${color}55, #0b1220)` }}>No Image</div>}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: compact ? "30%" : "58%", background: "linear-gradient(to top, rgba(2,6,23,.92), rgba(2,6,23,.55) 60%, transparent)" }} />

        {/* พื้นที่ด้านบน: Size + แถบสถิติ (ยืดหดตามความสูงของส่วนล่าง จึงไม่ทับกัน) */}
        <div className="relative flex-1 min-h-0 z-10">
          <div className="absolute top-0 left-0 flex flex-col items-center text-center" style={{ width: "4.4em", padding: "0.2em 0 0.5em", background: "linear-gradient(180deg, rgba(8,12,24,.92), rgba(8,12,24,.7))", clipPath: "polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)" }}>
            <span className="font-display font-bold text-amber-300 leading-none" style={{ fontSize: "2.5em", ...stroke }}>{card.size}</span>
            <span className="text-white font-semibold leading-none" style={{ fontSize: "0.58em" }}>{TYPE_LABEL.Monster}</span>
          </div>
          {/* Defense (ฟ้า) บน · Critical กลาง · Power (แดง) ล่าง */}
          <div className="absolute left-0 flex flex-col items-center justify-between font-display font-bold overflow-hidden" style={{ top: "4.9em", bottom: "0.3em", width: "2.3em", padding: "0.15em 0", background: "linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,0))" }}>
            <span style={vert("#7dd3fc", st.defense)} title="Defense">{st.defense}</span>
            <span className="text-white" style={{ fontSize: compact ? "2.2em" : "1.9em", lineHeight: 1, ...stroke }} title="Critical">{st.critical}</span>
            <span style={vert("#fb7185", st.power)} title="Power">{st.power}</span>
          </div>
        </div>

        {/* ส่วนล่าง: กล่องข้อความ → ป้าย Tag → แถบชื่อ เรียงต่อกันในแนวตั้ง จึงไม่มีทางซ้อนทับ */}
        <div className="relative z-10 shrink-0 flex flex-col">
          {!compact && (
            <div className="rounded-[0.5em] text-white leading-snug overflow-hidden" style={{ marginLeft: "2.7em", marginRight: "0.7em", marginBottom: "0.4em", fontSize: "0.62em", background: "rgba(5,8,18,.74)", padding: "0.4em 0.6em", maxHeight: "9.6em", border: "0.08em solid rgba(255,255,255,.18)" }}>
              {cost && <div><span className="inline-block bg-white/90 text-slate-900 rounded px-1 mr-1 font-bold">Call Cost</span>{cost}</div>}
              {lines.map((l, i) => <div key={i} className="text-amber-100">▪ {l}</div>)}
              {card.customText && <div className="text-slate-200">▪ {card.customText}</div>}
              {badges.length > 0 && (
                <div className="flex flex-wrap justify-end gap-[0.3em] mt-[0.3em]">
                  {badges.map(b => <span key={b} className="bg-red-600 text-white rounded px-[0.5em] font-bold border border-white/70">{b}</span>)}
                </div>
              )}
            </div>
          )}
          {compact && badges.length > 0 && (
            <div className="flex justify-end" style={{ padding: "0 0.4em 0.25em" }}>
              <span className="bg-red-600 text-white rounded px-[0.4em] font-bold border border-white/70" style={{ fontSize: "0.6em" }}>{badges.length} KW</span>
            </div>
          )}
          {!compact && (tagA || tagB) && (
            <div className="flex flex-wrap items-center" style={{ padding: "0 0.5em 0.35em 0.7em", gap: "0.25em 0.4em" }}>
              {tagA && <span className="px-[1.1em] rounded-full text-white font-semibold truncate max-w-[60%]" style={{ fontSize: "0.6em", lineHeight: 1.5, background: `linear-gradient(90deg, ${color}, ${color}99)`, border: "0.08em solid rgba(255,255,255,.5)" }}>{tagA}</span>}
              {tagB && <span className="px-[1.1em] rounded-full text-white font-semibold truncate max-w-[60%]" style={{ fontSize: "0.6em", lineHeight: 1.5, background: "linear-gradient(90deg, #1d4ed8, #3b82f6cc)", border: "0.08em solid rgba(255,255,255,.5)" }}>{tagB}</span>}
            </div>
          )}
          <div className="flex items-center justify-center px-[0.5em] text-center" style={{ height: compact ? "2.6em" : "2.3em", background: `linear-gradient(180deg, ${color}cc, #0b1220f2)`, borderTop: "0.1em solid rgba(255,255,255,.5)" }}>
            <span className="font-display font-bold italic text-white truncate" style={{ fontSize: compact ? "1em" : "1.1em", textShadow: "0 0 0.3em #000" }}>{card.name}</span>
          </div>
        </div>
        {soul !== undefined && (soul > 0 || guard > 0) && <SoulRail count={soul} guardCost={guard} />}
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

      {soul !== undefined && soul > 0 && <SoulRail count={soul} guardCost={soulguardCost(card)} />}
      {/* Name */}
      <div className="mt-[0.3em] rounded-[0.5em] flex items-center justify-center px-[0.4em] shrink-0" style={{ height: "2.1em", background: `linear-gradient(180deg, ${frame.a}, ${frame.b})`, border: `0.12em solid ${frame.b}` }}>
        <span className="font-display font-bold text-slate-900 truncate" style={{ fontSize: "1.05em" }}>{card.name}</span>
      </div>
      {children}
    </div>
  );
}
