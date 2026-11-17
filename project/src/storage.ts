import type { Card, Flag, Deck, RuleSet, CustomKeyword } from "./types";
import { DEFAULT_RULES } from "./types";

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

export function importAll(json: string): { flags: number; cards: number; decks: number } {
  const data = JSON.parse(json);
  if (data.flags) saveFlags(data.flags);
  if (data.cards) saveCards(data.cards);
  if (data.decks) saveDecks(data.decks);
  if (data.customKeywords) saveCustomKeywords(data.customKeywords);
  return {
    flags: data.flags?.length ?? 0,
    cards: data.cards?.length ?? 0,
    decks: data.decks?.length ?? 0,
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function downloadJSON(data: string, filename: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
