/**
 * The game's single seeded PRNG (mulberry32).
 *
 * Determinism is a hard requirement, not a nicety: the same seed and the same
 * orders must produce the same battles on the client and inside the Stage B
 * Durable Object, or the authoritative server and the player's screen disagree.
 * The whole generator state is one integer, so it serializes with GameState for
 * free and a resumed game continues the same stream.
 *
 * Never call Math.random() anywhere in the rules engine.
 */

import type { RngState } from './types';

export function createRng(seed: number): RngState {
  // `| 0` keeps the state a 32-bit int so behaviour matches across engines.
  return { s: seed | 0 };
}

/** Advances the stream and returns a uniform integer in [0, 2^32). */
export function nextUint32(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / 0x1_0000_0000;
}

/** Uniform integer in [0, maxExclusive). Returns 0 when the range is empty. */
export function nextInt(rng: RngState, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(nextFloat(rng) * maxExclusive);
}

/**
 * Uniform float in [min, max]. Used for the combat variance swing, where the
 * multiplier is centred on 1 (e.g. variance 0.10 → [0.9, 1.1]).
 */
export function nextInRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}
