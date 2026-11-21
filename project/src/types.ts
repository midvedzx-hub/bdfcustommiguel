export type CardType = "Monster" | "Spell" | "Item" | "Impact";

export type AutoTrigger =
  | "onCall"        // เมื่อลงสนาม / ติดตั้ง
  | "onTransform"   // เมื่อ Transform เสร็จ (กลายเป็นไอเทมแล้ว)
  | "onCast"        // เมื่อร่าย
  | "onAttack"      // เมื่อโจมตี
  | "onDestroyed"   // เมื่อถูกทำลาย
  | "onDestroyEnemy"// เมื่อทำลายมอนสเตอร์ศัตรูได้
  | "onDamage"      // เมื่อทำดาเมจใส่ผู้เล่นศัตรู
  | "onCounter"     // 【Counter】: ใช้จากมือ/ช่อง Set ตอนศัตรูโจมตีหรือร่ายเวท
  | "onCounterAct"  // Counter 【Act】: ความสามารถของการ์ดบนสนาม กดใช้ตอนศัตรูโจมตีหรือร่ายเวท
  | "onSoulRemoved" // เมื่อโซลของการ์ดนี้ถูกถอดออก
  | "onBuddyCall"   // เมื่อลงสนามด้วย Buddy Call
  | "onTurnStart"   // ต้นเทิร์นของเรา
  | "onFinal"       // ใน Final Phase ของเรา
  | "continuous";   // สกิลถาวร (คีย์เวิร์ด เช่น Penetrate)

export type AutoEffectType =
  | "draw"
  | "addGauge"                // Charge: เอาการ์ดบนเด็คลงเกจ
  | "addLife"
  | "reduceLife"              // ดาเมจตรงใส่ศัตรู
  | "destroyOpponentMonster"  // ทำลายมอนสเตอร์ศัตรู N ตัว (เริ่มจากช่องกลาง)
  | "restOpponent"            // Rest มอนสเตอร์ศัตรู N ตัว
  | "opponentDiscard"         // ศัตรูทิ้งการ์ดในมือ N ใบ
  | "recoverFromDrop"         // เอาการ์ดจากสุสานกลับมือ N ใบ
  | "standSelf"               // Stand การ์ดของเรา (ตัวที่เพิ่งออกแรง / ทั้งหมด N ตัว)
  | "buffPower"
  | "buffCritical"
  | "buffDefense"
  | "penetrate"               // ทำลายมอนสเตอร์กลางได้ -> ทำดาเมจใส่ผู้เล่น
  | "doubleAttack"            // โจมตีแล้ว Stand กลับ (ครั้งที่ 2)
  | "tripleAttack"            // โจมตีได้ 3 ครั้ง
  | "quadrupleAttack"         // โจมตีได้ 4 ครั้ง
  | "hextupleAttack"          // โจมตีได้ 6 ครั้ง
  | "kw"                      // ป้ายคีย์เวิร์ดอย่างเดียว (ชื่ออยู่ใน name) เกมไม่บังคับผลอัตโนมัติ
  | "multiAttack"             // (เก่า) value = จำนวนครั้งที่โจมตีได้
  | "soulguard"               // จะถูกนำออกจากสนาม (ทำลาย/ดึงกลับมือ) → ถอด Soul N ใบลงสุสานแทน แล้วอยู่ต่อ
  | "lifelink"                // เมื่อการ์ดนี้ตาย (ถูกทำลาย) เจ้าของโดนดาเมจเท่าค่านี้
  | "ignoreCenter"            // ตีผู้เล่นได้แม้ศัตรูมีมอนสเตอร์กลาง
  | "indestructibleBattle"    // ไม่ถูกทำลายจากการต่อสู้
  | "negateAttack"            // (Counter) ยกเลิกการโจมตีนั้น
  | "destroyAttacker"         // (Counter) ทำลายผู้โจมตี
  | "restAttacker"            // (Counter) Rest ผู้โจมตี
  | "negateSpell"             // (Counter) ยกเลิกความสามารถของเวทที่ศัตรูกำลังร่าย
  | "set"                     // Set: เวทที่ร่ายแล้วอยู่ในช่อง Set (ไม่ลงสุสาน) คงผลต่อเนื่อง · ค่า = Set ชื่อเดียวกันได้กี่ใบ
  | "destroyOpponentSet"      // ทำลายการ์ด Set ของศัตรู N ใบ (ลงสุสาน ผลต่อเนื่องหยุด)
  | "chooseRemoveSoul"        // เลือกการ์ดของเรา 1 ใบ แล้วถอด Soul N ใบ (เลือกไม่ถอดได้) ถ้าถอดได้ค่อยทำเอฟเฟกต์ถัดไป
  | "lookTop"                 // ดูการ์ดบนสุดของกอง X ใบ แล้วเลือก: ขึ้นมือ / ลงดรอป / ใต้สุดของกอง
  | "move"                    // Move: ย้ายมอนสเตอร์ไปช่องอื่นได้ (1 ครั้ง/เทิร์น ใน Main Phase)
  | "counterattack"           // ถูกโจมตีแล้วตอบโต้: ถ้า Power ≥ Defense ผู้โจมตี ผู้โจมตีจะถูกทำลาย
  | "addSoul"                 // นำการ์ดบนเด็ค N ใบเข้าโซลของการ์ดนี้
  | "removeSoul"              // ถอดโซลของการ์ดนี้ N ใบลงสุสาน (ถ้าโซลไม่พอ เอฟเฟกต์ถัดไปของสกิลนี้จะไม่ทำงาน)
  | "dropToSoul"              // นำการ์ดจากสุสานของเรา N ใบเข้าโซล (การ์ดนี้ / ถ้าเป็นเวทจะเข้ามอนสเตอร์ที่มี Soulguard ก่อน)
  | "soulToHand"              // ถอดโซลของการ์ดนี้ N ใบขึ้นมือ
  | "bounceOpponentMonster"   // ดึงมอนสเตอร์ศัตรู N ตัวกลับมือ (Soulguard กันได้)
  | "opponentMonsterToDrop"   // ส่งมอนสเตอร์ศัตรู N ตัวลงสุสานโดยไม่นับเป็นการทำลาย (Soulguard กันได้)
  | "opponentMonsterToDeck"   // ใส่มอนสเตอร์ศัตรู N ตัวกลับบนกองเด็ค (Soulguard กันได้)
  | "nullifyOpponentMonster"  // ยกเลิกความสามารถมอนสเตอร์ศัตรู N ตัวจนจบเทิร์น (Soulguard/Lifelink/Counterattack/Battle Proof ไม่ทำงาน)
  | "powerPerSoul"            // Power +N ต่อการ์ด 1 ใบในโซล (ถาวร)
  | "criticalPerSoul"         // Critical +N ต่อการ์ด 1 ใบในโซล (ถาวร)
  | "condBuff";                // ถาวร: ถ้าในสนามมีการ์ดที่มีคุณสมบัติ/ชื่อที่กำหนด → การ์ดนี้ (หรือการ์ดที่ชื่อ ...) ได้ Power/Critical/Defense เพิ่ม

export const TRIGGER_LABELS: { value: AutoTrigger; label: string }[] = [
  { value: "onCall", label: "เมื่อลงสนาม / ติดตั้ง" },
  { value: "onTransform", label: "เมื่อ Transform เสร็จ" },
  { value: "onCast", label: "เมื่อร่าย" },
  { value: "onAttack", label: "เมื่อโจมตี" },
  { value: "onDestroyEnemy", label: "เมื่อทำลายมอนสเตอร์ศัตรู" },
  { value: "onDamage", label: "เมื่อทำดาเมจใส่ผู้เล่น" },
  { value: "onDestroyed", label: "เมื่อถูกทำลาย" },
  { value: "onCounter", label: "Counter (ใช้จากมือ/ช่อง Set)" },
  { value: "onCounterAct", label: "Counter 【Act】 (ความสามารถบนสนาม)" },
  { value: "onSoulRemoved", label: "เมื่อโซลถูกถอด" },
  { value: "onBuddyCall", label: "เมื่อลงสนามด้วย Buddy Call" },
  { value: "onTurnStart", label: "ต้นเทิร์นของเรา" },
  { value: "onFinal", label: "ใน Final Phase" },
  { value: "continuous", label: "ถาวร (คีย์เวิร์ด)" },
];

export const EFFECT_LABELS: { value: AutoEffectType; label: string; hint: string }[] = [
  { value: "draw", label: "จั่วการ์ด", hint: "จำนวนใบ" },
  { value: "addGauge", label: "Charge (เด็ค→เกจ)", hint: "จำนวนใบ" },
  { value: "addLife", label: "ฟื้น Life", hint: "จำนวน" },
  { value: "reduceLife", label: "ดาเมจตรงใส่ศัตรู", hint: "ดาเมจ" },
  { value: "destroyOpponentMonster", label: "ทำลายมอนสเตอร์ศัตรู", hint: "จำนวนตัว" },
  { value: "restOpponent", label: "Rest มอนสเตอร์ศัตรู", hint: "จำนวนตัว" },
  { value: "opponentDiscard", label: "ศัตรูทิ้งการ์ดในมือ", hint: "จำนวนใบ" },
  { value: "recoverFromDrop", label: "เก็บการ์ดจากสุสานขึ้นมือ", hint: "จำนวนใบ" },
  { value: "standSelf", label: "Stand มอนสเตอร์ของเรา", hint: "จำนวนตัว" },
  { value: "buffPower", label: "บวก Power (เทิร์นนี้)", hint: "เช่น 5000" },
  { value: "buffCritical", label: "บวก Critical (เทิร์นนี้)", hint: "จำนวน" },
  { value: "buffDefense", label: "บวก Defense (เทิร์นนี้)", hint: "เช่น 5000" },
  { value: "penetrate", label: "Penetrate (ทะลวง)", hint: "ใส่ 1" },
  { value: "doubleAttack", label: "Double Attack", hint: "ใส่ 1" },
  { value: "tripleAttack", label: "Triple Attack", hint: "ใส่ 1" },
  { value: "quadrupleAttack", label: "Quadruple Attack (โจมตี 4 ครั้ง)", hint: "ใส่ 1" },
  { value: "hextupleAttack", label: "Hextuple Attack (โจมตี 6 ครั้ง)", hint: "ใส่ 1" },
  { value: "kw", label: "ป้ายคีย์เวิร์ด (เลือกชื่อ)", hint: "ใส่ 1" },
  { value: "multiAttack", label: "โจมตีหลายครั้ง (กำหนดเอง)", hint: "จำนวนครั้ง" },
  { value: "soulguard", label: "Soulguard (ถอด Soul 1 ใบ กันออกจากสนาม)", hint: "ใส่ 1" },
  { value: "lifelink", label: "Lifelink (ตายแล้วเจ้าของโดนดาเมจ)", hint: "ดาเมจที่เจ้าของโดนตอนการ์ดนี้ตาย" },
  { value: "ignoreCenter", label: "ตีผู้เล่นได้แม้มีมอนกลาง", hint: "ใส่ 1" },
  { value: "indestructibleBattle", label: "ไม่ถูกทำลายจากการต่อสู้", hint: "ใส่ 1" },
  { value: "negateAttack", label: "[Counter] ยกเลิกการโจมตี", hint: "ใส่ 1" },
  { value: "destroyAttacker", label: "[Counter] ทำลายผู้โจมตี", hint: "ใส่ 1" },
  { value: "restAttacker", label: "[Counter] Rest ผู้โจมตี", hint: "ใส่ 1" },
  { value: "negateSpell", label: "[Counter] ยกเลิกเวทที่ศัตรูร่าย", hint: "ใส่ 1" },
  { value: "set", label: "Set (อยู่ในช่อง Set คงผลต่อเนื่อง)", hint: "Set ชื่อเดียวกันได้กี่ใบ" },
  { value: "destroyOpponentSet", label: "ทำลายการ์ด Set ของศัตรู", hint: "จำนวนใบ" },
  { value: "chooseRemoveSoul", label: "ถอด Soul ของการ์ดที่เลือก 1 ใบ (ถ้าถอดได้ ทำเอฟเฟกต์ถัดไป)", hint: "ถอดกี่ใบ" },
  { value: "lookTop", label: "ดูการ์ดบนสุดของกอง X ใบ (แล้วเลือกได้)", hint: "ดูกี่ใบ" },
  { value: "move", label: "Move (ย้ายช่องได้)", hint: "ใส่ 1" },
  { value: "counterattack", label: "Counterattack (ตอบโต้ผู้โจมตี)", hint: "ใส่ 1" },
  { value: "addSoul", label: "เพิ่ม Soul (เด็ค→โซลการ์ดนี้)", hint: "จำนวนใบ" },
  { value: "removeSoul", label: "ถอด Soul ลงสุสาน (เป็นค่าใช้จ่าย)", hint: "จำนวนใบ" },
  { value: "dropToSoul", label: "สุสาน→Soul (นำการ์ดจากสุสานเข้าโซล)", hint: "จำนวนใบ (เลือกชนิดการ์ดได้)" },
  { value: "soulToHand", label: "ถอด Soul ขึ้นมือ", hint: "จำนวนใบ" },
  { value: "bounceOpponentMonster", label: "ดึงมอนสเตอร์ศัตรูกลับมือ", hint: "จำนวนตัว" },
  { value: "opponentMonsterToDrop", label: "ส่งมอนสเตอร์ศัตรูลงสุสาน (ไม่ใช่การทำลาย)", hint: "จำนวนตัว" },
  { value: "opponentMonsterToDeck", label: "ใส่มอนสเตอร์ศัตรูกลับกองเด็ค", hint: "จำนวนตัว" },
  { value: "nullifyOpponentMonster", label: "Nullify ยกเลิกความสามารถมอนสเตอร์ศัตรู (จนจบเทิร์น)", hint: "จำนวนตัว" },
  { value: "powerPerSoul", label: "Power เพิ่มต่อ Soul 1 ใบ (ถาวร)", hint: "เช่น 1000" },
  { value: "criticalPerSoul", label: "Critical เพิ่มต่อ Soul 1 ใบ (ถาวร)", hint: "เช่น 1" },
  { value: "condBuff", label: "บัฟถาวรแบบมีเงื่อนไข (ถ้าบนสนามมีการ์ด…)", hint: "ค่าที่เพิ่ม เช่น 1 หรือ 5000" },
];

// ชนิดการ์ดที่เลือกได้เมื่อดึงจากสุสาน (dropToSoul / recoverFromDrop)
export const DROP_FILTERS: { value: CardFilter; label: string }[] = [
  { value: "any", label: "การ์ดใดก็ได้" },
  { value: "Monster", label: "เฉพาะมอนสเตอร์" },
  { value: "Spell", label: "เฉพาะเวท" },
  { value: "Item", label: "เฉพาะไอเทม" },
  { value: "Impact", label: "เฉพาะ Impact" },
];
export type CardFilter = "any" | "Monster" | "Spell" | "Item" | "Impact";

export interface AutoEffect {
  type: AutoEffectType;
  value: number;
  filter?: CardFilter; // ใช้กับเอฟเฟกต์ที่ดึงการ์ดจากสุสาน
  name?: string;       // ชื่อคีย์เวิร์ด (ใช้กับ type "kw")
  toHand?: number;     // lookTop: เลือกขึ้นมือได้สูงสุดกี่ใบ
  toDrop?: number;     // lookTop: เลือกลงดรอปได้สูงสุดกี่ใบ
  toBottom?: number;   // lookTop: เลือกใส่ใต้สุดของกองได้สูงสุดกี่ใบ
  // condBuff (ใช้กับสกิลแบบ "ถาวร"): เงื่อนไข + เป้าหมาย + ค่าสถานะที่เพิ่ม
  stat?: "power" | "critical" | "defense"; // (แบบเก่า) ค่าที่เพิ่มอย่างเดียว ใช้คู่กับ value
  bPower?: number;                         // ค่าที่เพิ่มพร้อมกันได้หลายอย่าง (power = ดาเมจ/พลังโจมตี) ถ้ากำหนดตัวใดตัวหนึ่ง จะใช้แทน stat/value
  bCritical?: number;
  bDefense?: number;
  includeSelf?: boolean;                   // เมื่อระบุ targetName: ให้การ์ดใบนี้ได้รับบัฟด้วย
  condMatch?: "attr" | "name";             // ตรวจจาก "คุณสมบัติ" (attribute) หรือ "ชื่อ" ของการ์ดบนสนาม
  condText?: string;                       // ข้อความที่ต้องมี (ไม่สนตัวพิมพ์) ว่าง = ไม่มีเงื่อนไข ได้บัฟเสมอ
  condWhere?: "own" | "opponent" | "any";  // ตรวจสนามฝั่งไหน (ค่าเริ่มต้น own = ของเรา)
  targetName?: string;                     // ผู้ได้รับบัฟ: ชื่อการ์ดของเรา ว่าง = การ์ดใบนี้
}

// ค่าที่ condBuff เพิ่มให้ (รองรับข้อมูลแบบเก่าที่ใช้ stat + value)
export function condBuffAmounts(e: AutoEffect): { power: number; critical: number; defense: number } {
  if (e.bPower !== undefined || e.bCritical !== undefined || e.bDefense !== undefined) {
    return { power: e.bPower ?? 0, critical: e.bCritical ?? 0, defense: e.bDefense ?? 0 };
  }
  return {
    power: !e.stat || e.stat === "power" ? e.value : 0,
    critical: e.stat === "critical" ? e.value : 0,
    defense: e.stat === "defense" ? e.value : 0,
  };
}

export type CounterTiming = "attack" | "cast" | "any"; // จังหวะที่ Counter ใช้ได้: ตอนศัตรูโจมตี / ตอนศัตรูร่ายเวท / ทั้งสอง

// ค่าใช้จ่ายเพิ่มเติมของ Counter / Counter 【Act】 (จ่ายตอนกดใช้ ถ้าจ่ายไม่ไหวก็ใช้ไม่ได้)
export interface CounterCost {
  gauge?: number; // จ่ายเกจ N (ย้ายจากกองเกจลงสุสาน)
  life?: number;  // เสียพลังชีวิต N (ต้องเหลือ Life อย่างน้อย 1)
  deckToDrop?: number; // ทิ้งการ์ดบนสุดของเด็ค N ใบลงสุสาน
  handToDrop?: number; // ทิ้งการ์ดในมือ N ใบลงสุสาน (ผู้เล่นเลือกใบที่ทิ้งตอนกดใช้)
}

export interface AutoSkill {
  trigger: AutoTrigger;
  effects: AutoEffect[];
  name?: string;          // ชื่อคีย์เวิร์ดกำหนดเอง (แสดงเป็น 【ชื่อ】)
  help?: string;          // คำอธิบายเพิ่มเติมของคีย์เวิร์ดกำหนดเอง (แสดงบนการ์ด)
  timing?: CounterTiming; // ใช้กับ Counter / Counter Act (ค่าเริ่มต้น = ตอนศัตรูโจมตี)
  cost?: CounterCost;     // ใช้กับ Counter / Counter Act: ต้องจ่ายเกจ / Life เพิ่มเพื่อใช้
}

export interface Card {
  id: string;
  name: string;
  image: string; // base64 data URL
  flagId: string;
  type: CardType;
  size: number; // 0-3
  power: number;
  defense: number;
  critical: number;
  callCost: number;
  callCostType: "Gauge" | "Life";
  transformCost?: number;          // มีค่า = มอนสเตอร์ใบนี้ Transform ได้ (จ่ายแล้วกลายเป็นไอเทมของเรา) ไม่ใส่ = Transform ไม่ได้
  transformCostType?: "Gauge" | "Life";
  transformCostExtra?: number;     // จ่ายอีกอย่างเพิ่ม (เหมือน callCostExtra)
  callCostExtra?: number; // จ่ายอีกอย่างเพิ่ม: จำนวนของทรัพยากรอีกชนิดที่ไม่ใช่ callCostType (เช่น จ่ายเกจ 2 + Life 1) 0/ไม่ใส่ = จ่ายอย่างเดียว
  customText: string; // รวมทุกข้อความ (คั่นด้วยบรรทัดใหม่) เก็บไว้เพื่อความเข้ากันได้กับการ์ดเก่า
  customTexts?: string[]; // สกิลอิสระหลายข้อ
  flavorText?: string; // Flavor Text: คำพูด/เรื่องราวของการ์ด (แสดงเป็นตัวเอียงท้ายกล่องข้อความ ไม่มีผลต่อเกม)
  autoSkills: AutoSkill[];
  attribute?: string; // เช่น "Dragon / Warrior" แสดงใต้ชื่อการ์ด
  callSoulFromDeck?: number; // Call Cost: นำการ์ดบนเด็ค N ใบเข้าโซลตอนลงสนาม
}

export interface Flag {
  id: string;
  name: string;
  image: string; // base64 data URL
  color: string; // hex theme color
  life: number;
  startHand: number;
  startGauge: number;
  effect: string;
  buddyIds?: string[]; // Buddy ประจำโลกนี้ (เลือกได้หลายตัว)
}

// กติกาที่ปรับแต่งได้ (เจ้าของห้องเป็นคนกำหนดตอนเล่นออนไลน์)
export interface RuleSet {
  maxSize: number;            // Size รวมสูงสุดของมอนสเตอร์ในสนาม (ปกติ 3)
  buddyCallLife: number;      // Life ที่ได้ตอน Buddy Call (ปกติ 1)
  firstTurnAttacks: number;   // จำนวนครั้งที่โจมตีได้ในเทิร์นแรกของผู้เล่นคนแรก (0 = ไม่จำกัด)
  useAttackPhase: boolean;    // แยก Attack Phase ออกจาก Main Phase
  enableCounter: boolean;     // เปิดระบบ Counter Act
  deckOutLose: boolean;       // เด็คหมดแล้วแพ้
  firstPlayer: "random" | "host" | "guest"; // ใครเริ่มก่อน
  firstPlayerDraws: boolean;  // ผู้เล่นคนแรกจั่วการ์ดใน Draw Phase ของเทิร์นแรกด้วย (กฏจริงข้าม)
  maxSet: number;             // จำนวนการ์ดที่ Set ได้สูงสุด
}

export const DEFAULT_RULES: RuleSet = {
  maxSize: 3,
  buddyCallLife: 1,
  firstTurnAttacks: 1,
  useAttackPhase: true,
  enableCounter: true,
  deckOutLose: true,
  firstPlayer: "random",
  firstPlayerDraws: true,
  maxSet: 2,
};

export type AttackTarget = { kind: "monster"; position: number } | { kind: "fighter" };

// คีย์เวิร์ดกำหนดเอง: ตั้งชื่อ + จังหวะที่ทำงาน + ชุดเอฟเฟกต์ แล้วกดใส่ในการ์ดใบไหนก็ได้
export interface CustomKeyword {
  id: string;
  name: string;
  trigger: AutoTrigger;
  timing?: CounterTiming;
  cost?: CounterCost;
  effects: AutoEffect[];
  help?: string;
}

export interface SpellWindow { casterSide: "host" | "guest"; cardId: string; negated: boolean }
export interface PendingLook {
  side: "host" | "guest";
  cardId: string;          // การ์ดที่ใช้ความสามารถนี้
  cards: string[];         // การ์ดบนสุดของกองที่ถูกดู (ตามลำดับ)
  toHand: number; toDrop: number; toBottom: number;
  cont: { skills: AutoSkill[]; fcUid?: string } | null; // เอฟเฟกต์ที่เหลือหลังเลือกเสร็จ
  resumeCounter?: boolean; // ถ้าเกิดระหว่าง Counter ให้ไปต่อ (ต่อสู้/ปิดเวท) หลังเลือกเสร็จ
}

export interface PendingSoul {
  side: "host" | "guest";
  cardId: string;          // การ์ดที่ใช้ความสามารถนี้
  n: number;               // ถอดกี่ใบ
  candidates: string[];    // uid ของการ์ดของเรา (มอนสเตอร์/ไอเทม) ที่มี Soul พอ
  cont: { skills: AutoSkill[]; fcUid?: string; firstIsRest: boolean } | null; // เอฟเฟกต์ที่เหลือ (firstIsRest = รายการแรกคือส่วนที่เหลือของสกิลเดียวกัน ซึ่งจะไม่ทำถ้าไม่ถอด)
  resumeCounter?: boolean;
}

// รอผู้เล่นเลือก "เป้าหมาย" มอนสเตอร์ศัตรู สำหรับเอฟเฟกต์ ทำลาย / Rest / ยกเลิกความสามารถ / ดึงกลับมือ ฯลฯ
export interface PendingTarget {
  side: "host" | "guest";  // ผู้เลือก (ฝั่งที่ใช้เอฟเฟกต์)
  cardId: string;          // การ์ดที่ใช้เอฟเฟกต์
  effType: AutoEffectType; // ชนิดเอฟเฟกต์
  n: number;               // เลือกกี่ตัว
  candidates: string[];    // uid ของมอนสเตอร์ศัตรูที่เลือกได้
  cont: { skills: AutoSkill[]; fcUid?: string } | null; // เอฟเฟกต์ที่เหลือหลังเลือกเสร็จ
  resumeCounter?: boolean;
}

export interface BattleState {
  attackerSide: "host" | "guest";
  attackerUid: string;     // ตัวนำ
  linkUids: string[];      // ผู้โจมตีทั้งหมด (รวมตัวนำ) ถ้ามากกว่า 1 = Link Attack
  target: AttackTarget;
  negated: boolean;
  triggered?: boolean;     // เอฟเฟกต์ "เมื่อโจมตี" ของผู้โจมตีทำงานแล้ว (ทำงานหลังจังหวะ Counter ไม่ใช่ตอนประกาศ)
}

export interface Deck {
  id: string;
  name: string;
  flagId: string;
  cardIds: string[];
  buddyId: string | null;
}

export type CardState = "stand" | "rest";

export interface FieldCard {
  uid: string; // unique instance id
  cardId: string;
  position: number; // 0=left,1=center,2=right (monster) ; 0 item slot
  state: CardState;
  tempPower: number; // temporary power buff (reset ทุกจบเทิร์น)
  tempCritical: number;
  tempDefense: number;
  attacks: number; // จำนวนครั้งที่โจมตีแล้วในเทิร์นนี้
  soul: string[]; // การ์ดใต้การ์ดนี้ (Soul)
  movedTurn?: number; // เทิร์นที่ใช้ Move ไปแล้ว
  counterUsedTurn?: number; // เทิร์นที่ใช้ Counter Act จากสนามไปแล้ว (ใช้ได้ 1 ครั้งต่อเทิร์น)
  counterUsedSkills?: number[]; // ดัชนีสกิล Counter Act (ใน autoSkills) ที่ใช้ไปแล้วในเทิร์น counterUsedTurn — การ์ดที่มี Act หลายอันใช้ได้อันละ 1 ครั้งต่อเทิร์น
  guardUsed?: boolean;
  auraPower?: number;   // บัฟต่อเนื่องจากการ์ด Set (คำนวณใหม่ทุกครั้ง)
  auraCritical?: number;
  auraDefense?: number;
  manualPower?: number;    // Sandbox: ค่าที่ปรับเองด้วยมือ (คงอยู่ตราบที่การ์ดอยู่บนสนาม)
  manualCritical?: number;
  manualDefense?: number;
  manualSize?: number;     // Sandbox: ปรับ Size ด้วยมือ (บวก/ลบจาก Size ของการ์ด) คงอยู่ตราบที่การ์ดอยู่บนสนาม
  nullified?: boolean; // ถูก Nullify: ความสามารถหลัก (Soulguard ฯลฯ) ไม่ทำงานจนจบเทิร์น
}

export interface PlayerState {
  life: number;
  gauge: number; // = gaugePile.length เสมอ (เก็บไว้ให้ UI ใช้)
  gaugePile: string[]; // การ์ดในเกจ (คว่ำ) เวลาจ่ายเกจจะย้ายไปสุสาน
  deck: string[]; // remaining card ids
  hand: string[];
  dropZone: string[];
  setZone: string[];
  setSoul?: string[][]; // Soul ใต้การ์ด Set แต่ละใบ (index ตรงกับ setZone) — ลงสุสานเมื่อการ์ด Set ออกจากช่อง
  setActUsed?: Record<string, number>; // ใช้ Counter 【Act】 ของการ์ด Set ไปแล้วในเทิร์นไหน (key = ชื่อไอดี#ลำดับ) // การ์ดที่ Set ไว้ (คว่ำ) ใช้เป็น Counter Act ได้
  monsters: FieldCard[];
  item: FieldCard | null;
  flagId: string;
  buddyId: string | null;
  buddyCalledThisGame: boolean;
  soulguardOff?: boolean; // ปิดการใช้ Soulguard อัตโนมัติ (ผู้เล่นเลือกไม่ใช้ได้)
}

export interface GameState {
  turn: number;
  currentTurn: "host" | "guest";
  phase: "draw" | "charge" | "main" | "attack" | "final";
  rules: RuleSet;
  mulligan: { host: boolean; guest: boolean }; // เลือกเปลี่ยนมือเริ่มต้นเสร็จแล้วหรือยัง
  battle: BattleState | null;
  spellWindow?: SpellWindow | null; // รอฝั่งตรงข้ามตัดสินใจ Counter ต่อเวทที่เพิ่งร่าย
  pendingLook?: PendingLook | null; // รอผู้เล่นเลือกการ์ดหลังดูกอง
  pendingSoul?: PendingSoul | null; // รอผู้เล่นเลือกการ์ดที่จะถอด Soul
  pendingTarget?: PendingTarget | null; // รอผู้เล่นเลือกเป้าหมายมอนสเตอร์ศัตรู
  moveWindow?: "host" | "guest" | null; // ฝั่งป้องกันกำลังเลือก Move ตอนเริ่ม Attack Phase // การโจมตีที่กำลังรอ Counter
  firstPlayer: "host" | "guest";
  attacksThisTurn: number; // ใช้จำกัดเทิร์นแรกของผู้เล่นคนแรก
  rev: number; // เลขเวอร์ชัน state ใช้กันข้อมูลทับกันตอนออนไลน์
  host: PlayerState;
  guest: PlayerState;
  log: string[];
  winner: "host" | "guest" | null;
  fx?: FxEvent[];   // เหตุการณ์ล่าสุด (ใช้เล่นอนิเมชัน)
  fxSeq?: number;   // เลข id ล่าสุดของ fx
}

// เหตุการณ์สำหรับเล่นอนิเมชันฝั่ง UI (engine เป็นคนส่ง ซิงค์ไปกับ state จึงเห็นเหมือนกันทั้งสองฝั่ง)
// pos: ช่องมอนสเตอร์ 0-2, ไอเทม = -1
export type FxEvent = { id: number } & (
  | { k: "attack"; side: "host" | "guest"; uids: string[]; units: { uid: string; cardId: string; pos: number }[]; target: AttackTarget }
  | { k: "life"; side: "host" | "guest"; delta: number }
  | { k: "destroy"; side: "host" | "guest"; uid: string; cardId: string; pos: number }
  | { k: "guard"; side: "host" | "guest"; uid: string; pos: number; left: number }
  | { k: "soulIn"; side: "host" | "guest"; uid: string; pos: number; n: number; from?: "deck" | "drop" }
  | { k: "soulOut"; side: "host" | "guest"; uid: string; pos: number; n: number }
  | { k: "call"; side: "host" | "guest"; uid: string; pos: number; buddy: boolean }
  | { k: "cast"; side: "host" | "guest"; cardId: string; label: string }
  | { k: "charge"; side: "host" | "guest"; n: number }
  | { k: "draw"; side: "host" | "guest"; n: number }
  | { k: "negate"; side: "host" | "guest" }
);
export type FxInput = FxEvent extends infer E ? (E extends FxEvent ? Omit<E, "id"> : never) : never;

export interface SyncMessage {
  type: "state" | "action" | "chat" | "hello" | "requestSync" | "image" | "needImages";
  imageFor?: { id: string; image: string };
  ids?: string[];
  state?: GameState;
  action?: string;
  text?: string;
  deck?: Deck;
  cards?: { [id: string]: Card };
  flags?: { [id: string]: Flag };
}

// รายการสกิลอิสระของการ์ด (รองรับการ์ดเก่าที่มีแต่ customText)
export function customTextList(card: { customText?: string; customTexts?: string[] }): string[] {
  if (card.customTexts) return card.customTexts.map(t => t.trim()).filter(Boolean);
  return card.customText?.trim() ? [card.customText.trim()] : [];
}

// Call Cost แยกเป็นเกจ / Life (การ์ดจ่ายได้ทั้งสองอย่างพร้อมกัน)
export function callCostAmounts(card: Pick<Card, "callCost" | "callCostType" | "callCostExtra">): { gauge: number; life: number } {
  const main = Math.max(0, card.callCost || 0);
  const extra = Math.max(0, Math.floor(card.callCostExtra ?? 0));
  return card.callCostType === "Life" ? { gauge: extra, life: main } : { gauge: main, life: extra };
}
// ข้อความสั้น เช่น "เกจ 2 + Life 1" (ถ้าเป็น 0 ทั้งคู่ = "เกจ 0")
export function callCostLabel(card: Pick<Card, "callCost" | "callCostType" | "callCostExtra">): string {
  const a = callCostAmounts(card);
  const parts: string[] = [];
  if (a.gauge > 0) parts.push(`เกจ ${a.gauge}`);
  if (a.life > 0) parts.push(`Life ${a.life}`);
  return parts.length ? parts.join(" + ") : `${card.callCostType === "Life" ? "Life" : "เกจ"} 0`;
}

// Transform: มอนสเตอร์ที่กำหนดค่า Transform ไว้ ใช้จากมือหรือจากสนามเพื่อจ่ายแล้วกลายเป็นไอเทม
export function canTransform(card: Pick<Card, "type" | "transformCost">): boolean {
  return card.type === "Monster" && typeof card.transformCost === "number";
}
export function transformCostAmounts(card: Pick<Card, "transformCost" | "transformCostType" | "transformCostExtra">): { gauge: number; life: number } {
  return callCostAmounts({ callCost: card.transformCost ?? 0, callCostType: card.transformCostType ?? "Gauge", callCostExtra: card.transformCostExtra });
}
export function transformCostLabel(card: Pick<Card, "transformCost" | "transformCostType" | "transformCostExtra">): string {
  return callCostLabel({ callCost: card.transformCost ?? 0, callCostType: card.transformCostType ?? "Gauge", callCostExtra: card.transformCostExtra });
}
