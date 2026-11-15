import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Card, Flag, FxEvent, GameState } from "@/types";
import { CardView } from "@/components/CardView";
import { statsOf } from "@/game/engine";
import { playSfx } from "@/game/sfx";

/* เลเยอร์เอฟเฟกต์ลอยเหนือสนาม (position: fixed)
 * อ่าน game.fx (เหตุการณ์จาก engine) แล้วเล่นอนิเมชันด้วย Web Animations API
 * ตำแหน่งอ้างอิงจาก DOM ที่มี data-fx:  slot:<side>:<0-2> · item:<side> · fighter:<side> · life:<side> · gauge:<side> · deck:<side> · drop:<side> · mat:<side>
 */
type Side = "host" | "guest";
// เสียงประกอบเหตุการณ์ (เวลาสอดคล้องกับอนิเมชัน)
function sfxFor(ev: FxEvent, at: number, impact: number) {
  switch (ev.k) {
    case "attack": playSfx("whoosh", 0); playSfx("hit", impact); break;
    case "life": playSfx(ev.delta < 0 ? "hurt" : "heal", at); break;
    case "destroy": playSfx("destroy", at); break;
    case "guard": playSfx("guard", at); break;
    case "soulIn": case "soulOut": playSfx("soul", at); break;
    case "call": playSfx("call", at); break;
    case "cast": playSfx("cast", at); break;
    case "charge": playSfx("charge", at); break;
    case "draw": playSfx("draw", at); break;
    case "negate": playSfx("negate", at); break;
  }
}
interface Pt { x: number; y: number; w: number; h: number }

function pointOf(id: string): Pt | null {
  const el = document.querySelector(`[data-fx="${id}"]`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight };
}
function shake(id: string, delay: number, power = 6) {
  const el = document.querySelector(`[data-fx="${id}"]`) as HTMLElement | null;
  if (!el || !el.animate) return;
  const p = power;
  el.animate(
    [{ transform: "translate(0,0)" }, { transform: `translate(${-p}px,${p / 2}px)` }, { transform: `translate(${p}px,${-p / 2}px)` }, { transform: `translate(${-p * 0.7}px,0)` }, { transform: `translate(${p * 0.5}px,0)` }, { transform: "translate(0,0)" }],
    { duration: 380, delay, easing: "ease-out" }
  );
}
function pulse(id: string, delay: number, color: string) {
  const el = document.querySelector(`[data-fx="${id}"]`) as HTMLElement | null;
  if (!el || !el.animate) return;
  el.animate(
    [{ filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}` }, { filter: "brightness(1.8)", boxShadow: `0 0 26px 6px ${color}`, offset: 0.3 }, { filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}` }],
    { duration: 700, delay, easing: "ease-out" }
  );
}

type Frames = Keyframe[];
function Anim({ frames, opts, style, className, children, onDone }: {
  frames: Frames; opts: KeyframeAnimationOptions; style?: CSSProperties; className?: string; children?: ReactNode; onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.animate) { onDone(); return; }
    const a = el.animate(frames, { fill: "both", ...opts });
    a.onfinish = () => onDone();
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className={className} style={{ position: "fixed", pointerEvents: "none", zIndex: 95, ...style }}>{children}</div>;
}

type Item = { key: number; node: (done: () => void) => ReactNode };

export function FxLayer({ game, cardOf, flagOf, onHide }: {
  game: GameState;
  cardOf: (id: string) => Card | undefined;
  flagOf: (id: string) => Flag | undefined;
  onHide: (uids: string[], ms: number) => void;
}) {
  const seen = useRef<number>(game.fxSeq ?? 0);
  const keySeq = useRef(0);
  const [items, setItems] = useState<Item[]>([]);

  const remove = (key: number) => setItems(prev => prev.filter(i => i.key !== key));

  useLayoutEffect(() => {
    const seq = game.fxSeq ?? 0;
    if (seq < seen.current) { seen.current = seq; return; } // เริ่มเกมใหม่/ซิงค์ย้อน
    if (seq === seen.current) return;
    const evs = (game.fx ?? []).filter(e => e.id > seen.current);
    seen.current = seq;
    if (evs.length === 0 || evs.length > 14) return; // ซิงค์กระโดดข้ามหลายเหตุการณ์ = ไม่เล่นย้อนหลัง

    const nodes: ((done: () => void) => ReactNode)[] = [];
    const push = (n: (done: () => void) => ReactNode) => nodes.push(n);
    const hasAttack = evs.some(e => e.k === "attack");
    const IMPACT = 600;                 // เวลา (ms) ที่ผู้โจมตีถึงเป้า
    const base = hasAttack ? IMPACT - 40 : 0;
    let idx = 0;

    const float = (x: number, y: number, text: string, color: string, delay: number, size = 30) => push(done => (
      <Anim onDone={done} style={{ left: x, top: y, color, fontSize: size, fontWeight: 900, textShadow: `0 0 10px ${color}, 0 2px 4px #000`, whiteSpace: "nowrap", fontFamily: "Kanit, sans-serif" }}
        frames={[
          { transform: "translate(-50%,-50%) translateY(14px) scale(.3)", opacity: 0 },
          { transform: "translate(-50%,-50%) translateY(-4px) scale(1.35)", opacity: 1, offset: 0.2 },
          { transform: "translate(-50%,-50%) translateY(-22px) scale(1)", opacity: 1, offset: 0.7 },
          { transform: "translate(-50%,-50%) translateY(-64px) scale(.9)", opacity: 0 },
        ]} opts={{ duration: 1250, delay, easing: "ease-out" }}>{text}</Anim>
    ));
    const ring = (x: number, y: number, size: number, color: string, delay: number, dur = 650) => push(done => (
      <Anim onDone={done} style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", border: `4px solid ${color}`, boxShadow: `0 0 24px ${color}, inset 0 0 18px ${color}` }}
        frames={[{ transform: "scale(.15)", opacity: 0.95 }, { transform: "scale(1.5)", opacity: 0 }]} opts={{ duration: dur, delay, easing: "cubic-bezier(.1,.7,.2,1)" }} />
    ));
    const flash = (x: number, y: number, size: number, color: string, delay: number) => push(done => (
      <Anim onDone={done} style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, #fff 0, ${color} 35%, transparent 70%)` }}
        frames={[{ transform: "scale(.2)", opacity: 1 }, { transform: "scale(1.25)", opacity: 0.9, offset: 0.35 }, { transform: "scale(1.6)", opacity: 0 }]} opts={{ duration: 520, delay, easing: "ease-out" }} />
    ));
    const orbs = (from: Pt, to: Pt, n: number, delay: number, color = "#a855f7") => {
      for (let i = 0; i < Math.min(n, 6); i++) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const arc = (i % 2 === 0 ? -1 : 1) * (30 + i * 10);
        push(done => (
          <Anim onDone={done} style={{ left: from.x - 11, top: from.y - 11, width: 22, height: 22, borderRadius: "50%", background: `radial-gradient(circle at 32% 28%, #fff 0 12%, ${color} 40%, #4c1d95)`, boxShadow: `0 0 14px ${color}, 0 0 30px ${color}88` }}
            frames={[
              { transform: "translate(0,0) scale(.4)", opacity: 0 },
              { transform: `translate(${dx * 0.35 + arc}px,${dy * 0.35 - 40}px) scale(1.25)`, opacity: 1, offset: 0.35 },
              { transform: `translate(${dx * 0.75 + arc * 0.4}px,${dy * 0.75 - 14}px) scale(1)`, opacity: 1, offset: 0.75 },
              { transform: `translate(${dx}px,${dy}px) scale(.45)`, opacity: 0.2 },
            ]} opts={{ duration: 850, delay: delay + i * 120, easing: "ease-in-out" }} />
        ));
      }
    };
    const slotId = (side: Side, pos: number) => (pos < 0 ? `item:${side}` : `slot:${side}:${pos}`);
    const other = (s: Side): Side => (s === "host" ? "guest" : "host");

    evs.forEach(ev => {
      const at = base + Math.min(idx, 6) * 140;
      sfxFor(ev, at, IMPACT);
      switch (ev.k) {
        case "attack": {
          const lead = game[ev.side];
          const tgt = ev.target.kind === "monster" ? pointOf(slotId(other(ev.side), ev.target.position)) : pointOf(`fighter:${other(ev.side)}`);
          if (!tgt) break;
          const flyers = ev.units.map(u => {
            const from = pointOf(slotId(ev.side, u.pos));
            const c = cardOf(u.cardId);
            const fc = u.pos < 0 ? lead.item : lead.monsters.find(m => m.uid === u.uid);
            return from && c ? { u, c, from, fc: fc ?? null } : null;
          }).filter((x): x is NonNullable<typeof x> => !!x);
          if (flyers.length === 0) break;
          onHide(flyers.map(f => f.u.uid), 1250);
          flyers.forEach((f, i) => {
            const cw = Math.max(48, Math.round(f.from.w * 0.62));
            const ch = Math.round(cw * 88 / 63);
            const spread = (i - (flyers.length - 1) / 2) * cw * 0.55;
            const dx = tgt.x - f.from.x + spread, dy = tgt.y - f.from.y + (ev.side === "host" ? 18 : -18);
            const finalRot = !f.fc || f.fc.state === "rest" ? 90 : 0; // ยังมีสิทธิ์ตีอีก = ตั้งกลับ, ไม่เหลือ = นอนค้าง
            push(done => (
              <Anim onDone={done} style={{ left: f.from.x - cw / 2, top: f.from.y - ch / 2, width: cw, height: ch, filter: "drop-shadow(0 0 10px #fbbf24)" }}
                frames={[
                  { transform: "translate(0,0) rotate(0deg) scale(1)", offset: 0 },
                  { transform: "translate(0,0) rotate(90deg) scale(1.15)", offset: 0.22, easing: "cubic-bezier(.6,0,.9,.4)" },
                  { transform: `translate(${dx}px,${dy}px) rotate(90deg) scale(1.3)`, offset: 0.5 },
                  { transform: `translate(${dx}px,${dy}px) rotate(90deg) scale(1.2)`, offset: 0.58 },
                  { transform: `translate(0,0) rotate(${finalRot}deg) scale(1)`, offset: 1 },
                ]} opts={{ duration: 1200, easing: "ease-in-out" }}>
                <CardView card={f.c} flag={flagOf(lead.flagId)} width={`${cw}px`} hideText stats={f.fc ? statsOf(f.fc) : undefined} />
              </Anim>
            ));
          });
          flash(tgt.x, tgt.y, 150, "#fbbf24", IMPACT - 30);
          ring(tgt.x, tgt.y, 120, "#fde68a", IMPACT - 20);
          ring(tgt.x, tgt.y, 90, "#fb7185", IMPACT + 70, 500);
          if (ev.target.kind === "monster") shake(slotId(other(ev.side), ev.target.position), IMPACT, 7);
          else shake(`fighter:${other(ev.side)}`, IMPACT, 7);
          if (flyers.length > 1) float(tgt.x, tgt.y - 70, `LINK ATTACK ×${flyers.length}`, "#c4b5fd", IMPACT - 80, 26);
          break;
        }
        case "life": {
          const p = pointOf(`life:${ev.side}`) ?? pointOf(`fighter:${ev.side}`);
          if (!p) break;
          idx++;
          if (ev.delta < 0) {
            float(p.x, p.y + 10, `−${Math.abs(ev.delta)}`, "#fb7185", at, 46);
            flash(p.x, p.y, 180, "#ef4444", at);
            shake(`mat:${ev.side}`, at, Math.min(14, 5 + Math.abs(ev.delta) * 2));
            pulse(`life:${ev.side}`, at, "#ef4444");
          } else {
            float(p.x, p.y + 10, `+${ev.delta}`, "#4ade80", at, 42);
            ring(p.x, p.y, 150, "#4ade80", at, 800);
            pulse(`life:${ev.side}`, at, "#4ade80");
          }
          break;
        }
        case "destroy": {
          const p = pointOf(slotId(ev.side, ev.pos));
          const c = cardOf(ev.cardId);
          if (!p || !c) break;
          idx++;
          const cw = Math.round(p.w * 0.62);
          const ch = Math.round(cw * 88 / 63);
          push(done => (
            <Anim onDone={done} style={{ left: p.x - cw / 2, top: p.y - ch / 2, width: cw, height: ch }}
              frames={[
                { transform: "translate(0,0) scale(1)", filter: "brightness(1)", opacity: 1, offset: 0 },
                { transform: "translate(-5px,2px) scale(1.04)", filter: "brightness(2.6)", opacity: 1, offset: 0.12 },
                { transform: "translate(5px,-2px) scale(1.06)", filter: "brightness(3)", opacity: 1, offset: 0.22 },
                { transform: "translate(0,0) scale(1.1) rotate(4deg)", filter: "brightness(2) blur(0px)", opacity: 1, offset: 0.38 },
                { transform: "translate(0,26px) scale(.35) rotate(26deg)", filter: "brightness(1.5) blur(5px)", opacity: 0, offset: 1 },
              ]} opts={{ duration: 900, delay: at, easing: "ease-in" }}>
              <CardView card={c} flag={flagOf(game[ev.side].flagId)} width={`${cw}px`} hideText />
            </Anim>
          ));
          for (let i = 0; i < 12; i++) {
            const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
            const dist = 50 + Math.random() * 70;
            const sz = 6 + Math.random() * 10;
            push(done => (
              <Anim onDone={done} style={{ left: p.x - sz / 2, top: p.y - sz / 2, width: sz, height: sz * 1.4, background: i % 3 === 0 ? "#fbbf24" : i % 3 === 1 ? "#fb7185" : "#e2e8f0", clipPath: "polygon(50% 0,100% 100%,0 100%)", boxShadow: "0 0 8px #fff8" }}
                frames={[
                  { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 },
                  { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 30}px) rotate(${Math.random() * 540}deg) scale(.2)`, opacity: 0 },
                ]} opts={{ duration: 750 + Math.random() * 250, delay: at + 280, easing: "cubic-bezier(.1,.7,.3,1)" }} />
            ));
          }
          flash(p.x, p.y, cw * 2, "#fb923c", at + 200);
          break;
        }
        case "guard": {
          const p = pointOf(slotId(ev.side, ev.pos));
          if (!p) break;
          idx++;
          const size = Math.round(p.w * 1.25);
          push(done => (
            <Anim onDone={done} style={{ left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: "50%", background: "radial-gradient(circle, rgba(233,213,255,.15) 0, rgba(168,85,247,.45) 60%, rgba(124,58,237,.1) 100%)", border: "5px solid #e9d5ff", boxShadow: "0 0 40px #a855f7, inset 0 0 40px #c084fc" }}
              frames={[
                { transform: "scale(.2)", opacity: 0 },
                { transform: "scale(1.05)", opacity: 1, offset: 0.3 },
                { transform: "scale(.96)", opacity: 1, offset: 0.55 },
                { transform: "scale(1.35)", opacity: 0 },
              ]} opts={{ duration: 1100, delay: at, easing: "ease-out" }} />
          ));
          ring(p.x, p.y, size * 1.2, "#c084fc", at + 150, 800);
          float(p.x, p.y - size * 0.62, "SOULGUARD!", "#e9d5ff", at, 28);
          float(p.x, p.y + size * 0.1, `เหลือ Soul ${ev.left}`, "#ddd6fe", at + 250, 18);
          break;
        }
        case "soulOut": {
          const p = pointOf(slotId(ev.side, ev.pos));
          const d = pointOf(`drop:${ev.side}`);
          if (!p) break;
          idx++;
          if (d) orbs(p, d, ev.n, at, "#a855f7");
          float(p.x, p.y + p.h * 0.1, `−${ev.n} SOUL`, "#c4b5fd", at, 22);
          break;
        }
        case "soulIn": {
          const p = pointOf(slotId(ev.side, ev.pos));
          const d = pointOf(`deck:${ev.side}`);
          if (!p) break;
          idx++;
          const delay = at + (evs.some(e => e.k === "call" && "uid" in e && e.uid === ev.uid) ? 520 : 0);
          if (d) orbs(d, p, ev.n, delay, "#c084fc");
          float(p.x, p.y - p.h * 0.15, `+${ev.n} SOUL`, "#ddd6fe", delay + 600, 22);
          break;
        }
        case "call": {
          const p = pointOf(slotId(ev.side, ev.pos));
          if (!p) break;
          idx++;
          ring(p.x, p.y, p.w * 1.1, ev.buddy ? "#fbbf24" : "#67e8f9", at + 220, 700);
          ring(p.x, p.y, p.w * 0.8, "#ffffff", at + 300, 550);
          flash(p.x, p.y, p.w * 1.4, ev.buddy ? "#fbbf24" : "#22d3ee", at + 250);
          if (ev.buddy) float(p.x, p.y - p.h * 0.45, "BUDDY CALL!", "#fde047", at + 200, 28);
          break;
        }
        case "cast": {
          const c = cardOf(ev.cardId);
          if (!c) break;
          idx++;
          const w = 170, h = Math.round(w * 88 / 63);
          const drop = pointOf(`drop:${ev.side}`);
          const cx = window.innerWidth / 2 - 80, cy = window.innerHeight / 2;
          const color = ev.label === "COUNTER!" ? "#38bdf8" : ev.label === "IMPACT!" ? "#fb7185" : "#fbbf24";
          const startY = ev.side === "host" ? 120 : -120;
          const toX = drop ? drop.x - cx : 0, toY = drop ? drop.y - cy : 0;
          push(done => (
            <Anim onDone={done} style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, filter: `drop-shadow(0 0 18px ${color})`, zIndex: 96 }}
              frames={[
                { transform: `translate(0,${startY}px) scale(.4) rotate(-8deg)`, opacity: 0, offset: 0 },
                { transform: "translate(0,0) scale(1.08) rotate(0)", opacity: 1, offset: 0.22 },
                { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, offset: 0.68 },
                { transform: `translate(${toX}px,${toY}px) scale(.3) rotate(14deg)`, opacity: 0, offset: 1 },
              ]} opts={{ duration: 1500, delay: at, easing: "cubic-bezier(.3,.8,.3,1)" }}>
              <CardView card={c} flag={flagOf(game[ev.side].flagId)} width={`${w}px`} />
            </Anim>
          ));
          float(cx, cy + h / 2 + 26, ev.label, color, at + 150, 40);
          break;
        }
        case "charge": {
          const p = pointOf(`gauge:${ev.side}`);
          if (!p) break;
          idx++;
          float(p.x, p.y, `+${ev.n} GAUGE`, "#fcd34d", at, 22);
          pulse(`gauge:${ev.side}`, at, "#f59e0b");
          break;
        }
        case "draw": {
          idx++;
          pulse(`deck:${ev.side}`, at, "#22d3ee");
          break;
        }
        case "negate": {
          idx++;
          float(window.innerWidth / 2 - 80, window.innerHeight / 2 - 40, "ATTACK NEGATED!", "#67e8f9", at, 38);
          break;
        }
      }
    });

    nodes.forEach(n => {
      const key = ++keySeq.current;
      setItems(prev => [...prev, { key, node: n }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fxSeq]);

  return (
    <>
      {items.map(it => <FxHost key={it.key} item={it} onDone={() => remove(it.key)} />)}
    </>
  );
}

function FxHost({ item, onDone }: { item: Item; onDone: () => void }) {
  const doneRef = useRef(false);
  const done = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };
  return <>{item.node(done)}</>;
}

/* แบนเนอร์ตัวใหญ่กลางจอ: เปลี่ยนเทิร์น / เฟส */
export function Banner({ text, sub, color }: { text: string; sub?: string; color: string }) {
  return (
    <div className="fixed inset-x-0 z-[90] pointer-events-none flex justify-center" style={{ top: "38%" }}>
      <div className="banner-sweep w-full flex flex-col items-center justify-center py-4" style={{ background: `linear-gradient(90deg, transparent, ${color}dd 18%, ${color}dd 82%, transparent)`, boxShadow: `0 0 40px ${color}88`, borderTop: "2px solid rgba(255,255,255,.7)", borderBottom: "2px solid rgba(255,255,255,.7)" }}>
        <div className="banner-text font-display font-extrabold text-white text-4xl md:text-5xl" style={{ textShadow: "0 3px 12px rgba(0,0,0,.6)", transform: "skewX(14deg)" }}>{text}</div>
        {sub && <div className="font-display text-white/90 text-sm md:text-base mt-1" style={{ transform: "skewX(14deg)" }}>{sub}</div>}
      </div>
    </div>
  );
}

export type { FxEvent };
