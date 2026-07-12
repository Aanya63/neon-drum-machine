"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureAudio,
  getContext,
  playVoice,
  setMasterVolume,
  VOICES,
  type Voice,
} from "@/lib/audio";
import { encodePattern, decodePattern } from "@/lib/pattern";

const STEPS = 8;
const STORAGE_KEY = "neonpads.pattern.v1";

type PadDef = {
  label: string;
  key: string; // keyboard trigger
  color: string; // neon hue
};

// Aligned by index with VOICES in lib/audio.ts
const PADS: PadDef[] = [
  { label: "Kick", key: "1", color: "#22d3ee" },
  { label: "Snare", key: "2", color: "#f472b6" },
  { label: "CH Hat", key: "3", color: "#a3e635" },
  { label: "OP Hat", key: "4", color: "#facc15" },
  { label: "Clap", key: "q", color: "#fb7185" },
  { label: "Rim", key: "w", color: "#38bdf8" },
  { label: "Cowbell", key: "e", color: "#c084fc" },
  { label: "Lo Tom", key: "r", color: "#34d399" },
  { label: "Mid Tom", key: "a", color: "#fb923c" },
  { label: "Hi Tom", key: "s", color: "#e879f9" },
  { label: "Crash", key: "d", color: "#60a5fa" },
  { label: "Ride", key: "f", color: "#2dd4bf" },
  { label: "Clave", key: "z", color: "#fbbf24" },
  { label: "Shaker", key: "x", color: "#a78bfa" },
  { label: "Zap", key: "c", color: "#4ade80" },
  { label: "Blip", key: "v", color: "#818cf8" },
];

function emptyPattern(): boolean[][] {
  return VOICES.map(() => Array(STEPS).fill(false));
}

export default function DrumMachine() {
  const [pattern, setPattern] = useState<boolean[][]>(emptyPattern);
  const [pulses, setPulses] = useState<number[]>(() => Array(VOICES.length).fill(0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState(120);
  const [volume, setVolume] = useState(0.9);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // --- Mutable refs the scheduler / recorder read (kept in sync every render) ---
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  const runningRef = useRef(false);
  const recordingRef = useRef(false);
  const stepRef = useRef(0);
  const nextTimeRef = useRef(0);
  const startTimeRef = useRef(0); // time (audio clock) that step 0 fires — quantize origin
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const queueRef = useRef<{ step: number; time: number }[]>([]);
  const saveTimerRef = useRef<number | null>(null);

  const triggerPulse = useCallback((i: number) => {
    setPulses((prev) => {
      const next = prev.slice();
      next[i] = next[i] + 1;
      return next;
    });
  }, []);

  // Quantize an audio-clock time to the nearest step index in the loop.
  const nearestStep = useCallback((time: number) => {
    const secondsPerStep = 60 / bpmRef.current / 2;
    const raw = (time - startTimeRef.current) / secondsPerStep;
    return (((Math.round(raw) % STEPS) + STEPS) % STEPS);
  }, []);

  const hit = useCallback(
    (i: number) => {
      playVoice(VOICES[i]);
      triggerPulse(i);
      // Live record: quantize the hit onto the grid while playing.
      if (recordingRef.current && runningRef.current) {
        const c = getContext();
        if (c) {
          const step = nearestStep(c.currentTime);
          setPattern((prev) => {
            if (prev[i][step]) return prev;
            const next = prev.map((r) => r.slice());
            next[i][step] = true;
            return next;
          });
        }
      }
    },
    [triggerPulse, nearestStep],
  );

  // Lookahead scheduler (audio-clock accurate) — Chris Wilson's two-clocks pattern.
  const scheduler = useCallback(() => {
    const c = getContext();
    if (!c) return;
    const secondsPerStep = 60 / bpmRef.current / 2; // 8 steps == 4 beats == one bar
    while (nextTimeRef.current < c.currentTime + 0.1) {
      const step = stepRef.current;
      const time = nextTimeRef.current;
      const pat = patternRef.current;
      for (let i = 0; i < VOICES.length; i++) {
        if (pat[i][step]) playVoice(VOICES[i] as Voice, time);
      }
      queueRef.current.push({ step, time });
      nextTimeRef.current += secondsPerStep;
      stepRef.current = (step + 1) % STEPS;
    }
  }, []);

  // Visual clock — fires pad glows + advances the playhead in sync with audio.
  const draw = useCallback(() => {
    const c = getContext();
    if (c) {
      const now = c.currentTime;
      const q = queueRef.current;
      while (q.length && q[0].time <= now) {
        const { step } = q.shift()!;
        setCurrentStep(step);
        const pat = patternRef.current;
        for (let i = 0; i < VOICES.length; i++) {
          if (pat[i][step]) triggerPulse(i);
        }
      }
    }
    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [triggerPulse]);

  const stop = useCallback(() => {
    runningRef.current = false;
    recordingRef.current = false;
    setIsPlaying(false);
    setIsRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    queueRef.current = [];
    setCurrentStep(-1);
  }, []);

  const start = useCallback(() => {
    const c = ensureAudio();
    if (!c || runningRef.current) return;
    runningRef.current = true;
    setIsPlaying(true);
    stepRef.current = 0;
    const t0 = c.currentTime + 0.1;
    nextTimeRef.current = t0;
    startTimeRef.current = t0;
    queueRef.current = [];
    timerRef.current = window.setInterval(scheduler, 25);
    rafRef.current = requestAnimationFrame(draw);
  }, [scheduler, draw]);

  // Record is an arm toggle — turning it on auto-starts playback so hits land on the grid.
  const toggleRecord = useCallback(() => {
    const next = !recordingRef.current;
    recordingRef.current = next;
    setIsRecording(next);
    if (next && !runningRef.current) start();
  }, [start]);

  const toggleStep = useCallback((row: number, step: number) => {
    setPattern((prev) => {
      const next = prev.map((r) => r.slice());
      next[row][step] = !next[row][step];
      return next;
    });
  }, []);

  const clearPattern = useCallback(() => setPattern(emptyPattern()), []);

  const buildShareUrl = useCallback(() => {
    const code = encodePattern(patternRef.current, bpmRef.current);
    const url = new URL(window.location.href);
    url.searchParams.set("p", code);
    return url.toString();
  }, []);

  const copyLink = useCallback(async () => {
    const link = buildShareUrl();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [buildShareUrl]);

  // ---- Load a saved / shared beat on mount (URL param wins over localStorage) ----
  useEffect(() => {
    let decoded: ReturnType<typeof decodePattern> = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("p");
      if (fromUrl) decoded = decodePattern(fromUrl);
      if (!decoded) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) decoded = decodePattern(saved);
      }
    } catch {
      /* ignore malformed input */
    }
    if (decoded && decoded.steps === STEPS) {
      setPattern(decoded.pattern);
      setBpm(decoded.bpm);
    }
    setLoaded(true);
  }, []);

  // ---- Autosave to localStorage + keep the URL shareable (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const code = encodePattern(pattern, bpm);
      try {
        window.localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* storage may be unavailable (private mode) */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("p", code);
      window.history.replaceState(null, "", url.toString());
    }, 200);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [pattern, bpm, loaded]);

  // Keep master volume in sync
  useEffect(() => {
    setMasterVolume(volume);
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Keyboard triggers (MPC-style)
  useEffect(() => {
    const keyMap = new Map<string, number>();
    PADS.forEach((p, i) => keyMap.set(p.key, i));
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        runningRef.current ? stop() : start();
        return;
      }
      const idx = keyMap.get(e.key.toLowerCase());
      if (idx !== undefined) {
        e.preventDefault();
        hit(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hit, start, stop]);

  return (
    <div className="w-full max-w-5xl">
      {/* Header */}
      <header className="mb-8 flex flex-col items-center text-center">
        <h1
          className="text-3xl sm:text-5xl font-black tracking-tight"
          style={{
            background: "linear-gradient(90deg,#22d3ee,#e879f9,#a3e635)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 18px rgba(232,121,249,0.35))",
          }}
        >
          NEON PADS
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Tap a pad · hit REC to jam a loop in · share it with a link
        </p>
      </header>

      {/* Pad grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {PADS.map((pad, i) => (
          <Pad key={pad.label} pad={pad} pulse={pulses[i]} onHit={() => hit(i)} />
        ))}
      </section>

      {/* Sequencer */}
      <section
        className="mt-8 rounded-2xl border bg-white/[0.03] p-4 sm:p-6 backdrop-blur transition-colors"
        style={{
          borderColor: isRecording ? "rgba(244,63,94,0.5)" : "rgba(255,255,255,0.1)",
        }}
      >
        {/* Transport */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => (isPlaying ? stop() : start())}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold uppercase tracking-wide transition-transform active:scale-95"
            style={{
              background: isPlaying
                ? "linear-gradient(90deg,#fb7185,#e879f9)"
                : "linear-gradient(90deg,#22d3ee,#a3e635)",
              color: "#050505",
              boxShadow: isPlaying
                ? "0 0 22px rgba(232,121,249,0.55)"
                : "0 0 22px rgba(34,211,238,0.55)",
            }}
          >
            {isPlaying ? "■ Stop" : "▶ Play"}
          </button>

          <button
            onClick={toggleRecord}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition-transform active:scale-95 ${
              isRecording ? "rec-armed" : ""
            }`}
            style={{
              background: isRecording ? "#f43f5e" : "transparent",
              color: isRecording ? "#0a0a0a" : "#fb7185",
              border: `1px solid ${isRecording ? "#f43f5e" : "rgba(251,113,133,0.5)"}`,
            }}
            aria-pressed={isRecording}
            title="Record your pad hits onto the grid (quantized)"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${isRecording ? "rec-dot" : ""}`}
              style={{
                background: isRecording ? "#0a0a0a" : "#fb7185",
                boxShadow: isRecording ? "none" : "0 0 8px #fb7185",
              }}
            />
            {isRecording ? "Recording" : "Rec"}
          </button>

          <button
            onClick={clearPattern}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            Clear
          </button>

          <button
            onClick={copyLink}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: copied ? "#a3e635" : "rgba(34,211,238,0.5)",
              color: copied ? "#a3e635" : "#22d3ee",
              background: copied ? "rgba(163,230,53,0.08)" : "transparent",
            }}
            title="Copy a shareable link to this beat"
          >
            {copied ? "✓ Copied!" : "🔗 Copy Link"}
          </button>

          <label className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <span className="w-10">BPM</span>
            <input
              type="range"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-24 sm:w-36"
            />
            <span className="w-8 tabular-nums text-cyan-300">{bpm}</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <span className="w-10">Vol</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="w-20 sm:w-28"
            />
          </label>
        </div>

        {/* Step header */}
        <div className="mb-2 flex items-center gap-2 pl-[84px] sm:pl-[104px]">
          {Array.from({ length: STEPS }).map((_, s) => (
            <div
              key={s}
              className={`flex-1 text-center text-[10px] font-bold transition-colors ${
                currentStep === s ? "text-cyan-300" : "text-white/25"
              }`}
            >
              {s + 1}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div className="flex flex-col gap-1.5">
          {PADS.map((pad, row) => (
            <div key={pad.label} className="flex items-center gap-2">
              <div className="flex w-[76px] sm:w-24 items-center gap-2 shrink-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: pad.color, boxShadow: `0 0 8px ${pad.color}` }}
                />
                <span className="truncate text-[11px] font-semibold text-white/60">
                  {pad.label}
                </span>
              </div>
              <div className="flex flex-1 gap-2">
                {pattern[row].map((on, step) => {
                  const isHead = currentStep === step;
                  return (
                    <button
                      key={step}
                      onClick={() => toggleStep(row, step)}
                      className={`relative flex-1 h-7 sm:h-8 rounded-md border transition-all duration-75 ${
                        isHead && isPlaying ? "step-live" : ""
                      }`}
                      style={{
                        borderColor: on
                          ? pad.color
                          : isHead
                            ? "rgba(255,255,255,0.28)"
                            : "rgba(255,255,255,0.08)",
                        background: on
                          ? pad.color
                          : isHead
                            ? "rgba(255,255,255,0.07)"
                            : "rgba(255,255,255,0.02)",
                        boxShadow: on ? `0 0 12px ${pad.color}aa` : "none",
                      }}
                      aria-label={`${pad.label} step ${step + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-6 text-center text-xs text-white/30">
        Web Audio API · Next.js · Tailwind · 100% client-side. Keys: 1-4 / Q-R / A-F / Z-V · Space = play/stop · your beat autosaves + lives in the URL
      </footer>
    </div>
  );
}

// ---------- Pad ----------

function Pad({
  pad,
  pulse,
  onHit,
}: {
  pad: PadDef;
  pulse: number;
  onHit: () => void;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onHit();
      }}
      className="group relative aspect-square select-none overflow-hidden rounded-2xl border transition-transform duration-75 active:scale-[0.97]"
      style={{
        borderColor: `${pad.color}55`,
        background: `radial-gradient(120% 120% at 50% 0%, ${pad.color}22, rgba(255,255,255,0.02) 60%), #0b0b0f`,
        boxShadow: `0 0 0 1px ${pad.color}18, 0 8px 24px rgba(0,0,0,0.5), inset 0 0 22px ${pad.color}14`,
      }}
    >
      {/* Ripple + flash retrigger on each hit via keyed remount */}
      {pulse > 0 && (
        <span key={pulse} className="pointer-events-none absolute inset-0">
          <span
            className="pad-ripple absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: pad.color }}
          />
          <span
            className="pad-flash absolute inset-0 rounded-2xl"
            style={{ background: pad.color, boxShadow: `0 0 40px ${pad.color}` }}
          />
        </span>
      )}

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1">
        <span
          className="text-sm sm:text-base font-extrabold tracking-wide"
          style={{ color: pad.color, textShadow: `0 0 12px ${pad.color}99` }}
        >
          {pad.label}
        </span>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/40">
          {pad.key}
        </span>
      </div>
    </button>
  );
}
