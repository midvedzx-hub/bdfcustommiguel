import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX, Music2 } from "lucide-react";
import { BGM_TITLE, getBgmVolume, isBgmOn, setBgmOn, setBgmVolume, subscribeBgm } from "@/game/bgm";
import { getSfxVolume, isMuted, playSfx, setMuted, setSfxVolume } from "@/game/sfx";
import { Switch } from "@/components/ui";

// ปุ่มควบคุมเสียง: เพลงประกอบ + เสียงเอฟเฟกต์ ปรับระดับเสียงแยกกันได้
export function AudioControl({ variant = "fab" }: { variant?: "fab" | "inline" }) {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const [sfxOn, setSfxOnState] = useState(!isMuted());
  const [sfxVol, setSfxVolState] = useState(getSfxVolume());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeBgm(() => tick(n => n + 1)), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const musicOn = isBgmOn();
  const vol = getBgmVolume();
  const anyOn = musicOn || sfxOn;
  const Icon = !anyOn ? VolumeX : musicOn ? Music : Volume2;

  const wrap = variant === "fab" ? "fixed bottom-4 right-4 z-40" : "relative";
  const popPos = variant === "fab" ? "bottom-14 right-0" : "top-11 right-0";

  return (
    <div ref={ref} className={wrap}>
      <button
        onClick={() => setOpen(o => !o)}
        title="เสียง"
        className={variant === "fab" ? "btn !rounded-full !p-3 shadow-xl backdrop-blur" : "btn !py-1.5 !px-2.5 !text-xs"}
        style={variant === "fab" ? { background: "rgba(15,23,42,.9)" } : undefined}
      >
        <Icon size={variant === "fab" ? 20 : 14} className={musicOn ? "text-cyan-300" : ""} />
      </button>
      {open && (
        <div className={`absolute ${popPos} w-72 panel p-4 shadow-2xl text-sm`} style={{ background: "rgba(10,15,30,.96)" }}>
          <div className="flex items-center gap-2 mb-3 text-cyan-300 font-display font-bold"><Music2 size={16} /> เสียงในเกม</div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-200">เพลงประกอบ</span>
              <Switch on={musicOn} onChange={setBgmOn} />
            </div>
            <div className="text-[11px] text-slate-500 mb-2 truncate">♪ {BGM_TITLE}</div>
            <div className="flex items-center gap-2">
              <VolumeX size={13} className="text-slate-500 shrink-0" />
              <input type="range" min={0} max={100} value={Math.round(vol * 100)} disabled={!musicOn} onChange={e => setBgmVolume(parseInt(e.target.value) / 100)} className="flex-1 accent-cyan-400" />
              <Volume2 size={13} className="text-slate-400 shrink-0" />
              <span className="w-8 text-right text-xs text-slate-400">{Math.round(vol * 100)}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-200">เสียงเอฟเฟกต์</span>
              <Switch on={sfxOn} onChange={v => { setMuted(!v); setSfxOnState(v); if (v) playSfx("turn"); }} />
            </div>
            <div className="flex items-center gap-2">
              <VolumeX size={13} className="text-slate-500 shrink-0" />
              <input type="range" min={0} max={100} value={Math.round(sfxVol * 100)} disabled={!sfxOn}
                onChange={e => { const v = parseInt(e.target.value) / 100; setSfxVolume(v); setSfxVolState(v); }}
                onMouseUp={() => playSfx("hit")} onTouchEnd={() => playSfx("hit")} className="flex-1 accent-cyan-400" />
              <Volume2 size={13} className="text-slate-400 shrink-0" />
              <span className="w-8 text-right text-xs text-slate-400">{Math.round(sfxVol * 100)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
