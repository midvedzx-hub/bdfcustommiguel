import { Flag, Layers, Swords, Gamepad2, Download, Upload, BookOpen, Check, ChevronRight, Sparkles } from "lucide-react";
import { getFlags, getCards, getDecks, exportAll, importAll, downloadJSON } from "@/storage";
import { useRef, useState } from "react";
import { CardView } from "@/components/CardView";

interface Props {
  onFlagMaker: () => void;
  onCardStudio: () => void;
  onDeckBuilder: () => void;
  onPlay: () => void;
}

export function Lobby({ onFlagMaker, onCardStudio, onDeckBuilder, onPlay }: Props) {
  const flags = getFlags();
  const cards = getCards();
  const decks = getDecks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState("");

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importAll(reader.result as string);
        setImportMsg(`นำเข้าสำเร็จ: ${result.flags} Flag, ${result.cards} การ์ด, ${result.decks} เด็ค`);
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        setImportMsg("ไฟล์ไม่ถูกต้อง");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const ready = decks.length > 0 && flags.length > 0 && cards.length > 0;
  // การ์ดโชว์หน้าแรก: เอาการ์ดจริงของผู้เล่น (ให้ความรู้สึกเป็นเกมของตัวเอง)
  const showcase = [...cards].filter(c => c.image).slice(0, 4);
  const fan = showcase.length > 0 ? showcase : cards.slice(0, 4);

  const menus = [
    { title: "Flag Maker", desc: "สร้างโลก/ธงประจำเด็ค กำหนด Life เกจ และ Buddy ประจำโลก", icon: Flag, color: "#22d3ee", onClick: onFlagMaker, count: flags.length, label: "Flag" },
    { title: "Card Studio", desc: "ออกแบบ Monster / Spell / Item / Impact พร้อมสกิลและ Counter Act", icon: Layers, color: "#34d399", onClick: onCardStudio, count: cards.length, label: "การ์ด" },
    { title: "Deck Builder", desc: "จัดเด็ค เลือก Flag และ Buddy ประจำเด็ค", icon: BookOpen, color: "#fbbf24", onClick: onDeckBuilder, count: decks.length, label: "เด็ค" },
    { title: "เข้าสนามแข่ง", desc: "เล่นกับบอท หรือสร้างห้องเล่นออนไลน์กับเพื่อน", icon: Swords, color: "#fb7185", onClick: onPlay, count: -1, label: "" },
  ];

  const steps = [
    { done: flags.length > 0, text: "สร้าง Flag", go: onFlagMaker },
    { done: cards.length > 0, text: "สร้างการ์ด", go: onCardStudio },
    { done: decks.length > 0, text: "จัดเด็ค", go: onDeckBuilder },
    { done: false, text: "ลงสนาม!", go: onPlay },
  ];
  const nextStep = steps.findIndex(s => !s.done);

  return (
    <div className="menu-bg min-h-screen text-white relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-8 py-8 md:py-12 page-in">
        {/* Hero */}
        <section className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center mb-14">
          <div>
            <span className="chip mb-4" style={{ color: "#67e8f9", borderColor: "#22d3ee55" }}><Sparkles size={12} /> SANDBOX CARD GAME</span>
            <h1 className="hero-title text-5xl md:text-7xl font-extrabold leading-[1.05] mb-4 flex items-center gap-3 flex-wrap">
              <Gamepad2 size={56} className="text-cyan-300 shrink-0" style={{ filter: "drop-shadow(0 0 14px #22d3ee)" }} />
              Custom Buddyfight
            </h1>
            <p className="text-slate-300 text-lg md:text-xl max-w-xl mb-7">ออกแบบ Flag และการ์ดทุกใบด้วยตัวเอง แล้วลงสนามแข่งกับบอทหรือเพื่อนแบบเรียลไทม์</p>
            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={ready ? onPlay : steps[Math.max(0, nextStep)].go} className="btn btn-primary btn-lg glow-pulse">
                <Swords size={20} /> {ready ? "เข้าสนามแข่ง" : `เริ่มเลย: ${steps[Math.max(0, nextStep)].text}`}
              </button>
              <button onClick={onCardStudio} className="btn btn-lg"><Layers size={18} /> ออกแบบการ์ด</button>
            </div>
            <div className="flex gap-3">
              {[{ n: flags.length, l: "Flag", c: "#22d3ee" }, { n: cards.length, l: "การ์ด", c: "#34d399" }, { n: decks.length, l: "เด็ค", c: "#fbbf24" }].map(s => (
                <div key={s.l} className="panel px-5 py-2.5 text-center min-w-[84px]">
                  <div className="font-display text-2xl font-bold" style={{ color: s.c }}>{s.n}</div>
                  <div className="text-xs text-slate-500">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* การ์ดลอย */}
          <div className="relative h-[22rem] md:h-[27rem] hidden sm:block">
            {(fan.length > 0 ? fan : [null, null, null]).map((c, i, arr) => {
              const n = arr.length;
              const rot = (i - (n - 1) / 2) * 11;
              const x = (i - (n - 1) / 2) * 46;
              return (
                <div key={i} className="absolute left-1/2 top-1/2 floaty" style={{ ["--r" as string]: `${rot}deg`, marginLeft: x - 105, marginTop: -150 + Math.abs(rot) * 1.4, animationDelay: `${i * 0.6}s`, zIndex: 10 - Math.abs(i - n / 2) }}>
                  <CardView card={c ?? undefined} faceDown={!c} flag={c ? flags.find(f => f.id === c.flagId) : undefined} width="210px" />
                </div>
              );
            })}
          </div>
        </section>

        {/* ขั้นตอนเริ่มต้น */}
        <section className="panel p-4 md:p-5 mb-8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-slate-300 mr-2">เริ่มต้นใน 4 ขั้นตอน</span>
            {steps.map((s, i) => (
              <button key={s.text} onClick={s.go} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition ${s.done ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : i === nextStep ? "border-cyan-400 bg-cyan-500/10 text-cyan-200 btn-nudge" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${s.done ? "bg-emerald-500 text-slate-900" : "bg-slate-700"}`}>{s.done ? <Check size={12} /> : i + 1}</span>
                {s.text}
                {i < steps.length - 1 && <ChevronRight size={14} className="text-slate-600 -mr-1" />}
              </button>
            ))}
          </div>
        </section>

        {/* เมนู */}
        <section className="grid sm:grid-cols-2 gap-5">
          {menus.map(m => {
            const Icon = m.icon;
            return (
              <button key={m.title} onClick={m.onClick} className="group relative panel lift p-6 text-left overflow-hidden" style={{ ["--glow" as string]: `${m.color}55`, borderColor: `${m.color}40` }}>
                <div className="absolute inset-0 opacity-60 group-hover:opacity-100 transition" style={{ background: `radial-gradient(circle at 100% 0%, ${m.color}26, transparent 60%)` }} />
                <div className="relative flex items-start gap-4">
                  <div className="rounded-2xl p-3.5 transition group-hover:scale-110 group-hover:rotate-3" style={{ background: `${m.color}1f`, border: `1px solid ${m.color}55` }}>
                    <Icon size={30} style={{ color: m.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-2xl font-bold mb-1 flex items-center gap-2" style={{ color: m.color }}>{m.title}<ChevronRight size={20} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition" /></h3>
                    <p className="text-sm text-slate-400">{m.desc}</p>
                    {m.count >= 0 && <span className="chip mt-3">{m.count} {m.label}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <div className="flex justify-center gap-3 mt-10">
          <button onClick={() => downloadJSON(exportAll(), "custom-buddyfight-all.json")} className="btn"><Download size={14} /> Export ทั้งหมด</button>
          <button onClick={() => fileRef.current?.click()} className="btn"><Upload size={14} /> Import ทั้งหมด</button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
        {importMsg && <p className="text-center text-sm text-cyan-400 mt-3">{importMsg}</p>}
      </div>
    </div>
  );
}
