import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  SAVE_VERSION,
  buildGraph,
  createInitialState,
  deserializeSave,
  endTurn,
  fortify,
  getRegion,
  loadMap,
  playerById,
  serializeSave,
  spawnUnit,
  type GameState,
  type Graph,
  type MapData,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

function newGame(): GameState {
  return createInitialState({
    map,
    players: [
      { id: 'p0', name: 'You', teamId: 'you', isAI: false, startRegion: 'florence' },
      { id: 'p1', name: 'Foe', teamId: 'foe', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'you', name: 'You' },
      { id: 'foe', name: 'Foe' },
    ],
  });
}

/** A game with something worth losing: dragons, works, damage and a spent turn. */
function playedGame(): GameState {
  const state = newGame();
  playerById(state, 'p0')!.gold = 50;
  fortify(state, 'florence', 'scorpion', 'p0');

  while (state.turn < BALANCE.dragon.hatchTurn) endTurn(state, graph);

  const dragon = spawnUnit(state, 'dragon', 'p0', 'florence');
  dragon.hp = Math.round(dragon.hp / 2);
  getRegion(state, 'killen').owner = 'p0';

  return state;
}

describe('round trip', () => {
  it('restores a played game exactly', () => {
    const before = playedGame();
    const after = deserializeSave(serializeSave(before, 'p0'));

    expect(after).not.toBeNull();
    expect(after!.state).toEqual(before);
    expect(after!.humanPlayerId).toBe('p0');
  });

  it('keeps the things a player would notice losing', () => {
    const before = playedGame();
    const after = deserializeSave(serializeSave(before, 'p0'))!.state;

    expect(after.turn).toBe(before.turn);
    expect(getRegion(after, 'florence').defenses.scorpion).toBe(1);
    expect(getRegion(after, 'killen').owner).toBe('p0');

    const dragons = Object.values(after.units).filter((unit) => unit.type === 'dragon');
    expect(dragons.length).toBe(Object.values(before.units).filter((u) => u.type === 'dragon').length);
    // The wounded dragon is still wounded.
    expect(dragons.some((dragon) => dragon.hp < BALANCE.dragon.hpAtHatch)).toBe(true);
  });

  it('carries the random stream on, so a resumed game is not re-rolled', () => {
    const before = playedGame();
    const after = deserializeSave(serializeSave(before, 'p0'))!.state;
    expect(after.rng).toEqual(before.rng);
  });

  it('survives a finished game', () => {
    const state = newGame();
    for (const region of Object.values(state.regions)) region.owner = 'p0';
    endTurn(state, graph);
    expect(state.outcome).not.toBeNull();

    const after = deserializeSave(serializeSave(state, 'p0'))!.state;
    expect(after.outcome).toEqual(state.outcome);
  });
});

describe('refusing a save it cannot trust', () => {
  const bad = (raw: string | null): void => {
    expect(deserializeSave(raw)).toBeNull();
  };

  it('turns away nothing at all', () => {
    bad(null);
    bad('');
    expect(deserializeSave(undefined)).toBeNull();
  });

  it('turns away anything that is not a save', () => {
    bad('not json');
    bad('[]');
    bad('42');
    bad('{}');
  });

  it('turns away a save from another version of the game', () => {
    const raw = JSON.parse(serializeSave(newGame(), 'p0'));
    raw.version = SAVE_VERSION + 1;
    bad(JSON.stringify(raw));
  });

  it('turns away a truncated save', () => {
    for (const field of ['turn', 'regions', 'units', 'players', 'rng']) {
      const raw = JSON.parse(serializeSave(newGame(), 'p0'));
      delete raw.state[field];
      bad(JSON.stringify(raw));
    }
  });

  it('turns away a save whose player is not in it', () => {
    const raw = JSON.parse(serializeSave(newGame(), 'p0'));
    raw.humanPlayerId = 'ghost';
    bad(JSON.stringify(raw));
  });

  it('turns away an empty board', () => {
    const raw = JSON.parse(serializeSave(newGame(), 'p0'));
    raw.state.regions = {};
    bad(JSON.stringify(raw));
  });
});
