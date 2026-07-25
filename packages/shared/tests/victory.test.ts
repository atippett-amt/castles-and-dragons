import { beforeEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  BuildError,
  IllegalMoveError,
  NEUTRAL,
  allUnits,
  buildGraph,
  checkVictory,
  createInitialState,
  endTurn,
  fortifyBlockedReason,
  getRegion,
  isEliminated,
  isOver,
  livingTeams,
  loadMap,
  moveUnits,
  recruit,
  spawnUnit,
  teamHolds,
  teamStrength,
  teamWon,
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
      { id: 'p0', name: 'North', teamId: 'north', isAI: false, startRegion: 'florence' },
      { id: 'p1', name: 'South', teamId: 'south', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'north', name: 'The North' },
      { id: 'south', name: 'The South' },
    ],
  });
}

/** Hands every hold on the map to one team, wiping the other out. */
function giveEverythingTo(state: GameState, owner: string): void {
  for (const region of Object.values(state.regions)) region.owner = owner;
}

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('elimination', () => {
  it('counts a player out when they hold nothing', () => {
    expect(isEliminated(state, 'p1')).toBe(false);
    getRegion(state, 'whiteoak').owner = 'p0';
    expect(isEliminated(state, 'p1')).toBe(true);
  });

  it('disbands the army of a player with no hold behind it', () => {
    spawnUnit(state, 'swordsman', 'p1', 'littleville');
    getRegion(state, 'whiteoak').owner = 'p0';

    endTurn(state, graph);

    expect(allUnits(state).filter((unit) => unit.owner === 'p1')).toHaveLength(0);
  });

  it('reports who was knocked out, once', () => {
    getRegion(state, 'whiteoak').owner = 'p0';

    const first = endTurn(state, graph);
    expect(first.eliminated).toContain('p1');

    // Nothing left to strip, so it does not keep announcing it.
    const second = endTurn(state, graph);
    expect(second.eliminated).toEqual([]);
  });

  it('leaves a player alive while they still hold ground', () => {
    // Their army is wiped but the hold is theirs — still in the game.
    for (const unit of unitsIn(state, 'whiteoak')) delete state.units[unit.id];
    endTurn(state, graph);
    expect(isEliminated(state, 'p1')).toBe(false);
    expect(state.outcome).toBeNull();
  });
});

describe('conquest', () => {
  it('ends the moment one team is the only one left holding ground', () => {
    giveEverythingTo(state, 'p0');

    const change = endTurn(state, graph);

    expect(change.outcome).toEqual({ kind: 'conquest', winningTeamId: 'north', turn: state.turn });
    expect(state.outcome?.kind).toBe('conquest');
    expect(teamWon(state, 'north')).toBe(true);
    expect(teamWon(state, 'south')).toBe(false);
  });

  it('freezes the game once decided', () => {
    giveEverythingTo(state, 'p0');
    endTurn(state, graph);

    const decidedOn = state.turn;
    const activeTeam = state.activeTeamIndex;

    endTurn(state, graph);
    endTurn(state, graph);

    // The counter does not creep on behind the result screen.
    expect(state.turn).toBe(decidedOn);
    expect(state.activeTeamIndex).toBe(activeTeam);
    expect(isOver(state)).toBe(true);
  });

  it('reports the result only on the turn it happens', () => {
    giveEverythingTo(state, 'p0');
    expect(endTurn(state, graph).outcome?.kind).toBe('conquest');
    // Subsequent calls are no-ops that simply restate the standing result.
    expect(endTurn(state, graph).turn).toBe(state.turn);
  });

  it('calls it a draw if the last teams fall together', () => {
    giveEverythingTo(state, NEUTRAL);
    endTurn(state, graph);
    expect(state.outcome).toEqual({ kind: 'draw', winningTeamId: null, turn: state.turn });
  });
});

describe('running out of turns', () => {
  it('does not resolve early', () => {
    state.turn = BALANCE.game.turnLimit;
    expect(checkVictory(state)).toBeNull();
  });

  it('gives it to whoever holds the most', () => {
    state.turn = BALANCE.game.turnLimit + 1;
    getRegion(state, 'killen').owner = 'p0';
    getRegion(state, 'sheffield').owner = 'p0';

    expect(teamHolds(state, 'north')).toBe(3);
    expect(teamHolds(state, 'south')).toBe(1);
    expect(checkVictory(state)).toEqual({
      kind: 'holds',
      winningTeamId: 'north',
      turn: state.turn,
    });
  });

  it('falls to army strength when holds are level', () => {
    state.turn = BALANCE.game.turnLimit + 1;
    expect(teamHolds(state, 'north')).toBe(teamHolds(state, 'south'));

    for (let i = 0; i < 3; i++) spawnUnit(state, 'swordsman', 'p1', 'whiteoak');

    expect(teamStrength(state, 'south')).toBeGreaterThan(teamStrength(state, 'north'));
    expect(checkVictory(state)).toEqual({
      kind: 'strength',
      winningTeamId: 'south',
      turn: state.turn,
    });
  });

  it('counts a dragon at what it has grown into', () => {
    state.turn = BALANCE.game.turnLimit + 1;
    spawnUnit(state, 'dragon', 'p0', 'florence');

    // A turn-100 dragon is worth far more than the swordsman it hatched beside.
    expect(teamStrength(state, 'north') - teamStrength(state, 'south')).toBeGreaterThan(
      BALANCE.dragon.atkAtHatch,
    );
  });

  it('is a draw when neither side is ahead on either count', () => {
    state.turn = BALANCE.game.turnLimit + 1;
    expect(teamHolds(state, 'north')).toBe(teamHolds(state, 'south'));
    expect(teamStrength(state, 'north')).toBe(teamStrength(state, 'south'));

    expect(checkVictory(state)).toEqual({ kind: 'draw', winningTeamId: null, turn: state.turn });
  });

  it('resolves through a real turn cycle rather than only on demand', () => {
    getRegion(state, 'killen').owner = 'p0';
    state.turn = BALANCE.game.turnLimit;
    state.activeTeamIndex = state.teams.length - 1; // next end-turn rolls the counter

    const change = endTurn(state, graph);

    expect(state.turn).toBe(BALANCE.game.turnLimit + 1);
    expect(change.outcome?.kind).toBe('holds');
    expect(change.outcome?.winningTeamId).toBe('north');
  });
});

describe('orders after the final whistle', () => {
  beforeEach(() => {
    clearNeutralGarrisons(state);
    giveEverythingTo(state, 'p0');
    endTurn(state, graph);
  });

  it('refuses a march', () => {
    const movers = unitsIn(state, 'florence').map((unit) => unit.id);
    expect(() => moveUnits(state, graph, movers, 'bailey_springs', 'p0')).toThrow(
      IllegalMoveError,
    );
    expect(() => moveUnits(state, graph, movers, 'bailey_springs', 'p0')).toThrow(/game is over/);
  });

  it('refuses a build', () => {
    expect(fortifyBlockedReason(state, 'florence', 'watchtower', 'p0')).toMatch(/game is over/);
    expect(() => recruit(state, 'florence', 'archer', 'p0')).toThrow(BuildError);
  });
});

describe('livingTeams', () => {
  it('lists only teams still holding ground', () => {
    expect([...livingTeams(state)].sort()).toEqual(['north', 'south']);
    getRegion(state, 'whiteoak').owner = 'p0';
    expect(livingTeams(state)).toEqual(['north']);
  });
});
