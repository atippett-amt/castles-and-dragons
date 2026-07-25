import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  addDefense,
  buildGraph,
  createInitialState,
  getRegion,
  loadMap,
  resolveSiege,
  spawnUnit,
  unitsIn,
  type BattleReport,
  type DefenseType,
  type GameState,
  type Graph,
  type MapData,
  type RegionId,
  type UnitType,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';
import { clearNeutralGarrisons, clearHold } from './helpers';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

/** Bailey Springs is plain forest (defenseBonus 1) — a neutral testing ground. */
const FIELD: RegionId = 'bailey_springs';
/** Underwood-Petersville is mountains (defenseBonus 3), for terrain tests. */
const MOUNTAIN: RegionId = 'underwood_petersville';

interface Scenario {
  readonly state: GameState;
  readonly attackerIds: readonly string[];
}

/**
 * Builds a controlled siege: an emptied hold, a defending force, an attacking
 * force, and any defences. Calls resolveSiege directly rather than going
 * through moveUnits, so adjacency and movement stay out of the way.
 */
function siege(options: {
  attackers: readonly UnitType[];
  defenders: readonly UnitType[];
  defenses?: Partial<Record<DefenseType, number>>;
  at?: RegionId;
  seed?: number;
  turn?: number;
}): Scenario {
  const at = options.at ?? FIELD;
  const state = createInitialState({
    map,
    players: [
      { id: 'atk', name: 'Attacker', teamId: 'a', isAI: false, startRegion: 'florence' },
      { id: 'def', name: 'Defender', teamId: 'd', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'a', name: 'A' },
      { id: 'd', name: 'D' },
    ],
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  });

  clearNeutralGarrisons(state);
  clearHold(state, 'florence');
  clearHold(state, at);
  if (options.turn !== undefined) state.turn = options.turn;

  const region = getRegion(state, at);
  region.owner = 'def';
  for (const [type, count] of Object.entries(options.defenses ?? {})) {
    for (let i = 0; i < (count ?? 0); i++) addDefense(region, type as DefenseType);
  }

  for (const type of options.defenders) spawnUnit(state, type, 'def', at);
  const attackerIds = options.attackers.map((type) => spawnUnit(state, type, 'atk', 'florence').id);

  return { state, attackerIds };
}

function fight(scenario: Scenario, at: RegionId = FIELD): BattleReport {
  return resolveSiege(scenario.state, graph, scenario.attackerIds, at, 'atk');
}

describe('siege resolution', () => {
  it('takes an undefended-once-broken hold and flips ownership', () => {
    const scenario = siege({ attackers: Array(6).fill('swordsman'), defenders: ['swordsman'] });
    const report = fight(scenario);

    expect(report.outcome).toBe('captured');
    expect(getRegion(scenario.state, FIELD).owner).toBe('atk');
  });

  it('leaves the hold alone when the attack is thrown back', () => {
    const scenario = siege({ attackers: ['archer'], defenders: Array(4).fill('swordsman') });
    const report = fight(scenario);

    expect(report.outcome).toBe('repelled');
    expect(getRegion(scenario.state, FIELD).owner).toBe('def');
  });

  it('marches the survivors in and charges them a move', () => {
    const scenario = siege({ attackers: Array(6).fill('swordsman'), defenders: ['archer'] });
    const report = fight(scenario);

    expect(report.outcome).toBe('captured');
    expect(report.survivingAttackerIds.length).toBeGreaterThan(0);
    for (const id of report.survivingAttackerIds) {
      const unit = scenario.state.units[id]!;
      expect(unit.regionId).toBe(FIELD);
      expect(unit.movesLeft).toBe(0);
    }
  });

  it('razes the defences of a hold it takes', () => {
    const scenario = siege({
      attackers: Array(8).fill('swordsman'),
      defenders: ['swordsman'],
      defenses: { ramparts: 2, watchtower: 1 },
    });
    fight(scenario);

    expect(getRegion(scenario.state, FIELD).defenses).toEqual({
      ramparts: 0,
      watchtower: 0,
      scorpion: 0,
    });
  });

  it('leaves the defences standing when the attack fails', () => {
    const scenario = siege({
      attackers: ['archer'],
      defenders: Array(4).fill('swordsman'),
      defenses: { ramparts: 2 },
    });
    fight(scenario);

    expect(getRegion(scenario.state, FIELD).defenses.ramparts).toBe(2);
  });
});

describe('resolution order', () => {
  it('fires the archer volley before any melee', () => {
    // Two attacking archers volley 24 into a lone 15hp defending archer, so the
    // garrison breaks before a single melee round is needed.
    const scenario = siege({ attackers: ['archer', 'archer'], defenders: ['archer'] });
    const report = fight(scenario);

    expect(report.outcome).toBe('captured');
    expect(report.rounds).toBe(0);
    expect(report.defenderLosses).toHaveLength(1);
  });

  it('fires watchtowers before the attackers can loose', () => {
    // Two watchtowers put 30 into the stack before anything else happens, which
    // kills a lone 15hp archer outright — so the defenders take no damage at all.
    const scenario = siege({
      attackers: ['archer'],
      defenders: ['swordsman'],
      defenses: { watchtower: 2 },
    });
    const report = fight(scenario);

    expect(report.outcome).toBe('repelled');
    expect(report.attackerLosses).toHaveLength(1);
    expect(unitsIn(scenario.state, FIELD)[0]!.hp).toBe(BALANCE.swordsman.hp);
  });
});

describe('dragons', () => {
  it('claims a defending dragon that outlives its garrison', () => {
    const scenario = siege({ attackers: Array(5).fill('swordsman'), defenders: ['archer', 'dragon'] });
    const report = fight(scenario);

    expect(report.outcome).toBe('captured');
    expect(report.claimedDragonIds).toHaveLength(1);

    const dragon = scenario.state.units[report.claimedDragonIds[0]!]!;
    expect(dragon.owner).toBe('atk');
    expect(dragon.regionId).toBe(FIELD);
    expect(dragon.hp).toBeGreaterThan(0);
    // The prize does not fly on the turn it changes hands.
    expect(dragon.movesLeft).toBe(0);
  });

  it('kills the infantry before it touches the dragon', () => {
    const scenario = siege({
      attackers: Array(5).fill('swordsman'),
      defenders: ['archer', 'swordsman', 'dragon'],
    });
    const report = fight(scenario);

    // Both foot units are gone; the dragon is alive and claimed.
    expect(report.defenderLosses).toHaveLength(2);
    expect(report.claimedDragonIds).toHaveLength(1);
  });

  it('makes a lone dragon fight for its hold rather than be handed over', () => {
    const weak = siege({ attackers: ['archer'], defenders: ['dragon'] });
    const repelled = fight(weak);

    expect(repelled.outcome).toBe('repelled');
    expect(repelled.claimedDragonIds).toHaveLength(0);
    expect(getRegion(weak.state, FIELD).owner).toBe('def');
  });

  it('destroys a lone dragon only by beating it outright', () => {
    const overwhelming = siege({ attackers: Array(12).fill('swordsman'), defenders: ['dragon'] });
    const report = fight(overwhelming);

    expect(report.outcome).toBe('captured');
    // Beaten down rather than captured: a dragons-only garrison is the garrison.
    expect(report.claimedDragonIds).toHaveLength(0);
    expect(report.defenderLosses).toHaveLength(1);
  });

  it('grows deadlier as the game runs on', () => {
    const early = fight(siege({ attackers: ['dragon'], defenders: Array(3).fill('swordsman'), turn: 5 }));
    const late = fight(siege({ attackers: ['dragon'], defenders: Array(3).fill('swordsman'), turn: 100 }));

    expect(early.outcome).toBe('repelled');
    expect(late.outcome).toBe('captured');
  });
});

describe('scorpions', () => {
  it('shred an attacking dragon in the opening fire', () => {
    // Three scorpions land 120 on a freshly hatched 60hp dragon before melee.
    const scenario = siege({
      attackers: ['dragon'],
      defenders: ['swordsman'],
      defenses: { scorpion: BALANCE.scorpion.cap },
      turn: BALANCE.dragon.hatchTurn,
    });
    const report = fight(scenario);

    expect(report.outcome).toBe('repelled');
    expect(report.attackerLosses).toHaveLength(1);
  });

  it('stop a dragon that an equal weight of infantry walks through', () => {
    // At hatch a dragon is worth roughly two swordsmen (60hp/15atk vs 60hp/20atk).
    // ONE scorpion — 40 a round at a dragon, 5 at anything else — kills the
    // dragon and is shrugged off by the infantry. Note this uses a single
    // scorpion deliberately: a full battery of three lands 15 a round even on
    // foot soldiers, which is half a swordsman per round and far from harmless.
    const defenses = { scorpion: 1 };
    const byDragon = fight(
      siege({ attackers: ['dragon'], defenders: ['archer'], defenses, turn: 5, seed: 7 }),
    );
    const byInfantry = fight(
      siege({
        attackers: ['swordsman', 'swordsman'],
        defenders: ['archer'],
        defenses,
        turn: 5,
        seed: 7,
      }),
    );

    expect(byDragon.outcome).toBe('repelled');
    expect(byInfantry.outcome).toBe('captured');
  });

  it('answer even a maxed dragon, given a garrison that can hold the wall', () => {
    // Scorpions need four rounds to chew through 400hp. The garrison has to
    // survive that long, so the arms race is scorpions AND bodies, not either.
    const scenario = siege({
      attackers: ['dragon'],
      defenders: Array(10).fill('swordsman'),
      defenses: { scorpion: BALANCE.scorpion.cap, ramparts: BALANCE.ramparts.cap },
      turn: BALANCE.game.turnLimit,
    });
    const report = fight(scenario);

    expect(report.outcome).toBe('repelled');
    expect(report.attackerLosses).toHaveLength(1);
  });
});

describe('defence reduction', () => {
  it('turns an even fight into a defensive win', () => {
    // Measured as hold rate, not battle length: a fortified garrison wins
    // FASTER, because it survives to finish the attackers off. Counting rounds
    // would have suggested ramparts hurt. Averaged over seeds, since a single
    // battle swings on the ±10% variance.
    const holdRate = (defenses: Partial<Record<DefenseType, number>>, at: RegionId): number => {
      let held = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const report = fight(
          siege({
            attackers: Array(4).fill('swordsman'),
            defenders: Array(3).fill('swordsman'),
            defenses,
            at,
            seed,
          }),
          at,
        );
        if (report.outcome === 'repelled') held += 1;
      }
      return held / 25;
    };

    const bare = holdRate({}, FIELD);
    const fortified = holdRate({ ramparts: BALANCE.ramparts.cap }, MOUNTAIN);

    expect(fortified).toBeGreaterThan(bare);
  });
});

describe('hit points stay whole', () => {
  it('never leaves a unit on a fractional hit point', () => {
    // The variance multiplier and the defence reduction are both fractions, so
    // unrounded damage put units on 73.99799986699969 hp — which reached the UI.
    for (let seed = 1; seed <= 20; seed++) {
      const scenario = siege({
        attackers: Array(3).fill('swordsman'),
        defenders: ['archer', 'swordsman', 'dragon'],
        defenses: { ramparts: 2, watchtower: 1, scorpion: 1 },
        at: MOUNTAIN,
        seed,
      });
      fight(scenario, MOUNTAIN);

      for (const unit of Object.values(scenario.state.units)) {
        expect(Number.isInteger(unit.hp)).toBe(true);
      }
    }
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const build = () =>
      siege({
        attackers: Array(4).fill('swordsman'),
        defenders: ['archer', 'swordsman', 'dragon'],
        defenses: { ramparts: 1, watchtower: 1, scorpion: 1 },
        seed: 4242,
      });

    const first = fight(build());
    const second = fight(build());

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('diverges on a different seed', () => {
    const build = (seed: number) =>
      siege({
        attackers: Array(4).fill('swordsman'),
        defenders: Array(4).fill('swordsman'),
        seed,
      });

    const a = fight(build(1));
    const b = fight(build(999));

    // Same setup, different stream: at minimum the blow-by-blow numbers differ.
    expect(JSON.stringify(a.log)).not.toBe(JSON.stringify(b.log));
  });
});
