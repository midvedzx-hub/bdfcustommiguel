import type { Card, Deck, Flag, GameState, RuleSet } from "@/types";
import { getCard } from "@/game/engine";

// เซฟเกมที่กำลังเล่นค้างอยู่ (บอท / ออนไลน์) ไว้ใน localStorage — เปิดเกมใหม่แล้ว "เล่นต่อ" ได้
// ไม่เก็บรูปการ์ด (ใหญ่มาก) — ตอนเล่นต่อดึงรูปจากคลังการ์ดในเครื่อง / ให้เพื่อนส่งรูปมาใหม่ตอนต่อห้อง
const KEY = "cbf_saved_game";

export interface SavedGame {
  v: 1;
  savedAt: number;
  mode: "bot" | "multiplayer";
  role: "host" | "guest";        // ออนไลน์: เราเป็นเจ้าของห้องหรือผู้เข้าร่วม
  roomId: string;                // ออนไลน์: รหัสห้อง (ใช้ต่อห้องเดิม)
  hostDeck: Deck;                // เด็คของเรา
  guestDeckId?: string;          // โหมดบอท: เด็คของบอท
  rules: RuleSet;
  state: GameState;
  cards: Record<string, Card>;   // การ์ดทุกใบที่ปรากฏในเกม (ไม่มีรูป)
  flags: Record<string, Flag>;   // Flag ทั้งสองฝั่ง (ไม่มีรูป)
}

type SideState = GameState["host"];
function idsOfSide(p: SideState, out: Set<string>) {
  [p.deck, p.hand, p.gaugePile, p.dropZone, p.setZone, p.buddyIds ?? [], p.buddiesCalled ?? []].forEach(a => a.forEach(id => out.add(id)));
  (p.setSoul ?? []).forEach(a => a.forEach(id => out.add(id)));
  if (p.buddyId) out.add(p.buddyId);
  [...p.monsters, ...(p.item ? [p.item] : [])].forEach(m => { out.add(m.cardId); m.soul.forEach(id => out.add(id)); });
  (p.soulCallOffers ?? []).forEach(o => out.add(o.cardId));
}
export function collectStateCardIds(state: GameState): string[] {
  const out = new Set<string>();
  idsOfSide(state.host, out);
  idsOfSide(state.guest, out);
  return [...out];
}

export function buildSave(args: {
  mode: "bot" | "multiplayer"; role: "host" | "guest"; roomId: string; hostDeck: Deck; guestDeckId?: string;
  rules: RuleSet; state: GameState; flagOf: (id: string) => Flag | undefined;
}): SavedGame {
  const cards: Record<string, Card> = {};
  collectStateCardIds(args.state).forEach(id => { const c = getCard(id); if (c) cards[id] = { ...c, image: "" }; });
  const flags: Record<string, Flag> = {};
  [args.state.host.flagId, args.state.guest.flagId].forEach(id => { const f = args.flagOf(id); if (f) flags[id] = { ...f, image: "" }; });
  const state = { ...args.state, fx: [] }; // อนิเมชันเก่าไม่ต้องเล่นซ้ำ
  return { v: 1, savedAt: Date.now(), mode: args.mode, role: args.role, roomId: args.roomId, hostDeck: args.hostDeck, guestDeckId: args.guestDeckId, rules: args.rules, state, cards, flags };
}

export function saveGame(s: SavedGame): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedGame;
    if (s?.v !== 1 || !s.state?.host || !s.state?.guest || !s.hostDeck) return null;
    return s;
  } catch { return null; }
}

export function clearSavedGame() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const PHASE: Record<string, string> = { draw: "Draw", charge: "Charge", main: "Main", attack: "Attack", final: "Final" };
export function savedGameSummary(s: SavedGame) {
  const mine = s.mode === "multiplayer" ? s.role : "host";
  const foe = mine === "host" ? "guest" : "host";
  const when = new Date(s.savedAt);
  const ago = Math.max(0, Math.round((Date.now() - s.savedAt) / 60000));
  const agoText = ago < 1 ? "เมื่อสักครู่" : ago < 60 ? `${ago} นาทีที่แล้ว` : ago < 1440 ? `${Math.round(ago / 60)} ชั่วโมงที่แล้ว` : `${Math.round(ago / 1440)} วันที่แล้ว`;
  return {
    modeText: s.mode === "bot" ? "เล่นกับบอท" : `ออนไลน์ ห้อง ${s.roomId || "-"} (${s.role === "host" ? "เจ้าของห้อง" : "ผู้เข้าร่วม"})`,
    turnText: `เทิร์น ${s.state.turn} · ${s.state.currentTurn === mine ? "ตาเรา" : "ตาคู่แข่ง"} · ${PHASE[s.state.phase] ?? s.state.phase}`,
    lifeText: `Life เรา ${s.state[mine].life} · คู่แข่ง ${s.state[foe].life}`,
    savedText: `${when.toLocaleString("th-TH")} (${agoText})`,
  };
}
