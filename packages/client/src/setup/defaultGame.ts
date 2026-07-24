import {
  buildGraph,
  createInitialState,
  loadMap,
  type GameState,
  type Graph,
  type MapData,
  type PlayerSetup,
  type TeamSetup,
} from '@shared/index';
import rawHolds from '@data/maps/holds.json';

export interface Game {
  readonly map: MapData;
  readonly graph: Graph;
  readonly state: GameState;
}

const TEAMS: readonly TeamSetup[] = [
  { id: 'north', name: 'The North' },
  { id: 'south', name: 'The South' },
];

/**
 * A North-vs-South opener across the lake, two players a side.
 *
 * Starting holds are pinned rather than auto-assigned so each team begins on
 * its own shore and the three bridges are genuinely contested. Phase 8 replaces
 * this with the real setup screen (side, AI count, presets, difficulty); until
 * then it exists so there is something concrete to render and click.
 */
// Named for their sigils rather than their holds, so the detail panel never
// shows a hold and its owner with the same word.
const PLAYERS: readonly PlayerSetup[] = [
  { id: 'p0', name: 'You', teamId: 'north', isAI: false, startRegion: 'underwood_petersville' },
  { id: 'p1', name: 'House Sword', teamId: 'north', isAI: true, startRegion: 'killen' },
  { id: 'p2', name: 'House Fish', teamId: 'south', isAI: true, startRegion: 'sheffield' },
  { id: 'p3', name: 'House Oak', teamId: 'south', isAI: true, startRegion: 'whiteoak' },
];

export function createDefaultGame(): Game {
  const map = loadMap(rawHolds);
  const graph = buildGraph(map);
  const state = createInitialState({ map, players: PLAYERS, teams: TEAMS });
  return { map, graph, state };
}
