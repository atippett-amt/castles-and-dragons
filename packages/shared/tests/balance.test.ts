import { describe, expect, it } from 'vitest';
import { BALANCE, dragonProgress, dragonStat } from '@shared/index';

describe('balance', () => {
  it('runs a 100-turn game with dragons hatching on turn 5', () => {
    expect(BALANCE.game.turnLimit).toBe(100);
    expect(BALANCE.dragon.hatchTurn).toBe(5);
  });

  it('clamps dragon growth progress to [0, 1]', () => {
    expect(dragonProgress(1)).toBe(0);
    expect(dragonProgress(5)).toBe(0);
    expect(dragonProgress(100)).toBe(1);
    expect(dragonProgress(250)).toBe(1);
  });

  it('grows a dragon monotonically from hatch to the turn limit', () => {
    const hatch = dragonStat(BALANCE.dragon.hatchTurn);
    const max = dragonStat(BALANCE.game.turnLimit);

    expect(hatch).toEqual({ atk: BALANCE.dragon.atkAtHatch, hp: BALANCE.dragon.hpAtHatch });
    expect(max).toEqual({ atk: BALANCE.dragon.atkAtMax, hp: BALANCE.dragon.hpAtMax });

    let previous = hatch;
    for (let turn = BALANCE.dragon.hatchTurn + 1; turn <= BALANCE.game.turnLimit; turn++) {
      const current = dragonStat(turn);
      expect(current.atk).toBeGreaterThanOrEqual(previous.atk);
      expect(current.hp).toBeGreaterThanOrEqual(previous.hp);
      previous = current;
    }
  });
});
