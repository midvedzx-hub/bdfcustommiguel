import type { Flag, Card, AutoSkill, AutoEffect } from "@/types";
import { getCustomKeywords } from "@/storage";
import { TRIGGER_LABELS, callCostLabel, canTransform, transformCostLabel, condBuffAmounts, SOUL_GRANT_KEYWORDS } from "@/types";
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
  set: "Set",
  move: "Move",
  counterattack: "Counterattack",
  ignoreCenter: "Ignore Center",
  indestructibleBattle: "Battle Proof",
  indestructible: "ไม่สามารถถูกทำลายจากความสามารถของการ์ดคู่แข่งได้",
  unnullifiable: "ไม่สามารถถูกยกเลิกความสามารถได้",
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
    case "destroyWeaker": {
      const names: Record<string, string> = { power: "Power", critical: "Critical", defense: "Defense" };
      const stats = (e.cmpStats && e.cmpStats.length ? e.cmpStats : ["power"]).map(k => names[k]);
      const joiner = e.cmpMode === "any" ? " หรือ " : " และ ";
      const ref = (e.refName ?? "").trim();
      const pk = Math.max(0, Math.floor(e.lifePerKill ?? 0));
      const all = (e.destroyScope ?? (e.includeItem ? "all" : "monster")) === "all";
      return `ทำลาย${all ? "การ์ดทั้งหมด (มอนสเตอร์/ไอเทม/การ์ด Set)" : "มอนสเตอร์"}ของศัตรูทุกใบที่ ${stats.join(joiner)} น้อยกว่า${ref ? ` “${ref}” (ต้องอยู่ในสนามของเรา)` : "การ์ดใบนี้"}${pk > 0 ? ` แล้วทำดาเมจตรง ${pk} ต่อการ์ด 1 ใบที่ถูกทำลาย` : ""}`;
    }
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
    case "soulGrant": {
      const tn = (e.targetName ?? "").trim();
      return `ถ้าการ์ดใบนี้อยู่ใน Soul ของการ์ด${tn ? `ชื่อ “${tn}”` : "ใบใดก็ได้"} การ์ดนั้นจะได้รับความสามารถทั้งหมดของการ์ดใบนี้`;
    }
    case "soulCond": {
      const x = Math.max(1, Math.floor(e.value) || 1);
      const txt = (e.condText ?? "").trim();
      const kind = e.condMatch === "name" ? "ชื่อ" : "คุณสมบัติ";
      const kws = (e.grantKw ?? []).map(t => SOUL_GRANT_KEYWORDS.find(k => k.value === t)?.label ?? String(t));
      const gain = [e.bPower ? `Power +${e.bPower}` : "", e.bCritical ? `Critical +${e.bCritical}` : "", e.bDefense ? `Defense +${e.bDefense}` : ""].filter(Boolean).join(" และ ");
      const per = e.perSoul ? " ต่อการ์ด 1 ใบใน Soul" : "";
      const gainAll = [gain ? gain + per : "", ...kws].filter(Boolean).join(" และ ") || "บัฟ";
      const tt = (e.targetText ?? "").trim();
      const who = tt ? `การ์ดของเราที่มี${e.targetMatch === "name" ? "ชื่อ" : "คุณสมบัติ"} “${tt}”${e.includeSelf ? " (รวมใบนี้)" : ""}` : "การ์ดนี้";
      const cond = e.perSoul && x === 1 ? "" : `ถ้าใน Soul ของการ์ดนี้มีการ์ด ${txt ? `ที่มี${kind} “${txt}” ` : ""}${x} ใบขึ้นไป `;
      return `${cond}${who} ได้รับ ${gainAll}`;
    }
    case "condBuff": {
      const amt = condBuffAmounts(e);
      const gain = [amt.power ? `Power +${amt.power}` : "", amt.critical ? `Critical +${amt.critical}` : "", amt.defense ? `Defense +${amt.defense}` : "", amt.size ? `Size ${amt.size > 0 ? "+" : ""}${amt.size}` : ""].filter(Boolean).join(" และ ") || "บัฟ";
      const where = e.condWhere === "opponent" ? "ฝั่งศัตรู" : e.condWhere === "any" ? "ทั้งสองฝั่ง" : "ของเรา";
      const kind = e.condMatch === "name" ? "ชื่อ" : "คุณสมบัติ";
      const need = (e.condText ?? "").trim();
      const tn = (e.targetName ?? "").trim();
      const cond = need ? `ถ้าในสนาม${where}มีการ์ดใบอื่นที่มี${kind} “${need}” ` : "";
      const target = tn ? (e.includeSelf ? `การ์ดใบนี้และการ์ดชื่อ “${tn}” ของเรา` : `การ์ดชื่อ “${tn}” ของเรา`) : "การ์ดใบนี้";
      const gainKws = (e.grantKw ?? []).map(t => SOUL_GRANT_KEYWORDS.find(k => k.value === t)?.label ?? String(t));
      const hasStat = !!(amt.power || amt.critical || amt.defense || amt.size);
      const gainAll = [...(hasStat || gainKws.length === 0 ? [gain] : []), ...gainKws].join(" และ ");
      return `${cond}${target}ได้รับ ${gainAll}`;
    }
    case "chooseRemoveSoul": return `เลือกการ์ดของเรา 1 ใบ ถอด Soul ${v} ใบ (ถ้าถอดได้ จึงทำต่อ)`;
    case "destroyOpponentSet": return `ทำลายการ์ด Set ของศัตรู ${v} ใบ`;
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
  const req = (card.callRequires ?? []).map(n => n.trim()).filter(Boolean);
  if (req.length > 0) lines.push(`【เงื่อนไขการลง】ต้องมี ${req.map(n => `“${n}”`).join(" และ ")} บนสนามก่อน เมื่อลงแล้วนำการ์ดเหล่านั้นเข้า Soul`);
  card.autoSkills?.forEach(sk => {
    const allKeywords = sk.effects.every(e => e.type in KEYWORDS || e.type === "kw");
    // การ์ดเก่าที่ใส่คีย์เวิร์ดไว้ก่อนมีช่องคำอธิบาย: ดึงคำอธิบายล่าสุดจากคีย์เวิร์ดที่บันทึกไว้ตามชื่อ
    const help = (sk.help ?? (sk.name ? getCustomKeywords().find(k => k.name === sk.name)?.help : undefined))?.trim();
    if ((sk.trigger === "continuous" || sk.trigger === "onAttack") && allKeywords) {
      // แสดงเป็นป้ายแดงแทน — แต่ถ้ามีคำอธิบายเพิ่มเติม ให้แสดงเป็นบรรทัดข้อความด้วย
      if (help) lines.push(sk.name ? `【${sk.name}】${help}`  : help);
      if (sk.nullifyProof) lines.push(`${sk.effects.map(e => effectText(e)).join("、")}: ความสามารถนี้ไม่สามารถถูกยกเลิกได้`);
      return;
    }
    const trig = TRIGGER_LABELS.find(t => t.value === sk.trigger)?.label.replace(/ \(.*\)$/, "") ?? sk.trigger;
    const timing = (sk.trigger === "onCounter" || sk.trigger === "onCounterAct")
      ? ((sk.timing ?? "attack") === "any" ? " (ตอนศัตรูโจมตีหรือร่ายเวท)" : (sk.timing ?? "attack") === "cast" ? " (ตอนศัตรูร่ายเวท)" : " (ตอนศัตรูโจมตี)")
      : "";
    const costParts: string[] = [];
    if ((sk.trigger === "onCounter" || sk.trigger === "onCounterAct") && sk.cost) {
      if ((sk.cost.gauge ?? 0) > 0) costParts.push(`เกจ ${sk.cost.gauge}`);
      if ((sk.cost.life ?? 0) > 0) costParts.push(`Life ${sk.cost.life}`);
      if ((sk.cost.deckToDrop ?? 0) > 0) costParts.push(`ทิ้งการ์ดบนเด็ค ${sk.cost.deckToDrop} ใบ`);
      if ((sk.cost.handToDrop ?? 0) > 0) costParts.push(`ทิ้งการ์ดบนมือ ${sk.cost.handToDrop} ใบ`);
    }
    const costStr = costParts.length ? `[จ่าย ${costParts.join(" + ")}] ` : "";
    const proofStr = sk.nullifyProof ? " (ความสามารถนี้ไม่สามารถถูกยกเลิกได้)" : "";
    const body = costStr + sk.effects.map(e => effectText(e) + (e.type === "condBuff" && sk.trigger !== "continuous" ? " จนจบเทิร์น" : "")).join("、");
    const helpStr = (help ? ` — ${help}` : "") + proofStr;
    if (sk.name) lines.push(`【${sk.name}】${sk.trigger === "continuous" ? "" : `${trig}${timing}: `}${body}${helpStr}`);
    else lines.push(`【${trig}】${timing ? timing.trim() + " " : ""}${body}${helpStr}`);
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
  if (card.callCost > 0 || (card.callCostExtra ?? 0) > 0 || card.type === "Monster") parts.push(`จ่าย ${callCostLabel(card)}`);
  if (canTransform(card)) parts.push(`[Transform] จ่าย ${transformCostLabel(card)} เพื่อแปลงเป็นไอเทม (ใช้ได้จากมือหรือบนสนาม)`);
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
  { label: "ไม่สามารถถูกทำลายจากความสามารถของการ์ดคู่แข่งได้", skill: { trigger: "continuous", effects: [{ type: "indestructible", value: 1 }] } },
  { label: "ไม่สามารถถูกยกเลิกความสามารถได้", skill: { trigger: "continuous", effects: [{ type: "unnullifiable", value: 1 }] } },
  { label: "Soulguard", skill: { trigger: "continuous", effects: [{ type: "soulguard", value: 1 }] } },
  { label: "Lifelink 1 (ตายแล้วโดนดาเมจ)", skill: { trigger: "continuous", effects: [{ type: "lifelink", value: 1 }] } },
  { label: "ต้นเทิร์น: สุสาน→Soul 1", skill: { trigger: "onTurnStart", effects: [{ type: "dropToSoul", value: 1 }] } },
  { label: "ลงสนาม: สุสาน→Soul 2", skill: { trigger: "onCall", effects: [{ type: "dropToSoul", value: 2 }] } },
  { label: "ร่าย: สุสาน→Soul ของ Soulguard 2", skill: { trigger: "onCast", effects: [{ type: "dropToSoul", value: 2 }] } },
  { label: "ร่าย: ดึงมอนสเตอร์ศัตรูกลับมือ", skill: { trigger: "onCast", effects: [{ type: "bounceOpponentMonster", value: 1 }] } },
  { label: "Soul 2 ใบขึ้นไป → Critical +1 และ Penetrate", skill: { trigger: "continuous", effects: [{ type: "soulCond", value: 2, bCritical: 1, grantKw: ["penetrate"] }] } },
  { label: "Power +1000 ต่อ Soul", skill: { trigger: "continuous", effects: [{ type: "powerPerSoul", value: 1000 }] } },
  { label: "ลงสนาม: จั่ว 1", skill: { trigger: "onCall", effects: [{ type: "draw", value: 1 }] } },
  { label: "ลงสนาม: Charge 1", skill: { trigger: "onCall", effects: [{ type: "addGauge", value: 1 }] } },
  { label: "ลงสนาม: ดาเมจ 1", skill: { trigger: "onCall", effects: [{ type: "reduceLife", value: 1 }] } },
  { label: "Transform เสร็จ: จั่ว 1", skill: { trigger: "onTransform", effects: [{ type: "draw", value: 1 }] } },
  { label: "Transform เสร็จ: Charge 1", skill: { trigger: "onTransform", effects: [{ type: "addGauge", value: 1 }] } },
  { label: "ถูกทำลาย: จั่ว 1", skill: { trigger: "onDestroyed", effects: [{ type: "draw", value: 1 }] } },
  { label: "โจมตี: Power +5000", skill: { trigger: "onAttack", effects: [{ type: "buffPower", value: 5000 }] } },
  { label: "Counter 【Act】: ถอด Soul 1 → Stand ตัวเอง", skill: { trigger: "onCounterAct", effects: [{ type: "removeSoul", value: 1 }, { type: "standSelf", value: 1 }] } },
  { label: "ร่าย: ดูกอง 3 ใบ เลือก 1 ขึ้นมือ", skill: { trigger: "onCast", effects: [{ type: "lookTop", value: 3, toHand: 1, toDrop: 0, toBottom: 0 }] } },
  { label: "ร่าย: ดูกอง 5 ใบ → 1 ขึ้นมือ / 1 ลงดรอป / 1 ใต้กอง", skill: { trigger: "onCast", effects: [{ type: "lookTop", value: 5, toHand: 1, toDrop: 1, toBottom: 1 }] } },
  { label: "ร่าย: เลือกการ์ดถอด Soul 1 → Life +2", skill: { trigger: "onCast", effects: [{ type: "chooseRemoveSoul", value: 1 }, { type: "addLife", value: 2 }] } },
  { label: "ร่าย: เลือกการ์ดถอด Soul 1 → Attack +5000", skill: { trigger: "onCast", effects: [{ type: "chooseRemoveSoul", value: 1 }, { type: "buffPower", value: 5000 }] } },
  { label: "ร่าย: เลือกการ์ดถอด Soul 1 → Defense +5000 / จั่ว 1", skill: { trigger: "onCast", effects: [{ type: "chooseRemoveSoul", value: 1 }, { type: "buffDefense", value: 5000 }, { type: "draw", value: 1 }] } },
  { label: "Counter: เลือกการ์ดถอด Soul 1 → ยกเลิกโจมตี", skill: { trigger: "onCounter", effects: [{ type: "chooseRemoveSoul", value: 1 }, { type: "negateAttack", value: 1 }] } },
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
  "ไม่สามารถถูกทำลายจากความสามารถของการ์ดคู่แข่งได้": "การ์ดใบนี้ไม่ถูกทำลายจากความสามารถของการ์ดคู่แข่ง (เอฟเฟกต์ทำลาย / Counter / Counterattack) — ยังถูกทำลายจากการต่อสู้ได้ ถ้าต้องการกันการต่อสู้ด้วยให้ใส่ Battle Proof (ถ้าถูก Nullify จะไม่มีผล · การนำออกจากสนามแบบอื่น เช่น ดึงกลับมือ ไม่ถูกกัน)",
  "ไม่สามารถถูกยกเลิกความสามารถได้": "ความสามารถของการ์ดใบนี้ไม่สามารถถูกยกเลิก (Nullify) ได้",
};

export const TRIGGER_HELP: Record<string, string> = {
  onCall: "ทำงานเมื่อการ์ดนี้ลงสนาม/ติดตั้ง",
  onTransform: "ทำงานเมื่อการ์ดนี้ Transform เสร็จและกลายเป็นไอเทมแล้ว (ใช้กับมอนสเตอร์ที่เปิด Transform)",
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
