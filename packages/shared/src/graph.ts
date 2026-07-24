/**
 * The region graph: loading, validating, and traversing the map.
 *
 * The loader is deliberately strict and reports EVERY problem at once rather
 * than throwing on the first. A malformed map is a content bug, and content
 * bugs are much cheaper to fix when you can see the whole list.
 */

import {
  EDGE_TYPES,
  SIDES,
  TERRAINS,
  UNIT_TYPES,
  type EdgeDef,
  type EdgeType,
  type MapData,
  type RegionDef,
  type RegionId,
  type Terrain,
  type UnitType,
} from './types';

export class MapValidationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid map data:\n  - ${problems.join('\n  - ')}`);
    this.name = 'MapValidationError';
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------
// Passability
// ---------------------------------------------------------------------------

/**
 * Which units may cross which edge type.
 *
 * This is THE rule that gives the map its strategic shape: Wilson Lake splits
 * the realm, the three bridges are the only pinch points land armies can use,
 * and dragons ignore the water entirely.
 */
const PASSABILITY: Readonly<Record<EdgeType, readonly UnitType[]>> = {
  land: UNIT_TYPES,
  bridge: UNIT_TYPES,
  water: ['dragon'],
};

export function passableBy(edgeType: EdgeType, unitType: UnitType): boolean {
  return PASSABILITY[edgeType].includes(unitType);
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export interface Adjacency {
  readonly to: RegionId;
  readonly type: EdgeType;
}

export interface Graph {
  readonly regions: ReadonlyMap<RegionId, RegionDef>;
  readonly adjacency: ReadonlyMap<RegionId, readonly Adjacency[]>;
  readonly edges: readonly EdgeDef[];
}

/** Builds an undirected adjacency index. Assumes `map` already validated. */
export function buildGraph(map: MapData): Graph {
  const regions = new Map<RegionId, RegionDef>();
  for (const region of map.regions) regions.set(region.id, region);

  const adjacency = new Map<RegionId, Adjacency[]>();
  for (const region of map.regions) adjacency.set(region.id, []);

  for (const edge of map.edges) {
    adjacency.get(edge.a)?.push({ to: edge.b, type: edge.type });
    adjacency.get(edge.b)?.push({ to: edge.a, type: edge.type });
  }

  return { regions, adjacency, edges: map.edges };
}

/** Every neighbour of `id`, regardless of unit type. Throws on unknown id. */
export function neighbors(graph: Graph, id: RegionId): readonly Adjacency[] {
  const found = graph.adjacency.get(id);
  if (!found) throw new Error(`Unknown region: ${id}`);
  return found;
}

/** Neighbours a given unit type can actually reach in one step. */
export function neighborsFor(
  graph: Graph,
  id: RegionId,
  unitType: UnitType,
): readonly Adjacency[] {
  return neighbors(graph, id).filter((a) => passableBy(a.type, unitType));
}

/** Whether `unitType` can move directly from `from` to `to`. */
export function canTraverse(
  graph: Graph,
  from: RegionId,
  to: RegionId,
  unitType: UnitType,
): boolean {
  return neighborsFor(graph, from, unitType).some((a) => a.to === to);
}

/**
 * Every region reachable within `maxSteps` moves, excluding the origin.
 * Breadth-first, so a dragon's 2-move range is just maxSteps = 2.
 */
export function reachableFrom(
  graph: Graph,
  from: RegionId,
  unitType: UnitType,
  maxSteps: number,
): ReadonlySet<RegionId> {
  const seen = new Set<RegionId>([from]);
  const reached = new Set<RegionId>();
  let frontier: RegionId[] = [from];

  for (let step = 0; step < maxSteps; step++) {
    const next: RegionId[] = [];
    for (const current of frontier) {
      for (const adjacent of neighborsFor(graph, current, unitType)) {
        if (seen.has(adjacent.to)) continue;
        seen.add(adjacent.to);
        reached.add(adjacent.to);
        next.push(adjacent.to);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return reached;
}

// ---------------------------------------------------------------------------
// Loading & validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Canonical key for an undirected edge, so A–B and B–A collide. */
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Parses and validates raw JSON into MapData.
 * @throws {MapValidationError} listing every problem found.
 */
export function loadMap(raw: unknown): MapData {
  const problems: string[] = [];

  if (!isRecord(raw)) {
    throw new MapValidationError(['map data must be an object']);
  }

  if (!isNonEmptyString(raw['name'])) problems.push('name must be a non-empty string');
  if (!isNonEmptyString(raw['image'])) problems.push('image must be a non-empty string');

  const turnLimit = raw['turnLimit'];
  if (!isFiniteNumber(turnLimit) || !Number.isInteger(turnLimit) || turnLimit < 1) {
    problems.push('turnLimit must be a positive integer');
  }

  // --- regions -------------------------------------------------------------
  const rawRegions = raw['regions'];
  const regions: RegionDef[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(rawRegions) || rawRegions.length === 0) {
    problems.push('regions must be a non-empty array');
  } else {
    rawRegions.forEach((entry, index) => {
      const where = `regions[${index}]`;
      if (!isRecord(entry)) {
        problems.push(`${where} must be an object`);
        return;
      }

      const id = entry['id'];
      if (!isNonEmptyString(id)) {
        problems.push(`${where}.id must be a non-empty string`);
        return; // Without an id nothing else can be reported usefully.
      }
      if (seenIds.has(id)) problems.push(`duplicate region id: ${id}`);
      seenIds.add(id);

      if (!isNonEmptyString(entry['name'])) problems.push(`${id}.name must be a non-empty string`);
      if (!isNonEmptyString(entry['sigil'])) problems.push(`${id}.sigil must be a non-empty string`);

      const terrain = entry['terrain'];
      if (!TERRAINS.includes(terrain as Terrain)) {
        problems.push(`${id}.terrain must be one of ${TERRAINS.join(' | ')}, got ${String(terrain)}`);
      }

      const side = entry['side'];
      if (!SIDES.includes(side as never)) {
        problems.push(`${id}.side must be one of ${SIDES.join(' | ')}, got ${String(side)}`);
      }

      for (const key of ['defenseBonus', 'goldPerTurn'] as const) {
        const value = entry[key];
        if (!isFiniteNumber(value) || value < 0) {
          problems.push(`${id}.${key} must be a number >= 0`);
        }
      }

      const labelPos = entry['labelPos'];
      if (!isRecord(labelPos)) {
        problems.push(`${id}.labelPos must be an object`);
      } else {
        for (const axis of ['x', 'y'] as const) {
          const value = labelPos[axis];
          if (!isFiniteNumber(value) || value < 0 || value > 1) {
            problems.push(`${id}.labelPos.${axis} must be a number between 0 and 1`);
          }
        }
      }

      if (typeof entry['dragonEgg'] !== 'boolean') {
        problems.push(`${id}.dragonEgg must be a boolean`);
      }
      if (!isNonEmptyString(entry['owner'])) {
        problems.push(`${id}.owner must be a non-empty string`);
      }

      regions.push(entry as unknown as RegionDef);
    });
  }

  // --- edges ---------------------------------------------------------------
  const rawEdges = raw['edges'];
  const edges: EdgeDef[] = [];
  const seenEdges = new Set<string>();

  if (!Array.isArray(rawEdges)) {
    problems.push('edges must be an array');
  } else {
    rawEdges.forEach((entry, index) => {
      const where = `edges[${index}]`;
      if (!isRecord(entry)) {
        problems.push(`${where} must be an object`);
        return;
      }

      const a = entry['a'];
      const b = entry['b'];
      const type = entry['type'];

      if (!isNonEmptyString(a) || !isNonEmptyString(b)) {
        problems.push(`${where}.a and .b must be non-empty strings`);
        return;
      }
      if (!seenIds.has(a)) problems.push(`${where} references unknown region: ${a}`);
      if (!seenIds.has(b)) problems.push(`${where} references unknown region: ${b}`);
      if (a === b) problems.push(`${where} connects ${a} to itself`);

      const key = edgeKey(a, b);
      if (seenEdges.has(key)) problems.push(`duplicate edge: ${a} <-> ${b}`);
      seenEdges.add(key);

      if (!EDGE_TYPES.includes(type as EdgeType)) {
        problems.push(`${where}.type must be one of ${EDGE_TYPES.join(' | ')}, got ${String(type)}`);
      }

      edges.push(entry as unknown as EdgeDef);
    });
  }

  // --- structural ----------------------------------------------------------
  // An isolated hold can never be attacked or reinforced, which is always a
  // map authoring mistake rather than an interesting design choice.
  if (problems.length === 0) {
    const connected = new Set<string>();
    for (const edge of edges) {
      connected.add(edge.a);
      connected.add(edge.b);
    }
    for (const id of seenIds) {
      if (!connected.has(id)) problems.push(`region ${id} has no edges — it is unreachable`);
    }
  }

  if (problems.length > 0) throw new MapValidationError(problems);

  return {
    name: raw['name'] as string,
    image: raw['image'] as string,
    lake: typeof raw['lake'] === 'string' ? raw['lake'] : '',
    turnLimit: turnLimit as number,
    regions,
    edges,
  };
}
