/**
 * Units, stacks and movement.
 *
 * Stacks are implicit: every unit standing in a region fights together, so
 * there is no separate "army" entity that could drift out of sync with the
 * units it claims to contain.
 *
 * Movement costs one point per step. A swordsman or archer has one point and so
 * takes one step; a dragon has two and can chain two steps, including across
 * open water. That falls out of the numbers in balance.ts rather than being
 * special-cased per unit type.
 */

import { BALANCE, dragonStat } from './balance';
import { canTraverse, type Graph } from './graph';
import { areAllied } from './players';
import { getRegion } from './regions';
import {
  NEUTRAL,
  type GameState,
  type PlayerId,
  type RegionId,
  type TeamId,
  type Unit,
  type UnitId,
  type UnitType,
} from './types';

export interface UnitProfile {
  readonly atk: number;
  readonly hp: number;
  readonly move: number;
}

/**
 * A unit type's stats on a given turn.
 *
 * Only dragons vary with the turn — they interpolate from hatch to their peak.
 * Everything else is fixed, which is why the turn argument is required but
 * usually irrelevant.
 */
export function unitProfile(type: UnitType, turn: number): UnitProfile {
  switch (type) {
    case 'swordsman':
      return { atk: BALANCE.swordsman.atk, hp: BALANCE.swordsman.hp, move: BALANCE.swordsman.move };
    case 'archer':
      return { atk: BALANCE.archer.atk, hp: BALANCE.archer.hp, move: BALANCE.archer.move };
    case 'dragon': {
      const scaled = dragonStat(turn);
      return { atk: scaled.atk, hp: scaled.hp, move: BALANCE.dragon.move };
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function allUnits(state: GameState): readonly Unit[] {
  return Object.values(state.units);
}

export function getUnit(state: GameState, id: UnitId): Unit {
  const unit = state.units[id];
  if (!unit) throw new Error(`Unknown unit: ${id}`);
  return unit;
}

export function unitsIn(state: GameState, regionId: RegionId): readonly Unit[] {
  return allUnits(state).filter((unit) => unit.regionId === regionId);
}

export function unitsOf(state: GameState, owner: PlayerId): readonly Unit[] {
  return allUnits(state).filter((unit) => unit.owner === owner);
}

export function unitsOfTeam(state: GameState, teamId: TeamId): readonly Unit[] {
  const members = new Set(
    state.players.filter((player) => player.teamId === teamId).map((player) => player.id),
  );
  return allUnits(state).filter((unit) => members.has(unit.owner));
}

/** Units in a region that are NOT allied with `owner` — i.e. would defend it. */
export function defendersAgainst(
  state: GameState,
  regionId: RegionId,
  owner: PlayerId,
): readonly Unit[] {
  return unitsIn(state, regionId).filter((unit) => !areAllied(state, unit.owner, owner));
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export function spawnUnit(
  state: GameState,
  type: UnitType,
  owner: PlayerId,
  regionId: RegionId,
): Unit {
  const profile = unitProfile(type, state.turn);
  const unit: Unit = {
    id: `u${state.nextUnitId}`,
    type,
    owner,
    regionId,
    hp: profile.hp,
    movesLeft: profile.move,
  };
  state.nextUnitId += 1;
  state.units[unit.id] = unit;
  return unit;
}

export function removeUnit(state: GameState, id: UnitId): void {
  delete state.units[id];
}

/** Restores movement for every unit belonging to a team. Called at turn start. */
export function refreshMovement(state: GameState, teamId: TeamId): void {
  for (const unit of unitsOfTeam(state, teamId)) {
    unit.movesLeft = unitProfile(unit.type, state.turn).move;
  }
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export type MoveOutcome =
  /** Moved into a hold the movers already hold or are allied with. */
  | 'reinforced'
  /** Moved into an undefended neutral or enemy hold, taking it. */
  | 'captured'
  /** Defenders present — a siege is required. Stubbed until Phase 4. */
  | 'battle';

export interface MoveResult {
  readonly outcome: MoveOutcome;
  readonly movedUnitIds: readonly UnitId[];
  readonly from: RegionId;
  readonly to: RegionId;
  /** Set when outcome is 'captured'. */
  readonly capturedFrom?: string;
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
 * Moves a stack one step.
 *
 * Ownership only changes when the destination has no defenders. If defenders
 * are present this reports 'battle' and changes nothing — Phase 4 replaces that
 * branch with a real siege, and the surrounding rules stay as they are.
 */
export function moveUnits(
  state: GameState,
  graph: Graph,
  unitIds: readonly UnitId[],
  to: RegionId,
): MoveResult {
  if (unitIds.length === 0) throw new IllegalMoveError('no units selected');

  const units = unitIds.map((id) => getUnit(state, id));
  const first = units[0];
  if (!first) throw new IllegalMoveError('no units selected');

  const from = first.regionId;
  if (units.some((unit) => unit.regionId !== from)) {
    throw new IllegalMoveError('all units in a move must start in the same hold');
  }

  const mover = first.owner;
  if (units.some((unit) => !areAllied(state, unit.owner, mover))) {
    throw new IllegalMoveError('cannot move units of an opposing team together');
  }

  for (const unit of units) {
    const reason = moveBlockedReason(state, graph, unit, to);
    if (reason) throw new IllegalMoveError(reason);
  }

  const defenders = defendersAgainst(state, to, mover);
  if (defenders.length > 0) {
    return { outcome: 'battle', movedUnitIds: [], from, to };
  }

  for (const unit of units) {
    unit.regionId = to;
    unit.movesLeft -= 1;
  }

  const destination = getRegion(state, to);
  // areAllied already reports false for NEUTRAL, so this covers both "my hold"
  // and "an ally's hold" without a separate neutral check.
  if (areAllied(state, destination.owner, mover)) {
    return { outcome: 'reinforced', movedUnitIds: unitIds, from, to };
  }

  const previousOwner = destination.owner;
  destination.owner = mover;
  return {
    outcome: 'captured',
    movedUnitIds: unitIds,
    from,
    to,
    capturedFrom: previousOwner,
  };
}
