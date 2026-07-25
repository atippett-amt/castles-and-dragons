/**
 * Dragons: hatching and growth.
 *
 * Exactly ten exist for the whole game — one egg per hold — and after turn 5
 * none are ever created. They only change hands, by conquest. That scarcity is
 * what makes claim-on-capture the decisive swing it is meant to be.
 */

import { BALANCE, dragonStat } from './balance';
import { allRegions } from './regions';
import { allUnits, spawnUnit } from './units';
import type { GameState, Owner, RegionId, UnitId } from './types';

export interface Hatching {
  readonly regionId: RegionId;
  readonly owner: Owner;
  readonly unitId: UnitId;
}

/** Whether the turn counter has reached the hatch. */
export function eggsAreDue(state: GameState): boolean {
  return state.turn >= BALANCE.dragon.hatchTurn;
}

export function unhatchedEggCount(state: GameState): number {
  return allRegions(state).filter((region) => region.hasEgg).length;
}

/**
 * Hatches every remaining egg, each into a dragon belonging to whoever holds
 * that region right now.
 *
 * Neutral holds hatch too — their dragons defend in place and are claimed by
 * whoever takes the hold. Because ownership is read at the moment of hatching,
 * an egg captured before turn 5 hatches for its new owner, which makes an early
 * land grab a bet on future dragons rather than just on income.
 *
 * Safe to call repeatedly: eggs are cleared as they hatch.
 */
export function hatchEggs(state: GameState): readonly Hatching[] {
  if (!eggsAreDue(state)) return [];

  const hatchings: Hatching[] = [];
  for (const region of allRegions(state)) {
    if (!region.hasEgg) continue;
    region.hasEgg = false;
    const dragon = spawnUnit(state, 'dragon', region.owner, region.id);
    hatchings.push({ regionId: region.id, owner: region.owner, unitId: dragon.id });
  }
  return hatchings;
}

/**
 * Rescales living dragons onto the current turn's curve.
 *
 * The plan asks for dragon stats to be "a function of the current turn, no
 * per-turn bookkeeping". Attack is exactly that — combat reads it fresh from
 * unitProfile every time. Hit points cannot be, because a dragon carries wounds
 * between battles, so they are stored.
 *
 * The reconciliation: a dragon keeps its DAMAGE FRACTION across the growth. One
 * sitting at half health on turn 5 (30/60) is still at half on turn 50
 * (110/220). It is not healing — a bigger dragon simply has bigger wounds — and
 * a dragon that has taken no damage always sits exactly on the curve.
 */
export function growDragons(state: GameState, fromTurn: number, toTurn: number): void {
  const before = dragonStat(fromTurn).hp;
  const after = dragonStat(toTurn).hp;
  if (before === after || before <= 0) return;

  for (const unit of allUnits(state)) {
    if (unit.type !== 'dragon') continue;
    const fraction = Math.min(1, unit.hp / before);
    // Never rescale a living dragon down to nothing.
    unit.hp = Math.max(1, Math.round(after * fraction));
  }
}

/** How many dragons are alive, and who holds them. */
export function dragonCensus(state: GameState): ReadonlyMap<Owner, number> {
  const census = new Map<Owner, number>();
  for (const unit of allUnits(state)) {
    if (unit.type !== 'dragon') continue;
    census.set(unit.owner, (census.get(unit.owner) ?? 0) + 1);
  }
  return census;
}
