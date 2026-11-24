import type { Card, Flag, Deck, RuleSet, CustomKeyword } from "./types";
import { DEFAULT_RULES, deckBuddies } from "./types";

const KEYS = {
  flags: "cbf_flags",
  cards: "cbf_cards",
  decks: "cbf_decks",
};

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    try { localStorage.setItem("cbf_last_change", String(Date.now())); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error("Save failed", e);
    return false;
  }
}

export function getFlags(): Flag[] {
  return load<Flag>(KEYS.flags);
}

export function saveFlags(flags: Flag[]): boolean {
  return save(KEYS.flags, flags);
}

// ย้ายการ์ดเก่า: เดิม Counter ทุกแบบใช้ trigger เดียว ตอนนี้แยก 【Counter】 (มือ/Set) กับ Counter 【Act】 (บนสนาม)
// มอนสเตอร์/ไอเทมที่ใช้ "ถอด Soul / Stand ตัวเอง" เป็น Counter ถือเป็น Counter 【Act】 ทำครั้งเดียวแล้วจำไว้
function migrateCounterAct(cards: Card[]): Card[] {
  try {
    if (localStorage.getItem("cbf_mig_counter_act") === "1") return cards;
    let changed = false;
    const out = cards.map(c => {
      if (c.type !== "Monster" && c.type !== "Item") return c;
      const skills = (c.autoSkills ?? []).map(sk => {
        if (sk.trigger === "onCounter" && sk.effects.some(e => e.type === "removeSoul" || e.type === "standSelf")) {
          changed = true;
          return { ...sk, trigger: "onCounterAct" as const };
        }
        return sk;
      });
      return changed ? { ...c, autoSkills: skills } : c;
    });
    localStorage.setItem("cbf_mig_counter_act", "1");
    if (changed) localStorage.setItem(KEYS.cards, JSON.stringify(out));
    return out;
  } catch { return cards; }
}

export function getCards(): Card[] {
  return migrateCounterAct(load<Card>(KEYS.cards));
}

export function saveCards(cards: Card[]): boolean {
  return save(KEYS.cards, cards);
}

export function getDecks(): Deck[] {
  return load<Deck>(KEYS.decks);
}

export function saveDecks(decks: Deck[]): boolean {
  return save(KEYS.decks, decks);
}

export function getRules(): RuleSet {
  try {
    const raw = localStorage.getItem("cbf_rules");
    return raw ? { ...DEFAULT_RULES, ...(JSON.parse(raw) as Partial<RuleSet>) } : { ...DEFAULT_RULES };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRules(rules: RuleSet): void {
  try { localStorage.setItem("cbf_rules", JSON.stringify(rules)); } catch { /* ignore */ }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function getCustomKeywords(): CustomKeyword[] {
  try {
    const raw = localStorage.getItem("cbf_custom_kw");
    return raw ? (JSON.parse(raw) as CustomKeyword[]) : [];
  } catch { return []; }
}

export function saveCustomKeywords(list: CustomKeyword[]): void {
  try { localStorage.setItem("cbf_custom_kw", JSON.stringify(list)); } catch { /* ignore */ }
}

export function exportAll(): string {
  return JSON.stringify(
    { flags: getFlags(), cards: getCards(), decks: getDecks(), customKeywords: getCustomKeywords() },
    null,
    2
  );
}

// ส่งออกเฉพาะส่วน (ใส่ของที่เกี่ยวข้องมาด้วย เพื่อนำเข้าที่เครื่องอื่นแล้วไม่ขาด)
export function exportCards(cards: Card[]): string {
  const flagIds = new Set(cards.map(c => c.flagId));
  return JSON.stringify({ flags: getFlags().filter(f => flagIds.has(f.id)), cards }, null, 2);
}
export function exportDecks(decks: Deck[]): string {
  const cardIds = new Set(decks.flatMap(d => [...d.cardIds, ...deckBuddies(d)]));
  const cards = getCards().filter(c => cardIds.has(c.id));
  const flagIds = new Set([...decks.map(d => d.flagId), ...cards.map(c => c.flagId)]);
  return JSON.stringify({ flags: getFlags().filter(f => flagIds.has(f.id)), cards, decks }, null, 2);
}
export function exportFlags(flags: Flag[]): string {
  return JSON.stringify({ flags }, null, 2);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

// รวมของเดิมกับของที่นำเข้า โดยใช้ id (id ซ้ำ = ทับของเดิม) ไม่ลบของที่มีอยู่
function mergeById<T extends { id: string }>(old: T[], incoming: T[]): T[] {
  const map = new Map(old.map(x => [x.id, x]));
  incoming.forEach(x => map.set(x.id, x));
  return [...map.values()];
}

export interface ImportResult { flags: number; cards: number; decks: number }
export interface ParsedImport { flags: Flag[]; cards: Card[]; decks: Deck[]; kws: CustomKeyword[] | null }
export interface ImportSelection { flags?: Set<string>; cards?: Set<string>; decks?: Set<string> }

// อ่านไฟล์ที่ Export ไว้ (รับได้ทั้งไฟล์รวม {flags,cards,decks} และอาร์เรย์เดี่ยว ๆ) โดยยังไม่บันทึกอะไร
export function parseImport(json: string): ParsedImport {
  const data: unknown = JSON.parse(json.replace(/^\uFEFF/, ""));
  let flags: Flag[] = [];
  let cards: Card[] = [];
  let decks: Deck[] = [];
  let kws: CustomKeyword[] | null = null;

  if (Array.isArray(data)) {
    const items = data.filter(isObj);
    cards = items.filter(x => "type" in x && "flagId" in x && !("cardIds" in x)) as unknown as Card[];
    decks = items.filter(x => Array.isArray(x.cardIds)) as unknown as Deck[];
    flags = items.filter(x => "color" in x && "startHand" in x && !("type" in x)) as unknown as Flag[];
  } else if (isObj(data)) {
    if (Array.isArray(data.flags)) flags = data.flags as Flag[];
    if (Array.isArray(data.cards)) cards = data.cards as Card[];
    if (Array.isArray(data.decks)) decks = data.decks as Deck[];
    if (Array.isArray(data.customKeywords)) kws = data.customKeywords as CustomKeyword[];
  }
  flags = flags.filter(x => isObj(x) && typeof x.id === "string");
  cards = cards.filter(x => isObj(x) && typeof x.id === "string");
  decks = decks.filter(x => isObj(x) && typeof x.id === "string");

  if (flags.length === 0 && cards.length === 0 && decks.length === 0 && !kws)
    throw new Error("ไม่พบข้อมูล Flag / การ์ด / เด็ค ในไฟล์นี้");
  return { flags, cards, decks, kws };
}

// บันทึกเข้าเครื่อง ถ้าระบุ sel = นำเข้าเฉพาะที่เลือก (เด็คที่เลือกจะพ่วงการ์ดของเด็คนั้น และการ์ด/เด็คจะพ่วง Flag ที่ใช้ ถ้ามีอยู่ในไฟล์)
export function applyImport(p: ParsedImport, sel?: ImportSelection): ImportResult {
  let { flags, cards, decks } = p;
  let kws = p.kws;
  if (sel) {
    const deckSet = sel.decks ?? new Set<string>();
    decks = decks.filter(d => deckSet.has(d.id));
    const cardIds = new Set(sel.cards ?? []);
    decks.forEach(d => { d.cardIds.forEach(id => cardIds.add(id)); deckBuddies(d).forEach(b => cardIds.add(b)); });
    cards = cards.filter(c => cardIds.has(c.id));
    const flagIds = new Set(sel.flags ?? []);
    [...cards.map(c => c.flagId), ...decks.map(d => d.flagId)].forEach(id => id && flagIds.add(id));
    flags = flags.filter(f => flagIds.has(f.id));
    kws = null;
  }
  let ok = true;
  if (flags.length) ok = saveFlags(mergeById(getFlags(), flags)) && ok;
  if (cards.length) ok = saveCards(mergeById(getCards(), cards)) && ok;
  if (decks.length) ok = saveDecks(mergeById(getDecks(), decks)) && ok;
  if (kws) saveCustomKeywords(mergeById(getCustomKeywords(), kws));
  if (!ok) throw new Error("พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม (รูปการ์ดใหญ่เกินไป) บันทึกไม่ครบ");
  return { flags: flags.length, cards: cards.length, decks: decks.length };
}

export function importAll(json: string): ImportResult {
  return applyImport(parseImport(json));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- สำรองข้อมูล ---------------- */
// การ์ด/เด็ค/Flag ทั้งหมดอยู่ใน localStorage ของเบราว์เซอร์ — ล้างข้อมูลเว็บ/เปลี่ยนเครื่อง/พื้นที่เต็ม = หายหมด จึงเตือนให้ Export เป็นไฟล์เก็บไว้
const num = (k: string) => { try { const v = parseInt(localStorage.getItem(k) ?? "", 10); return isNaN(v) ? 0 : v; } catch { return 0; } };
export function backupAll(): void {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  downloadJSON(exportAll(), `custom-buddyfight-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`);
  try { localStorage.setItem("cbf_last_backup", String(Date.now())); localStorage.removeItem("cbf_backup_snooze"); } catch { /* ignore */ }
}
export function snoozeBackupReminder(days = 1): void {
  try { localStorage.setItem("cbf_backup_snooze", String(Date.now() + days * 86400000)); } catch { /* ignore */ }
}
// ขนาดข้อมูลของเกมใน localStorage (ตัวอักษร ≈ ไบต์ x2; โควตามาตรฐานประมาณ 5 MB)
export function storageUsageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("cbf_")) total += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
    }
  } catch { /* ignore */ }
  return total;
}
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
export interface BackupStatus {
  hasData: boolean;
  lastBackup: number;      // 0 = ไม่เคยสำรอง
  changedSince: boolean;   // มีการแก้ข้อมูลหลังสำรองครั้งล่าสุด
  needsReminder: boolean;
  usageBytes: number;
  nearFull: boolean;
}
export function getBackupStatus(): BackupStatus {
  const hasData = getCards().length + getDecks().length + getFlags().length > 0;
  const lastBackup = num("cbf_last_backup");
  const lastChange = num("cbf_last_change");
  const changedSince = lastBackup === 0 ? hasData : lastChange > lastBackup;
  const snoozed = num("cbf_backup_snooze") > Date.now();
  const stale = lastBackup === 0 || Date.now() - lastBackup > 3 * 86400000;
  const usageBytes = storageUsageBytes();
  const nearFull = usageBytes > STORAGE_QUOTA_BYTES * 0.8;
  return { hasData, lastBackup, changedSince, needsReminder: hasData && changedSince && stale && !snoozed, usageBytes, nearFull };
}
// ขอให้เบราว์เซอร์เก็บข้อมูลแบบถาวร (ลดโอกาสโดนล้างเองตอนพื้นที่ไม่พอ) — เงียบ ๆ ไม่รบกวนผู้เล่น
export async function requestPersistentStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
export async function isStoragePersistent(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; }
}

export function downloadJSON(data: string, filename: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000); // ถ้าเพิกถอนทันที บางเบราว์เซอร์/มือถือโหลดไฟล์ไม่ได้
}

// ย่อรูปก่อนเก็บ: รูปจากมือถือใหญ่หลาย MB ทำให้ localStorage (~5MB) เต็มแล้วบันทึกการ์ดไม่ได้
export function compressImage(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load image failed"));
    };
    img.src = url;
  });
}
