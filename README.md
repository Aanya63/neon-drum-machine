# NEON PADS — Drum Machine

A sleek, DJ-style drum machine that runs entirely in the browser. Built with
**Next.js (App Router)**, **Tailwind CSS**, and the **Web Audio API** — no backend,
no database, no audio files. Every sound is synthesized programmatically.

## Features

- **4×4 grid of 16 neon pads** — Kick, Snare, Hats, Clap, Toms, Cowbell, Crash,
  Ride, Clave, Shaker, and more, each a distinct synthesized voice.
- **Click to play** with a ripple + glow animation on every hit.
- **Keyboard triggers** (MPC-style): `1 2 3 4 / Q W E R / A S D F / Z X C V`.
- **8-step sequencer** — toggle which sounds fire on which beat, then loop it.
- **Audio-clock-accurate playback** using a lookahead scheduler (no timing drift).
- **BPM** (60–180) and master **volume** controls. `Space` = play/stop.
- Bright neon palette on a dark background.

## Run it

```bash
cd "drum-machine"
npm install
npm run dev
```

Then open http://localhost:3000

> Audio starts on your first click/keypress — browsers require a user gesture
> before a page can produce sound.

## Build for production

```bash
npm run build
npm start
```

## How it works

- `lib/audio.ts` — one shared `AudioContext`; each drum voice is an oscillator
  and/or filtered noise graph with its own amplitude/pitch envelope.
- `components/DrumMachine.tsx` — the UI, plus the lookahead sequencer that
  schedules notes on the audio clock and drives the on-screen playhead + glows
  via a `requestAnimationFrame` visual clock.

Everything is client-side — there are no API routes or server logic.
