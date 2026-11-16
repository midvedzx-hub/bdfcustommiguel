import type { AutoEffectType } from "@/types";

// ทะเบียนคีย์เวิร์ดของเกม (อ้างอิงรายการที่ผู้ใช้ให้มา + ข้อความการ์ด Buddyfight จริง)
//  engine:true  = เกมบังคับผลให้อัตโนมัติ
//  engine:false = เป็น "ป้ายคีย์เวิร์ด" แสดงบนการ์ด/คำอธิบาย ผลจริงให้ใส่ด้วยสกิลอัตโนมัติควบคู่ (เกมไม่เดาผลให้)
export type KwCategory = "attack" | "defense" | "call" | "series" | "ability";

export interface KeywordDef {
  id: string;                 // ชื่อที่แสดงบนการ์ด
  cat: KwCategory;
  effect?: AutoEffectType;    // ถ้า engine:true จะเก็บเป็นเอฟเฟกต์ชนิดนี้
  param?: boolean;            // มีตัวเลขกำกับ เช่น Lifelink 2
  engine: boolean;
  help: string;
}

export const KW_CATEGORIES: { key: KwCategory; label: string }[] = [
  { key: "attack", label: "การโจมตีและการเคลื่อนที่" },
  { key: "defense", label: "การป้องกันและเอาตัวรอด" },
  { key: "call", label: "การคอล / แปลงร่าง / ติดตั้ง / Buddy" },
  { key: "series", label: "เฉพาะสายและภาคต่างๆ" },
  { key: "ability", label: "ประเภทความสามารถ" },
];

const TAG = "ป้ายคีย์เวิร์ด: เกมไม่ได้บังคับผลอัตโนมัติ ใส่สกิลอัตโนมัติควบคู่เพื่อให้ทำงานจริง · ";

export const KEYWORD_DEFS: KeywordDef[] = [
  // ---- โจมตี / เคลื่อนที่ ----
  { id: "Double Attack", cat: "attack", effect: "doubleAttack", engine: true, help: "โจมตีได้ 2 ครั้งต่อเทิร์น (หลังโจมตีครั้งแรกจะ Stand กลับมา)" },
  { id: "Triple Attack", cat: "attack", effect: "tripleAttack", engine: true, help: "โจมตีได้ 3 ครั้งต่อเทิร์น" },
  { id: "Quadruple Attack", cat: "attack", effect: "quadrupleAttack", engine: true, help: "โจมตีได้ 4 ครั้งต่อเทิร์น" },
  { id: "Hextuple Attack", cat: "attack", effect: "hextupleAttack", engine: true, help: "โจมตีได้ 6 ครั้งต่อเทิร์น" },
  { id: "Penetrate", cat: "attack", effect: "penetrate", engine: true, help: "ถ้าโจมตีแล้วทำลายมอนสเตอร์ช่องกลางของศัตรูได้ จะทำดาเมจใส่ผู้เล่นศัตรูเท่า Critical (ตามข้อความการ์ดจริง)" },
  { id: "Counterattack", cat: "attack", effect: "counterattack", engine: true, help: "ถ้าการ์ดนี้ถูกโจมตีแล้วยังอยู่บนสนามหลังการโจมตี เลือกผู้โจมตี 1 ตัวที่ Defense ≤ Power ของการ์ดนี้ แล้วทำลายมัน" },
  { id: "Move", cat: "attack", effect: "move", engine: true, help: "ตอนเริ่ม Attack Phase ของผู้เล่นแต่ละฝ่าย (ก่อนมีการโจมตี) ย้ายการ์ดนี้ไปช่องมอนสเตอร์ที่ว่างได้ 1 ครั้งต่อเทิร์น" },
  { id: "Ambush", cat: "attack", engine: false, help: TAG + "ความสามารถซุ่มโจมตีหรือเรียก/ใช้งานในจังหวะพิเศษ" },
  // ---- ป้องกัน ----
  { id: "Soulguard", cat: "defense", effect: "soulguard", engine: true, help: "เมื่อการ์ดนี้กำลังจะออกจากสนาม เลือกถอด Soul 1 ใบลงสุสานเพื่อยกเลิกการออกจากสนามได้ (ต้องมี Soul)" },
  { id: "Soulguard/EX", cat: "defense", engine: false, help: TAG + "รูปแบบขยายของ Soulguard" },
  { id: "Lifelink", cat: "defense", effect: "lifelink", param: true, engine: true, help: "เมื่อการ์ดนี้ตาย (ถูกทำลาย) เจ้าของจะโดนดาเมจตามตัวเลข (Soulguard กันตายได้จึงไม่โดน)" },
  { id: "Guardian", cat: "defense", engine: false, help: TAG + "ความสามารถที่เกี่ยวข้องกับการป้องกันหรือปกป้อง" },
  // ---- คอล / แปลงร่าง / บัดดี้ ----
  { id: "Set", cat: "call", engine: false, help: TAG + "วางการ์ดคว่ำลงช่อง Set (ในเกมนี้การ์ดที่มี Counter Act กดปุ่ม Set จากมือได้เลย)" },
  { id: "Ride", cat: "call", engine: false, help: TAG + "การขี่ เพื่อเพิ่มพลังหรือเปลี่ยนความสามารถ" },
  { id: "Transform", cat: "call", engine: false, help: TAG + "การแปลงร่าง" },
  { id: "Impact Transform", cat: "call", engine: false, help: TAG + "การแปลงร่างผ่าน Impact" },
  { id: "Class Change", cat: "call", engine: false, help: TAG + "เปลี่ยนคลาสเพื่อเพิ่มพลังหรือเปลี่ยนความสามารถ" },
  { id: "Crossnize", cat: "call", engine: false, help: TAG + "กลไกการผสานอุปกรณ์/อาวุธ" },
  { id: "Crossnize/EX", cat: "call", engine: false, help: TAG + "รูปแบบขยายของ Crossnize" },
  { id: "Equipment Change", cat: "call", engine: false, help: TAG + "เปลี่ยนอุปกรณ์ที่ติดตั้ง (เกมนี้การติดตั้งไอเทมใหม่จะทับไอเทมเดิมอยู่แล้ว)" },
  { id: "Weaponry Link", cat: "call", engine: false, help: TAG + "ผสานอาวุธเข้าด้วยกัน" },
  { id: "BuddyCost", cat: "call", engine: false, help: TAG + "ค่าใช้จ่ายที่เกี่ยวกับ Buddy" },
  { id: "BuddyGift", cat: "call", engine: false, help: TAG + "ของขวัญ Buddy (ตอน Buddy Call เกมให้ Life ตามกติกาอยู่แล้ว)" },
  { id: "Double Buddy", cat: "call", engine: false, help: TAG + "Buddy 2 ตัว" },
  { id: "Triple Buddy", cat: "call", engine: false, help: TAG + "Buddy 3 ตัว" },
  // ---- สาย / ภาค ----
  { id: "Overkill", cat: "series", engine: false, help: TAG + "ทำงานเมื่อพลังโจมตีหรือความเสียหายเกินเงื่อนไขที่กำหนด" },
  { id: "Overkill:REBØØT", cat: "series", engine: false, help: TAG + "รูปแบบ REBØØT ของ Overkill" },
  { id: "OverDrive", cat: "series", engine: false, help: TAG + "กลไกเร่งพลัง" },
  { id: "Overthrow", cat: "series", engine: false, help: TAG + "กลไกพลิกสถานการณ์" },
  { id: "Overturn", cat: "series", engine: false, help: TAG + "กลไกพลิกสถานการณ์" },
  { id: "CHAOS Territory", cat: "series", engine: false, help: TAG + "คีย์เวิร์ดเฉพาะสาย CHAOS" },
  { id: "Dragod", cat: "series", engine: false, help: TAG + "คีย์เวิร์ดเฉพาะสาย Dragod" },
  { id: "Evil Deity", cat: "series", engine: false, help: TAG + "สายพลังระดับสูง" },
  { id: "Great Evil Deity", cat: "series", engine: false, help: TAG + "สายพลังระดับสูง" },
  { id: "Omni Lord", cat: "series", engine: false, help: TAG + "สายพลังระดับสูง" },
  // ---- ประเภทความสามารถ ----
  { id: "AUTO", cat: "ability", engine: false, help: TAG + "ความสามารถแบบอัตโนมัติ (Automatic)" },
  { id: "CONT", cat: "ability", engine: false, help: TAG + "ความสามารถแบบต่อเนื่อง (Continuous)" },
  { id: "ACT", cat: "ability", engine: false, help: TAG + "ความสามารถแบบกดใช้เอง (Activated)" },
];

export const KW_BY_ID: Record<string, KeywordDef> = Object.fromEntries(KEYWORD_DEFS.map(k => [k.id, k]));
export const KW_BY_EFFECT: Record<string, KeywordDef> = Object.fromEntries(
  KEYWORD_DEFS.filter(k => k.effect).map(k => [k.effect as string, k])
);
