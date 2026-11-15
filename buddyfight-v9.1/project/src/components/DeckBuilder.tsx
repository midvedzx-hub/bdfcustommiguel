import { useState } from "react";
import { Plus, Minus, Save, Trash2, Star, Search, Download, Upload, BookOpen } from "lucide-react";
import { ScreenShell, EmptyState } from "@/components/ui";
import type { Deck, Card, Flag } from "@/types";
import { getDecks, saveDecks, getCards, getFlags, uid, downloadJSON, importAll } from "@/storage";
import { CardView } from "@/components/CardView";

export function DeckBuilder({ onBack, onPlay }: { onBack: () => void; onPlay?: (deck: Deck) => void }) {
  const [decks, setDecks] = useState<Deck[]>(getDecks());
  const [cards] = useState<Card[]>(getCards());
  const [flags] = useState<Flag[]>(getFlags);
  const [editing, setEditing] = useState<Deck | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  function persist(next: Deck[]) {
    setDecks(next);
    saveDecks(next);
  }

  function startNew() {
    setEditing({ id: uid(), name: "เด็คใหม่", flagId: flags[0]?.id ?? "", cardIds: [], buddyId: null });
  }

  function saveEdit() {
    if (!editing) return;
    const exists = decks.some(d => d.id === editing.id);
    const next = exists ? decks.map(d => d.id === editing.id ? editing : d) : [...decks, editing];
    persist(next);
    setEditing(null);
  }

  function del(id: string) {
    persist(decks.filter(d => d.id !== id));
  }

  function addCard(cardId: string) {
    if (!editing) return;
    setEditing({ ...editing, cardIds: [...editing.cardIds, cardId] });
  }

  function removeCard(index: number) {
    if (!editing) return;
    setEditing({ ...editing, cardIds: editing.cardIds.filter((_, i) => i !== index) });
  }

  function setBuddy(cardId: string | null) {
    if (!editing) return;
    setEditing({ ...editing, buddyId: cardId });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importAll(reader.result as string);
        setDecks(getDecks());
        alert("นำเข้าสำเร็จ");
      } catch { alert("ไฟล์ไม่ถูกต้อง"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const flagOf = (id: string) => flags.find(f => f.id === id);
  const cardOf = (id: string) => cards.find(c => c.id === id);

  if (editing) {
    const flag = flagOf(editing.flagId);
    const col = flag?.color || "#22d3ee";
    const buddyCard = editing.buddyId ? cardOf(editing.buddyId) : null;
    const TYPE_COL: Record<string, string> = { Monster: "#f59e0b", Spell: "#38bdf8", Item: "#34d399", Impact: "#fb7185" };

    const filtered = cards.filter(c => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    const counts: { [id: string]: number } = {};
    editing.cardIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    // รวมการ์ดซ้ำเป็นแถวเดียว เรียงตามประเภท แล้วตามค่าใช้จ่าย
    const typeOrder = ["Monster", "Item", "Spell", "Impact"];
    const groups = Object.keys(counts)
      .map(id => ({ id, n: counts[id], c: cardOf(id) }))
      .filter((g): g is { id: string; n: number; c: Card } => !!g.c)
      .sort((x, y) => typeOrder.indexOf(x.c.type) - typeOrder.indexOf(y.c.type) || x.c.callCost - y.c.callCost || x.c.name.localeCompare(y.c.name));
    const typeCount: Record<string, number> = { Monster: 0, Spell: 0, Item: 0, Impact: 0 };
    editing.cardIds.forEach(id => { const c = cardOf(id); if (c) typeCount[c.type]++; });
    const total = editing.cardIds.length;
    // เส้นโค้งค่าใช้จ่าย: 0,1,2,3,4,5+
    const curve = [0, 0, 0, 0, 0, 0];
    editing.cardIds.forEach(id => { const c = cardOf(id); if (c) curve[Math.min(5, c.callCost)]++; });
    const maxCurve = Math.max(1, ...curve);
    const avgCost = total ? (editing.cardIds.reduce((a, id) => a + (cardOf(id)?.callCost ?? 0), 0) / total) : 0;

    return (
      <ScreenShell
        title="แก้ไขเด็ค" subtitle="คลิกการ์ดจากคลังเพื่อเพิ่ม · ใช้ปุ่ม +/− ในรายการเด็คเพื่อปรับจำนวน" icon={BookOpen} accent={col} maxW="max-w-7xl"
        actions={<>
          <button onClick={() => setEditing(null)} className="btn">ยกเลิก</button>
          <button onClick={saveEdit} className="btn btn-primary"><Save size={16} /> บันทึกเด็ค</button>
        </>}
      >
        {/* ตั้งค่าเด็ค */}
        <div className="panel p-4 mb-5 grid lg:grid-cols-[1.2fr_1fr_1fr] gap-4 items-center" style={{ borderColor: `${col}55` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2" style={{ borderColor: col, background: `linear-gradient(135deg, ${col}, #0f172a)` }}>
              {flag?.image && <img src={flag.image} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-xs text-slate-400">ชื่อเด็ค</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-display font-bold text-lg" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Flag (โลก)</label>
            <select value={editing.flagId} onChange={e => setEditing({ ...editing, flagId: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
              {flags.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {flag && <div className="text-xs mt-1" style={{ color: col }}>Life {flag.life} · จั่ว {flag.startHand} · เกจ {flag.startGauge}</div>}
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center gap-1"><Star size={11} className="text-amber-400" fill="currentColor" /> Buddy</label>
            <select value={editing.buddyId ?? ""} onChange={e => setBuddy(e.target.value || null)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
              <option value="">ไม่เลือก</option>
              {(flag?.buddyIds ?? []).length > 0 && (
                <optgroup label="Buddy ประจำโลกนี้">
                  {(flag!.buddyIds ?? []).map(id => cardOf(id)).filter(Boolean).map(c => <option key={c!.id} value={c!.id}>★ {c!.name}</option>)}
                </optgroup>
              )}
              <optgroup label="มอนสเตอร์ทั้งหมด">
                {cards.filter(c => c.type === "Monster").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            </select>
            {buddyCard && <div className="text-xs text-amber-400 mt-1 truncate">★ {buddyCard.name} (Buddy Call: Life +1)</div>}
          </div>
        </div>

        {/* สถิติเด็ค */}
        <div className="panel p-4 mb-5 grid md:grid-cols-[auto_1fr_auto] gap-5 items-center">
          <div className="text-center">
            <div className={`font-display text-4xl font-extrabold ${total === 50 ? "text-emerald-400" : "text-amber-300"}`}>{total}<span className="text-lg text-slate-500">/50</span></div>
            <div className="text-xs text-slate-500">{total === 50 ? "ครบตามมาตรฐาน" : total < 50 ? `ขาดอีก ${50 - total} ใบ` : `เกิน ${total - 50} ใบ`}</div>
          </div>
          <div>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-800 mb-2">
              {Object.entries(typeCount).map(([t, n]) => n > 0 && <div key={t} style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: TYPE_COL[t] }} />)}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(typeCount).map(([t, n]) => <span key={t} className="chip"><span className="w-2 h-2 rounded-full" style={{ background: TYPE_COL[t] }} />{t} {n}</span>)}
              <span className="chip">Cost เฉลี่ย {avgCost.toFixed(1)}</span>
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-14" title="จำนวนการ์ดตามค่าใช้จ่าย (0–5+)">
            {curve.map((n, i) => (
              <div key={i} className="flex flex-col items-center justify-end h-full">
                <div className="w-5 rounded-t bg-gradient-to-t from-cyan-700 to-cyan-300 transition-all" style={{ height: `${(n / maxCurve) * 100}%`, minHeight: n > 0 ? 3 : 0 }} title={`Cost ${i}${i === 5 ? "+" : ""}: ${n}`} />
                <span className="text-[10px] text-slate-500 mt-0.5">{i === 5 ? "5+" : i}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5">
          {/* คลังการ์ด */}
          <div>
            <div className="flex flex-wrap gap-2 mb-2 items-center">
              <h3 className="font-display font-bold text-cyan-300 mr-auto">คลังการ์ด ({filtered.length})</h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm w-44" />
              </div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm">
                <option value="all">ทุกประเภท</option>
                <option value="Monster">Monster</option>
                <option value="Spell">Spell</option>
                <option value="Item">Item</option>
                <option value="Impact">Impact</option>
              </select>
            </div>
            <div className="panel p-3 max-h-[62vh] overflow-y-auto">
              {filtered.length === 0 ? <p className="text-center text-slate-500 py-10 text-sm">ไม่พบการ์ด</p> : (
                <div className="grid gap-x-3 gap-y-5 justify-items-center" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
                  {filtered.map(c => {
                    const n = counts[c.id] || 0;
                    return (
                      <div key={c.id} className="relative group lift rounded-lg cursor-pointer" onClick={() => addCard(c.id)} style={{ ["--glow" as string]: "rgba(34,211,238,.5)" }}>
                        <CardView card={c} flag={flagOf(c.flagId)} size="sm" />
                        {n > 0 && <span className="absolute -top-2 -right-2 z-30 min-w-[1.5rem] h-6 px-1 rounded-full bg-cyan-500 text-slate-900 text-xs font-bold flex items-center justify-center shadow-lg">×{n}</span>}
                        <div className="absolute inset-0 z-20 bg-cyan-500/25 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center pointer-events-none">
                          <Plus className="text-white drop-shadow" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* เด็คของฉัน */}
          <div>
            <h3 className="font-display font-bold text-cyan-300 mb-2">เด็คของฉัน ({total} ใบ · {groups.length} แบบ)</h3>
            <div className="panel p-2 max-h-[62vh] overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-center text-slate-500 py-12 text-sm">คลิกการ์ดจากคลังเพื่อเพิ่มเข้าเด็ค</p>
              ) : (
                <div className="space-y-1">
                  {groups.map(({ id, n, c }) => (
                    <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-slate-800/60 hover:bg-slate-700/70 transition group">
                      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: TYPE_COL[c.type] }} />
                      <CardView card={c} flag={flagOf(c.flagId)} width="30px" hideText />
                      <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-900 text-xs font-bold flex items-center justify-center shrink-0" title="Cost">{c.callCost}</span>
                      <span className="text-sm flex-1 truncate">{c.name}</span>
                      {editing.buddyId === id && <Star size={12} className="text-amber-400 shrink-0" fill="currentColor" />}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => removeCard(editing.cardIds.lastIndexOf(id))} className="w-6 h-6 rounded-md bg-slate-700 hover:bg-red-800 flex items-center justify-center"><Minus size={12} /></button>
                        <span className="w-6 text-center font-display font-bold text-cyan-300">{n}</span>
                        <button onClick={() => addCard(id)} className="w-6 h-6 rounded-md bg-slate-700 hover:bg-cyan-700 flex items-center justify-center"><Plus size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }


  const TYPE_COL: Record<string, string> = { Monster: "#f59e0b", Spell: "#38bdf8", Item: "#34d399", Impact: "#fb7185" };
  return (
    <ScreenShell
      title="Deck Builder" subtitle="จัดเด็ค เลือก Flag และ Buddy ประจำเด็ค" icon={BookOpen} accent="#fbbf24" onBack={onBack}
      actions={<>
        <button onClick={() => downloadJSON(JSON.stringify(decks, null, 2), "decks.json")} className="btn"><Download size={14} /> Export</button>
        <label className="btn cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
        <button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างเด็ค</button>
      </>}
    >
      {decks.length === 0 ? (
        <EmptyState icon={BookOpen} title="ยังไม่มีเด็ค" hint='กด "สร้างเด็ค" เพื่อเริ่มจัดเด็คของคุณ' action={<button onClick={startNew} className="btn btn-primary"><Plus size={16} /> สร้างเด็คแรก</button>} />
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {decks.map(d => {
            const flag = flagOf(d.flagId);
            const col = flag?.color || "#475569";
            const buddy = d.buddyId ? cardOf(d.buddyId) : null;
            const counts: Record<string, number> = { Monster: 0, Spell: 0, Item: 0, Impact: 0 };
            d.cardIds.forEach(id => { const c = cardOf(id); if (c) counts[c.type] = (counts[c.type] ?? 0) + 1; });
            const total = Math.max(1, d.cardIds.length);
            return (
              <div key={d.id} className="panel lift group overflow-hidden flex" style={{ borderColor: `${col}66`, ["--glow" as string]: `${col}66` }}>
                <div className="relative w-28 shrink-0 cursor-pointer" onClick={() => setEditing(d)}>
                  {flag?.image ? <img src={flag.image} alt="" className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-110" /> : <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${col}, #0f172a)` }} />}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-950/80" />
                </div>
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-bold text-xl truncate" style={{ color: col }}>{d.name}</h3>
                      <p className="text-sm text-slate-400 truncate">{flag?.name ?? "ไม่มี Flag"}</p>
                    </div>
                    <span className={`chip shrink-0 ${d.cardIds.length === 50 ? "!text-emerald-300 !border-emerald-500/40" : "!text-amber-300 !border-amber-500/40"}`} title="เด็คมาตรฐาน Buddyfight ใช้ 50 ใบ">{d.cardIds.length}/50 ใบ</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-800 my-3" title="สัดส่วนประเภทการ์ด">
                    {Object.entries(counts).map(([t, n]) => n > 0 && <div key={t} style={{ width: `${(n / total) * 100}%`, background: TYPE_COL[t] }} title={`${t} ${n}`} />)}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
                    {Object.entries(counts).map(([t, n]) => <span key={t} className="chip"><span className="w-2 h-2 rounded-full" style={{ background: TYPE_COL[t] }} />{t} {n}</span>)}
                    {buddy && <span className="chip !text-amber-300"><Star size={10} fill="currentColor" /> {buddy.name}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(d)} className="btn !py-1.5 flex-1">แก้ไข</button>
                    {onPlay && <button onClick={() => onPlay(d)} className="btn btn-primary !py-1.5">เล่น</button>}
                    <button onClick={() => del(d.id)} className="btn btn-danger !py-1.5 !px-3"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScreenShell>
  );
}
