import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BALANCE,
  buildGraph,
  createInitialState,
  getRegion,
  hatchEggs,
  loadMap,
  spawnUnit,
  type GameState,
  type Graph,
  type MapData,
} from '@shared/index';
import rawHolds from '@data/maps/holds.json';
import { createBoard, type Board } from '../src/render/board';
import { stubRect } from './dom';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

function newGame(): GameState {
  return createInitialState({
    map,
    players: [
      { id: 'p0', name: 'You', teamId: 'you', isAI: false, startRegion: 'florence' },
      { id: 'p1', name: 'Foe', teamId: 'foe', isAI: true, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'you', name: 'You' },
      { id: 'foe', name: 'Foe' },
    ],
  });
}

const bannerOf = (board: Board, region: string): HTMLElement =>
  board.element.querySelector(`[data-region="${region}"].banner`)!;
const readoutOf = (board: Board, region: string): HTMLElement =>
  board.element.querySelector(`[data-region="${region}"].readout`)!;
const text = (root: Element, selector: string): string =>
  root.querySelector(selector)?.textContent ?? '';

let state: GameState;
let board: Board;
let selected: string[];

beforeEach(() => {
  document.body.replaceChildren();
  state = newGame();
  selected = [];
  board = createBoard({ map, graph, state, onSelect: (id) => selected.push(id) });
  document.body.append(board.element);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('banners', () => {
  it('draws one per hold and reports clicks', () => {
    expect(board.element.querySelectorAll('.banner')).toHaveLength(map.regions.length);

    bannerOf(board, 'florence').click();
    expect(selected).toEqual(['florence']);
  });

  it('shows the garrison size and hides it when a hold empties', () => {
    expect(text(bannerOf(board, 'florence'), '.banner__count')).toBe('3');

    for (const unit of Object.values(state.units)) {
      if (unit.regionId === 'florence') delete state.units[unit.id];
    }
    board.refresh();

    expect(bannerOf(board, 'florence').querySelector<HTMLElement>('.banner__count')!.hidden).toBe(
      true,
    );
  });

  it('swaps the egg for a dragon once the eggs hatch', () => {
    const egg = bannerOf(board, 'florence').querySelector<HTMLElement>('.banner__egg')!;
    const dragon = bannerOf(board, 'florence').querySelector<HTMLElement>('.banner__dragon')!;
    expect(egg.hidden).toBe(false);
    expect(dragon.hidden).toBe(true);

    state.turn = BALANCE.dragon.hatchTurn;
    hatchEggs(state);
    board.refresh();

    expect(egg.hidden).toBe(true);
    expect(dragon.hidden).toBe(false);
  });

  it('marks only the selected hold and only the highlighted targets', () => {
    board.select('florence');
    expect(board.element.querySelectorAll('.banner--selected')).toHaveLength(1);
    expect(bannerOf(board, 'florence').classList.contains('banner--selected')).toBe(true);

    board.highlight(new Set(['killen', 'sheffield']));
    expect(
      [...board.element.querySelectorAll('.banner--target')].map((b) =>
        (b as HTMLElement).dataset['region'],
      ),
    ).toEqual(['killen', 'sheffield']);

    board.highlight(new Set());
    expect(board.element.querySelectorAll('.banner--target')).toHaveLength(0);
  });
});

describe('readouts', () => {
  /** What the readout should say for a hold of the given terrain rating. */
  const expectedDef = (terrain: number): string => {
    const rating = terrain + BALANCE.start.ramparts * BALANCE.ramparts.defensePoints;
    return `-${Math.round(rating * BALANCE.defense.reductionPerPoint * 100)}% dmg`;
  };

  it('reports composition, health, attack and the terrain advantage', () => {
    const readout = readoutOf(board, 'florence');

    // Florence starts 1 swordsman + 2 archers behind one rampart, on forest.
    expect(text(readout, '.readout__army')).toBe('1S 2A');
    expect(text(readout, '.readout__hp')).toBe('60/60 hp');
    expect(text(readout, '.readout__atk')).toBe('22 atk');
    expect(text(readout, '.readout__def')).toBe(expectedDef(1));
  });

  it('shows a mountain hold shrugging off more than a forest one', () => {
    // Underwood-Petersville is mountains: defence 3 plus the same rampart.
    expect(text(readoutOf(board, 'underwood_petersville'), '.readout__def')).toBe(expectedDef(3));
    expect(expectedDef(3)).not.toBe(expectedDef(1));
  });

  it('says nothing at all about an empty hold', () => {
    for (const unit of Object.values(state.units)) {
      if (unit.regionId === 'florence') delete state.units[unit.id];
    }
    board.refresh();
    expect(readoutOf(board, 'florence').hidden).toBe(true);
  });

  it('counts a dragon in the composition', () => {
    spawnUnit(state, 'dragon', 'p0', 'florence');
    board.refresh();
    expect(text(readoutOf(board, 'florence'), '.readout__army')).toBe('1S 2A 1D');
  });
});

describe('assault animations', () => {
  beforeEach(() => {
    // jsdom has no layout, so give the two banners real positions to fly between.
    stubRect(bannerOf(board, 'florence'), { x: 100, y: 100, w: 40, h: 16 });
    stubRect(bannerOf(board, 'killen'), { x: 300, y: 220, w: 40, h: 16 });
  });

  it('sends a strike from attacker to defender with the right glyph', () => {
    board.strike({ from: 'florence', to: 'killen', spearhead: 'dragon', captured: true });

    const strike = board.element.querySelector<HTMLElement>('.strike')!;
    expect(strike.classList.contains('strike--dragon')).toBe(true);
    expect(strike.style.getPropertyValue('--dx')).toBe('200px');
    expect(strike.style.getPropertyValue('--dy')).toBe('120px');

    const clash = board.element.querySelector<HTMLElement>('.clash')!;
    expect(clash.classList.contains('clash--taken')).toBe(true);
  });

  it('marks a repulse differently from a capture', () => {
    board.strike({ from: 'florence', to: 'killen', spearhead: 'swordsman', captured: false });
    expect(
      board.element.querySelector<HTMLElement>('.clash')!.classList.contains('clash--held'),
    ).toBe(true);
  });

  it('leaves an arrow unrotated only when a dragon leads', () => {
    board.strike({ from: 'florence', to: 'killen', spearhead: 'archer', captured: true });
    expect(board.element.querySelector<HTMLElement>('.strike')!.style.getPropertyValue('--angle'))
      .not.toBe('');

    board.clearStrikes();
    board.strike({ from: 'florence', to: 'killen', spearhead: 'dragon', captured: true });
    expect(
      board.element.querySelector<HTMLElement>('.strike')!.style.getPropertyValue('--angle'),
    ).toBe('');
  });

  it('cleans itself up on a timer', () => {
    vi.useFakeTimers();
    board.strike({ from: 'florence', to: 'killen', spearhead: 'swordsman', captured: true });
    expect(board.element.querySelectorAll('.strike')).toHaveLength(1);

    vi.advanceTimersByTime(2500);

    expect(board.element.querySelectorAll('.strike')).toHaveLength(0);
    expect(board.element.querySelectorAll('.clash')).toHaveLength(0);
  });

  it('does not let assaults pile up across turns', () => {
    // The regression: each strike lives two seconds and a busy turn staggers
    // several, so clicking briskly through turns stacked a dozen on screen.
    vi.useFakeTimers();
    for (let turn = 0; turn < 5; turn++) {
      board.clearStrikes();
      for (let i = 0; i < 3; i++) {
        board.strike({
          from: 'florence',
          to: 'killen',
          spearhead: 'swordsman',
          captured: true,
          delayMs: i * 200,
        });
      }
      vi.advanceTimersByTime(120); // next turn arrives before any expire
      expect(board.element.querySelectorAll('.strike').length).toBeLessThanOrEqual(3);
    }
  });

  it('cancels the shake so it cannot fire after the banner is swept', () => {
    vi.useFakeTimers();
    board.strike({ from: 'florence', to: 'killen', spearhead: 'swordsman', captured: true });
    board.clearStrikes();

    vi.advanceTimersByTime(3000);

    expect(board.element.querySelectorAll('.banner--struck')).toHaveLength(0);
    expect(board.element.querySelectorAll('.strike')).toHaveLength(0);
  });

  it('ignores a strike between holds it does not know', () => {
    expect(() =>
      board.strike({ from: 'nowhere', to: 'killen', spearhead: 'swordsman', captured: true }),
    ).not.toThrow();
    expect(board.element.querySelectorAll('.strike')).toHaveLength(0);
  });
});

describe('health floats', () => {
  it('shows a loss and a gain differently, and says what is left', () => {
    board.flash('florence', -30, 45);
    const loss = board.element.querySelector<HTMLElement>('.float')!;
    expect(loss.classList.contains('float--loss')).toBe(true);
    expect(text(loss, '.float__delta')).toBe('-30 hp');
    expect(text(loss, '.float__remaining')).toBe('45 left');

    board.flash('killen', 12, 72);
    const gain = [...board.element.querySelectorAll<HTMLElement>('.float')][1]!;
    expect(gain.classList.contains('float--gain')).toBe(true);
    expect(text(gain, '.float__delta')).toBe('+12 hp');
  });

  it('says a hold was emptied rather than showing nothing left', () => {
    board.flash('florence', -60, 0);
    expect(text(board.element.querySelector('.float')!, '.float__remaining')).toBe('emptied');
  });

  it('clears itself after its time is up', () => {
    vi.useFakeTimers();
    board.flash('florence', -30, 45);
    expect(board.element.querySelectorAll('.float')).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(board.element.querySelectorAll('.float')).toHaveLength(0);
  });
});

describe('ownership colours', () => {
  it('marks held holds and leaves neutral ones plain', () => {
    expect(bannerOf(board, 'florence').classList.contains('banner--owned')).toBe(true);
    expect(bannerOf(board, 'killen').classList.contains('banner--owned')).toBe(false);

    getRegion(state, 'killen').owner = 'p1';
    board.refresh();
    expect(bannerOf(board, 'killen').classList.contains('banner--owned')).toBe(true);
  });
});
