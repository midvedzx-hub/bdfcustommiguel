import type { Flag, Card, AutoSkill, AutoEffect } from "@/types";
import { TRIGGER_LABELS } from "@/types";

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
  soulguard: "Soulguard",
  lifelink: "Lifelink",
};

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
    case "recoverFromDrop": return `เก็บการ์ดจากสุสานขึ้นมือ ${v} ใบ`;
    case "standSelf": return `Stand มอนสเตอร์ของเรา`;
    case "buffPower": return `Power +${v}`;
    case "buffCritical": return `Critical +${v}`;
    case "buffDefense": return `Defense +${v}`;
    case "multiAttack": return `โจมตีได้ ${v} ครั้งต่อเทิร์น`;
    case "ignoreCenter": return `ตีผู้เล่นได้แม้ศัตรูมีมอนสเตอร์ช่องกลาง`;
    case "indestructibleBattle": return `ไม่ถูกทำลายจากการต่อสู้`;
    case "negateAttack": return `ยกเลิกการโจมตีนั้น`;
    case "destroyAttacker": return `ทำลายผู้โจมตี`;
    case "restAttacker": return `Rest ผู้โจมตี`;
    default: return KEYWORDS[e.type] ?? e.type;
  }
}

// สร้างข้อความสกิลอัตโนมัติสำหรับแสดงบนการ์ด (คนสร้างการ์ดไม่ต้องพิมพ์เอง)
export function skillLines(card: Card): string[] {
  const lines: string[] = [];
  card.autoSkills?.forEach(sk => {
    const allKeywords = sk.effects.every(e => e.type in KEYWORDS);
    if ((sk.trigger === "continuous" || sk.trigger === "onAttack") && allKeywords) {
      lines.push(sk.effects.map(e => `【${KEYWORDS[e.type]}】`).join(""));
      return;
    }
    const label = TRIGGER_LABELS.find(t => t.value === sk.trigger)?.label.replace(/ \(.*\)$/, "") ?? sk.trigger;
    lines.push(`【${label}】${sk.effects.map(effectText).join("、")}`);
  });
  return lines;
}

export function hasCounter(card: Card): boolean {
  return !!card.autoSkills?.some(s => s.trigger === "onCounter");
}

// เทมเพลตสกิลกดเพิ่มทีเดียว ทำให้ออกแบบการ์ดง่ายขึ้น
export const SKILL_TEMPLATES: { label: string; skill: AutoSkill }[] = [
  { label: "Penetrate", skill: { trigger: "continuous", effects: [{ type: "penetrate", value: 1 }] } },
  { label: "Double Attack", skill: { trigger: "continuous", effects: [{ type: "doubleAttack", value: 1 }] } },
  { label: "Triple Attack", skill: { trigger: "continuous", effects: [{ type: "tripleAttack", value: 1 }] } },
  { label: "Soulguard", skill: { trigger: "continuous", effects: [{ type: "soulguard", value: 1 }] } },
  { label: "Lifelink", skill: { trigger: "continuous", effects: [{ type: "lifelink", value: 1 }] } },
  { label: "ลงสนาม: จั่ว 1", skill: { trigger: "onCall", effects: [{ type: "draw", value: 1 }] } },
  { label: "ลงสนาม: Charge 1", skill: { trigger: "onCall", effects: [{ type: "addGauge", value: 1 }] } },
  { label: "ลงสนาม: ดาเมจ 1", skill: { trigger: "onCall", effects: [{ type: "reduceLife", value: 1 }] } },
  { label: "ถูกทำลาย: จั่ว 1", skill: { trigger: "onDestroyed", effects: [{ type: "draw", value: 1 }] } },
  { label: "โจมตี: Power +5000", skill: { trigger: "onAttack", effects: [{ type: "buffPower", value: 5000 }] } },
  { label: "Counter: ยกเลิกโจมตี", skill: { trigger: "onCounter", effects: [{ type: "negateAttack", value: 1 }] } },
  { label: "Counter: ทำลายผู้โจมตี", skill: { trigger: "onCounter", effects: [{ type: "destroyAttacker", value: 1 }] } },
  { label: "Counter: Def +10000", skill: { trigger: "onCounter", effects: [{ type: "buffDefense", value: 10000 }] } },
  { label: "ร่าย: ทำลายมอนสเตอร์ 1", skill: { trigger: "onCast", effects: [{ type: "destroyOpponentMonster", value: 1 }] } },
  { label: "ร่าย: ฟื้น Life 2", skill: { trigger: "onCast", effects: [{ type: "addLife", value: 2 }] } },
];
