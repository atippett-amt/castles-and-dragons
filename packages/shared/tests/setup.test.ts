import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  NEUTRAL,
  PRESETS,
  buildSetup,
  createInitialState,
  loadMap,
  playerCountFor,
  presetById,
  regionsOwnedBy,
  type MapData,
  type PresetId,
  type SetupChoices,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);

function choices(overrides: Partial<SetupChoices> = {}): SetupChoices {
  return {
    preset: 'ffa',
    playerCount: 4,
    humanName: 'You',
    humanSide: 'north',
    difficulty: 'normal',
    ...overrides,
  };
}

const sideOf = (id: string): string =>
  map.regions.find((region) => region.id === id)?.side ?? 'unknown';

describe('every preset', () => {
  it('produces a state the engine accepts', () => {
    for (const preset of PRESETS) {
      const count = preset.fixedPlayers ?? preset.minPlayers;
      const options = buildSetup(map, choices({ preset: preset.id, playerCount: count }));

      expect(() => createInitialState(options)).not.toThrow();

      const state = createInitialState(options);
      expect(state.players).toHaveLength(count);
      expect(regionsOwnedBy(state, NEUTRAL)).toHaveLength(map.regions.length - count);
    }
  });

  it('seats the human first, so nobody has to go looking', () => {
    for (const preset of PRESETS) {
      const count = preset.fixedPlayers ?? preset.minPlayers;
      const options = buildSetup(map, choices({ preset: preset.id, playerCount: count }));

      expect(options.players[0]?.id).toBe('p0');
      expect(options.players[0]?.isAI).toBe(false);
      expect(options.players.slice(1).every((player) => player.isAI)).toBe(true);
    }
  });

  it('gives everyone a distinct hold', () => {
    for (const preset of PRESETS) {
      const count = preset.fixedPlayers ?? preset.maxPlayers;
      const options = buildSetup(map, choices({ preset: preset.id, playerCount: count }));
      const starts = options.players.map((player) => player.startRegion);

      expect(starts.every((start) => start !== undefined)).toBe(true);
      expect(new Set(starts).size).toBe(count);
    }
  });

  it('passes the chosen difficulty to the opponents', () => {
    const options = buildSetup(map, choices({ difficulty: 'hard' }));
    expect(options.players.slice(1).every((player) => player.difficulty === 'hard')).toBe(true);
  });
});

describe('free-for-all', () => {
  it('makes every house its own side', () => {
    const options = buildSetup(map, choices({ preset: 'ffa', playerCount: 5 }));
    expect(options.teams).toHaveLength(5);
    expect(new Set(options.players.map((player) => player.teamId)).size).toBe(5);
  });

  it('spreads the field across the lake instead of crowding one shore', () => {
    // Taking holds in map order would put the first four players all in the
    // north; alternating means nobody starts surrounded.
    const options = buildSetup(map, choices({ preset: 'ffa', playerCount: 4 }));
    const sides = options.players.map((player) => sideOf(player.startRegion!));

    expect(sides).toEqual(['north', 'south', 'north', 'south']);
  });
});

describe('sided games', () => {
  it('puts two teams across the water', () => {
    const options = buildSetup(map, choices({ preset: 'north-vs-south', playerCount: 6 }));
    expect(options.teams.map((team) => team.id).sort()).toEqual(['north', 'south']);
  });

  it('starts every house on its own team’s shore', () => {
    const options = buildSetup(map, choices({ preset: 'north-vs-south', playerCount: 8 }));
    for (const player of options.players) {
      expect(sideOf(player.startRegion!)).toBe(player.teamId);
    }
  });

  it('honours which shore the player picked', () => {
    for (const humanSide of ['north', 'south'] as const) {
      const options = buildSetup(map, choices({ preset: 'north-vs-south', humanSide }));
      expect(options.players[0]?.teamId).toBe(humanSide);
      expect(sideOf(options.players[0]!.startRegion!)).toBe(humanSide);
    }
  });

  it('splits odd numbers in the player’s favour', () => {
    const options = buildSetup(map, choices({ preset: 'north-vs-south', playerCount: 5 }));
    const north = options.players.filter((player) => player.teamId === 'north');
    expect(north).toHaveLength(3);
    expect(options.players.filter((player) => player.teamId === 'south')).toHaveLength(2);
  });

  it('fills exactly four a side at 4v4, which is all the north has', () => {
    const options = buildSetup(map, choices({ preset: '4v4' }));
    expect(options.players.filter((player) => player.teamId === 'north')).toHaveLength(4);
    expect(options.players.filter((player) => player.teamId === 'south')).toHaveLength(4);
  });
});

describe('player counts', () => {
  it('pins the count for a fixed preset, whatever is asked for', () => {
    for (const id of ['2v2', '3v3', '4v4'] as PresetId[]) {
      const preset = presetById(id);
      expect(playerCountFor(preset, 2)).toBe(preset.fixedPlayers);
      expect(playerCountFor(preset, 99)).toBe(preset.fixedPlayers);
    }
  });

  it('clamps a free choice to what the engine supports', () => {
    const preset = presetById('ffa');
    expect(playerCountFor(preset, 1)).toBe(MIN_PLAYERS);
    expect(playerCountFor(preset, 99)).toBe(MAX_PLAYERS);
    expect(playerCountFor(preset, 5)).toBe(5);
  });

  it('rejects a preset that does not exist', () => {
    expect(() => presetById('siege' as PresetId)).toThrow(/Unknown preset/);
  });
});
