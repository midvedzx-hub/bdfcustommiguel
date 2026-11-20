import type { CSSProperties, ReactNode } from "react";
import type { Card, Flag } from "@/types";
import { customTextList } from "@/types";
import { getFlagColor, skillLines, keywordBadges, costText } from "@/game/helpers";

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";

interface Props {
  card?: Card | null;
  flag?: Flag;
  size?: CardSize;
  sizeValue?: number; // Size ที่ใช้แสดง (มอนสเตอร์บนสนามที่ถูกปรับ Size) ถ้าไม่ส่ง = Size ของการ์ด
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

// ไอคอนประเภทการ์ด (เวท = ประกาย, ไอเทม = ดาบ, Impact = สายฟ้า)
function TypeIcon({ type }: { type: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: "62%", height: "62%" }} fill="currentColor" aria-hidden>
      {type === "Item"
        ? <path d="M11 2h2l1 11h2v2h-3v6h-2v-6H8v-2h2z" />
        : type === "Impact"
          ? <path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.5h-5.8z" />
          : <path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z" />}
    </svg>
  );
}

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

// เลย์เอาต์ตามการ์ด Buddyfight จริง (ทุกประเภทใช้ภาพเต็มใบ + กรอบสีตามโลก + กล่องข้อความโปร่งแสง + แถบชื่อ)
//  - มอนสเตอร์: Size มุมซ้ายบน, Power/Critical/Defense แนวตั้งซ้าย
//  - เวทมนตร์: ป้ายประเภทมุมซ้ายบน + ตราโลก, ป้าย Tag สีม่วงอยู่เหนือกล่องข้อความ
//  - ไอเทม: ป้ายไอเทมมุมซ้ายบน, Power/Critical ใต้ป้าย, ป้าย Tag สีเทาใต้กล่องข้อความ
//  - Impact: เป็นการ์ดแนวนอน (88:63) กล่องข้อความซ้าย ป้าย Tag ขวา
// ทุกอย่างใช้หน่วย em และ font-size = ความกว้าง/16 จึงย่อ-ขยายได้ทุกขนาด
export function CardView({
  card, flag, size = "md", sizeValue, width, stats, soul, faceDown, hideText, onClick, className = "", style,
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
  // Flavor Text: กล่องแยกของตัวเอง (ไม่อยู่ในกล่องความสามารถ จึงไม่ถูกตัดทิ้งเมื่อความสามารถยาว)
  const flavor = card.flavorText?.trim() ?? "";
  const flavorBox = (opts: { ml: string; mr: string; fs: string; maxH: string }) =>
    !compact && flavor ? (
      <div className="rounded-[0.5em] italic text-center text-slate-100 overflow-hidden shrink-0" style={{ marginLeft: opts.ml, marginRight: opts.mr, marginBottom: "0.4em", fontSize: opts.fs, lineHeight: 1.35, padding: "0.35em 0.6em", maxHeight: opts.maxH, background: "rgba(30,41,59,.9)", border: "0.08em solid rgba(255,255,255,.25)" }}>
        “{flavor}”
      </div>
    ) : null;

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
            <span className="font-display font-bold text-amber-300 leading-none" style={{ fontSize: "2.5em", ...stroke }}>{sizeValue ?? card.size}</span>
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
        <div className="relative z-10 shrink-0 flex flex-col" style={{ maxHeight: "19em" }}>
          {flavorBox({ ml: "2.7em", mr: "0.7em", fs: "0.6em", maxH: "5.6em" })}
          {!compact && (
            <div className="rounded-[0.5em] text-white leading-snug overflow-x-hidden" style={{ marginLeft: "2.7em", marginRight: "0.7em", marginBottom: "0.4em", fontSize: "0.62em", background: "rgba(5,8,18,.74)", padding: "0.4em 0.6em", minHeight: 0, maxHeight: flavor ? "7em" : "9.6em", overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.4) transparent", border: "0.08em solid rgba(255,255,255,.18)" }}>
              {cost && <div><span className="inline-block bg-white/90 text-slate-900 rounded px-1 mr-1 font-bold">Call Cost</span>{cost}</div>}
              {lines.map((l, i) => <div key={i} className="text-amber-100">▪ {l}</div>)}
              {customTextList(card).map((t, i) => <div key={`ct${i}`} className="text-slate-200">▪ {t}</div>)}
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
            <div className="flex flex-wrap items-center shrink-0" style={{ padding: "0 0.5em 0.35em 0.7em", gap: "0.25em 0.4em" }}>
              {tagA && <span className="px-[1.1em] rounded-full text-white font-semibold truncate max-w-[60%]" style={{ fontSize: "0.6em", lineHeight: 1.5, background: `linear-gradient(90deg, ${color}, ${color}99)`, border: "0.08em solid rgba(255,255,255,.5)" }}>{tagA}</span>}
              {tagB && <span className="px-[1.1em] rounded-full text-white font-semibold truncate max-w-[60%]" style={{ fontSize: "0.6em", lineHeight: 1.5, background: "linear-gradient(90deg, #1d4ed8, #3b82f6cc)", border: "0.08em solid rgba(255,255,255,.5)" }}>{tagB}</span>}
            </div>
          )}
          <div className="flex items-center justify-center px-[0.5em] text-center shrink-0" style={{ height: compact ? "2.6em" : "2.3em", background: `linear-gradient(180deg, ${color}cc, #0b1220f2)`, borderTop: "0.1em solid rgba(255,255,255,.5)" }}>
            <span className="font-display font-bold italic text-white truncate" style={{ fontSize: compact ? "1em" : "1.1em", textShadow: "0 0 0.3em #000" }}>{card.name}</span>
          </div>
        </div>
        {soul !== undefined && (soul > 0 || guard > 0) && <SoulRail count={soul} guardCost={guard} />}
        {children}
      </div>
    );
  }

  /* ---------------- Spell / Item / Impact: เลย์เอาต์ตามการ์ดจริง (ภาพเต็มใบ + กรอบสีโลก) ---------------- */
  const isImpact = card.type === "Impact";
  const isItem = card.type === "Item";
  const isSpell = card.type === "Spell";
  const accent = isImpact ? "#fb7185" : isItem ? "#5eead4" : "#c4b5fd";
  const guard = soulguardCost(card);
  const costLabel = isItem ? "Call Cost" : "Cast Cost";
  const stroke: CSSProperties = { WebkitTextStroke: "0.07em #000", paintOrder: "stroke fill" } as CSSProperties;
  const box: CSSProperties = isImpact ? { ...base, aspectRatio: "88 / 63" } : base; // Impact จริงเป็นการ์ดแนวนอน
  const pillBg = isSpell ? "linear-gradient(180deg, #7c3aed, #3b0764)" : "linear-gradient(180deg, #94a3b8, #334155)";
  const showStat = (isItem || isImpact) && (st.power > 0 || st.critical > 0);
  const hasBody = !!cost || lines.length > 0 || customTextList(card).length > 0 || badges.length > 0;

  const renderLine = (l: string, i: number) => {
    const m = l.match(/^【Counter( 【Act】)?】\s*(.*)$/);
    if (m) {
      return (
        <div key={i} className="text-amber-100">
          <span className="inline-block bg-red-600 text-white rounded px-1 mr-1 font-bold border border-white/60">Counter{m[1] ? " Act" : ""}</span>{m[2]}
        </div>
      );
    }
    return <div key={i} className="text-amber-100">■ {l}</div>;
  };

  const pill = (txt: string, key: string, img?: string) => (
    <span key={key} className="inline-flex items-center rounded-full text-white font-semibold max-w-full" style={{ fontSize: "0.6em", lineHeight: 1.5, background: pillBg, border: "0.08em solid rgba(255,255,255,.55)", padding: "0 1.2em 0 0.2em", gap: "0.45em", boxShadow: "inset 0 0.1em 0 rgba(255,255,255,.25)" }}>
      <span className="shrink-0 rounded-full flex items-center justify-center overflow-hidden" style={{ width: "1.5em", height: "1.5em", background: "rgba(0,0,0,.5)", border: "0.08em solid rgba(255,255,255,.65)", fontSize: "0.9em" }}>
        {img ? <img src={img} alt="" className="w-full h-full object-cover" draggable={false} /> : "✦"}
      </span>
      <span className="truncate">{txt}</span>
    </span>
  );
  const pills = [tagA ? pill(tagA, "a") : null, tagB ? pill(tagB, "b", flag?.image) : null].filter(Boolean);

  const textBox = !compact && hasBody ? (
    <div className="rounded-[0.5em] text-white leading-snug overflow-x-hidden" style={{ marginLeft: "0.7em", marginRight: isImpact ? "0.3em" : "0.7em", marginBottom: "0.4em", fontSize: isImpact ? "0.56em" : "0.62em", background: "rgba(5,8,18,.74)", padding: "0.4em 0.6em", minHeight: 0, maxHeight: flavor ? (isImpact ? "6em" : "7.5em") : (isImpact ? "9em" : "10.5em"), overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.4) transparent", border: "0.08em solid rgba(255,255,255,.18)" }}>
      {cost && (
        <div>
          <span className="inline-block bg-slate-950 text-white rounded px-1 mr-1 font-bold border border-white/70">{costLabel}</span>{cost}
        </div>
      )}
      {lines.map(renderLine)}
      {customTextList(card).map((t, i) => <div key={`ct${i}`} className="text-slate-200 italic">■ {t}</div>)}
      {badges.length > 0 && (
        <div className="flex flex-wrap justify-end gap-[0.3em] mt-[0.3em]">
          {badges.map(b => <span key={b} className="bg-red-600 text-white rounded px-[0.5em] font-bold border border-white/70">{b}</span>)}
        </div>
      )}
    </div>
  ) : null;

  const nameBar = (
    <div className="flex items-center justify-center px-[0.5em] text-center shrink-0" style={{ height: compact ? "2.6em" : "2.3em", background: `linear-gradient(180deg, ${color}cc, #0b1220f2)`, borderTop: "0.1em solid rgba(255,255,255,.5)" }}>
      <span className="font-display font-bold italic text-white truncate" style={{ fontSize: compact ? "1em" : "1.1em", textShadow: "0 0 0.3em #000" }}>{card.name}</span>
    </div>
  );

  return (
    <div onClick={onClick} {...dnd} className={`${common} flex flex-col`} style={{ ...box, border: `0.22em solid ${color}`, background: "#0b1220" }}>
      {card.image
        ? <img src={card.image} alt={card.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        : <div className="absolute inset-0 flex items-center justify-center text-slate-600" style={{ fontSize: "0.9em", background: `linear-gradient(160deg, ${color}55, #0b1220)` }}>No Image</div>}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: compact ? "30%" : isImpact ? "78%" : "58%", background: "linear-gradient(to top, rgba(2,6,23,.92), rgba(2,6,23,.55) 60%, transparent)" }} />

      {/* พื้นที่ด้านบน: ป้ายประเภท (ไอคอน + ชื่อประเภท) และค่าสถานะ */}
      <div className="relative flex-1 min-h-0 z-10">
        <div className="absolute top-0 left-0 flex flex-col items-center text-center" style={{ width: "4.4em", padding: "0.3em 0 0.55em", background: "linear-gradient(180deg, rgba(8,12,24,.92), rgba(8,12,24,.7))", clipPath: "polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)" }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: "2.3em", height: "2.3em", color: accent, border: `0.12em solid ${accent}`, background: "rgba(0,0,0,.45)", boxShadow: `0 0 0.5em ${accent}88` }}>
            <TypeIcon type={card.type} />
          </span>
          <span className="text-white font-semibold leading-none" style={{ fontSize: "0.58em", marginTop: "0.35em" }}>{TYPE_LABEL[card.type] ?? card.type}</span>
        </div>

        {/* Item: Critical กลาง · Power (แดง) ล่าง เรียงแนวตั้งด้านซ้ายแบบเดียวกับมอนสเตอร์ (ไม่มี Defense) */}
        {isItem && showStat && (
          <div className="absolute left-0 flex flex-col items-center justify-between font-display font-bold overflow-hidden" style={{ top: "4.9em", bottom: "0.3em", width: "2.3em", padding: "0.15em 0", background: "linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,0))" }}>
            <span className="text-white" style={{ fontSize: compact ? "2.2em" : "1.9em", lineHeight: 1, ...stroke }} title="Critical">{st.critical}</span>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: vertSize(st.power, compact), lineHeight: 1, whiteSpace: "nowrap", color: "#fb7185", ...stroke }} title="Power">{st.power}</span>
          </div>
        )}
        {isImpact && showStat && (
          <div className="absolute flex items-baseline font-display font-bold" style={{ top: "0.5em", right: "0.8em", gap: "0.3em" }}>
            <span style={{ fontSize: "1.2em", color: "#fb7185", ...stroke }} title="Power">{st.power}</span>
            <span style={{ fontSize: "1.8em", lineHeight: 1, color: "#fff", ...stroke }} title="Critical">{st.critical}</span>
          </div>
        )}
        {/* Spell: ตราโลกใต้ป้าย */}
        {isSpell && !compact && flag?.image && (
          <img src={flag.image} alt="" draggable={false} className="absolute object-cover rounded-full" style={{ top: "4.6em", left: "0.7em", width: "2.8em", height: "2.8em", border: "0.12em solid rgba(255,255,255,.7)", boxShadow: "0 0 0.5em rgba(0,0,0,.7)" }} />
        )}
      </div>

      {/* ส่วนล่าง */}
      <div className="relative z-10 shrink-0 flex flex-col" style={{ maxHeight: isImpact ? "9.7em" : "19em" }}>
        {compact && badges.length > 0 && (
          <div className="flex justify-end" style={{ padding: "0 0.4em 0.25em" }}>
            <span className="bg-red-600 text-white rounded px-[0.4em] font-bold border border-white/70" style={{ fontSize: "0.6em" }}>{badges.length} KW</span>
          </div>
        )}

        {isImpact ? (
          !compact && (
            <div className="flex items-end">
              <div style={{ width: "62%" }}>{flavorBox({ ml: "0.7em", mr: "0.3em", fs: "0.54em", maxH: "5em" })}{textBox}</div>
              {pills.length > 0 && <div className="flex-1 min-w-0 flex flex-col items-end" style={{ padding: "0 0.5em 0.4em 0", gap: "0.25em" }}>{pills}</div>}
            </div>
          )
        ) : isSpell ? (
          <>
            {!compact && pills.length > 0 && <div className="flex flex-col items-start shrink-0" style={{ padding: "0 0.5em 0.3em 0.7em", gap: "0.2em" }}>{pills}</div>}
            {flavorBox({ ml: "0.7em", mr: "0.7em", fs: "0.6em", maxH: "5.6em" })}
            {textBox}
          </>
        ) : (
          <>
            {flavorBox({ ml: "0.7em", mr: "0.7em", fs: "0.6em", maxH: "5.6em" })}
            {textBox}
            {!compact && pills.length > 0 && <div className="flex flex-wrap items-center shrink-0" style={{ padding: "0 0.5em 0.35em 0.7em", gap: "0.25em 0.4em" }}>{pills}</div>}
          </>
        )}
        {nameBar}
      </div>
      {soul !== undefined && (soul > 0 || guard > 0) && <SoulRail count={soul} guardCost={guard} />}
      {children}
    </div>
  );
}
