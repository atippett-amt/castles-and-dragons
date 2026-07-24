/**
 * Defensive structures and the damage-reduction maths they feed.
 *
 * Each defence answers a different threat: Ramparts blunt melee, Watchtowers
 * punish stacks as they arrive, and Scorpions are the only reliable answer to a
 * dragon. Phase 4's combat reads all of it; nothing here knows about battles.
 */

import { BALANCE } from './balance';
import { DEFENSE_TYPES, type DefenseType, type RegionState } from './types';

export function defenseCost(type: DefenseType): number {
  return BALANCE.cost[type];
}

export function defenseCap(type: DefenseType): number {
  return BALANCE[type].cap;
}

export function defenseCount(region: RegionState, type: DefenseType): number {
  return region.defenses[type];
}

/** A fresh, undefended hold. */
export function emptyDefenses(): Record<DefenseType, number> {
  return { ramparts: 0, watchtower: 0, scorpion: 0 };
}

export function isAtCap(region: RegionState, type: DefenseType): boolean {
  return defenseCount(region, type) >= defenseCap(type);
}

export function addDefense(region: RegionState, type: DefenseType): void {
  region.defenses[type] += 1;
}

/**
 * Levelled on capture — a hold's works are wrecked when it changes hands, so
 * taking a fortress does not hand you the fortress.
 */
export function razeDefenses(region: RegionState): void {
  for (const type of DEFENSE_TYPES) region.defenses[type] = 0;
}

/**
 * A hold's defence rating: its terrain bonus plus its ramparts.
 * `terrainDefenseBonus` comes from the map (holds.json), not from state.
 */
export function defenseRating(region: RegionState, terrainDefenseBonus: number): number {
  return terrainDefenseBonus + region.defenses.ramparts * BALANCE.ramparts.defensePoints;
}

/**
 * The fraction of incoming damage a defender shrugs off, capped so no hold
 * becomes untakeable. Mountains (3) with two ramparts (+4) gives 7 → 42%.
 */
export function damageReduction(rating: number): number {
  return Math.min(BALANCE.defense.maxReduction, rating * BALANCE.defense.reductionPerPoint);
}

/** Damage dealt at the very start of a siege, before any melee. */
export function watchtowerVolley(region: RegionState): number {
  return region.defenses.watchtower * BALANCE.watchtower.volley;
}

/** Scorpion damage per melee round, aimed at the strongest attacking dragon. */
export function scorpionDamage(region: RegionState, dragonPresent: boolean): number {
  const perScorpion = dragonPresent
    ? BALANCE.scorpion.vsDragonPerRound
    : BALANCE.scorpion.vsOtherPerRound;
  return region.defenses.scorpion * perScorpion;
}
