import { deserializeSave, serializeSave, type GameState, type PlayerId, type SaveFile } from '@shared/index';

const KEY = 'castles-and-dragons/save';

/**
 * The saved game, in localStorage.
 *
 * Every call is wrapped: localStorage throws outright in a private window on
 * some browsers, and when the quota is full. A game that cannot save is worse
 * played than not played at all, so failures are swallowed rather than allowed
 * to take the turn down with them.
 */
export function saveGame(state: GameState, humanPlayerId: PlayerId): void {
  try {
    localStorage.setItem(KEY, serializeSave(state, humanPlayerId));
  } catch {
    /* storage unavailable or full — play on without a save */
  }
}

export function loadGame(): SaveFile | null {
  try {
    return deserializeSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

export function hasSavedGame(): boolean {
  return loadGame() !== null;
}
