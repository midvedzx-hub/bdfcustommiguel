import { useState } from "react";
import { Plus, Save, Trash2, Star, Search, ArrowLeft, ArrowRight, Download, Upload } from "lucide-react";
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
    const deckCards = editing.cardIds.map(id => cardOf(id)).filter(Boolean) as Card[];
    const buddyCard = editing.buddyId ? cardOf(editing.buddyId) : null;

    const filtered = cards.filter(c => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    const counts: { [id: string]: number } = {};
    editing.cardIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

    return (
      <div className="min-h-screen bg-slate-950 text-white p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 font-bold text-lg focus:border-cyan-500 outline-none" />
              <span className="text-slate-400 text-sm">({editing.cardIds.length} ใบ)</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">ยกเลิก</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Save size={16} /> บันทึก</button>
            </div>
          </div>

          <div className="mb-4 bg-slate-900 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">Flag:</label>
                <select value={editing.flagId} onChange={e => setEditing({ ...editing, flagId: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                  {flags.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {flag && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded overflow-hidden bg-slate-800">{flag.image && <img src={flag.image} className="w-full h-full object-cover" />}</div>
                  <span style={{ color: flag.color }}>Life {flag.life} | จั่ว {flag.startHand} | เกจ {flag.startGauge}</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <label className="text-sm text-slate-400">Buddy:</label>
                <select value={editing.buddyId ?? ""} onChange={e => setBuddy(e.target.value || null)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
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
              </div>
            </div>
            {buddyCard && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
                <Star size={12} fill="currentColor" /> Buddy: {buddyCard.name} (ลงสนามครั้งแรก Life +1)
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-cyan-400 mb-2">คลังการ์ด ({filtered.length})</h3>
              <div className="flex gap-2 mb-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:border-cyan-500 outline-none" />
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm">
                  <option value="all">ทั้งหมด</option>
                  <option value="Monster">Monster</option>
                  <option value="Spell">Spell</option>
                  <option value="Item">Item</option>
                  <option value="Impact">Impact</option>
                </select>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 max-h-[60vh] overflow-y-auto">
                <div className="flex flex-wrap gap-3 justify-center">
                  {filtered.map(c => (
                    <div key={c.id} className="relative group" onClick={() => addCard(c.id)}>
                      <CardView card={c} flag={flagOf(c.flagId)} size="sm" />
                      <div className="absolute inset-0 bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                        <Plus className="text-cyan-300" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-cyan-400 mb-2">เด็คของฉัน ({editing.cardIds.length} ใบ)</h3>
              <div className="bg-slate-900 rounded-xl p-3 max-h-[60vh] overflow-y-auto">
                {deckCards.length === 0 ? (
                  <p className="text-center text-slate-500 py-8 text-sm">คลิกการ์ดจากคลังเพื่อเพิ่มเข้าเด็ค</p>
                ) : (
                  <div className="space-y-1">
                    {editing.cardIds.map((id, i) => {
                      const c = cardOf(id);
                      if (!c) return null;
                      return (
                        <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-700 transition group">
                          <span className="text-xs text-slate-500 w-6">{i + 1}</span>
                          <span className="text-xs text-cyan-400 w-16">{c.type}</span>
                          <span className="text-sm flex-1 truncate">{c.name}</span>
                          {editing.buddyId === id && <Star size={12} className="text-amber-400" fill="currentColor" />}
                          <button onClick={() => removeCard(i)} className="opacity-0 group-hover:opacity-100 p-1 bg-red-900 hover:bg-red-800 rounded transition"><Trash2 size={12} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400">Deck Builder</h2>
          <div className="flex gap-2">
            <button onClick={() => downloadJSON(JSON.stringify(decks, null, 2), "decks.json")} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm"><Download size={14} /> Export</button>
            <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition flex items-center gap-1 text-sm cursor-pointer"><Upload size={14} /> Import<input type="file" accept=".json" className="hidden" onChange={handleImport} /></label>
            <button onClick={startNew} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition flex items-center gap-2"><Plus size={16} /> สร้างเด็ค</button>
            <button onClick={onBack} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">กลับ</button>
          </div>
        </div>

        {decks.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <p className="text-lg">ยังไม่มีเด็ค</p>
            <p className="text-sm mt-2">กด "สร้างเด็ค" เพื่อเริ่มจัดเด็คของคุณ</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {decks.map(d => {
              const flag = flagOf(d.flagId);
              const buddy = d.buddyId ? cardOf(d.buddyId) : null;
              return (
                <div key={d.id} className="bg-slate-900 border-2 rounded-xl p-4" style={{ borderColor: flag?.color || "#334155" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg" style={{ color: flag?.color }}>{d.name}</h3>
                      <p className="text-sm text-slate-400">{flag?.name ?? "ไม่มี Flag"} | {d.cardIds.length} ใบ</p>
                      {buddy && <p className="text-xs text-amber-400 mt-1 flex items-center gap-1"><Star size={10} fill="currentColor" /> Buddy: {buddy.name}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(d)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm">แก้ไข</button>
                      {onPlay && <button onClick={() => onPlay(d)} className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm">เล่น</button>}
                      <button onClick={() => del(d.id)} className="p-2 bg-red-900 hover:bg-red-800 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
