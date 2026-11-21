// เสียงเอฟเฟกต์สังเคราะห์ด้วย WebAudio (ไม่ต้องมีไฟล์เสียง) เปิด/ปิดได้ และจำค่าไว้
let ctx: AudioContext | null = null;
let muted = (() => {
  try { return localStorage.getItem("cbf_muted") === "1"; } catch { return false; }
})();
let sfxVol = (() => {
  try { const v = parseFloat(localStorage.getItem("cbf_sfx_vol") ?? ""); return isNaN(v) ? 0.8 : Math.min(1, Math.max(0, v)); } catch { return 0.8; }
})();
export function getSfxVolume() { return sfxVol; }
export function setSfxVolume(v: number) {
  sfxVol = Math.min(1, Math.max(0, v));
  try { localStorage.setItem("cbf_sfx_vol", String(sfxVol)); } catch { /* ignore */ }
}

export function isMuted() { return muted; }
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem("cbf_muted", v ? "1" : "0"); } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const Ctor = AC.AudioContext ?? AC.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol: number, delay = 0, lowpass = 3000) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = vol * sfxVol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export type Sfx =
  | "click" | "draw" | "call" | "cast" | "charge" | "whoosh" | "hit" | "hurt" | "heal"
  | "destroy" | "guard" | "negate" | "soul" | "turn" | "win" | "lose" | "error";

export function playSfx(name: Sfx, delayMs = 0) {
  const d = delayMs / 1000;
  switch (name) {
    case "click": tone(620, 0.06, "square", 0.04, d); break;
    case "draw": noise(0.09, 0.05, d, 6000); tone(900, 0.07, "triangle", 0.04, d + 0.02, 600); break;
    case "call": tone(300, 0.18, "sawtooth", 0.06, d, 700); tone(880, 0.22, "triangle", 0.06, d + 0.1); tone(1320, 0.25, "sine", 0.04, d + 0.16); break;
    case "cast": tone(500, 0.35, "sine", 0.06, d, 1500); tone(1000, 0.3, "triangle", 0.04, d + 0.08, 2000); break;
    case "charge": tone(440, 0.1, "square", 0.04, d); tone(660, 0.12, "square", 0.04, d + 0.07); break;
    case "whoosh": noise(0.32, 0.08, d, 1800); tone(180, 0.3, "sawtooth", 0.035, d, 60); break;
    case "hit": noise(0.18, 0.18, d, 1400); tone(120, 0.22, "square", 0.12, d, 40); break;
    case "hurt": noise(0.25, 0.2, d, 900); tone(90, 0.35, "sawtooth", 0.14, d, 35); break;
    case "heal": tone(660, 0.18, "sine", 0.06, d); tone(880, 0.2, "sine", 0.06, d + 0.1); tone(1320, 0.3, "sine", 0.05, d + 0.2); break;
    case "destroy": noise(0.5, 0.2, d, 2500); tone(200, 0.5, "sawtooth", 0.1, d, 40); break;
    case "guard": tone(700, 0.25, "triangle", 0.07, d, 1400); tone(1400, 0.3, "sine", 0.05, d + 0.05); break;
    case "negate": tone(880, 0.12, "square", 0.06, d, 220); tone(220, 0.2, "square", 0.06, d + 0.1, 110); break;
    case "soul": tone(520, 0.3, "sine", 0.05, d, 780); tone(780, 0.3, "sine", 0.04, d + 0.1, 1040); break;
    case "turn": tone(520, 0.12, "triangle", 0.06, d); tone(780, 0.18, "triangle", 0.06, d + 0.1); break;
    case "win": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, "triangle", 0.08, d + i * 0.14)); tone(1047, 0.7, "sine", 0.06, d + 0.6); break;
    case "lose": [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, "sawtooth", 0.06, d + i * 0.22, f * 0.8)); break;
    case "error": tone(200, 0.15, "square", 0.06, d); tone(150, 0.2, "square", 0.06, d + 0.12); break;
  }
}
