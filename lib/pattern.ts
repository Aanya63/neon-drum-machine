// Compact, URL-safe encoding of a drum pattern so beats can be saved to
// localStorage and shared via a link — no backend required.
//
// Wire format:  1.<bpm>.<steps>.<base64url-bitfield>
//   - version "1"
//   - bpm            (integer)
//   - steps          (columns per row)
//   - bitfield       one bit per cell, row-major (voice 0 step 0, voice 0 step 1, ...)
// "." is not part of the base64url alphabet, so it is a safe separator.

import { VOICES } from "./audio";

const VERSION = "1";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodePattern(pattern: boolean[][], bpm: number): string {
  const voices = pattern.length;
  const steps = pattern[0]?.length ?? 0;
  const totalBits = voices * steps;
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  let bit = 0;
  for (let v = 0; v < voices; v++) {
    for (let s = 0; s < steps; s++) {
      if (pattern[v][s]) bytes[bit >> 3] |= 1 << (7 - (bit & 7));
      bit++;
    }
  }
  return `${VERSION}.${Math.round(bpm)}.${steps}.${bytesToB64url(bytes)}`;
}

export function decodePattern(
  str: string,
): { pattern: boolean[][]; bpm: number; steps: number } | null {
  try {
    const parts = str.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    const bpm = clamp(parseInt(parts[1], 10) || 120, 60, 180);
    const steps = parseInt(parts[2], 10);
    if (!steps || steps < 1 || steps > 64) return null;

    const bytes = b64urlToBytes(parts[3]);
    const voices = VOICES.length;
    const pattern: boolean[][] = [];
    let bit = 0;
    for (let v = 0; v < voices; v++) {
      const row: boolean[] = [];
      for (let s = 0; s < steps; s++) {
        const byte = bytes[bit >> 3] ?? 0;
        row.push(((byte >> (7 - (bit & 7))) & 1) === 1);
        bit++;
      }
      pattern.push(row);
    }
    return { pattern, bpm, steps };
  } catch {
    return null;
  }
}
