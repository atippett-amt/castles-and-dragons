import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NEUTRAL,
  activeTeam,
  createInitialState,
  getRegion,
  loadMap,
  playersOfTeam,
  regionsOwnedBy,
  type CreateStateOptions,
  type MapData,
  type PlayerSetup,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);

/** North-vs-South setup with `count` players split across two teams. */
function setupFor(count: number): CreateStateOptions {
  const players: PlayerSetup[] = Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    teamId: index % 2 === 0 ? 'north' : 'south',
    isAI: index !== 0,
  }));
  const teams = [
    { id: 'north', name: 'The North' },
    { id: 'south', name: 'The South' },
  ].filter((team) => players.some((player) => player.teamId === team.id));

  return { map, players, teams };
}

describe('createInitialState', () => {
  it('builds a valid state for every supported player count', () => {
    for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
      const state = createInitialState(setupFor(count));
      expect(state.players).toHaveLength(count);
      expect(Object.keys(state.regions)).toHaveLength(map.regions.length);
    }
  });

  it('starts on turn 1 with the turn limit from BALANCE', () => {
    const state = createInitialState(setupFor(2));
    expect(state.turn).toBe(1);
    expect(state.turnLimit).toBe(BALANCE.game.turnLimit);
    expect(state.activeTeamIndex).toBe(0);
  });

  it('seeds exactly one egg per region', () => {
    const state = createInitialState(setupFor(2));
    const withEggs = Object.values(state.regions).filter((region) => region.hasEgg);
    expect(withEggs).toHaveLength(BALANCE.dragon.total);
    expect(withEggs).toHaveLength(map.regions.length);
  });

  it('gives each player one distinct starting hold and leaves the rest neutral', () => {
    const count = 4;
    const state = createInitialState(setupFor(count));

    const owned = Object.values(state.regions).filter((region) => region.owner !== NEUTRAL);
    expect(owned).toHaveLength(count);
    expect(new Set(owned.map((region) => region.owner)).size).toBe(count);

    const neutral = regionsOwnedBy(state, NEUTRAL);
    expect(neutral).toHaveLength(map.regions.length - count);
  });

  it('gives every player the starting treasury', () => {
    const state = createInitialState(setupFor(3));
    for (const player of state.players) {
      expect(player.gold).toBe(BALANCE.economy.startingGold);
    }
  });

  it('honours an explicit starting hold', () => {
    const options = setupFor(2);
    const players = options.players.map((player, index) =>
      index === 0 ? { ...player, startRegion: 'whiteoak' } : player,
    );
    const state = createInitialState({ ...options, players });

    expect(getRegion(state, 'whiteoak').owner).toBe('p0');
  });

  it('is deterministic — identical setups produce identical states', () => {
    const a = createInitialState(setupFor(5));
    const b = createInitialState(setupFor(5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('round-trips through JSON unchanged', () => {
    // The same serialization powers localStorage saves and Stage B snapshots.
    const state = createInitialState(setupFor(4));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('createInitialState validation', () => {
  it('rejects too few or too many players', () => {
    expect(() => createInitialState(setupFor(MIN_PLAYERS - 1))).toThrow(/player count/);
    expect(() => createInitialState(setupFor(MAX_PLAYERS + 1))).toThrow(/player count/);
  });

  it('rejects a player on an unknown team', () => {
    const options = setupFor(2);
    const players = options.players.map((player, index) =>
      index === 0 ? { ...player, teamId: 'ghosts' } : player,
    );
    expect(() => createInitialState({ ...options, players })).toThrow(/unknown team ghosts/);
  });

  it('rejects a team with no players', () => {
    const options = setupFor(2);
    const teams = [...options.teams, { id: 'empty', name: 'Nobody' }];
    expect(() => createInitialState({ ...options, teams })).toThrow(/team empty has no players/);
  });

  it('rejects duplicate player ids', () => {
    const options = setupFor(2);
    const players = options.players.map((player) => ({ ...player, id: 'same' }));
    expect(() => createInitialState({ ...options, players })).toThrow(/duplicate player id/);
  });

  it('rejects two players claiming the same starting hold', () => {
    const options = setupFor(2);
    const players = options.players.map((player) => ({ ...player, startRegion: 'florence' }));
    expect(() => createInitialState({ ...options, players })).toThrow(/both start in florence/);
  });

  it('rejects an unknown starting hold', () => {
    const options = setupFor(2);
    const players = options.players.map((player, index) =>
      index === 0 ? { ...player, startRegion: 'kings_landing' } : player,
    );
    expect(() => createInitialState({ ...options, players })).toThrow(/unknown region kings_landing/);
  });

  it('rejects a map whose turnLimit disagrees with BALANCE', () => {
    const skewed: MapData = { ...map, turnLimit: BALANCE.game.turnLimit + 1 };
    expect(() => createInitialState({ ...setupFor(2), map: skewed })).toThrow(/disagrees with BALANCE/);
  });

  it('rejects more players than the map has holds', () => {
    const tiny: MapData = { ...map, regions: map.regions.slice(0, 2) };
    expect(() => createInitialState({ ...setupFor(4), map: tiny })).toThrow(/need a starting hold/);
  });
});

describe('state helpers', () => {
  it('getRegion throws on an unknown id', () => {
    const state = createInitialState(setupFor(2));
    expect(() => getRegion(state, 'dorne')).toThrow(/Unknown region/);
  });

  it('groups players by team and reports the active one', () => {
    const state = createInitialState(setupFor(4));
    expect(playersOfTeam(state, 'north').map((p) => p.id)).toEqual(['p0', 'p2']);
    expect(playersOfTeam(state, 'south').map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(activeTeam(state).id).toBe('north');
  });
});
