import { NEUTRAL, allUnits, removeUnit, type GameState, type RegionId } from '@shared/index';

/**
 * Strips the neutral garrisons off the map.
 *
 * Phase 4 gave every unclaimed hold a garrison, which is right for the game but
 * turns every movement test into a siege. Tests that are about movement, turn
 * order or ownership call this so they exercise the thing they name.
 */
export function clearNeutralGarrisons(state: GameState): void {
  for (const unit of allUnits(state)) {
    if (unit.owner === NEUTRAL) removeUnit(state, unit.id);
  }
}

/** Empties a single hold, whoever is standing in it. */
export function clearHold(state: GameState, regionId: RegionId): void {
  for (const unit of allUnits(state)) {
    if (unit.regionId === regionId) removeUnit(state, unit.id);
  }
}
