import { Flag, Layers, Swords, Gamepad2, Download, Upload, BookOpen } from "lucide-react";
import { getFlags, getCards, getDecks, exportAll, importAll, downloadJSON } from "@/storage";
import { useRef, useState } from "react";

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

  const menus = [
    {
      title: "Flag Maker",
      desc: "สร้าง Flag ประจำตัว กำหนด Life, เกจ, และกฎพิเศษได้อิสระ",
      icon: Flag,
      color: "#0891b2",
      onClick: onFlagMaker,
      count: flags.length,
      countLabel: "Flag",
    },
    {
      title: "Card Studio",
      desc: "สร้างการ์ด Monster, Spell, Item, Impact พร้อมสกิลอัตโนมัติ",
      icon: Layers,
      color: "#059669",
      onClick: onCardStudio,
      count: cards.length,
      countLabel: "การ์ด",
    },
    {
      title: "Deck Builder",
      desc: "จัดเด็ค เลือก Flag และ Buddy Monster ประจำเด็ค",
      icon: BookOpen,
      color: "#d97706",
      onClick: onDeckBuilder,
      count: decks.length,
      countLabel: "เด็ค",
    },
    {
      title: "Play Online / VS Bot",
      desc: "เข้าสนามแข่ง เล่นกับบอท หรือสร้างห้องเล่นกับเพื่อนแบบเรียลไทม์",
      icon: Swords,
      color: "#dc2626",
      onClick: onPlay,
      count: 0,
      countLabel: "",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Gamepad2 size={48} className="text-cyan-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Custom Buddyfight
            </h1>
          </div>
          <p className="text-slate-400 text-lg">Sandbox — ออกแบบ Flag และการ์ดทุกใบขึ้นเอง 100% เล่นออนไลน์กับเพื่อน</p>
        </div>

        {/* Stats bar */}
        <div className="flex justify-center gap-6 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-3 text-center">
            <div className="text-2xl font-bold text-cyan-400">{flags.length}</div>
            <div className="text-xs text-slate-500">Flag</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{cards.length}</div>
            <div className="text-xs text-slate-500">การ์ด</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{decks.length}</div>
            <div className="text-xs text-slate-500">เด็ค</div>
          </div>
        </div>

        {/* Menu grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {menus.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.title}
                onClick={m.onClick}
                className="group relative bg-slate-900 border-2 rounded-2xl p-6 text-left hover:scale-[1.02] transition-all overflow-hidden"
                style={{ borderColor: `${m.color}40` }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition"
                  style={{ background: `radial-gradient(circle at top right, ${m.color}15, transparent 70%)` }}
                />
                <div className="relative flex items-start gap-4">
                  <div className="rounded-xl p-3" style={{ background: `${m.color}20`, border: `1px solid ${m.color}40` }}>
                    <Icon size={28} style={{ color: m.color }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1" style={{ color: m.color }}>{m.title}</h3>
                    <p className="text-sm text-slate-400">{m.desc}</p>
                    {m.countLabel && (
                      <span className="text-xs text-slate-500 mt-2 inline-block">มี {m.count} {m.countLabel}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Import/Export all */}
        <div className="flex justify-center gap-3 mt-10">
          <button onClick={() => downloadJSON(exportAll(), "custom-buddyfight-all.json")} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-2 transition">
            <Download size={14} /> Export ทั้งหมด
          </button>
          <button onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm flex items-center gap-2 transition">
            <Upload size={14} /> Import ทั้งหมด
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
        {importMsg && <p className="text-center text-sm text-cyan-400 mt-3">{importMsg}</p>}
      </div>
    </div>
  );
}


