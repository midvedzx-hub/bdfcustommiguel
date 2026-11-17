import type { Flag, Card, AutoSkill, AutoEffect } from "@/types";
import { TRIGGER_LABELS } from "@/types";
import { KEYWORD_DEFS } from "@/game/keywords";

export function getFlagColor(flag?: Flag | null): string {
  return flag?.color || "#0891b2";
}

export function clampColor(hex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return "#0891b2";
}

const KEYWORDS: Record<string, string> = {
  penetrate: "Penetrate",
  doubleAttack: "Double Attack",
  tripleAttack: "Triple Attack",
  quadrupleAttack: "Quadruple Attack",
  hextupleAttack: "Hextuple Attack",
  soulguard: "Soulguard",
  lifelink: "Lifelink",
  move: "Move",
  counterattack: "Counterattack",
  ignoreCenter: "Ignore Center",
  indestructibleBattle: "Battle Proof",
};

const FILTER_TH: Record<string, string> = { Monster: "มอนสเตอร์", Spell: "เวท", Item: "ไอเทม", Impact: "Impact" };
const filterText = (f?: string) => (f && f !== "any" ? `การ์ด${FILTER_TH[f] ?? f}` : "การ์ด");

export function effectText(e: AutoEffect): string {
  const v = e.value;
  switch (e.type) {
    case "draw": return `จั่วการ์ด ${v} ใบ`;
    case "addGauge": return `Charge ${v} ใบ (เด็ค→เกจ)`;
    case "addLife": return `ฟื้น Life ${v}`;
    case "reduceLife": return `ทำดาเมจ ${v} ใส่ผู้เล่นศัตรู`;
    case "destroyOpponentMonster": return `ทำลายมอนสเตอร์ศัตรู ${v} ตัว`;
    case "restOpponent": return `Rest มอนสเตอร์ศัตรู ${v} ตัว`;
    case "opponentDiscard": return `ศัตรูทิ้งการ์ดในมือ ${v} ใบ`;
    case "recoverFromDrop": return `เก็บ${filterText(e.filter)}จากสุสานขึ้นมือ ${v} ใบ`;
    case "standSelf": return `Stand มอนสเตอร์ของเรา`;
    case "buffPower": return `Power +${v}`;
    case "buffCritical": return `Critical +${v}`;
    case "buffDefense": return `Defense +${v}`;
    case "multiAttack": return `โจมตีได้ ${v} ครั้งต่อเทิร์น`;
    case "negateAttack": return `ยกเลิกการโจมตีนั้น`;
    case "destroyAttacker": return `ทำลายผู้โจมตี`;
    case "restAttacker": return `Rest ผู้โจมตี`;
    case "addSoul": return `นำการ์ดบนเด็ค ${v} ใบเข้า Soul ของการ์ดนี้`;
    case "removeSoul": return `ถอด Soul ${v} ใบของการ์ดนี้ลงสุสาน`;
    case "dropToSoul": return `นำ${filterText(e.filter)} ${v} ใบจากสุสานเข้า Soul`;
    case "soulToHand": return `ถอด Soul ${v} ใบของการ์ดนี้ขึ้นมือ`;
    case "bounceOpponentMonster": return `ดึงมอนสเตอร์ศัตรู ${v} ตัวกลับมือ`;
    case "powerPerSoul": return `Power +${v} ต่อการ์ด 1 ใบใน Soul`;
    case "criticalPerSoul": return `Critical +${v} ต่อการ์ด 1 ใบใน Soul`;
    case "negateSpell": return `ยกเลิกเวทที่ศัตรูกำลังร่าย`;
    case "lookTop": {
      const opts: string[] = [];
      if ((e.toHand ?? 0) > 0) opts.push(`ขึ้นมือ ${e.toHand} ใบ`);
      if ((e.toDrop ?? 0) > 0) opts.push(`ลงดรอป ${e.toDrop} ใบ`);
      if ((e.toBottom ?? 0) > 0) opts.push(`ใส่ใต้สุดของกอง ${e.toBottom} ใบ`);
      return `ดูการ์ด ${v} ใบจากบนสุดของกอง${opts.length ? ` แล้วเลือก: ${opts.join(" / ")}` : ""}`;
    }
    case "kw": return e.name ?? "คีย์เวิร์ด";
    default: return KEYWORDS[e.type] ?? e.type;
  }
}

// สร้างข้อความสกิลอัตโนมัติสำหรับแสดงบนการ์ด (คนสร้างการ์ดไม่ต้องพิมพ์เอง)
export function skillLines(card: Card): string[] {
  const lines: string[] = [];
  card.autoSkills?.forEach(sk => {
    const allKeywords = sk.effects.every(e => e.type in KEYWORDS || e.type === "kw");
    if ((sk.trigger === "continuous" || sk.trigger === "onAttack") && allKeywords) return; // แสดงเป็นป้ายแดงแทน
    const trig = TRIGGER_LABELS.find(t => t.value === sk.trigger)?.label.replace(/ \(.*\)$/, "") ?? sk.trigger;
    const timing = (sk.trigger === "onCounter" || sk.trigger === "onCounterAct")
      ? ((sk.timing ?? "attack") === "any" ? " (ตอนศัตรูโจมตีหรือร่ายเวท)" : (sk.timing ?? "attack") === "cast" ? " (ตอนศัตรูร่ายเวท)" : " (ตอนศัตรูโจมตี)")
      : "";
    const body = sk.effects.map(effectText).join("、");
    if (sk.name) lines.push(`【${sk.name}】${sk.trigger === "continuous" ? "" : `${trig}${timing}: `}${body}`);
    else lines.push(`【${trig}】${timing ? timing.trim() + " " : ""}${body}`);
  });
  return lines;
}

// ป้ายคีย์เวิร์ดสีแดง (Penetrate, Move, Soulguard ฯลฯ)
export function keywordBadges(card: Card): string[] {
  const out: string[] = [];
  card.autoSkills?.forEach(sk => {
    if (sk.name && !out.includes(sk.name)) out.push(sk.name); // คีย์เวิร์ดกำหนดเอง
    if (sk.trigger !== "continuous" && sk.trigger !== "onAttack") return;
    sk.effects.forEach(e => {
      const k = e.type === "kw" ? (e.name ?? "") : KEYWORDS[e.type];
      if (!k) return;
      const v = Math.max(1, Math.floor(e.value));
      // Lifelink แสดงค่าดาเมจเสมอ (Soulguard ถอด Soul 1 ใบเสมอ จึงไม่มีตัวเลข)
      const label = e.type === "lifelink" ? `${k} ${v}` : k;
      if (!out.includes(label)) out.push(label);
    });
  });
  return out;
}

// ข้อความ Call Cost บนการ์ด
export function costText(card: Card): string {
  const parts: string[] = [];
  if (card.callCost > 0 || card.type === "Monster") parts.push(`จ่าย ${card.callCostType === "Life" ? "Life" : "เกจ"} ${card.callCost}`);
  if ((card.callSoulFromDeck ?? 0) > 0) parts.push(`นำการ์ดบนเด็ค ${card.callSoulFromDeck} ใบเข้า Soul ของการ์ดนี้`);
  return parts.join(" และ ");
}

export function hasCounter(card: Card): boolean {
  return !!card.autoSkills?.some(s => s.trigger === "onCounter" || s.trigger === "onCounterAct");
}

// เทมเพลตสกิลกดเพิ่มทีเดียว ทำให้ออกแบบการ์ดง่ายขึ้น
export const SKILL_TEMPLATES: { label: string; skill: AutoSkill }[] = [
  { label: "Penetrate", skill: { trigger: "continuous", effects: [{ type: "penetrate", value: 1 }] } },
  { label: "Double Attack", skill: { trigger: "continuous", effects: [{ type: "doubleAttack", value: 1 }] } },
  { label: "Triple Attack", skill: { trigger: "continuous", effects: [{ type: "tripleAttack", value: 1 }] } },
  { label: "Move", skill: { trigger: "continuous", effects: [{ type: "move", value: 1 }] } },
  { label: "Counterattack", skill: { trigger: "continuous", effects: [{ type: "counterattack", value: 1 }] } },
  { label: "Soulguard", skill: { trigger: "continuous", effects: [{ type: "soulguard", value: 1 }] } },
  { label: "Lifelink 1 (ตายแล้วโดนดาเมจ)", skill: { trigger: "continuous", effects: [{ type: "lifelink", value: 1 }] } },
  { label: "ต้นเทิร์น: สุสาน→Soul 1", skill: { trigger: "onTurnStart", effects: [{ type: "dropToSoul", value: 1 }] } },
  { label: "ลงสนาม: สุสาน→Soul 2", skill: { trigger: "onCall", effects: [{ type: "dropToSoul", value: 2 }] } },
  { label: "ร่าย: สุสาน→Soul ของ Soulguard 2", skill: { trigger: "onCast", effects: [{ type: "dropToSoul", value: 2 }] } },
  { label: "ร่าย: ดึงมอนสเตอร์ศัตรูกลับมือ", skill: { trigger: "onCast", effects: [{ type: "bounceOpponentMonster", value: 1 }] } },
  { label: "Power +1000 ต่อ Soul", skill: { trigger: "continuous", effects: [{ type: "powerPerSoul", value: 1000 }] } },
  { label: "ลงสนาม: จั่ว 1", skill: { trigger: "onCall", effects: [{ type: "draw", value: 1 }] } },
  { label: "ลงสนาม: Charge 1", skill: { trigger: "onCall", effects: [{ type: "addGauge", value: 1 }] } },
  { label: "ลงสนาม: ดาเมจ 1", skill: { trigger: "onCall", effects: [{ type: "reduceLife", value: 1 }] } },
  { label: "ถูกทำลาย: จั่ว 1", skill: { trigger: "onDestroyed", effects: [{ type: "draw", value: 1 }] } },
  { label: "โจมตี: Power +5000", skill: { trigger: "onAttack", effects: [{ type: "buffPower", value: 5000 }] } },
  { label: "Counter 【Act】: ถอด Soul 1 → Stand ตัวเอง", skill: { trigger: "onCounterAct", effects: [{ type: "removeSoul", value: 1 }, { type: "standSelf", value: 1 }] } },
  { label: "ร่าย: ดูกอง 3 ใบ เลือก 1 ขึ้นมือ", skill: { trigger: "onCast", effects: [{ type: "lookTop", value: 3, toHand: 1, toDrop: 0, toBottom: 0 }] } },
  { label: "ร่าย: ดูกอง 5 ใบ → 1 ขึ้นมือ / 1 ลงดรอป / 1 ใต้กอง", skill: { trigger: "onCast", effects: [{ type: "lookTop", value: 5, toHand: 1, toDrop: 1, toBottom: 1 }] } },
  { label: "ร่าย: ถอด Soul 1 → Life +2", skill: { trigger: "onCast", effects: [{ type: "removeSoul", value: 1 }, { type: "addLife", value: 2 }] } },
  { label: "ร่าย: ถอด Soul 1 → Attack +5000", skill: { trigger: "onCast", effects: [{ type: "removeSoul", value: 1 }, { type: "buffPower", value: 5000 }] } },
  { label: "ร่าย: ถอด Soul 1 → Defense +5000", skill: { trigger: "onCast", effects: [{ type: "removeSoul", value: 1 }, { type: "buffDefense", value: 5000 }] } },
  { label: "ร่าย: ถอด Soul 1 → จั่ว 1", skill: { trigger: "onCast", effects: [{ type: "removeSoul", value: 1 }, { type: "draw", value: 1 }] } },
  { label: "Counter: ยกเลิกเวทที่ศัตรูร่าย", skill: { trigger: "onCounter", timing: "cast", effects: [{ type: "negateSpell", value: 1 }] } },
  { label: "ถอด Soul → ดาเมจ 1", skill: { trigger: "onSoulRemoved", effects: [{ type: "reduceLife", value: 1 }] } },
  { label: "Buddy Call: จั่ว 1", skill: { trigger: "onBuddyCall", effects: [{ type: "draw", value: 1 }] } },
  { label: "Counter: ยกเลิกโจมตี", skill: { trigger: "onCounter", effects: [{ type: "negateAttack", value: 1 }] } },
  { label: "Counter: ทำลายผู้โจมตี", skill: { trigger: "onCounter", effects: [{ type: "destroyAttacker", value: 1 }] } },
  { label: "Counter: Def +10000", skill: { trigger: "onCounter", effects: [{ type: "buffDefense", value: 10000 }] } },
  { label: "ร่าย: ทำลายมอนสเตอร์ 1", skill: { trigger: "onCast", effects: [{ type: "destroyOpponentMonster", value: 1 }] } },
  { label: "ร่าย: ฟื้น Life 2", skill: { trigger: "onCast", effects: [{ type: "addLife", value: 2 }] } },
];

// คำอธิบายคีย์เวิร์ด/ตัวกระตุ้น ใช้แสดงในหน้าต่างดูการ์ด
export const KEYWORD_HELP: Record<string, string> = {
  ...Object.fromEntries(KEYWORD_DEFS.map(k => [k.id, k.help])),
  "Ignore Center": "ตีผู้เล่นได้แม้ศัตรูมีมอนสเตอร์ช่องกลาง",
  "Battle Proof": "ไม่ถูกทำลายจากการต่อสู้",
};

export const TRIGGER_HELP: Record<string, string> = {
  onCall: "ทำงานเมื่อการ์ดนี้ลงสนาม/ติดตั้ง",
  onCast: "ทำงานเมื่อร่ายการ์ดนี้",
  onAttack: "ทำงานตอนการ์ดนี้ประกาศโจมตี",
  onDestroyed: "ทำงานเมื่อการ์ดนี้ถูกทำลาย",
  onDestroyEnemy: "ทำงานเมื่อทำลายมอนสเตอร์ศัตรูได้",
  onDamage: "ทำงานเมื่อทำดาเมจใส่ผู้เล่นศัตรู",
  onCounter: "【Counter】: ใช้จากมือ (จ่ายค่าใช้จ่ายตามปกติ) หรือจากช่อง Set ในเทิร์นของศัตรู ตอนศัตรูโจมตีหรือร่ายเวท (ตามที่เลือกจังหวะ)",
  onCounterAct: "Counter 【Act】: ความสามารถของการ์ดบนสนาม กดใช้ได้ 1 ครั้งต่อเทิร์น จ่ายตามที่เขียนในสกิล เช่น ถอด Soul",
  onSoulRemoved: "ทำงานเมื่อ Soul ของการ์ดนี้ถูกถอด",
  onBuddyCall: "ทำงานเมื่อลงสนามด้วย Buddy Call",
  onTurnStart: "ทำงานต้นเทิร์นของเรา",
  onFinal: "ทำงานใน Final Phase ของเรา",
  continuous: "สกิลถาวร ทำงานตลอดที่การ์ดอยู่บนสนาม",
};
