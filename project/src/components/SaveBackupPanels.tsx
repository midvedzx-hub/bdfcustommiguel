import { useEffect, useState } from "react";
import { Play, Trash2, ShieldAlert, DatabaseBackup, Clock, HardDrive } from "lucide-react";
import { type SavedGame, savedGameSummary } from "@/game/savegame";
import { backupAll, getBackupStatus, snoozeBackupReminder, isStoragePersistent, STORAGE_QUOTA_BYTES, type BackupStatus } from "@/storage";

// กล่อง "เล่นต่อเกมที่ค้างอยู่" (หน้าแรก / หน้าเลือกโหมดเล่น)
export function ResumePanel({ saved, onResume, onDiscard }: { saved: SavedGame; onResume: () => void; onDiscard: () => void }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const sum = savedGameSummary(saved);
  return (
    <section className="panel p-4 md:p-5 mb-6 border-2 !border-emerald-500/60" style={{ boxShadow: "0 0 24px #10b98133" }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="rounded-2xl p-3 bg-emerald-500/15 border border-emerald-500/50"><Play size={26} className="text-emerald-300" /></div>
        <div className="flex-1 min-w-[14rem]">
          <h3 className="font-display text-lg font-bold text-emerald-300">มีเกมที่เล่นค้างอยู่ — เล่นต่อได้</h3>
          <p className="text-sm text-slate-200">{sum.modeText} · {sum.turnText}</p>
          <p className="text-xs text-slate-400">{sum.lifeText} · บันทึกเมื่อ {sum.savedText}</p>
          {saved.mode === "multiplayer" && (
            <p className="text-xs text-amber-300 mt-1">ออนไลน์: {saved.role === "host" ? "ระบบจะเปิดห้องเดิมรอเพื่อน (รหัสเดิม) — บอกเพื่อนให้เข้าห้องเดิมอีกครั้ง" : "ระบบจะพยายามเข้าห้องเดิมให้อัตโนมัติ — เจ้าของห้องต้องเล่นต่อก่อน"}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onResume} className="btn btn-primary"><Play size={16} /> เล่นต่อ</button>
          {!confirmDel
            ? <button onClick={() => setConfirmDel(true)} className="btn" title="ลบเกมที่เซฟไว้"><Trash2 size={15} /></button>
            : <button onClick={onDiscard} onBlur={() => setConfirmDel(false)} className="btn !bg-rose-700 !border-rose-400/60" autoFocus>ยืนยันลบเซฟ</button>}
        </div>
      </div>
    </section>
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleString("th-TH");
const mb = (b: number) => (b / 1024 / 1024).toFixed(1);

// แถบเตือนสำรองข้อมูล: การ์ด/เด็ค/Flag อยู่ใน localStorage ของเบราว์เซอร์ ล้างข้อมูลเว็บเมื่อไหร่ก็หายหมด
export function BackupBanner() {
  const [st, setSt] = useState<BackupStatus>(() => getBackupStatus());
  const refresh = () => setSt(getBackupStatus());
  if (!st.hasData) return null;

  return (
    <div className="space-y-3 mb-6">
      {st.needsReminder && (
        <section className="panel p-4 border-2 !border-amber-500/60" style={{ boxShadow: "0 0 24px #f59e0b26" }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-2xl p-3 bg-amber-500/15 border border-amber-500/50"><ShieldAlert size={26} className="text-amber-300" /></div>
            <div className="flex-1 min-w-[14rem]">
              <h3 className="font-display text-lg font-bold text-amber-300">สำรองข้อมูลของคุณไว้หน่อยนะ</h3>
              <p className="text-sm text-slate-200">
                การ์ด เด็ค และ Flag ทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ถ้าล้างข้อมูลเว็บ เปลี่ยนเครื่อง หรือพื้นที่เต็ม <b>จะหายหมดและกู้คืนไม่ได้</b>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {st.lastBackup ? `สำรองล่าสุด ${fmtDate(st.lastBackup)} · มีการแก้ไขหลังจากนั้น` : "ยังไม่เคยสำรองข้อมูล"}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { backupAll(); setTimeout(refresh, 300); }} className="btn btn-primary"><DatabaseBackup size={16} /> สำรองตอนนี้ (ดาวน์โหลดไฟล์)</button>
              <button onClick={() => { snoozeBackupReminder(1); refresh(); }} className="btn" title="เตือนอีกครั้งพรุ่งนี้"><Clock size={15} /> ไว้ทีหลัง</button>
            </div>
          </div>
        </section>
      )}
      {st.nearFull && (
        <section className="panel p-3 border !border-rose-500/60 flex items-center gap-3 flex-wrap">
          <HardDrive size={20} className="text-rose-300 shrink-0" />
          <p className="text-sm text-rose-200 flex-1 min-w-[14rem]">
            พื้นที่เก็บข้อมูลในเบราว์เซอร์ใกล้เต็ม ({mb(st.usageBytes)} / ~{mb(STORAGE_QUOTA_BYTES)} MB) — ถ้าเต็มจะบันทึกการ์ดใหม่ไม่ได้ แนะนำสำรองข้อมูลแล้วลบรูปการ์ดที่ใหญ่หรือไม่ได้ใช้ออก
          </p>
          <button onClick={() => { backupAll(); setTimeout(refresh, 300); }} className="btn !py-1 !px-3 !text-xs"><DatabaseBackup size={14} /> สำรองตอนนี้</button>
        </section>
      )}
    </div>
  );
}

// ข้อความสถานะเล็ก ๆ ใต้ปุ่ม Export/Import (หน้าแรก)
export function BackupStatusLine() {
  const st = getBackupStatus();
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => { isStoragePersistent().then(setPersistent); }, []);
  return (
    <p className="text-center text-xs text-slate-500 mt-2">
      {st.lastBackup ? `สำรองล่าสุด ${fmtDate(st.lastBackup)}` : "ยังไม่เคยสำรองข้อมูล"} · พื้นที่ใช้ไป {mb(st.usageBytes)} MB
      {persistent === true ? " · เบราว์เซอร์ล็อกข้อมูลถาวรให้แล้ว (แต่ยังควรสำรองไฟล์เก็บไว้)" : persistent === false ? " · เบราว์เซอร์อาจล้างข้อมูลได้เมื่อพื้นที่เครื่องเต็ม จึงควรสำรองไฟล์เก็บไว้" : ""}
    </p>
  );
}
