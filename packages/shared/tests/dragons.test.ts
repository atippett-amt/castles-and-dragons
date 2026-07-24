import { beforeEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  NEUTRAL,
  allUnits,
  buildGraph,
  createInitialState,
  dragonCensus,
  dragonStat,
  endTurn,
  getRegion,
  getUnit,
  hatchEggs,
  loadMap,
  moveUnits,
  unhatchedEggCount,
  unitProfile,
  unitsIn,
  type GameState,
  type Graph,
  type MapData,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';
import { clearNeutralGarrisons } from './helpers';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

function newGame(): GameState {
  return createInitialState({
    map,
    players: [
      { id: 'p0', name: 'North', teamId: 'north', isAI: false, startRegion: 'killen' },
      { id: 'p1', name: 'South', teamId: 'south', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'north', name: 'The North' },
      { id: 'south', name: 'The South' },
    ],
  });
}

/** Ends turns until the counter reaches `target`. */
function advanceTo(state: GameState, target: number): void {
  let guard = 0;
  while (state.turn < target && guard++ < 500) endTurn(state, graph);
}

const dragons = (state: GameState) => allUnits(state).filter((unit) => unit.type === 'dragon');

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('hatching', () => {
  it('holds every egg until the hatch turn', () => {
    expect(unhatchedEggCount(state)).toBe(map.regions.length);

    advanceTo(state, BALANCE.dragon.hatchTurn - 1);
    expect(state.turn).toBe(BALANCE.dragon.hatchTurn - 1);
    expect(dragons(state)).toHaveLength(0);
    expect(unhatchedEggCount(state)).toBe(map.regions.length);
  });

  it('hatches all ten the moment turn 5 arrives', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    expect(state.turn).toBe(BALANCE.dragon.hatchTurn);
    expect(dragons(state)).toHaveLength(BALANCE.dragon.total);
    expect(unhatchedEggCount(state)).toBe(0);
  });

  it('reports the hatchings on the turn change', () => {
    let hatched = 0;
    let guard = 0;
    while (state.turn < BALANCE.dragon.hatchTurn && guard++ < 500) {
      hatched += endTurn(state, graph).hatchings.length;
    }
    expect(hatched).toBe(BALANCE.dragon.total);
  });

  it('gives each dragon to whoever holds the region at that moment', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    for (const dragon of dragons(state)) {
      expect(dragon.owner).toBe(getRegion(state, dragon.regionId).owner);
    }
    expect(unitsIn(state, 'killen').some((u) => u.type === 'dragon' && u.owner === 'p0')).toBe(true);
  });

  it('hatches neutral holds too, so their dragons defend in place', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    const neutral = dragons(state).filter((dragon) => dragon.owner === NEUTRAL);
    // Eight holds are unclaimed in a two-player game.
    expect(neutral).toHaveLength(map.regions.length - 2);
  });

  it('hands an egg captured before the hatch to its new owner', () => {
    clearNeutralGarrisons(state);
    const movers = unitsIn(state, 'killen')
      .filter((u) => u.owner === 'p0')
      .map((u) => u.id);
    moveUnits(state, graph, movers, 'bailey_springs', 'p0');
    expect(getRegion(state, 'bailey_springs').owner).toBe('p0');
    expect(getRegion(state, 'bailey_springs').hasEgg).toBe(true);

    advanceTo(state, BALANCE.dragon.hatchTurn);

    const hatched = unitsIn(state, 'bailey_springs').find((u) => u.type === 'dragon');
    expect(hatched?.owner).toBe('p0');
  });

  it('never hatches twice', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    const afterHatch = dragons(state).length;

    expect(hatchEggs(state)).toHaveLength(0);
    advanceTo(state, BALANCE.dragon.hatchTurn + 5);

    expect(dragons(state)).toHaveLength(afterHatch);
  });

  it('keeps exactly ten in existence — conquest redistributes, never creates', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn + 20);
    expect(dragons(state)).toHaveLength(BALANCE.dragon.total);
  });

  it('hatches at the same turn regardless of team count', () => {
    const fourTeams = createInitialState({
      map,
      players: ['a', 'b', 'c', 'd'].map((id, index) => ({
        id,
        name: id,
        teamId: `t${index}`,
        isAI: index > 0,
        startRegion: ['killen', 'whiteoak', 'florence', 'littleville'][index]!,
      })),
      teams: ['t0', 't1', 't2', 't3'].map((id) => ({ id, name: id })),
    });

    advanceTo(fourTeams, BALANCE.dragon.hatchTurn);
    expect(fourTeams.turn).toBe(BALANCE.dragon.hatchTurn);
    expect(dragons(fourTeams)).toHaveLength(BALANCE.dragon.total);
  });
});

describe('growth', () => {
  it('hatches on the weakest point of the curve', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    const expected = dragonStat(BALANCE.dragon.hatchTurn);
    for (const dragon of dragons(state)) {
      expect(dragon.hp).toBe(expected.hp);
      expect(dragon.hp).toBe(BALANCE.dragon.hpAtHatch);
    }
  });

  it('keeps an undamaged dragon exactly on the curve as turns pass', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    for (const turn of [10, 25, 50, 75, BALANCE.game.turnLimit]) {
      advanceTo(state, turn);
      const expected = dragonStat(turn).hp;
      for (const dragon of dragons(state)) {
        // ±1 for rounding as the fraction is reapplied each turn.
        expect(Math.abs(dragon.hp - expected)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('grows attack straight off the current turn', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    const early = unitProfile('dragon', state.turn).atk;

    advanceTo(state, BALANCE.game.turnLimit);
    const late = unitProfile('dragon', state.turn).atk;

    expect(early).toBe(BALANCE.dragon.atkAtHatch);
    expect(late).toBe(BALANCE.dragon.atkAtMax);
    expect(late).toBeGreaterThan(early);
  });

  it('carries wounds through the growth rather than healing them', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);

    const dragon = dragons(state)[0]!;
    dragon.hp = Math.round(dragon.hp / 2); // half health at hatch

    advanceTo(state, 50);

    const expectedMax = dragonStat(50).hp;
    // Still about half, on a much bigger frame — bigger dragon, bigger wound.
    expect(dragon.hp / expectedMax).toBeGreaterThan(0.4);
    expect(dragon.hp / expectedMax).toBeLessThan(0.6);
    expect(dragon.hp).toBeLessThan(expectedMax);
  });

  it('never rescales a living dragon out of existence', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    const dragon = dragons(state)[0]!;
    dragon.hp = 1;

    advanceTo(state, BALANCE.game.turnLimit);
    expect(dragon.hp).toBeGreaterThanOrEqual(1);
  });

  it('rises monotonically for an undamaged dragon', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    const dragon = dragons(state)[0]!;

    let previous = dragon.hp;
    for (let turn = BALANCE.dragon.hatchTurn + 1; turn <= BALANCE.game.turnLimit; turn++) {
      advanceTo(state, turn);
      expect(dragon.hp).toBeGreaterThanOrEqual(previous - 1);
      previous = dragon.hp;
    }
    expect(previous).toBeGreaterThan(BALANCE.dragon.hpAtHatch);
  });
});

describe('dragons in the field', () => {
  it('flies the lake where no army can follow', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    clearNeutralGarrisons(state);

    const dragon = unitsIn(state, 'killen').find((u) => u.type === 'dragon')!;
    expect(dragon.owner).toBe('p0');
    expect(dragon.movesLeft).toBe(BALANCE.dragon.move);

    // Killen to Muscle Shoals is open water: dragons only.
    const result = moveUnits(state, graph, [dragon.id], 'muscle_shoals', 'p0');
    expect(result.outcome).toBe('captured');
    expect(getUnit(state, dragon.id).regionId).toBe('muscle_shoals');

    // And still has a second move in it.
    expect(getUnit(state, dragon.id).movesLeft).toBe(1);
  });

  it('counts who holds how many', () => {
    advanceTo(state, BALANCE.dragon.hatchTurn);
    const census = dragonCensus(state);

    expect(census.get('p0')).toBe(1);
    expect(census.get('p1')).toBe(1);
    expect(census.get(NEUTRAL)).toBe(map.regions.length - 2);

    let total = 0;
    for (const count of census.values()) total += count;
    expect(total).toBe(BALANCE.dragon.total);
  });
});
