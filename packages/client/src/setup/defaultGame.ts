import {
  buildGraph,
  createInitialState,
  loadMap,
  type GameState,
  type Graph,
  type MapData,
  type PlayerId,
  type PlayerSetup,
  type TeamSetup,
} from '@shared/index';
import rawHolds from '@data/maps/holds.json';

export interface Game {
  readonly map: MapData;
  readonly graph: Graph;
  readonly state: GameState;
  /** The player this browser controls. Everyone else is an AI opponent. */
  readonly humanPlayerId: PlayerId;
}

/**
 * A free-for-all: you against three AI, nobody allied with anybody.
 *
 * Each player is a team of one, so you are never handed someone else's holds
 * to steer and the three AI do not gang up on you. Starting holds are pinned
 * to the four corners of the map, which leaves the bridges and both water
 * crossings as contested ground between them.
 *
 * Phase 8 replaces this with the real setup screen — side, AI count, and the
 * North-vs-South / 4v4 / 3v3 presets. Until then this exists so there is a
 * concrete game to play.
 */
// Named for their sigils rather than their holds, so the detail panel never
// shows a hold and its owner with the same word.
const PLAYERS: readonly PlayerSetup[] = [
  { id: 'p0', name: 'You', teamId: 'you', isAI: false, startRegion: 'underwood_petersville' },
  { id: 'p1', name: 'House Sword', teamId: 'sword', isAI: true, startRegion: 'killen' },
  { id: 'p2', name: 'House Fish', teamId: 'fish', isAI: true, startRegion: 'sheffield' },
  { id: 'p3', name: 'House Oak', teamId: 'oak', isAI: true, startRegion: 'whiteoak' },
];

const TEAMS: readonly TeamSetup[] = PLAYERS.map((player) => ({
  id: player.teamId,
  name: player.name,
}));

export function createDefaultGame(): Game {
  const map = loadMap(rawHolds);
  const graph = buildGraph(map);
  const state = createInitialState({ map, players: PLAYERS, teams: TEAMS });
  return { map, graph, state, humanPlayerId: 'p0' };
}
