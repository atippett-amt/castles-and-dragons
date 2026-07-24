import type { GameState, Owner } from '@shared/index';
import { NEUTRAL } from '@shared/index';

/**
 * Owner colours live in the client, not in `shared`. They are presentation, and
 * `shared` must stay free of anything the authoritative server does not need.
 *
 * Eight distinct hues for the eight supported players, chosen to stay legible
 * against the parchment map and to remain distinguishable from each other.
 */
export const PLAYER_COLORS: readonly string[] = [
  '#b5342c', // crimson
  '#2c6fb5', // steel blue
  '#3f8f46', // moss
  '#7d4a9e', // amethyst
  '#c9861f', // amber
  '#1f8f8a', // teal
  '#b5347f', // magenta
  '#5b6f85', // slate
];

export const NEUTRAL_COLOR = '#8a7c62';

export function colorForOwner(state: GameState, owner: Owner): string {
  if (owner === NEUTRAL) return NEUTRAL_COLOR;
  const index = state.players.findIndex((player) => player.id === owner);
  if (index < 0) return NEUTRAL_COLOR;
  return PLAYER_COLORS[index % PLAYER_COLORS.length] ?? NEUTRAL_COLOR;
}

/** Stroke colours for the three edge types drawn over the map. */
export const EDGE_STYLE: Readonly<
  Record<string, { readonly stroke: string; readonly width: number; readonly dash: string }>
> = {
  land: { stroke: 'rgba(240, 228, 200, 0.45)', width: 1.5, dash: '' },
  bridge: { stroke: 'rgba(226, 176, 63, 0.95)', width: 3, dash: '' },
  water: { stroke: 'rgba(120, 196, 232, 0.9)', width: 2, dash: '6 5' },
};
