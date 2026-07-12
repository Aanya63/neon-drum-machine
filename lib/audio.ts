// Programmatic percussion synthesis with the Web Audio API.
// No audio files — every voice is built from oscillators + filtered noise.

export type Voice =
  | "kick"
  | "snare"
  | "chat"
  | "ohat"
  | "clap"
  | "rim"
  | "cowbell"
  | "ltom"
  | "mtom"
  | "htom"
  | "crash"
  | "ride"
  | "clave"
  | "shaker"
  | "zap"
  | "blip";

// Ordered list — index positions line up with the pad grid + sequencer rows.
export const VOICES: Voice[] = [
  "kick",
  "snare",
  "chat",
  "ohat",
  "clap",
  "rim",
  "cowbell",
  "ltom",
  "mtom",
  "htom",
  "crash",
  "ride",
  "clave",
  "shaker",
  "zap",
  "blip",
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const EPS = 0.0001;

/** Create (or resume) the shared AudioContext. Must be called from a user gesture. */
export function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function getContext(): AudioContext | null {
  return ctx;
}

export function setMasterVolume(v: number) {
  if (master && ctx) {
    master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.01);
  }
}

function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(c.sampleRate * 2);
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function noiseSource(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  return src;
}

/** Schedule a voice at `when` (defaults to now). */
export function playVoice(voice: Voice, when?: number) {
  const c = ensureAudio();
  if (!c || !master) return;
  const t = when ?? c.currentTime;
  const out = master;

  switch (voice) {
    case "kick":
      kick(c, out, t);
      break;
    case "snare":
      snare(c, out, t);
      break;
    case "chat":
      hat(c, out, t, 8000, 0.05, 0.4);
      break;
    case "ohat":
      hat(c, out, t, 7000, 0.32, 0.35);
      break;
    case "clap":
      clap(c, out, t);
      break;
    case "rim":
      rim(c, out, t);
      break;
    case "cowbell":
      cowbell(c, out, t);
      break;
    case "ltom":
      tom(c, out, t, 100);
      break;
    case "mtom":
      tom(c, out, t, 160);
      break;
    case "htom":
      tom(c, out, t, 240);
      break;
    case "crash":
      cymbal(c, out, t, 5000, 1.2, 0.45);
      break;
    case "ride":
      cymbal(c, out, t, 6500, 0.6, 0.32);
      break;
    case "clave":
      clave(c, out, t);
      break;
    case "shaker":
      shaker(c, out, t);
      break;
    case "zap":
      zap(c, out, t);
      break;
    case "blip":
      blip(c, out, t);
      break;
  }
}

// ---------- Voices ----------

function kick(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(1, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.45);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.45);
}

function snare(c: AudioContext, out: AudioNode, t: number) {
  // Noise crack
  const n = noiseSource(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.8, t);
  ng.gain.exponentialRampToValueAtTime(EPS, t + 0.2);
  n.connect(hp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.2);

  // Tonal body
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(180, t);
  const og = c.createGain();
  og.gain.setValueAtTime(0.5, t);
  og.gain.exponentialRampToValueAtTime(EPS, t + 0.12);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}

function hat(
  c: AudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  decay: number,
  peak: number,
) {
  const n = noiseSource(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + decay);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
  n.stop(t + decay);
}

function clap(c: AudioContext, out: AudioNode, t: number) {
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1200;
  bp.Q.value = 1.3;
  const g = c.createGain();
  g.gain.value = 1;
  bp.connect(g).connect(out);

  const offsets = [0, 0.012, 0.024, 0.038];
  offsets.forEach((off, i) => {
    const n = noiseSource(c);
    const eg = c.createGain();
    const tt = t + off;
    const last = i === offsets.length - 1;
    eg.gain.setValueAtTime(last ? 0.7 : 0.5, tt);
    eg.gain.exponentialRampToValueAtTime(EPS, tt + (last ? 0.18 : 0.03));
    n.connect(eg).connect(bp);
    n.start(tt);
    n.stop(tt + 0.2);
  });
}

function rim(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator();
  o.type = "square";
  o.frequency.value = 440;
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.05);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.05);

  const n = noiseSource(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(EPS, t + 0.04);
  n.connect(hp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.05);
}

function cowbell(c: AudioContext, out: AudioNode, t: number) {
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 560;
  bp.Q.value = 2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.4);
  bp.connect(g).connect(out);

  [540, 800].forEach((f) => {
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    o.connect(bp);
    o.start(t);
    o.stop(t + 0.4);
  });
}

function tom(c: AudioContext, out: AudioNode, t: number, base: number) {
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.85, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.35);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.35);
}

function cymbal(
  c: AudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  decay: number,
  peak: number,
) {
  const n = noiseSource(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = freq;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq + 1500;
  bp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + decay);
  n.connect(hp).connect(bp).connect(g).connect(out);
  n.start(t);
  n.stop(t + decay);
}

function clave(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.06);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.06);
}

function shaker(c: AudioContext, out: AudioNode, t: number) {
  const n = noiseSource(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = c.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.02);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.12);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
  n.stop(t + 0.14);
}

function zap(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.2);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

function blip(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(1600, t);
  o.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.08);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.08);
}
