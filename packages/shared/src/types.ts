/**
 * Core domain types — pure data, no behaviour, no platform APIs.
 *
 * A deliberate split runs through this file:
 *   *Def types  describe the MAP (static, loaded from holds.json, never mutated)
 *   *State types describe the GAME (mutable, serialized, sent over the wire)
 *
 * Keeping them apart means a saved game stores only what actually changes, and
 * Stage B can ship a small snapshot instead of re-transmitting the whole map.
 */

export type RegionId = string;
export type PlayerId = string;
export type TeamId = string;
export type UnitId = string;

/** Sentinel owner for a hold nobody controls. */
export const NEUTRAL = 'neutral';
export type Neutral = typeof NEUTRAL;
export type Owner = PlayerId | Neutral;

export const TERRAINS = ['mountains', 'forest', 'lakeshore'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const EDGE_TYPES = ['land', 'bridge', 'water'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const UNIT_TYPES = ['swordsman', 'archer', 'dragon'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const SIDES = ['north', 'south'] as const;
export type Side = (typeof SIDES)[number];

/** Units are recruited with Gold; dragons are not — they hatch from eggs. */
export const RECRUITABLE_TYPES = ['swordsman', 'archer'] as const;
export type RecruitableType = (typeof RECRUITABLE_TYPES)[number];

export const DEFENSE_TYPES = ['ramparts', 'watchtower', 'scorpion'] as const;
export type DefenseType = (typeof DEFENSE_TYPES)[number];

/** Normalized (0–1) position for placing a hold's banner over the map image. */
export interface LabelPos {
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Map definition (static)
// ---------------------------------------------------------------------------

export interface RegionDef {
  readonly id: RegionId;
  readonly name: string;
  readonly sigil: string;
  readonly terrain: Terrain;
  readonly defenseBonus: number;
  readonly goldPerTurn: number;
  readonly side: Side;
  readonly labelPos: LabelPos;
  /** Start-assignment hint from the map file: 'neutral' or 'slot:N'. */
  readonly owner: string;
  readonly dragonEgg: boolean;
}

export interface EdgeDef {
  readonly a: RegionId;
  readonly b: RegionId;
  readonly type: EdgeType;
}

export interface MapData {
  readonly name: string;
  /** Path to the map art, relative to the client's served root. */
  readonly image: string;
  readonly lake: string;
  readonly turnLimit: number;
  readonly regions: readonly RegionDef[];
  readonly edges: readonly EdgeDef[];
}

// ---------------------------------------------------------------------------
// Game state (mutable, serializable)
// ---------------------------------------------------------------------------

/** Everything about a hold that can change during a game. */
export interface RegionState {
  readonly id: RegionId;
  owner: Owner;
  /** An egg that has not hatched yet. Cleared at the turn-5 hatch (Phase 5). */
  hasEgg: boolean;
  /** Structures built here. Destroyed when the hold is captured. */
  readonly defenses: Record<DefenseType, number>;
  /**
   * Build actions spent this turn. Reset at the owning team's turn start.
   * A hold gets `BALANCE.economy.buildsPerHoldPerTurn` of them, and recruiting
   * competes with fortifying for the same allowance — that tradeoff is the
   * point, so they deliberately share one counter.
   */
  buildsUsed: number;
}

/**
 * A single fighting unit. Stacks are implicit: every unit standing in the same
 * region fights together, so there is no separate "army" entity to keep in sync.
 */
export interface Unit {
  readonly id: UnitId;
  readonly type: UnitType;
  owner: PlayerId;
  regionId: RegionId;
  hp: number;
  /** Steps remaining this turn. Refreshed at the owning team's turn start. */
  movesLeft: number;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId;
  readonly isAI: boolean;
  gold: number;
}

export interface Team {
  readonly id: TeamId;
  readonly name: string;
}

/** Seeded PRNG state. Lives in GameState so battles replay identically. */
export interface RngState {
  s: number;
}

export interface GameState {
  /** Advances 1 → turnLimit. */
  turn: number;
  readonly turnLimit: number;
  readonly mapName: string;
  readonly regions: Record<RegionId, RegionState>;
  readonly units: Record<UnitId, Unit>;
  /** Monotonic counter so unit ids are deterministic and replay-stable. */
  nextUnitId: number;
  readonly players: readonly Player[];
  readonly teams: readonly Team[];
  /** Index into `teams` — whose turn it is. Team-sequential play. */
  activeTeamIndex: number;
  readonly rng: RngState;
}
