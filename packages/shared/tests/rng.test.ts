import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInRange, nextInt, nextUint32 } from '@shared/index';

describe('rng', () => {
  it('produces an identical stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const drawA = Array.from({ length: 50 }, () => nextUint32(a));
    const drawB = Array.from({ length: 50 }, () => nextUint32(b));
    expect(drawA).toEqual(drawB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextUint32(a)).not.toBe(nextUint32(b));
  });

  it('survives a serialization round-trip mid-stream', () => {
    // Stage B snapshots a running game; the resumed stream must continue
    // exactly where it left off rather than restarting.
    const original = createRng(7);
    for (let i = 0; i < 10; i++) nextUint32(original);

    const restored = JSON.parse(JSON.stringify(original)) as typeof original;
    expect(nextUint32(restored)).toBe(nextUint32(original));
  });

  it('keeps floats in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i++) {
      const value = nextFloat(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps integers in [0, maxExclusive)', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const value = nextInt(rng, 6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns 0 for an empty integer range rather than NaN', () => {
    const rng = createRng(5);
    expect(nextInt(rng, 0)).toBe(0);
    expect(nextInt(rng, -3)).toBe(0);
  });

  it('spans the requested range for the combat variance swing', () => {
    const rng = createRng(11);
    for (let i = 0; i < 500; i++) {
      const value = nextInRange(rng, 0.9, 1.1);
      expect(value).toBeGreaterThanOrEqual(0.9);
      expect(value).toBeLessThanOrEqual(1.1);
    }
  });
});
