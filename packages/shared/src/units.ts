/**
 * Units and stacks: creation, queries and per-turn bookkeeping.
 *
 * Stacks are implicit: every unit standing in a region fights together, so
 * there is no separate "army" entity that could drift out of sync with the
 * units it claims to contain.
 *
 * Movement orders live in orders.ts and sieges in combat.ts. Keeping those out
 * of here is what stops combat.ts (which needs unit stats) and movement (which
 * needs combat) from importing each other in a circle.
 */

import { BALANCE, dragonStat } from './balance';
import { areAllied } from './players';
import {
  type GameState,
  type Owner,
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

export function unitsOf(state: GameState, owner: Owner): readonly Unit[] {
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
  owner: Owner,
): readonly Unit[] {
  return unitsIn(state, regionId).filter((unit) => !areAllied(state, unit.owner, owner));
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export function spawnUnit(
  state: GameState,
  type: UnitType,
  owner: Owner,
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


