/**
 * Team-sequential turns with immediate resolution.
 *
 * One team acts, each order resolving instantly, then play passes to the next
 * team. The shared turn counter advances only once a full round completes —
 * every team has acted — so "turn 7" means the same moment for everyone
 * regardless of how many teams are playing. The dragon growth curve reads that
 * counter, so it must not tick once per team.
 */

import { growDragons, hatchEggs, type Hatching } from './dragons';
import type { Graph } from './graph';
import { collectIncome, resetBuilds } from './holds';
import { activeTeam } from './players';
import { refreshMovement } from './units';
import { checkVictory, eliminateLandlessPlayers } from './victory';
import type { GameState, Outcome, PlayerId, TeamId } from './types';

export interface TurnChange {
  readonly turn: number;
  readonly activeTeamId: TeamId;
  /** True when the turn counter advanced, i.e. every team has now acted. */
  readonly roundCompleted: boolean;
  /** Gold collected by the incoming team from the holds it controls. */
  readonly incomeCollected: number;
  /** Eggs that hatched as this turn opened — only ever on turn 5. */
  readonly hatchings: readonly Hatching[];
  /** Players who lost their last hold and were knocked out this turn. */
  readonly eliminated: readonly PlayerId[];
  /** Set on the turn the game is decided, and null every turn before it. */
  readonly outcome: Outcome | null;
}

/**
 * Everything that happens as a team's turn opens: it is paid for the holds it
 * controls, every one of those holds gets its build action back, and its units
 * recover their movement.
 *
 * Exported because createInitialState runs it for the first team, so turn 1 is
 * a normal turn rather than a special case.
 */
export function beginTeamTurn(state: GameState, graph: Graph, teamId: TeamId): number {
  const income = collectIncome(state, graph, teamId);
  resetBuilds(state, teamId);
  refreshMovement(state, teamId);
  return income;
}

/** Whose turn it is right now, plus the current turn number. */
export function currentTurn(state: GameState): TurnChange {
  return {
    turn: state.turn,
    activeTeamId: activeTeam(state).id,
    roundCompleted: false,
    incomeCollected: 0,
    hatchings: [],
    eliminated: [],
    outcome: state.outcome,
  };
}

/**
 * Passes play to the next team.
 *
 * Phase 7 checks victory here. It deliberately does not stop at the turn limit —
 * reaching it is a result to be resolved, which is Phase 7's job, not a reason
 * to refuse to advance.
 */
export function endTurn(state: GameState, graph: Graph): TurnChange {
  // A decided game takes no further turns. Without this the counter would keep
  // climbing behind the result screen.
  if (state.outcome !== null) return currentTurn(state);

  const wasLastTeam = state.activeTeamIndex === state.teams.length - 1;
  let hatchings: readonly Hatching[] = [];

  state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;

  if (wasLastTeam) {
    const previousTurn = state.turn;
    state.turn += 1;

    // Both hang off the turn counter, not off any team, so a four-team game
    // hatches at the same moment a two-team game does.
    growDragons(state, previousTurn, state.turn);
    hatchings = hatchEggs(state);
  }

  // Settle who is still in the game before the next team acts, so a knocked-out
  // player is never handed a turn.
  const eliminated = eliminateLandlessPlayers(state);
  const outcome = checkVictory(state);
  if (outcome !== null) {
    state.outcome = outcome;
    return {
      turn: state.turn,
      activeTeamId: activeTeam(state).id,
      roundCompleted: wasLastTeam,
      incomeCollected: 0,
      hatchings,
      eliminated,
      outcome,
    };
  }

  const next = activeTeam(state);
  const incomeCollected = beginTeamTurn(state, graph, next.id);

  return {
    turn: state.turn,
    activeTeamId: next.id,
    roundCompleted: wasLastTeam,
    incomeCollected,
    hatchings,
    eliminated,
    outcome: null,
  };
}

/** True once play has run past the final turn. Phase 7 decides what that means. */
export function hasReachedTurnLimit(state: GameState): boolean {
  return state.turn > state.turnLimit;
}
