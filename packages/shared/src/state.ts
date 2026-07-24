/**
 * Building the initial GameState.
 *
 * State is player- and team-aware from Phase 1 even in single-player, so co-op
 * in Stage B is an extension rather than a retrofit. A solo game is simply a
 * team of one.
 */

import { BALANCE } from './balance';
import { emptyDefenses } from './defense';
import { buildGraph } from './graph';
import { createRng } from './rng';
import { beginTeamTurn } from './turn';
import { spawnUnit } from './units';
import {
  NEUTRAL,
  type GameState,
  type MapData,
  type Player,
  type PlayerId,
  type RegionId,
  type RegionState,
  type Team,
  type TeamId,
  type Unit,
  type UnitId,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Fixed default so an unseeded game is still reproducible. */
export const DEFAULT_SEED = 1337;

export interface PlayerSetup {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId;
  readonly isAI: boolean;
  /** Explicit starting hold. Auto-assigned when omitted. */
  readonly startRegion?: RegionId;
}

export interface TeamSetup {
  readonly id: TeamId;
  readonly name: string;
}

export interface CreateStateOptions {
  readonly map: MapData;
  readonly players: readonly PlayerSetup[];
  readonly teams: readonly TeamSetup[];
  readonly seed?: number;
}

/**
 * Picks each player's starting hold.
 *
 * Precedence: an explicit `startRegion`, then the map's own `slot:N` hint, then
 * the first unclaimed hold in map order. Every branch is deterministic — the
 * same setup must always produce the same board, or saved games and Stage B
 * snapshots stop matching.
 */
function assignStartingHolds(
  map: MapData,
  players: readonly PlayerSetup[],
): Map<PlayerId, RegionId> {
  const assignments = new Map<PlayerId, RegionId>();
  const claimed = new Set<RegionId>();

  for (const player of players) {
    if (player.startRegion === undefined) continue;
    assignments.set(player.id, player.startRegion);
    claimed.add(player.startRegion);
  }

  players.forEach((player, index) => {
    if (assignments.has(player.id)) return;

    const hinted = map.regions.find(
      (region) => region.owner === `slot:${index}` && !claimed.has(region.id),
    );
    const fallback = map.regions.find((region) => !claimed.has(region.id));
    const chosen = hinted ?? fallback;

    if (!chosen) throw new Error('Ran out of holds while assigning starting positions');
    assignments.set(player.id, chosen.id);
    claimed.add(chosen.id);
  });

  return assignments;
}

function validate(options: CreateStateOptions): void {
  const { map, players, teams } = options;
  const problems: string[] = [];

  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    problems.push(`player count must be ${MIN_PLAYERS}–${MAX_PLAYERS}, got ${players.length}`);
  }
  if (teams.length === 0) problems.push('at least one team is required');

  const playerIds = new Set<PlayerId>();
  for (const player of players) {
    if (playerIds.has(player.id)) problems.push(`duplicate player id: ${player.id}`);
    playerIds.add(player.id);
  }

  const teamIds = new Set<TeamId>();
  for (const team of teams) {
    if (teamIds.has(team.id)) problems.push(`duplicate team id: ${team.id}`);
    teamIds.add(team.id);
  }

  for (const player of players) {
    if (!teamIds.has(player.teamId)) {
      problems.push(`player ${player.id} references unknown team ${player.teamId}`);
    }
  }
  for (const team of teams) {
    if (!players.some((player) => player.teamId === team.id)) {
      problems.push(`team ${team.id} has no players`);
    }
  }

  // "Enough non-neutral start slots for the player count."
  if (players.length > map.regions.length) {
    problems.push(
      `map has ${map.regions.length} holds but ${players.length} players need a starting hold`,
    );
  }

  const regionIds = new Set(map.regions.map((region) => region.id));
  const requested = new Set<RegionId>();
  for (const player of players) {
    const start = player.startRegion;
    if (start === undefined) continue;
    if (!regionIds.has(start)) {
      problems.push(`player ${player.id} starts in unknown region ${start}`);
    }
    if (requested.has(start)) {
      problems.push(`two players both start in ${start}`);
    }
    requested.add(start);
  }

  // A mismatch here would silently desynchronise the dragon growth curve, which
  // interpolates against BALANCE.game.turnLimit.
  if (map.turnLimit !== BALANCE.game.turnLimit) {
    problems.push(
      `map turnLimit (${map.turnLimit}) disagrees with BALANCE.game.turnLimit (${BALANCE.game.turnLimit})`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Cannot create game state:\n  - ${problems.join('\n  - ')}`);
  }
}

export function createInitialState(options: CreateStateOptions): GameState {
  validate(options);

  const { map, players, teams, seed = DEFAULT_SEED } = options;
  const starts = assignStartingHolds(map, players);
  const ownerByRegion = new Map<RegionId, string>();
  for (const [playerId, regionId] of starts) ownerByRegion.set(regionId, playerId);

  const regions: Record<RegionId, RegionState> = {};
  for (const region of map.regions) {
    regions[region.id] = {
      id: region.id,
      owner: ownerByRegion.get(region.id) ?? NEUTRAL,
      // Every hold starts with an egg; they all hatch on turn 5 (Phase 5).
      hasEgg: region.dragonEgg,
      defenses: emptyDefenses(),
      buildsUsed: 0,
    };
  }

  const state: GameState = {
    turn: 1,
    turnLimit: BALANCE.game.turnLimit,
    mapName: map.name,
    regions,
    units: {} as Record<UnitId, Unit>,
    nextUnitId: 1,
    players: players.map(
      (player): Player => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        isAI: player.isAI,
        gold: BALANCE.economy.startingGold,
      }),
    ),
    teams: teams.map((team): Team => ({ id: team.id, name: team.name })),
    activeTeamIndex: 0,
    rng: createRng(seed),
  };

  // Starting garrisons. Spawned in player order so unit ids stay deterministic,
  // which keeps saves and Stage B snapshots comparable.
  for (const player of players) {
    const home = starts.get(player.id);
    if (home === undefined) continue;
    for (let i = 0; i < BALANCE.start.swordsmen; i++) spawnUnit(state, 'swordsman', player.id, home);
    for (let i = 0; i < BALANCE.start.archers; i++) spawnUnit(state, 'archer', player.id, home);
  }

  // Open the first team's turn properly rather than treating turn 1 as a
  // special case: they collect income and start with a full build allowance,
  // exactly as every later turn does.
  beginTeamTurn(state, buildGraph(map), state.teams[0]?.id ?? '');

  return state;
}
