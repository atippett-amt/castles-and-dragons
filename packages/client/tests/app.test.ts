import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { gameFromChoices } from '../src/setup/game';

let root: HTMLElement;
let newGameRequests: number;

/** Free-for-all puts the human on Underwood-Petersville, mountains in the north. */
const startGame = (): void => {
  createApp(
    root,
    gameFromChoices({
      preset: 'ffa',
      playerCount: 4,
      humanName: 'You',
      humanSide: 'north',
      difficulty: 'normal',
    }),
    { onNewGame: () => (newGameRequests += 1) },
  );
};

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
  localStorage.clear();
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  newGameRequests = 0;
  startGame();
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
  it('shows the result, freezes the turn, and offers a way out', () => {
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
    expect(newGameRequests).toBe(1);
  });
});

describe('saving', () => {
  it('writes the game out as it goes', () => {
    expect(localStorage.getItem('castles-and-dragons/save')).not.toBeNull();

    endTurn();
    const saved = JSON.parse(localStorage.getItem('castles-and-dragons/save')!);
    expect(saved.state.turn).toBe(2);
    expect(saved.humanPlayerId).toBe('p0');
  });

  it('keeps the save in step with what the board shows', () => {
    banner('underwood_petersville').click();
    buttonSaying('Select all')!.click();
    banner('florence').click();

    const saved = JSON.parse(localStorage.getItem('castles-and-dragons/save')!);
    const inState = Object.values(saved.state.units as Record<string, { regionId: string }>).filter(
      (unit) => unit.regionId === 'underwood_petersville',
    ).length;

    expect(inState).toBe(garrison('underwood_petersville'));
  });
});

describe('starting over', () => {
  it('asks twice before throwing a game away', () => {
    const button = buttonSaying('New game')!;

    button.click();
    expect(newGameRequests).toBe(0);
    expect(button.textContent).toBe('Sure?');

    button.click();
    expect(newGameRequests).toBe(1);
  });

  it('disarms itself if you do anything else', () => {
    const button = buttonSaying('New game')!;
    button.click();
    expect(button.textContent).toBe('Sure?');

    endTurn();

    expect(button.textContent).toBe('New game');
    expect(newGameRequests).toBe(0);
  });
});
