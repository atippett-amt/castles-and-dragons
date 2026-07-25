/**
 * Saving and restoring a game.
 *
 * GameState is deliberately plain data — no classes, no Maps, no functions — so
 * a save is just JSON of it. The same serialization is what Stage B will send
 * as a room snapshot, which is why this lives in `shared` and not next to
 * localStorage in the client.
 *
 * Loading is defensive on purpose. A save sitting in a browser can be older
 * than the code reading it, hand-edited, or simply truncated, and a corrupt
 * resume that half-works is worse than an honest fresh start.
 */

import type { GameState, PlayerId } from './types';

/** Bumped whenever GameState changes shape. Older saves are discarded. */
export const SAVE_VERSION = 1;

export interface SaveFile {
  readonly version: number;
  /** Which player the machine holding this save is playing. */
  readonly humanPlayerId: PlayerId;
  readonly state: GameState;
}

export function toSave(state: GameState, humanPlayerId: PlayerId): SaveFile {
  return { version: SAVE_VERSION, humanPlayerId, state };
}

export function serializeSave(state: GameState, humanPlayerId: PlayerId): string {
  return JSON.stringify(toSave(state, humanPlayerId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a save, or returns null if it cannot be trusted.
 *
 * Null covers every failure the same way — absent, malformed, wrong version,
 * missing a field — because the caller's response is identical in each case:
 * start a new game.
 */
export function deserializeSave(raw: string | null | undefined): SaveFile | null {
  if (raw === null || raw === undefined || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed['version'] !== SAVE_VERSION) return null;
  if (typeof parsed['humanPlayerId'] !== 'string') return null;

  const state = parsed['state'];
  if (!isRecord(state)) return null;

  // Spot-check the fields the game cannot run without. Not a full schema —
  // enough to catch truncation and a save from a different shape of the game.
  const required = ['turn', 'turnLimit', 'regions', 'units', 'players', 'teams', 'rng'];
  for (const field of required) {
    if (!(field in state)) return null;
  }
  if (typeof state['turn'] !== 'number') return null;
  if (!Array.isArray(state['players']) || state['players'].length === 0) return null;
  if (!isRecord(state['regions']) || Object.keys(state['regions']).length === 0) return null;

  const players = state['players'] as Record<string, unknown>[];
  if (!players.some((player) => player['id'] === parsed['humanPlayerId'])) return null;

  return {
    version: SAVE_VERSION,
    humanPlayerId: parsed['humanPlayerId'],
    state: state as unknown as GameState,
  };
}
