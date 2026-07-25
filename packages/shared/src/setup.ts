/**
 * Turning a handful of choices into a starting position.
 *
 * Lives in `shared` rather than the client because Stage B's lobby has to build
 * exactly the same setup on the server, and two implementations of "what does
 * 3v3 mean" would drift apart the first time the map changed.
 *
 * Starting holds are drawn from the map's own `side` field, so this knows
 * nothing about Wilson Lake specifically — a different ten holds with a
 * north/south split would work unchanged.
 */

import type { CreateStateOptions, PlayerSetup, TeamSetup } from './state';
import { MAX_PLAYERS, MIN_PLAYERS } from './state';
import type { Difficulty, MapData, RegionId, Side } from './types';

export const PRESET_IDS = ['ffa', 'north-vs-south', '2v2', '3v3', '4v4'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface Preset {
  readonly id: PresetId;
  readonly name: string;
  readonly blurb: string;
  /** Everyone on their own, versus two sides of the lake. */
  readonly kind: 'free-for-all' | 'sides';
  /** Set when the preset only makes sense at one player count. */
  readonly fixedPlayers?: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

/**
 * The north shore has four holds and the south has six, so a sided game tops
 * out at eight — four a side. Free-for-all can use all ten but the engine caps
 * a game at eight players.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'ffa',
    name: 'Free-for-all',
    blurb: 'Every house for itself. Nobody is allied with anybody.',
    kind: 'free-for-all',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  },
  {
    id: 'north-vs-south',
    name: 'North vs South',
    blurb: 'The lake divides the realm. Two alliances, three bridges between them.',
    kind: 'sides',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  },
  {
    id: '2v2',
    name: '2 v 2',
    blurb: 'Two pairs across the water.',
    kind: 'sides',
    fixedPlayers: 4,
    minPlayers: 4,
    maxPlayers: 4,
  },
  {
    id: '3v3',
    name: '3 v 3',
    blurb: 'Three a side, with the bridges contested from the first turn.',
    kind: 'sides',
    fixedPlayers: 6,
    minPlayers: 6,
    maxPlayers: 6,
  },
  {
    id: '4v4',
    name: '4 v 4',
    blurb: 'The whole north shore against the south.',
    kind: 'sides',
    fixedPlayers: 8,
    minPlayers: 8,
    maxPlayers: 8,
  },
];

export function presetById(id: PresetId): Preset {
  const found = PRESETS.find((preset) => preset.id === id);
  if (!found) throw new Error(`Unknown preset: ${id}`);
  return found;
}

export interface SetupChoices {
  readonly preset: PresetId;
  /** Total players, human included. Ignored when the preset fixes it. */
  readonly playerCount: number;
  readonly humanName: string;
  /** Which shore the human starts on. Only meaningful for a sided preset. */
  readonly humanSide: Side;
  readonly difficulty: Difficulty;
  readonly seed?: number;
}

/** House names for the AI, drawn in order. Purely cosmetic. */
const AI_NAMES: readonly string[] = [
  'House Sword',
  'House Fish',
  'House Oak',
  'House Stag',
  'House Rose',
  'House Bull',
  'House Trident',
];

function holdsOnSide(map: MapData, side: Side): readonly RegionId[] {
  return map.regions.filter((region) => region.side === side).map((region) => region.id);
}

/**
 * Free-for-all start positions, alternating shores.
 *
 * Taking them in map order would crowd everyone into the north; alternating
 * spreads the field across the lake so nobody begins surrounded.
 */
function spreadStarts(map: MapData): readonly RegionId[] {
  const north = holdsOnSide(map, 'north');
  const south = holdsOnSide(map, 'south');
  const spread: RegionId[] = [];

  for (let i = 0; i < Math.max(north.length, south.length); i++) {
    if (north[i] !== undefined) spread.push(north[i]!);
    if (south[i] !== undefined) spread.push(south[i]!);
  }
  return spread;
}

export function playerCountFor(preset: Preset, requested: number): number {
  if (preset.fixedPlayers !== undefined) return preset.fixedPlayers;
  return Math.min(preset.maxPlayers, Math.max(preset.minPlayers, requested));
}

/**
 * Builds the options `createInitialState` wants.
 *
 * The human is always the first player, so a caller does not have to hunt for
 * which of eight ids belongs to the person at the keyboard.
 */
export function buildSetup(map: MapData, choices: SetupChoices): CreateStateOptions {
  const preset = presetById(choices.preset);
  const count = playerCountFor(preset, choices.playerCount);

  const players: PlayerSetup[] = [];
  const teams: TeamSetup[] = [];

  const named = (index: number): string =>
    index === 0 ? choices.humanName : (AI_NAMES[(index - 1) % AI_NAMES.length] ?? `House ${index}`);

  if (preset.kind === 'free-for-all') {
    const starts = spreadStarts(map);
    for (let i = 0; i < count; i++) {
      const teamId = `t${i}`;
      const name = named(i);
      teams.push({ id: teamId, name });
      players.push({
        id: `p${i}`,
        name,
        teamId,
        isAI: i !== 0,
        difficulty: choices.difficulty,
        ...(starts[i] === undefined ? {} : { startRegion: starts[i]! }),
      });
    }
    return { map, players, teams, ...(choices.seed === undefined ? {} : { seed: choices.seed }) };
  }

  // Sided: the human's shore is filled first so player 0 always lands there.
  const humanSide = choices.humanSide;
  const otherSide: Side = humanSide === 'north' ? 'south' : 'north';
  const perSide = { [humanSide]: Math.ceil(count / 2), [otherSide]: Math.floor(count / 2) } as Record<
    Side,
    number
  >;

  teams.push(
    { id: humanSide, name: humanSide === 'north' ? 'The North' : 'The South' },
    { id: otherSide, name: otherSide === 'north' ? 'The North' : 'The South' },
  );

  const remaining: Record<Side, RegionId[]> = {
    north: [...holdsOnSide(map, 'north')],
    south: [...holdsOnSide(map, 'south')],
  };

  let index = 0;
  for (const side of [humanSide, otherSide] as const) {
    for (let i = 0; i < perSide[side]; i++) {
      const start = remaining[side].shift();
      players.push({
        id: `p${index}`,
        name: named(index),
        teamId: side,
        isAI: index !== 0,
        difficulty: choices.difficulty,
        ...(start === undefined ? {} : { startRegion: start }),
      });
      index += 1;
    }
  }

  return { map, players, teams, ...(choices.seed === undefined ? {} : { seed: choices.seed }) };
}
