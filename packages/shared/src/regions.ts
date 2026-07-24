import type { GameState, Owner, RegionId, RegionState } from './types';

/**
 * Reads a region out of state, failing loudly on a bad id.
 *
 * Worth having because `noUncheckedIndexedAccess` makes every lookup return
 * `RegionState | undefined`, and silently propagating an undefined here would
 * surface much later as a confusing render or combat bug.
 */
export function getRegion(state: GameState, id: RegionId): RegionState {
  const region = state.regions[id];
  if (!region) throw new Error(`Unknown region: ${id}`);
  return region;
}

export function allRegions(state: GameState): readonly RegionState[] {
  return Object.values(state.regions);
}

export function regionsOwnedBy(state: GameState, owner: Owner): readonly RegionState[] {
  return allRegions(state).filter((region) => region.owner === owner);
}
