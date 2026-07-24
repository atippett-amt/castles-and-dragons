/**
 * Player and team lookups.
 *
 * Kept separate from state.ts so units.ts can ask "are these two allied?"
 * without importing the module that builds state — which itself needs to spawn
 * units. Its own file breaks that cycle.
 */

import { NEUTRAL, type GameState, type Owner, type Player, type PlayerId, type Team, type TeamId } from './types';

export function teamOf(state: GameState, playerId: PlayerId): TeamId | null {
  return state.players.find((player) => player.id === playerId)?.teamId ?? null;
}

/**
 * Whether two owners fight on the same side.
 *
 * Neutral is allied with nobody — not even other neutral holds. Neutral
 * garrisons defend in place independently, so treating them as one bloc would
 * wrongly let a player walk through one neutral hold into the next.
 */
export function areAllied(state: GameState, a: Owner, b: Owner): boolean {
  if (a === NEUTRAL || b === NEUTRAL) return false;
  if (a === b) return true;
  const teamA = teamOf(state, a);
  const teamB = teamOf(state, b);
  return teamA !== null && teamA === teamB;
}

export function playersOfTeam(state: GameState, teamId: TeamId): readonly Player[] {
  return state.players.filter((player) => player.teamId === teamId);
}

/** The team whose turn it is. */
export function activeTeam(state: GameState): Team {
  const team = state.teams[state.activeTeamIndex];
  if (!team) throw new Error(`No team at index ${state.activeTeamIndex}`);
  return team;
}

export function isActiveTeamMember(state: GameState, playerId: PlayerId): boolean {
  return teamOf(state, playerId) === activeTeam(state).id;
}
