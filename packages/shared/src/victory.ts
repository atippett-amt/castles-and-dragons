/**
 * Winning, losing, and running out of turns.
 *
 * A player is out when they hold nothing. Holds are the only thing that counts:
 * an army with no hold behind it has no income, no recruits and nowhere to
 * return to, so it disbands rather than roaming the map as a ghost. That is the
 * build plan's rule — lose all holds, be eliminated — and it is what keeps a
 * beaten player from dragging a game out.
 */

import { allRegions, regionsOwnedBy } from './regions';
import { allUnits, removeUnit, unitProfile } from './units';
import {
  NEUTRAL,
  type GameState,
  type Outcome,
  type PlayerId,
  type TeamId,
} from './types';

/** Holds controlled by everyone on a team. */
export function teamHolds(state: GameState, teamId: TeamId): number {
  const members = new Set(
    state.players.filter((player) => player.teamId === teamId).map((player) => player.id),
  );
  return allRegions(state).filter((region) => members.has(region.owner)).length;
}

/**
 * A team's total attack power, dragons included.
 *
 * Dragons are read at the current turn, so a late-game tiebreak counts them at
 * what they have actually grown into rather than what they hatched as.
 */
export function teamStrength(state: GameState, teamId: TeamId): number {
  const members = new Set(
    state.players.filter((player) => player.teamId === teamId).map((player) => player.id),
  );
  return allUnits(state)
    .filter((unit) => unit.owner !== NEUTRAL && members.has(unit.owner))
    .reduce((sum, unit) => sum + unitProfile(unit.type, state.turn).atk, 0);
}

export function isEliminated(state: GameState, playerId: PlayerId): boolean {
  return regionsOwnedBy(state, playerId).length === 0;
}

/** Teams still holding at least one hold. */
export function livingTeams(state: GameState): readonly TeamId[] {
  return state.teams.map((team) => team.id).filter((id) => teamHolds(state, id) > 0);
}

/**
 * Disbands the forces of anyone who has lost their last hold.
 *
 * Returns who was knocked out, so the client can say so. Idempotent: a player
 * already stripped has nothing left to remove.
 */
export function eliminateLandlessPlayers(state: GameState): readonly PlayerId[] {
  const knockedOut: PlayerId[] = [];

  for (const player of state.players) {
    if (!isEliminated(state, player.id)) continue;

    const stranded = allUnits(state).filter((unit) => unit.owner === player.id);
    if (stranded.length === 0) continue;

    for (const unit of stranded) removeUnit(state, unit.id);
    knockedOut.push(player.id);
  }

  return knockedOut;
}

/**
 * The result, or null if there is still a game on.
 *
 * Conquest is checked first and at any time; the turn-limit tiebreak only
 * applies once play has run past the final turn.
 */
export function checkVictory(state: GameState): Outcome | null {
  const living = livingTeams(state);

  if (living.length === 1) {
    return { kind: 'conquest', winningTeamId: living[0]!, turn: state.turn };
  }
  // Everyone wiped out at once — possible if the last two holds fall together.
  if (living.length === 0) {
    return { kind: 'draw', winningTeamId: null, turn: state.turn };
  }

  if (state.turn <= state.turnLimit) return null;

  // Out of turns: most holds, then the bigger army, then nobody.
  const ranked = [...living].sort((a, b) => {
    const byHolds = teamHolds(state, b) - teamHolds(state, a);
    if (byHolds !== 0) return byHolds;
    return teamStrength(state, b) - teamStrength(state, a);
  });

  const first = ranked[0]!;
  const second = ranked[1];
  if (second === undefined) {
    return { kind: 'holds', winningTeamId: first, turn: state.turn };
  }

  if (teamHolds(state, first) !== teamHolds(state, second)) {
    return { kind: 'holds', winningTeamId: first, turn: state.turn };
  }
  if (teamStrength(state, first) !== teamStrength(state, second)) {
    return { kind: 'strength', winningTeamId: first, turn: state.turn };
  }
  return { kind: 'draw', winningTeamId: null, turn: state.turn };
}

/** Whether the game has been decided and no further orders may be given. */
export function isOver(state: GameState): boolean {
  return state.outcome !== null;
}

/** Convenience for the client: did this team win? */
export function teamWon(state: GameState, teamId: TeamId): boolean {
  return state.outcome?.winningTeamId === teamId;
}
