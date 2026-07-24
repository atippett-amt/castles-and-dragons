import { beforeEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  IllegalMoveError,
  buildGraph,
  createInitialState,
  dragonStat,
  getRegion,
  getUnit,
  legalDestinations,
  loadMap,
  moveBlockedReason,
  moveUnits,
  spawnUnit,
  unitProfile,
  unitsIn,
  unitsOf,
  unitsOfTeam,
  type GameState,
  type Graph,
  type MapData,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

/** Two players on opposite shores, far enough apart not to collide by accident. */
function newGame(): GameState {
  return createInitialState({
    map,
    players: [
      { id: 'p0', name: 'North', teamId: 'north', isAI: false, startRegion: 'florence' },
      { id: 'p1', name: 'South', teamId: 'south', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'north', name: 'The North' },
      { id: 'south', name: 'The South' },
    ],
  });
}

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('unitProfile', () => {
  it('gives foot units fixed stats', () => {
    expect(unitProfile('swordsman', 1)).toEqual({
      atk: BALANCE.swordsman.atk,
      hp: BALANCE.swordsman.hp,
      move: BALANCE.swordsman.move,
    });
    expect(unitProfile('archer', 1)).toEqual({
      atk: BALANCE.archer.atk,
      hp: BALANCE.archer.hp,
      move: BALANCE.archer.move,
    });
  });

  it('does not scale foot units with the turn', () => {
    expect(unitProfile('swordsman', 90)).toEqual(unitProfile('swordsman', 1));
    expect(unitProfile('archer', 90)).toEqual(unitProfile('archer', 1));
  });

  it('scales dragons with the turn but never their movement', () => {
    const early = unitProfile('dragon', BALANCE.dragon.hatchTurn);
    const late = unitProfile('dragon', BALANCE.game.turnLimit);

    expect(early.hp).toBe(dragonStat(BALANCE.dragon.hatchTurn).hp);
    expect(late.hp).toBe(dragonStat(BALANCE.game.turnLimit).hp);
    expect(late.atk).toBeGreaterThan(early.atk);
    expect(early.move).toBe(BALANCE.dragon.move);
    expect(late.move).toBe(BALANCE.dragon.move);
  });
});

describe('starting garrisons', () => {
  it('places the configured garrison in each player home hold', () => {
    const florence = unitsIn(state, 'florence');
    expect(florence.filter((u) => u.type === 'swordsman')).toHaveLength(BALANCE.start.swordsmen);
    expect(florence.filter((u) => u.type === 'archer')).toHaveLength(BALANCE.start.archers);
    expect(florence.every((u) => u.owner === 'p0')).toBe(true);
  });

  it('leaves neutral holds empty until Phase 4 garrisons them', () => {
    expect(unitsIn(state, 'killen')).toHaveLength(0);
  });

  it('assigns deterministic unit ids', () => {
    const other = newGame();
    expect(Object.keys(state.units)).toEqual(Object.keys(other.units));
  });

  it('starts every unit at full health and movement', () => {
    for (const unit of unitsOf(state, 'p0')) {
      const profile = unitProfile(unit.type, state.turn);
      expect(unit.hp).toBe(profile.hp);
      expect(unit.movesLeft).toBe(profile.move);
    }
  });

  it('groups units by team', () => {
    expect(unitsOfTeam(state, 'north').every((u) => u.owner === 'p0')).toBe(true);
    expect(unitsOfTeam(state, 'south')).toHaveLength(
      BALANCE.start.swordsmen + BALANCE.start.archers,
    );
  });
});

describe('moveBlockedReason', () => {
  it('allows a legal adjacent step', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    expect(moveBlockedReason(state, graph, unit, 'bailey_springs')).toBeNull();
  });

  it('blocks a non-adjacent hold', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    expect(moveBlockedReason(state, graph, unit, 'whiteoak')).toMatch(/cannot cross/);
  });

  it('blocks a land unit from crossing open water', () => {
    const sword = spawnUnit(state, 'swordsman', 'p0', 'killen');
    expect(moveBlockedReason(state, graph, sword, 'muscle_shoals')).toMatch(/cannot cross/);
  });

  it('lets a dragon cross the same open water', () => {
    const dragon = spawnUnit(state, 'dragon', 'p0', 'killen');
    expect(moveBlockedReason(state, graph, dragon, 'muscle_shoals')).toBeNull();
  });

  it('blocks a spent unit', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    unit.movesLeft = 0;
    expect(moveBlockedReason(state, graph, unit, 'bailey_springs')).toMatch(/no movement left/);
  });
});

describe('legalDestinations', () => {
  it('omits the water crossing for a land stack', () => {
    const sword = spawnUnit(state, 'swordsman', 'p0', 'killen');
    const destinations = legalDestinations(state, graph, [sword.id]);
    expect(destinations).toContain('ford_city');
    expect(destinations).toContain('bailey_springs');
    expect(destinations).not.toContain('muscle_shoals');
  });

  it('includes the water crossing for a dragon', () => {
    const dragon = spawnUnit(state, 'dragon', 'p0', 'killen');
    expect(legalDestinations(state, graph, [dragon.id])).toContain('muscle_shoals');
  });

  it('intersects across a mixed stack, so the dragon is held back by the infantry', () => {
    const sword = spawnUnit(state, 'swordsman', 'p0', 'killen');
    const dragon = spawnUnit(state, 'dragon', 'p0', 'killen');
    expect(legalDestinations(state, graph, [sword.id, dragon.id])).not.toContain('muscle_shoals');
    expect(legalDestinations(state, graph, [dragon.id])).toContain('muscle_shoals');
  });

  it('returns nothing for an empty selection or a spent stack', () => {
    expect(legalDestinations(state, graph, [])).toEqual([]);
    const unit = unitsIn(state, 'florence')[0]!;
    unit.movesLeft = 0;
    expect(legalDestinations(state, graph, [unit.id])).toEqual([]);
  });
});

describe('moveUnits', () => {
  it('captures an empty neutral hold and flips ownership', () => {
    const movers = unitsIn(state, 'florence').map((u) => u.id);
    const result = moveUnits(state, graph, movers, 'bailey_springs', 'p0');

    expect(result.outcome).toBe('captured');
    expect(result.capturedFrom).toBe('neutral');
    expect(getRegion(state, 'bailey_springs').owner).toBe('p0');
    expect(unitsIn(state, 'bailey_springs')).toHaveLength(movers.length);
    expect(unitsIn(state, 'florence')).toHaveLength(0);
  });

  it('spends one movement point per step', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    expect(unit.movesLeft).toBe(1);
    moveUnits(state, graph, [unit.id], 'bailey_springs', 'p0');
    expect(getUnit(state, unit.id).movesLeft).toBe(0);
    expect(getUnit(state, unit.id).regionId).toBe('bailey_springs');
  });

  it('reinforces rather than captures a hold already held', () => {
    const first = unitsIn(state, 'florence')[0]!;
    moveUnits(state, graph, [first.id], 'bailey_springs', 'p0');

    const second = spawnUnit(state, 'swordsman', 'p0', 'florence');
    const result = moveUnits(state, graph, [second.id], 'bailey_springs', 'p0');
    expect(result.outcome).toBe('reinforced');
  });

  it('reports a battle and changes nothing when defenders are present', () => {
    spawnUnit(state, 'swordsman', 'p1', 'bailey_springs');
    const movers = unitsIn(state, 'florence').map((u) => u.id);

    const result = moveUnits(state, graph, movers, 'bailey_springs', 'p0');

    expect(result.outcome).toBe('battle');
    expect(result.movedUnitIds).toEqual([]);
    // Phase 4 replaces this branch with a real siege; until then nothing moves.
    expect(getRegion(state, 'bailey_springs').owner).toBe('neutral');
    expect(unitsIn(state, 'florence')).toHaveLength(movers.length);
    expect(unitsIn(state, 'florence').every((u) => u.movesLeft === 1)).toBe(true);
  });

  it('lets a dragon take two steps in one turn', () => {
    const dragon = spawnUnit(state, 'dragon', 'p0', 'killen');
    expect(dragon.movesLeft).toBe(2);

    moveUnits(state, graph, [dragon.id], 'muscle_shoals', 'p0');
    expect(getUnit(state, dragon.id).movesLeft).toBe(1);

    moveUnits(state, graph, [dragon.id], 'littleville', 'p0');
    expect(getUnit(state, dragon.id).regionId).toBe('littleville');
    expect(getUnit(state, dragon.id).movesLeft).toBe(0);

    expect(() => moveUnits(state, graph, [dragon.id], 'whiteoak', 'p0')).toThrow(IllegalMoveError);
  });

  it('rejects an illegal or empty order', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    expect(() => moveUnits(state, graph, [], 'florence', 'p0')).toThrow(IllegalMoveError);
    expect(() => moveUnits(state, graph, [unit.id], 'whiteoak', 'p0')).toThrow(IllegalMoveError);
    expect(() => moveUnits(state, graph, [unit.id], 'florence', 'p0')).toThrow(IllegalMoveError);
  });

  it('rejects moving units that start in different holds', () => {
    const here = unitsIn(state, 'florence')[0]!;
    const there = spawnUnit(state, 'swordsman', 'p0', 'killen');
    expect(() => moveUnits(state, graph, [here.id, there.id], 'bailey_springs', 'p0')).toThrow(
      /same hold/,
    );
  });

  it('rejects sweeping another player’s units along with your own', () => {
    const mine = unitsIn(state, 'florence')[0]!;
    const theirs = spawnUnit(state, 'swordsman', 'p1', 'florence');
    expect(() => moveUnits(state, graph, [mine.id, theirs.id], 'bailey_springs', 'p0')).toThrow(
      /only order your own units/,
    );
  });

  it('rejects ordering units out of turn', () => {
    const theirs = unitsIn(state, 'whiteoak').map((u) => u.id);
    // p1's units, but it is p0's team on the clock.
    expect(() => moveUnits(state, graph, theirs, 'ford_city', 'p1')).toThrow(/not your team’s turn/);
  });

  it('does not let an ally order your units, even sharing a turn', () => {
    // Allies share a turn but not a chain of command. Without this, a human
    // would end up steering their AI teammate's army, and in Stage B co-op one
    // player could move another's units out from under them.
    const coop = createInitialState({
      map,
      players: [
        { id: 'a', name: 'A', teamId: 'allies', isAI: false, startRegion: 'florence' },
        { id: 'b', name: 'B', teamId: 'allies', isAI: true, startRegion: 'killen' },
      ],
      teams: [{ id: 'allies', name: 'Allies' }],
    });

    const theirs = unitsIn(coop, 'killen').map((unit) => unit.id);
    expect(() => moveUnits(coop, graph, theirs, 'bailey_springs', 'a')).toThrow(
      /only order your own units/,
    );
    // The rightful owner, on the same turn, has no trouble.
    expect(moveUnits(coop, graph, theirs, 'bailey_springs', 'b').outcome).toBe('captured');
  });

  it('does not treat one neutral hold as allied with another', () => {
    // Neutral garrisons defend independently; if they counted as one bloc a
    // player could stroll from one neutral hold straight into the next.
    const unit = unitsIn(state, 'florence')[0]!;
    const result = moveUnits(state, graph, [unit.id], 'bailey_springs', 'p0');
    expect(result.outcome).toBe('captured');
  });
});
