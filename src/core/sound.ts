/** Tiny WebAudio sound synth — no audio assets needed. */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(
  freq: number, durMs: number, type: OscillatorType, gainV: number, delayMs = 0,
): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delayMs / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainV, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.05);
}

export type SoundName =
  | 'move' | 'capture' | 'check' | 'castle' | 'promote'
  | 'win' | 'lose' | 'draw' | 'click' | 'illegal';

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  switch (name) {
    case 'move': tone(440, 60, 'sine', 0.12); break;
    case 'capture': tone(220, 90, 'square', 0.10); tone(160, 90, 'sine', 0.08, 10); break;
    case 'check': tone(660, 90, 'sine', 0.14); tone(880, 120, 'sine', 0.12, 90); break;
    case 'castle': tone(330, 70, 'sine', 0.12); tone(494, 70, 'sine', 0.10, 60); break;
    case 'promote': tone(523, 80, 'sine', 0.12); tone(659, 80, 'sine', 0.12, 70); tone(784, 120, 'sine', 0.12, 140); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 140, 'sine', 0.13, i * 110)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 180, 'sine', 0.12, i * 140)); break;
    case 'draw': [440, 440].forEach((f, i) => tone(f, 120, 'sine', 0.10, i * 150)); break;
    case 'click': tone(700, 35, 'triangle', 0.07); break;
    case 'illegal': tone(140, 120, 'sawtooth', 0.08); break;
  }
}

export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
