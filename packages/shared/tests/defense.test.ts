import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  addDefense,
  damageReduction,
  defenseCap,
  defenseCost,
  defenseRating,
  emptyDefenses,
  isAtCap,
  razeDefenses,
  scorpionDamage,
  watchtowerVolley,
  type RegionState,
} from '@shared/index';

function hold(): RegionState {
  return { id: 'test', owner: 'p0', hasEgg: true, defenses: emptyDefenses(), buildsUsed: 0 };
}

describe('defense costs and caps', () => {
  it('reads every value from BALANCE', () => {
    for (const type of ['ramparts', 'watchtower', 'scorpion'] as const) {
      expect(defenseCost(type)).toBe(BALANCE.cost[type]);
      expect(defenseCap(type)).toBe(BALANCE[type].cap);
    }
  });

  it('prices the scorpion above the rest — it is the anti-dragon tool', () => {
    expect(defenseCost('scorpion')).toBeGreaterThan(defenseCost('ramparts'));
    expect(defenseCost('scorpion')).toBeGreaterThan(defenseCost('watchtower'));
  });

  it('reports when a defense is at its cap', () => {
    const region = hold();
    expect(isAtCap(region, 'ramparts')).toBe(false);
    for (let i = 0; i < BALANCE.ramparts.cap; i++) addDefense(region, 'ramparts');
    expect(isAtCap(region, 'ramparts')).toBe(true);
  });
});

describe('defenseRating and damageReduction', () => {
  it('adds terrain to ramparts', () => {
    const region = hold();
    expect(defenseRating(region, 3)).toBe(3);

    addDefense(region, 'ramparts');
    expect(defenseRating(region, 3)).toBe(3 + BALANCE.ramparts.defensePoints);
  });

  it('matches the worked example: mountains plus two ramparts is 42%', () => {
    const region = hold();
    addDefense(region, 'ramparts');
    addDefense(region, 'ramparts');

    const rating = defenseRating(region, 3); // 3 + 2*2 = 7
    expect(rating).toBe(7);
    expect(damageReduction(rating)).toBeCloseTo(0.42, 5);
  });

  it('never exceeds the cap, so no hold becomes untakeable', () => {
    expect(damageReduction(1000)).toBe(BALANCE.defense.maxReduction);
    expect(damageReduction(0)).toBe(0);
  });

  it('rises monotonically with the rating', () => {
    let previous = -1;
    for (let rating = 0; rating <= 20; rating++) {
      const reduction = damageReduction(rating);
      expect(reduction).toBeGreaterThanOrEqual(previous);
      previous = reduction;
    }
  });
});

describe('watchtower and scorpion output', () => {
  it('scales the opening volley with the number of watchtowers', () => {
    const region = hold();
    expect(watchtowerVolley(region)).toBe(0);

    addDefense(region, 'watchtower');
    expect(watchtowerVolley(region)).toBe(BALANCE.watchtower.volley);

    addDefense(region, 'watchtower');
    expect(watchtowerVolley(region)).toBe(BALANCE.watchtower.volley * 2);
  });

  it('hits dragons far harder than anything else', () => {
    const region = hold();
    addDefense(region, 'scorpion');

    expect(scorpionDamage(region, true)).toBe(BALANCE.scorpion.vsDragonPerRound);
    expect(scorpionDamage(region, false)).toBe(BALANCE.scorpion.vsOtherPerRound);
    expect(scorpionDamage(region, true)).toBeGreaterThan(scorpionDamage(region, false) * 5);
  });

  it('can out-damage a maxed dragon at full stack, as intended', () => {
    // The design benchmark: 2-3 scorpions plus a garrison should bring down
    // even a turn-100 dragon before it takes the hold.
    const region = hold();
    for (let i = 0; i < BALANCE.scorpion.cap; i++) addDefense(region, 'scorpion');

    const perRound = scorpionDamage(region, true);
    const maxDragonHp = BALANCE.dragon.hpAtMax;
    expect(Math.ceil(maxDragonHp / perRound)).toBeLessThanOrEqual(4);
  });
});

describe('razeDefenses', () => {
  it('wrecks every structure, so taking a fortress does not hand you one', () => {
    const region = hold();
    addDefense(region, 'ramparts');
    addDefense(region, 'watchtower');
    addDefense(region, 'scorpion');

    razeDefenses(region);

    expect(region.defenses).toEqual({ ramparts: 0, watchtower: 0, scorpion: 0 });
  });
});
