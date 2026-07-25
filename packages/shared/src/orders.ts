/**
 * Movement orders — the bridge between a player's intent and the rules.
 *
 * Lives apart from units.ts because issuing a move can start a siege, and
 * combat.ts needs unit stats from units.ts. Splitting the order layer out keeps
 * that dependency a straight line instead of a circle.
 */

import { resolveSiege, type BattleReport } from './combat';
import { canTraverse, type Graph } from './graph';
import { areAllied, isActiveTeamMember } from './players';
import { getRegion } from './regions';
import { defendersAgainst, getUnit } from './units';
import type { GameState, Owner, PlayerId, RegionId, Unit, UnitId } from './types';

export type MoveOutcome =
  /** Moved into a hold the movers already hold or are allied with. */
  | 'reinforced'
  /** Took the hold — either it was undefended, or the siege was won. */
  | 'captured'
  /** A siege was fought and lost; the hold did not change hands. */
  | 'repelled';

export interface MoveResult {
  readonly outcome: MoveOutcome;
  readonly movedUnitIds: readonly UnitId[];
  readonly from: RegionId;
  readonly to: RegionId;
  /** Set when outcome is 'captured'. */
  readonly capturedFrom?: Owner;
  /** Present whenever the move triggered a siege. */
  readonly battle?: BattleReport;
}

export class IllegalMoveError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IllegalMoveError';
  }
}

/** Why `unit` may not step to `to`, or null when the step is legal. */
export function moveBlockedReason(
  state: GameState,
  graph: Graph,
  unit: Unit,
  to: RegionId,
): string | null {
  if (unit.movesLeft < 1) return `${unit.type} has no movement left`;
  if (unit.regionId === to) return 'already there';
  if (!canTraverse(graph, unit.regionId, to, unit.type)) {
    // The interesting case: a land unit staring across open water.
    return `a ${unit.type} cannot cross that border`;
  }
  return null;
}

/**
 * Every hold the given stack could step to together.
 *
 * Intersecting across the selection matters: a mixed stack of swordsmen and a
 * dragon can only move as one to holds the swordsmen can also reach, so the
 * water crossings drop out of the list.
 */
export function legalDestinations(
  state: GameState,
  graph: Graph,
  unitIds: readonly UnitId[],
): readonly RegionId[] {
  if (unitIds.length === 0) return [];
  const units = unitIds.map((id) => getUnit(state, id));
  const first = units[0];
  if (!first) return [];

  const candidates = graph.adjacency.get(first.regionId) ?? [];
  return candidates
    .map((adjacent) => adjacent.to)
    .filter((to) => units.every((unit) => moveBlockedReason(state, graph, unit, to) === null));
}

/**
 * Moves a stack one step, on behalf of `actingPlayer`.
 *
 * Orders are scoped to a single player, not to their whole team. Allies share
 * a turn but not a purse or a chain of command: one player may never move
 * another's units, even a teammate's. In Stage B the Durable Object knows who
 * sent an order and passes them here, so the same check guards the network.
 *
 * An undefended destination is simply walked into. Anything with defenders is a
 * siege, resolved in full by combat.ts before this returns.
 */
export function moveUnits(
  state: GameState,
  graph: Graph,
  unitIds: readonly UnitId[],
  to: RegionId,
  actingPlayer: PlayerId,
): MoveResult {
  if (unitIds.length === 0) throw new IllegalMoveError('no units selected');

  if (state.outcome !== null) throw new IllegalMoveError('the game is over');

  if (!isActiveTeamMember(state, actingPlayer)) {
    throw new IllegalMoveError('it is not your team’s turn');
  }

  const units = unitIds.map((id) => getUnit(state, id));
  const first = units[0];
  if (!first) throw new IllegalMoveError('no units selected');

  const from = first.regionId;
  if (units.some((unit) => unit.regionId !== from)) {
    throw new IllegalMoveError('all units in a move must start in the same hold');
  }

  if (units.some((unit) => unit.owner !== actingPlayer)) {
    throw new IllegalMoveError('you can only order your own units');
  }

  for (const unit of units) {
    const reason = moveBlockedReason(state, graph, unit, to);
    if (reason) throw new IllegalMoveError(reason);
  }

  const destination = getRegion(state, to);
  const previousOwner = destination.owner;

  if (defendersAgainst(state, to, actingPlayer).length > 0) {
    const battle = resolveSiege(state, graph, unitIds, to, actingPlayer);
    return {
      outcome: battle.outcome === 'captured' ? 'captured' : 'repelled',
      movedUnitIds: battle.outcome === 'captured' ? battle.survivingAttackerIds : [],
      from,
      to,
      ...(battle.outcome === 'captured' ? { capturedFrom: previousOwner } : {}),
      battle,
    };
  }

  for (const unit of units) {
    unit.regionId = to;
    unit.movesLeft -= 1;
  }

  // areAllied already reports false for NEUTRAL, so this covers both "my hold"
  // and "an ally's hold" without a separate neutral check.
  if (areAllied(state, destination.owner, actingPlayer)) {
    return { outcome: 'reinforced', movedUnitIds: unitIds, from, to };
  }

  destination.owner = actingPlayer;
  return { outcome: 'captured', movedUnitIds: unitIds, from, to, capturedFrom: previousOwner };
}
