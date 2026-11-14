export type CardType = "Monster" | "Spell" | "Item" | "Impact";

export type AutoTrigger =
  | "onCall"        // เมื่อลงสนาม / ติดตั้ง
  | "onCast"        // เมื่อร่าย
  | "onAttack"      // เมื่อโจมตี
  | "onDestroyed"   // เมื่อถูกทำลาย
  | "onDestroyEnemy"// เมื่อทำลายมอนสเตอร์ศัตรูได้
  | "onDamage"      // เมื่อทำดาเมจใส่ผู้เล่นศัตรู
  | "onCounter"     // Counter Act: ใช้จากมือ/สนาม/ช่อง Set ตอนศัตรูโจมตี
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
  | "multiAttack"             // (เก่า) value = จำนวนครั้งที่โจมตีได้
  | "soulguard"               // ถูกทำลายครั้งแรกแล้วจ่ายเกจ 1 เพื่อรอด
  | "lifelink"                // ทำดาเมจใส่ผู้เล่นแล้วฟื้น Life เท่ากัน
  | "ignoreCenter"            // ตีผู้เล่นได้แม้ศัตรูมีมอนสเตอร์กลาง
  | "indestructibleBattle"    // ไม่ถูกทำลายจากการต่อสู้
  | "negateAttack"            // (Counter) ยกเลิกการโจมตีนั้น
  | "destroyAttacker"         // (Counter) ทำลายผู้โจมตี
  | "restAttacker"            // (Counter) Rest ผู้โจมตี
  | "move"                    // Move: ย้ายมอนสเตอร์ไปช่องอื่นได้ (1 ครั้ง/เทิร์น ใน Main Phase)
  | "counterattack"           // ถูกโจมตีแล้วตอบโต้: ถ้า Power ≥ Defense ผู้โจมตี ผู้โจมตีจะถูกทำลาย
  | "addSoul"                 // นำการ์ดบนเด็ค N ใบเข้าโซลของการ์ดนี้
  | "removeSoul";             // ถอดโซลของการ์ดนี้ N ใบลงสุสาน (ถ้าโซลไม่พอ เอฟเฟกต์ถัดไปของสกิลนี้จะไม่ทำงาน)

export const TRIGGER_LABELS: { value: AutoTrigger; label: string }[] = [
  { value: "onCall", label: "เมื่อลงสนาม / ติดตั้ง" },
  { value: "onCast", label: "เมื่อร่าย" },
  { value: "onAttack", label: "เมื่อโจมตี" },
  { value: "onDestroyEnemy", label: "เมื่อทำลายมอนสเตอร์ศัตรู" },
  { value: "onDamage", label: "เมื่อทำดาเมจใส่ผู้เล่น" },
  { value: "onDestroyed", label: "เมื่อถูกทำลาย" },
  { value: "onCounter", label: "Counter Act (ใช้จากมือตอนศัตรูโจมตี)" },
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
  { value: "multiAttack", label: "โจมตีหลายครั้ง (กำหนดเอง)", hint: "จำนวนครั้ง" },
  { value: "soulguard", label: "Soulguard (จ่ายเกจกันตาย)", hint: "ใส่ 1" },
  { value: "lifelink", label: "Lifelink (ดูด Life)", hint: "ใส่ 1" },
  { value: "ignoreCenter", label: "ตีผู้เล่นได้แม้มีมอนกลาง", hint: "ใส่ 1" },
  { value: "indestructibleBattle", label: "ไม่ถูกทำลายจากการต่อสู้", hint: "ใส่ 1" },
  { value: "negateAttack", label: "[Counter] ยกเลิกการโจมตี", hint: "ใส่ 1" },
  { value: "destroyAttacker", label: "[Counter] ทำลายผู้โจมตี", hint: "ใส่ 1" },
  { value: "restAttacker", label: "[Counter] Rest ผู้โจมตี", hint: "ใส่ 1" },
  { value: "move", label: "Move (ย้ายช่องได้)", hint: "ใส่ 1" },
  { value: "counterattack", label: "Counterattack (ตอบโต้ผู้โจมตี)", hint: "ใส่ 1" },
  { value: "addSoul", label: "เพิ่ม Soul (เด็ค→โซลการ์ดนี้)", hint: "จำนวนใบ" },
  { value: "removeSoul", label: "ถอด Soul ลงสุสาน (เป็นค่าใช้จ่าย)", hint: "จำนวนใบ" },
];

export interface AutoEffect {
  type: AutoEffectType;
  value: number;
}

export interface AutoSkill {
  trigger: AutoTrigger;
  effects: AutoEffect[];
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
  customText: string;
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
  maxSet: 2,
};

export type AttackTarget = { kind: "monster"; position: number } | { kind: "fighter" };

export interface BattleState {
  attackerSide: "host" | "guest";
  attackerUid: string;     // ตัวนำ
  linkUids: string[];      // ผู้โจมตีทั้งหมด (รวมตัวนำ) ถ้ามากกว่า 1 = Link Attack
  target: AttackTarget;
  negated: boolean;
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
  guardUsed?: boolean;
}

export interface PlayerState {
  life: number;
  gauge: number; // = gaugePile.length เสมอ (เก็บไว้ให้ UI ใช้)
  gaugePile: string[]; // การ์ดในเกจ (คว่ำ) เวลาจ่ายเกจจะย้ายไปสุสาน
  deck: string[]; // remaining card ids
  hand: string[];
  dropZone: string[];
  setZone: string[]; // การ์ดที่ Set ไว้ (คว่ำ) ใช้เป็น Counter Act ได้
  monsters: FieldCard[];
  item: FieldCard | null;
  flagId: string;
  buddyId: string | null;
  buddyCalledThisGame: boolean;
}

export interface GameState {
  turn: number;
  currentTurn: "host" | "guest";
  phase: "charge" | "main" | "attack" | "final";
  rules: RuleSet;
  mulligan: { host: boolean; guest: boolean }; // เลือกเปลี่ยนมือเริ่มต้นเสร็จแล้วหรือยัง
  battle: BattleState | null; // การโจมตีที่กำลังรอ Counter
  firstPlayer: "host" | "guest";
  attacksThisTurn: number; // ใช้จำกัดเทิร์นแรกของผู้เล่นคนแรก
  rev: number; // เลขเวอร์ชัน state ใช้กันข้อมูลทับกันตอนออนไลน์
  host: PlayerState;
  guest: PlayerState;
  log: string[];
  winner: "host" | "guest" | null;
}

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
