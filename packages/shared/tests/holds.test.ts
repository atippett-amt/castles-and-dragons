import { beforeEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  BuildError,
  buildGraph,
  buildsRemaining,
  createInitialState,
  endTurn,
  fortify,
  fortifyBlockedReason,
  getRegion,
  loadMap,
  playerById,
  recruit,
  recruitBlockedReason,
  unitsIn,
  type GameState,
  type Graph,
  type MapData,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

/** Florence yields 3 gold a turn — the joint-richest hold on the map. */
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

const goldOf = (state: GameState, id: string): number => playerById(state, id)!.gold;

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('income', () => {
  it('pays the opening team at once and the other as its turn begins', () => {
    expect(goldOf(state, 'p0')).toBe(BALANCE.economy.startingGold + 3); // Florence
    expect(goldOf(state, 'p1')).toBe(BALANCE.economy.startingGold); // not yet on the clock

    endTurn(state, graph);
    expect(goldOf(state, 'p1')).toBe(BALANCE.economy.startingGold + 2); // Whiteoak
  });

  it('pays once per round, every round', () => {
    const before = goldOf(state, 'p0');
    endTurn(state, graph); // south
    endTurn(state, graph); // north again — one full round
    expect(goldOf(state, 'p0')).toBe(before + 3);

    endTurn(state, graph);
    endTurn(state, graph);
    expect(goldOf(state, 'p0')).toBe(before + 6);
  });

  it('pays for every hold a player controls', () => {
    getRegion(state, 'bailey_springs').owner = 'p0'; // +2
    getRegion(state, 'underwood_petersville').owner = 'p0'; // +2

    const before = goldOf(state, 'p0');
    endTurn(state, graph);
    endTurn(state, graph);
    expect(goldOf(state, 'p0')).toBe(before + 3 + 2 + 2);
  });

  it('reports what the incoming team collected', () => {
    const change = endTurn(state, graph);
    expect(change.incomeCollected).toBe(2);
  });

  it('pays nothing for neutral holds', () => {
    const change = endTurn(state, graph);
    // Only Whiteoak is South's; the other eight holds are neutral.
    expect(change.incomeCollected).toBe(2);
  });
});

describe('recruiting', () => {
  it('raises a unit, spends the gold and uses the hold’s action', () => {
    const before = goldOf(state, 'p0');
    const garrison = unitsIn(state, 'florence').length;

    const unit = recruit(state, 'florence', 'swordsman');

    expect(unit.owner).toBe('p0');
    expect(unit.regionId).toBe('florence');
    expect(unitsIn(state, 'florence')).toHaveLength(garrison + 1);
    expect(goldOf(state, 'p0')).toBe(before - BALANCE.cost.swordsman);
    expect(buildsRemaining(getRegion(state, 'florence'))).toBe(0);
  });

  it('blocks a second build at the same hold in one turn', () => {
    recruit(state, 'florence', 'swordsman');
    expect(recruitBlockedReason(state, 'florence', 'archer')).toMatch(/already acted/);
    expect(() => recruit(state, 'florence', 'archer')).toThrow(BuildError);
  });

  it('blocks recruiting without the gold', () => {
    playerById(state, 'p0')!.gold = 0;
    expect(recruitBlockedReason(state, 'florence', 'archer')).toMatch(/needs 4 gold, has 0/);
    expect(() => recruit(state, 'florence', 'archer')).toThrow(BuildError);
  });

  it('blocks recruiting at a neutral hold', () => {
    expect(recruitBlockedReason(state, 'killen', 'swordsman')).toMatch(/neutral hold/);
  });

  it('blocks recruiting out of turn', () => {
    endTurn(state, graph); // South is on the clock now
    expect(recruitBlockedReason(state, 'florence', 'swordsman')).toMatch(/turn/);
    expect(recruitBlockedReason(state, 'whiteoak', 'swordsman')).toBeNull();
  });

  it('restores the allowance next turn', () => {
    recruit(state, 'florence', 'swordsman');
    expect(buildsRemaining(getRegion(state, 'florence'))).toBe(0);

    endTurn(state, graph);
    endTurn(state, graph);

    expect(buildsRemaining(getRegion(state, 'florence'))).toBe(
      BALANCE.economy.buildsPerHoldPerTurn,
    );
    expect(recruitBlockedReason(state, 'florence', 'swordsman')).toBeNull();
  });
});

describe('fortifying', () => {
  it('builds each of the three defenses', () => {
    for (const type of ['ramparts', 'watchtower', 'scorpion'] as const) {
      const fresh = newGame();
      playerById(fresh, 'p0')!.gold = 50;
      fortify(fresh, 'florence', type);
      expect(getRegion(fresh, 'florence').defenses[type]).toBe(1);
    }
  });

  it('respects each defense’s stack cap', () => {
    playerById(state, 'p0')!.gold = 500;

    // Ramparts cap at 2, one per turn.
    for (let i = 0; i < BALANCE.ramparts.cap; i++) {
      fortify(state, 'florence', 'ramparts');
      endTurn(state, graph);
      endTurn(state, graph);
    }

    expect(getRegion(state, 'florence').defenses.ramparts).toBe(BALANCE.ramparts.cap);
    expect(fortifyBlockedReason(state, 'florence', 'ramparts')).toMatch(/at its limit of 2/);
    expect(() => fortify(state, 'florence', 'ramparts')).toThrow(BuildError);
  });

  it('blocks fortifying without the gold', () => {
    playerById(state, 'p0')!.gold = 1;
    expect(fortifyBlockedReason(state, 'florence', 'scorpion')).toMatch(/needs 6 gold/);
  });

  it('blocks fortifying at a neutral hold', () => {
    expect(fortifyBlockedReason(state, 'killen', 'ramparts')).toMatch(/neutral hold/);
  });
});

describe('recruit versus fortify', () => {
  it('are mutually exclusive — one hold, one action per turn', () => {
    playerById(state, 'p0')!.gold = 100;

    recruit(state, 'florence', 'swordsman');
    expect(fortifyBlockedReason(state, 'florence', 'ramparts')).toMatch(/already acted/);
    expect(() => fortify(state, 'florence', 'ramparts')).toThrow(BuildError);
  });

  it('blocks recruiting after fortifying too', () => {
    playerById(state, 'p0')!.gold = 100;

    fortify(state, 'florence', 'watchtower');
    expect(recruitBlockedReason(state, 'florence', 'swordsman')).toMatch(/already acted/);
  });

  it('tracks the allowance per hold, not per player', () => {
    playerById(state, 'p0')!.gold = 100;
    getRegion(state, 'bailey_springs').owner = 'p0';
    getRegion(state, 'bailey_springs').buildsUsed = 0;

    recruit(state, 'florence', 'swordsman');
    // A different hold still has its own action.
    expect(recruitBlockedReason(state, 'bailey_springs', 'swordsman')).toBeNull();
  });
});
