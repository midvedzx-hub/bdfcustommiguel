import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

type Icon = ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;

// โครงหน้าจอมาตรฐาน: พื้นหลังเมนู + หัวเรื่อง + ปุ่มกลับ/ปุ่มเครื่องมือ
export function ScreenShell({ title, subtitle, icon: Icon, accent = "#22d3ee", onBack, actions, children, maxW = "max-w-6xl" }: {
  title: string; subtitle?: string; icon?: Icon; accent?: string; onBack?: () => void;
  actions?: ReactNode; children: ReactNode; maxW?: string;
}) {
  return (
    <div className="menu-bg min-h-screen text-white p-4 md:p-8">
      <div className={`${maxW} mx-auto page-in`}>
        <header className="flex items-center justify-between gap-3 flex-wrap mb-7">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="rounded-2xl p-3 shrink-0" style={{ background: `${accent}22`, border: `1px solid ${accent}55`, boxShadow: `0 0 22px ${accent}33` }}>
                <Icon size={26} style={{ color: accent }} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-2xl md:text-3xl font-bold truncate" style={{ color: accent, textShadow: `0 0 24px ${accent}55` }}>{title}</h2>
              {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {actions}
            {onBack && <button onClick={onBack} className="btn"><ArrowLeft size={15} /> กลับ</button>}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: Icon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="panel text-center py-16 px-6">
      <div className="floaty inline-flex rounded-full p-5 bg-slate-800/70 border border-slate-700 mb-4"><Icon size={36} className="text-slate-400" /></div>
      <p className="font-display text-xl text-slate-200">{title}</p>
      {hint && <p className="text-sm text-slate-500 mt-1 mb-5">{hint}</p>}
      {action}
    </div>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <span role="switch" aria-checked={on} tabIndex={0} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!on); } }} />;
}
