/**
 * Hold economy: Gold income and the single build action each hold gets.
 *
 * The build allowance is deliberately shared between recruiting and fortifying.
 * A hold may raise a unit OR raise a wall in a turn, never both, which is the
 * offence-versus-defence tension the whole economy rests on. Widen it by
 * changing BALANCE.economy.buildsPerHoldPerTurn — nothing here hardcodes 1.
 */

import { BALANCE } from './balance';
import { addDefense, defenseCap, defenseCost, isAtCap } from './defense';
import type { Graph } from './graph';
import { isActiveTeamMember, playerById } from './players';
import { allRegions, getRegion } from './regions';
import { spawnUnit } from './units';
import {
  NEUTRAL,
  type DefenseType,
  type GameState,
  type PlayerId,
  type RecruitableType,
  type RegionId,
  type RegionState,
  type TeamId,
  type Unit,
} from './types';

export class BuildError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BuildError';
  }
}

/** A hold's Gold yield, which lives in the map rather than in state. */
export function goldPerTurn(graph: Graph, regionId: RegionId): number {
  return graph.regions.get(regionId)?.goldPerTurn ?? 0;
}

export function recruitCost(type: RecruitableType): number {
  return BALANCE.cost[type];
}

export function buildsRemaining(region: RegionState): number {
  return Math.max(0, BALANCE.economy.buildsPerHoldPerTurn - region.buildsUsed);
}

// ---------------------------------------------------------------------------
// Turn-start bookkeeping
// ---------------------------------------------------------------------------

/**
 * Pays every player on the team the yield of each hold they own.
 * Returns the total collected, which the UI reports.
 */
export function collectIncome(state: GameState, graph: Graph, teamId: TeamId): number {
  let total = 0;
  for (const region of allRegions(state)) {
    if (region.owner === NEUTRAL) continue;
    const player = playerById(state, region.owner);
    if (!player || player.teamId !== teamId) continue;

    const income = goldPerTurn(graph, region.id);
    player.gold += income;
    total += income;
  }
  return total;
}

/** Restores each hold's build allowance at its owning team's turn start. */
export function resetBuilds(state: GameState, teamId: TeamId): void {
  for (const region of allRegions(state)) {
    if (region.owner === NEUTRAL) continue;
    const player = playerById(state, region.owner);
    if (player?.teamId === teamId) region.buildsUsed = 0;
  }
}

// ---------------------------------------------------------------------------
// Build actions
// ---------------------------------------------------------------------------

/**
 * Conditions common to recruiting and fortifying, or null when clear.
 *
 * Build orders are scoped to a single player. Allies share a turn but not a
 * treasury, so a teammate may not spend your gold or act at your holds.
 */
function buildGateReason(
  state: GameState,
  regionId: RegionId,
  cost: number,
  actingPlayer: PlayerId,
): string | null {
  if (state.outcome !== null) return 'the game is over';

  const region = getRegion(state, regionId);

  if (region.owner === NEUTRAL) return 'a neutral hold cannot build';
  if (region.owner !== actingPlayer) return 'that hold belongs to another player';
  if (!isActiveTeamMember(state, actingPlayer)) return 'not this team’s turn';
  if (buildsRemaining(region) <= 0) return 'this hold has already acted this turn';

  const player = playerById(state, actingPlayer);
  if (!player) return 'unknown owner';
  if (player.gold < cost) return `needs ${cost} gold, has ${player.gold}`;

  return null;
}

export function recruitBlockedReason(
  state: GameState,
  regionId: RegionId,
  type: RecruitableType,
  actingPlayer: PlayerId,
): string | null {
  return buildGateReason(state, regionId, recruitCost(type), actingPlayer);
}

/**
 * Raises a unit at a hold.
 *
 * Recruits arrive ready to march. The plan does not restrict this and with one
 * build per hold per turn it is not abusable; make them arrive spent by setting
 * movesLeft to 0 here if playtesting says otherwise.
 */
export function recruit(
  state: GameState,
  regionId: RegionId,
  type: RecruitableType,
  actingPlayer: PlayerId,
): Unit {
  const reason = recruitBlockedReason(state, regionId, type, actingPlayer);
  if (reason) throw new BuildError(reason);

  const region = getRegion(state, regionId);
  const player = playerById(state, actingPlayer);
  if (!player) throw new BuildError('unknown owner');

  player.gold -= recruitCost(type);
  region.buildsUsed += 1;
  return spawnUnit(state, type, player.id, regionId);
}

export function fortifyBlockedReason(
  state: GameState,
  regionId: RegionId,
  type: DefenseType,
  actingPlayer: PlayerId,
): string | null {
  const region = getRegion(state, regionId);
  if (isAtCap(region, type)) return `${type} is at its limit of ${defenseCap(type)}`;
  return buildGateReason(state, regionId, defenseCost(type), actingPlayer);
}

/** Constructs one defensive structure at a hold. */
export function fortify(
  state: GameState,
  regionId: RegionId,
  type: DefenseType,
  actingPlayer: PlayerId,
): void {
  const reason = fortifyBlockedReason(state, regionId, type, actingPlayer);
  if (reason) throw new BuildError(reason);

  const region = getRegion(state, regionId);
  const player = playerById(state, actingPlayer);
  if (!player) throw new BuildError('unknown owner');

  player.gold -= defenseCost(type);
  region.buildsUsed += 1;
  addDefense(region, type);
}
