import {
  buildGraph,
  buildSetup,
  createInitialState,
  loadMap,
  type GameState,
  type Graph,
  type MapData,
  type PlayerId,
  type SaveFile,
  type SetupChoices,
} from '@shared/index';
import rawHolds from '@data/maps/holds.json';

export interface Game {
  readonly map: MapData;
  readonly graph: Graph;
  readonly state: GameState;
  /** The player this browser controls. Everyone else is an AI opponent. */
  readonly humanPlayerId: PlayerId;
}

/** Loaded once: the map never changes during a session. */
const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

/** A fresh game from the setup screen's choices. */
export function gameFromChoices(choices: SetupChoices): Game {
  const state = createInitialState(buildSetup(map, choices));
  // buildSetup always makes the human player 0, so there is nothing to search.
  return { map, graph, state, humanPlayerId: 'p0' };
}

/**
 * A game picked up where it was left.
 *
 * The map is rebuilt from holds.json rather than stored in the save: it is
 * static content, and a save that carried its own copy would go on using a
 * stale one after the map was corrected.
 */
export function gameFromSave(save: SaveFile): Game {
  return { map, graph, state: save.state, humanPlayerId: save.humanPlayerId };
}
