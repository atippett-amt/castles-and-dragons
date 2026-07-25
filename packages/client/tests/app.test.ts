import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

let root: HTMLElement;

const banner = (region: string): HTMLElement =>
  root.querySelector(`[data-region="${region}"].banner`)!;

const garrison = (region: string): number => {
  const count = banner(region).querySelector<HTMLElement>('.banner__count')!;
  return count.hidden ? 0 : Number.parseInt(count.textContent ?? '0', 10);
};

const targets = (): string[] =>
  [...root.querySelectorAll<HTMLElement>('.banner--target')].map((b) => b.dataset['region']!);

const buttonSaying = (label: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label);

const endTurn = (): void => buttonSaying('End Turn')!.click();
const panelTitle = (): string => root.querySelector('.panel__title')?.textContent ?? '';

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  createApp(root);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inspecting a hold', () => {
  it('opens it without arming anything', () => {
    banner('underwood_petersville').click();

    expect(panelTitle()).toBe('Underwood-Petersville');
    // The whole point: opening a hold selects no units, so nothing can march.
    expect(targets()).toEqual([]);
  });

  it('lets you look at a neighbour without marching into it', () => {
    // The regression. Opening a hold used to pre-select its whole garrison, so
    // the next click on an adjacent hold was read as an order and the army
    // walked out, leaving the first hold empty.
    const before = [garrison('underwood_petersville'), garrison('florence')];

    banner('underwood_petersville').click();
    banner('florence').click();

    expect(panelTitle()).toBe('Florence');
    expect([garrison('underwood_petersville'), garrison('florence')]).toEqual(before);
  });

  it('can be browsed back and forth all day and change nothing', () => {
    const before = [garrison('underwood_petersville'), garrison('florence'), garrison('bailey_springs')];

    for (const hold of ['underwood_petersville', 'florence', 'bailey_springs', 'underwood_petersville']) {
      banner(hold).click();
    }

    expect([garrison('underwood_petersville'), garrison('florence'), garrison('bailey_springs')]).toEqual(
      before,
    );
  });

  it('offers no orders at a hold that is not yours', () => {
    banner('killen').click();
    expect(panelTitle()).toBe('Killen');
    expect(root.querySelector('.panel__build')).toBeNull();
    expect(buttonSaying('Select all')).toBeUndefined();
  });
});

describe('raising a force', () => {
  it('highlights where it could go once units are picked', () => {
    banner('underwood_petersville').click();
    expect(targets()).toEqual([]);

    buttonSaying('Select all')!.click();

    expect([...targets()].sort()).toEqual(['bailey_springs', 'florence']);
  });

  it('marches only after a deliberate selection', () => {
    const before = garrison('underwood_petersville');

    banner('underwood_petersville').click();
    buttonSaying('Select all')!.click();
    banner('florence').click();

    // Something happened this time: the stack left, and Florence was defended
    // so it was a siege either way.
    expect(garrison('underwood_petersville')).toBeLessThan(before);
  });

  it('drops the selection again when Clear is pressed', () => {
    banner('underwood_petersville').click();
    buttonSaying('Select all')!.click();
    expect(targets()).not.toEqual([]);

    buttonSaying('Clear')!.click();
    expect(targets()).toEqual([]);
  });
});

describe('taking a turn', () => {
  it('plays every AI and hands the board straight back', () => {
    const turnText = (): string => root.querySelector('.hud__turn')!.textContent ?? '';
    expect(turnText()).toBe('Turn 1 / 100');

    endTurn();

    // One click covers all three opponents, so it is the human's move again.
    expect(turnText()).toBe('Turn 2 / 100');
    expect(root.querySelector('.hud__team')!.textContent).toBe('You');
  });

  it('reports what the opponents did', () => {
    endTurn();
    const report = root.querySelector<HTMLElement>('.report')!;
    expect(report.hidden).toBe(false);
    expect(report.querySelectorAll('.report__item').length).toBeGreaterThan(0);
  });
});

describe('the end of a game', () => {
  it('shows the result, freezes the turn, and restarts clean', () => {
    vi.useFakeTimers();

    // Sit on our hands until somebody wins.
    let clicks = 0;
    while (root.querySelector('.gameover')?.hidden !== false && clicks < 400) {
      endTurn();
      vi.advanceTimersByTime(1500);
      clicks += 1;
    }

    const screen = root.querySelector<HTMLElement>('.gameover')!;
    expect(screen.hidden).toBe(false);
    expect(root.querySelector('.gameover__title')?.textContent).toBeTruthy();
    expect(root.querySelectorAll('.gameover__table tr').length).toBeGreaterThan(1);

    const frozen = root.querySelector('.hud__turn')!.textContent;
    endTurn();
    expect(root.querySelector('.hud__turn')!.textContent).toBe(frozen);

    buttonSaying('Play again')!.click();

    expect(root.querySelector('.hud__turn')!.textContent).toBe('Turn 1 / 100');
    expect(root.querySelector<HTMLElement>('.gameover')!.hidden).toBe(true);
    // Rebuilt rather than layered on top of the old game.
    expect(root.querySelectorAll('.hud')).toHaveLength(1);
    expect(root.querySelectorAll('.stage')).toHaveLength(1);
    expect(root.querySelectorAll('.board')).toHaveLength(1);
  });
});
