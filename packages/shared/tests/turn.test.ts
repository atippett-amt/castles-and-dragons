import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeTeam,
  buildGraph,
  createInitialState,
  endTurn,
  getUnit,
  hasReachedTurnLimit,
  loadMap,
  moveUnits,
  unitsIn,
  type GameState,
  type Graph,
  type MapData,
  type PlayerSetup,
  type TeamSetup,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';
import { clearNeutralGarrisons } from './helpers';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

function newGame(teamCount = 2): GameState {
  const homes = ['florence', 'whiteoak', 'bailey_springs', 'littleville'];
  const players: PlayerSetup[] = Array.from({ length: teamCount }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    teamId: `t${index}`,
    isAI: index !== 0,
    startRegion: homes[index]!,
  }));
  const teams: TeamSetup[] = players.map((player) => ({
    id: player.teamId,
    name: `Team ${player.teamId}`,
  }));
  return createInitialState({ map, players, teams });
}

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('endTurn', () => {
  it('passes play to the next team', () => {
    expect(activeTeam(state).id).toBe('t0');
    const change = endTurn(state, graph);
    expect(change.activeTeamId).toBe('t1');
    expect(activeTeam(state).id).toBe('t1');
  });

  it('advances the turn counter only once every team has acted', () => {
    expect(state.turn).toBe(1);

    // First team ends: still turn 1, it is simply the other team's move.
    expect(endTurn(state, graph).roundCompleted).toBe(false);
    expect(state.turn).toBe(1);

    // Second team ends: the round is complete, so the counter ticks.
    expect(endTurn(state, graph).roundCompleted).toBe(true);
    expect(state.turn).toBe(2);
    expect(activeTeam(state).id).toBe('t0');
  });

  it('ticks once per round regardless of team count', () => {
    const four = newGame(4);
    for (let i = 0; i < 4; i++) endTurn(four, graph);
    expect(four.turn).toBe(2);

    for (let i = 0; i < 8; i++) endTurn(four, graph);
    expect(four.turn).toBe(4);
  });

  it('climbs steadily across many rounds', () => {
    for (let round = 0; round < 20; round++) {
      endTurn(state, graph);
      endTurn(state, graph);
    }
    expect(state.turn).toBe(21);
  });
});

describe('movement refresh', () => {
  // Movement, not sieges: strip the neutral garrisons out of the way.
  beforeEach(() => {
    clearNeutralGarrisons(state);
  });

  it('restores movement to the team whose turn is starting', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    moveUnits(state, graph, [unit.id], 'underwood_petersville', 'p0');
    expect(getUnit(state, unit.id).movesLeft).toBe(0);

    endTurn(state, graph); // t1's turn â€” t0 stays spent
    expect(getUnit(state, unit.id).movesLeft).toBe(0);

    endTurn(state, graph); // back to t0 â€” refreshed
    expect(getUnit(state, unit.id).movesLeft).toBe(1);
  });

  it('does not refresh a team that is not starting its turn', () => {
    const theirs = unitsIn(state, 'whiteoak')[0]!;
    theirs.movesLeft = 0;

    endTurn(state, graph); // t1 starts, so t1 refreshes
    expect(getUnit(state, theirs.id).movesLeft).toBe(1);

    const mine = unitsIn(state, 'florence')[0]!;
    mine.movesLeft = 0;
    endTurn(state, graph); // t0 starts, t1 keeps whatever it has left
    expect(getUnit(state, mine.id).movesLeft).toBe(1);
  });

  it('lets a stack move again on the following turn', () => {
    const unit = unitsIn(state, 'florence')[0]!;
    moveUnits(state, graph, [unit.id], 'underwood_petersville', 'p0');

    endTurn(state, graph);
    endTurn(state, graph);

    moveUnits(state, graph, [unit.id], 'bailey_springs', 'p0');
    expect(getUnit(state, unit.id).regionId).toBe('bailey_springs');
  });
});

describe('hasReachedTurnLimit', () => {
  it('is false during normal play', () => {
    expect(hasReachedTurnLimit(state)).toBe(false);
    state.turn = state.turnLimit;
    expect(hasReachedTurnLimit(state)).toBe(false);
  });

  it('is true once play runs past the final turn', () => {
    state.turn = state.turnLimit;
    endTurn(state, graph);
    endTurn(state, graph);
    expect(state.turn).toBe(state.turnLimit + 1);
    expect(hasReachedTurnLimit(state)).toBe(true);
  });
});
