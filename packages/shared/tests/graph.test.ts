import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  MapValidationError,
  buildGraph,
  canTraverse,
  loadMap,
  neighbors,
  neighborsFor,
  passableBy,
  reachableFrom,
  type MapData,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';

const map: MapData = loadMap(rawHolds);
const graph = buildGraph(map);

/** A minimal valid map, so each invalid case differs in exactly one way. */
function validRaw(): Record<string, unknown> {
  return {
    name: 'Test',
    image: 'assets/map.png',
    turnLimit: BALANCE.game.turnLimit,
    regions: [
      {
        id: 'a',
        name: 'A',
        sigil: 'rose',
        terrain: 'forest',
        defenseBonus: 1,
        goldPerTurn: 2,
        side: 'north',
        labelPos: { x: 0.1, y: 0.2 },
        owner: 'neutral',
        dragonEgg: true,
      },
      {
        id: 'b',
        name: 'B',
        sigil: 'stag',
        terrain: 'mountains',
        defenseBonus: 3,
        goldPerTurn: 2,
        side: 'south',
        labelPos: { x: 0.3, y: 0.4 },
        owner: 'neutral',
        dragonEgg: true,
      },
    ],
    edges: [{ a: 'a', b: 'b', type: 'land' }],
  };
}

function problemsFrom(raw: unknown): readonly string[] {
  try {
    loadMap(raw);
  } catch (error) {
    if (error instanceof MapValidationError) return error.problems;
    throw error;
  }
  throw new Error('expected loadMap to reject this map');
}

describe('passableBy', () => {
  it('lets every unit use land and bridge edges', () => {
    for (const unit of ['swordsman', 'archer', 'dragon'] as const) {
      expect(passableBy('land', unit)).toBe(true);
      expect(passableBy('bridge', unit)).toBe(true);
    }
  });

  it('lets only dragons cross open water', () => {
    expect(passableBy('water', 'dragon')).toBe(true);
    expect(passableBy('water', 'swordsman')).toBe(false);
    expect(passableBy('water', 'archer')).toBe(false);
  });
});

describe('Wilson Lake Realms map', () => {
  it('loads all ten holds', () => {
    expect(map.regions).toHaveLength(10);
  });

  it('has exactly three bridges and one open-water crossing', () => {
    const byType = (type: string) => map.edges.filter((edge) => edge.type === type);
    expect(byType('bridge').map((e) => [e.a, e.b])).toEqual([
      ['florence', 'sheffield'],
      ['florence', 'muscle_shoals'],
      ['killen', 'ford_city'],
    ]);
    expect(byType('water')).toHaveLength(1);
    expect(map.edges).toHaveLength(17);
  });

  it('gives every hold a dragon egg — exactly ten exist', () => {
    expect(map.regions.filter((region) => region.dragonEgg)).toHaveLength(BALANCE.dragon.total);
  });

  it('includes the muscle_shoals–whiteoak border verified against the art', () => {
    expect(canTraverse(graph, 'muscle_shoals', 'whiteoak', 'swordsman')).toBe(true);
  });

  it('leaves no hold isolated', () => {
    for (const region of map.regions) {
      expect(neighbors(graph, region.id).length).toBeGreaterThan(0);
    }
  });
});

describe('neighbors', () => {
  it('is symmetric — every edge is traversable both ways', () => {
    for (const edge of map.edges) {
      expect(neighbors(graph, edge.a).some((a) => a.to === edge.b)).toBe(true);
      expect(neighbors(graph, edge.b).some((a) => a.to === edge.a)).toBe(true);
    }
  });

  it('returns Florence with both of its bridges', () => {
    const found = neighbors(graph, 'florence');
    expect(found.filter((a) => a.type === 'bridge').map((a) => a.to).sort()).toEqual([
      'muscle_shoals',
      'sheffield',
    ]);
  });

  it('throws on an unknown region', () => {
    expect(() => neighbors(graph, 'winterfell')).toThrow(/Unknown region/);
  });
});

describe('neighborsFor', () => {
  it('hides the water crossing from land units but shows it to dragons', () => {
    const dragonReach = neighborsFor(graph, 'killen', 'dragon').map((a) => a.to);
    const footReach = neighborsFor(graph, 'killen', 'swordsman').map((a) => a.to);

    expect(dragonReach).toContain('muscle_shoals');
    expect(footReach).not.toContain('muscle_shoals');
    // The bridge to Ford City is open to everyone.
    expect(footReach).toContain('ford_city');
  });
});

describe('reachableFrom', () => {
  it('flies a dragon across the lake within its two moves', () => {
    const reach = reachableFrom(graph, 'killen', 'dragon', BALANCE.dragon.move);
    expect(reach.has('muscle_shoals')).toBe(true);
    // Two steps: killen -> muscle_shoals -> littleville.
    expect(reach.has('littleville')).toBe(true);
  });

  it('keeps a swordsman north of the lake without a bridge', () => {
    const reach = reachableFrom(graph, 'bailey_springs', 'swordsman', 1);
    expect([...reach].sort()).toEqual(['florence', 'killen', 'underwood_petersville']);
  });

  it('excludes the origin', () => {
    expect(reachableFrom(graph, 'florence', 'dragon', 3).has('florence')).toBe(false);
  });

  it('returns nothing for zero moves', () => {
    expect(reachableFrom(graph, 'florence', 'dragon', 0).size).toBe(0);
  });
});

describe('loadMap validation', () => {
  it('accepts the shipped map', () => {
    expect(() => loadMap(rawHolds)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => loadMap('nope')).toThrow(MapValidationError);
    expect(() => loadMap(null)).toThrow(MapValidationError);
  });

  it('rejects duplicate region ids', () => {
    const raw = validRaw();
    (raw['regions'] as unknown[]).push({ ...(raw['regions'] as unknown[])[0] as object });
    expect(problemsFrom(raw)).toContain('duplicate region id: a');
  });

  it('rejects an edge referencing an unknown region', () => {
    const raw = validRaw();
    raw['edges'] = [{ a: 'a', b: 'nowhere', type: 'land' }];
    expect(problemsFrom(raw).some((p) => p.includes('unknown region: nowhere'))).toBe(true);
  });

  it('rejects an unknown terrain', () => {
    const raw = validRaw();
    ((raw['regions'] as Record<string, unknown>[])[0] as Record<string, unknown>)['terrain'] = 'swamp';
    expect(problemsFrom(raw).some((p) => p.includes('terrain must be one of'))).toBe(true);
  });

  it('rejects an unknown edge type', () => {
    const raw = validRaw();
    raw['edges'] = [{ a: 'a', b: 'b', type: 'tunnel' }];
    expect(problemsFrom(raw).some((p) => p.includes('type must be one of'))).toBe(true);
  });

  it('rejects a self-connecting edge', () => {
    const raw = validRaw();
    raw['edges'] = [{ a: 'a', b: 'a', type: 'land' }];
    expect(problemsFrom(raw).some((p) => p.includes('connects a to itself'))).toBe(true);
  });

  it('rejects a duplicate edge regardless of direction', () => {
    const raw = validRaw();
    raw['edges'] = [
      { a: 'a', b: 'b', type: 'land' },
      { a: 'b', b: 'a', type: 'bridge' },
    ];
    expect(problemsFrom(raw).some((p) => p.includes('duplicate edge'))).toBe(true);
  });

  it('rejects a labelPos outside the image', () => {
    const raw = validRaw();
    ((raw['regions'] as Record<string, unknown>[])[0] as Record<string, unknown>)['labelPos'] = {
      x: 1.5,
      y: -0.2,
    };
    const problems = problemsFrom(raw);
    expect(problems.some((p) => p.includes('labelPos.x'))).toBe(true);
    expect(problems.some((p) => p.includes('labelPos.y'))).toBe(true);
  });

  it('rejects an isolated region', () => {
    const raw = validRaw();
    (raw['regions'] as unknown[]).push({
      ...((raw['regions'] as Record<string, unknown>[])[0] as object),
      id: 'lonely',
    });
    expect(problemsFrom(raw).some((p) => p.includes('lonely has no edges'))).toBe(true);
  });

  it('rejects a non-positive turnLimit', () => {
    const raw = validRaw();
    raw['turnLimit'] = 0;
    expect(problemsFrom(raw)).toContain('turnLimit must be a positive integer');
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const raw = validRaw();
    raw['name'] = '';
    raw['turnLimit'] = -1;
    raw['edges'] = [{ a: 'a', b: 'ghost', type: 'land' }];
    expect(problemsFrom(raw).length).toBeGreaterThanOrEqual(3);
  });
});
