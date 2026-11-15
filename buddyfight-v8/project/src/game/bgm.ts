// เพลงประกอบ (BGM) วนซ้ำ ปรับระดับเสียงได้ จำค่าไว้ใน localStorage
// เบราว์เซอร์บล็อกการเล่นเสียงอัตโนมัติ จึงเริ่มเล่นหลังผู้เล่นคลิก/กดแป้นครั้งแรก
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const SRC = `${BASE}audio/bgm.mp3`;
export const BGM_TITLE = "The Sound of Lost Joy";

function read(key: string, def: string): string {
  try { return localStorage.getItem(key) ?? def; } catch { return def; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

let audio: HTMLAudioElement | null = null;
let volume = Math.min(1, Math.max(0, parseFloat(read("cbf_bgm_vol", "0.35")) || 0.35));
let on = read("cbf_bgm_on", "1") !== "0";
let wantPlaying = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(f => f());

export function subscribeBgm(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function getBgmVolume() { return volume; }
export function isBgmOn() { return on; }

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = volume;
  }
  return audio;
}

function tryPlay() {
  if (!on) return;
  const a = el();
  a.volume = volume;
  a.play().catch(() => { /* ยังไม่มีการโต้ตอบ: รอคลิกแรก */ });
}

let installed = false;
// เรียกครั้งเดียวตอนเปิดเกม
export function startBgm() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  wantPlaying = true;
  tryPlay();
  const unlock = () => {
    if (wantPlaying) tryPlay();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  // พักเพลงตอนสลับแท็บ แล้วเล่นต่อเมื่อกลับมา
  document.addEventListener("visibilitychange", () => {
    if (!audio) return;
    if (document.hidden) audio.pause();
    else if (on && wantPlaying) tryPlay();
  });
}

export function setBgmVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = volume;
  write("cbf_bgm_vol", String(volume));
  notify();
}

export function setBgmOn(v: boolean) {
  on = v;
  write("cbf_bgm_on", v ? "1" : "0");
  if (v) tryPlay(); else audio?.pause();
  notify();
}
