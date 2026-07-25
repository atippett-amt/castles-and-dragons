import {
  damageReduction,
  defenseRating,
  unitProfile,
  unitsIn,
  type GameState,
  type Graph,
  type MapData,
  type RegionDef,
  type RegionId,
  type RegionState,
  type Unit,
  type UnitType,
} from '@shared/index';
import { EDGE_STYLE, colorForOwner } from './colors';

/** How long a floating health change stays on screen, in milliseconds. */
const FLOAT_LIFETIME_MS = 4200;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Board {
  readonly element: HTMLElement;
  /** Repaints owner colours, garrison counts, eggs and selection from state. */
  refresh(): void;
  select(id: RegionId | null): void;
  /** Marks holds the current selection could move into. */
  highlight(ids: ReadonlySet<RegionId>): void;
  /** Floats a health change above a hold, with what it has left. */
  flash(regionId: RegionId, delta: number, remaining: number): void;
  readonly selected: RegionId | null;
}

export interface BoardOptions {
  readonly map: MapData;
  readonly graph: Graph;
  readonly state: GameState;
  readonly onSelect: (id: RegionId) => void;
}

/**
 * Rendering v1: the map art as the board, an SVG layer for adjacency lines, and
 * an interactive banner over each hold.
 *
 * Everything is positioned from `labelPos`, the normalized 0–1 coordinates in
 * holds.json. That works because `.board` is kept exactly congruent with the
 * rendered image (see style.css), so a percentage offset lands on the same spot
 * at any window size.
 *
 * Phase 1's plan calls a later v2 pass to trace holds as SVG polygon hotspots.
 * That is purely a render-layer swap — nothing here leaks into the rules.
 */
export function createBoard(options: BoardOptions): Board {
  const { map, graph, state, onSelect } = options;

  const element = document.createElement('div');
  element.className = 'board';

  const image = document.createElement('img');
  image.className = 'board__map';
  image.src = map.image;
  image.alt = `${map.name} — ten holds divided by ${map.lake}`;
  element.append(image);

  element.append(createEdgeLayer(map, graph));

  const banners = new Map<RegionId, HTMLButtonElement>();
  const readouts = new Map<RegionId, HTMLElement>();
  let selected: RegionId | null = null;

  for (const region of map.regions) {
    const readout = createReadout(region);
    readouts.set(region.id, readout);
    element.append(readout);

    const banner = createBanner(region);
    banner.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect(region.id);
    });
    banners.set(region.id, banner);
    element.append(banner);
  }

  const board: Board = {
    element,
    get selected() {
      return selected;
    },
    select(id) {
      selected = id;
      for (const [regionId, banner] of banners) {
        banner.classList.toggle('banner--selected', regionId === id);
      }
    },
    highlight(ids) {
      for (const [regionId, banner] of banners) {
        banner.classList.toggle('banner--target', ids.has(regionId));
      }
    },
    flash(regionId, delta, remaining) {
      const banner = banners.get(regionId);
      if (!banner) return;

      const float = document.createElement('div');
      float.className = `float float--${delta < 0 ? 'loss' : 'gain'}`;
      // Anchored to the same normalized position as the banner it belongs to,
      // then lifted clear of it by the transform in CSS.
      float.style.left = banner.style.left;
      float.style.top = banner.style.top;

      const change = document.createElement('span');
      change.className = 'float__delta';
      change.textContent = `${delta > 0 ? '+' : ''}${delta} hp`;

      const left = document.createElement('span');
      left.className = 'float__remaining';
      left.textContent = remaining > 0 ? `${remaining} left` : 'emptied';

      float.append(change, left);
      element.append(float);

      // Removed on a timer rather than animationend, so it still cleans itself
      // up for players who have animations turned off. Kept in step with the
      // CSS duration via FLOAT_LIFETIME_MS.
      setTimeout(() => float.remove(), FLOAT_LIFETIME_MS);
    },
    refresh() {
      for (const region of map.regions) {
        const banner = banners.get(region.id);
        const regionState = state.regions[region.id];
        if (!banner || !regionState) continue;

        banner.style.setProperty('--owner', colorForOwner(state, regionState.owner));
        banner.classList.toggle('banner--owned', regionState.owner !== 'neutral');

        const egg = banner.querySelector<HTMLElement>('.banner__egg');
        if (egg) egg.hidden = !regionState.hasEgg;

        const garrison = unitsIn(state, region.id);
        const count = banner.querySelector<HTMLElement>('.banner__count');
        if (count) {
          count.textContent = String(garrison.length);
          count.hidden = garrison.length === 0;
        }

        // A dragon in the hold is the single most important thing on the board,
        // so it gets its own mark rather than hiding inside the garrison count.
        const dragon = banner.querySelector<HTMLElement>('.banner__dragon');
        if (dragon) dragon.hidden = !garrison.some((unit) => unit.type === 'dragon');

        updateReadout(readouts.get(region.id), region, regionState, garrison, state.turn);
      }
    },
  };

  board.refresh();
  return board;
}

/**
 * The always-on readout that sits above a hold's banner.
 *
 * Shares the banner's normalized position and is lifted clear of it in CSS.
 * Purely informational, so it never swallows a click meant for the banner.
 */
function createReadout(region: RegionDef): HTMLElement {
  const readout = document.createElement('div');
  readout.className = 'readout';
  readout.style.left = `${region.labelPos.x * 100}%`;
  readout.style.top = `${region.labelPos.y * 100}%`;
  readout.dataset['region'] = region.id;
  readout.hidden = true;

  for (const [row, fields] of [
    ['readout__row', ['army', 'hp']],
    ['readout__row', ['atk', 'def']],
  ] as const) {
    const line = document.createElement('div');
    line.className = row;
    for (const field of fields) {
      const span = document.createElement('span');
      span.className = `readout__${field}`;
      line.append(span);
    }
    readout.append(line);
  }

  return readout;
}

/** Short composition, e.g. "2S 1A 1D". Zero counts are left out. */
function composition(garrison: readonly Unit[]): string {
  const counts: Record<UnitType, number> = { swordsman: 0, archer: 0, dragon: 0 };
  for (const unit of garrison) counts[unit.type] += 1;

  const initials: readonly (readonly [UnitType, string])[] = [
    ['swordsman', 'S'],
    ['archer', 'A'],
    ['dragon', 'D'],
  ];

  return initials
    .filter(([type]) => counts[type] > 0)
    .map(([type, letter]) => `${counts[type]}${letter}`)
    .join(' ');
}

function updateReadout(
  readout: HTMLElement | undefined,
  region: RegionDef,
  regionState: RegionState,
  garrison: readonly Unit[],
  turn: number,
): void {
  if (!readout) return;

  // An empty hold has nothing to report, and ten permanent labels over an empty
  // map would bury the art.
  readout.hidden = garrison.length === 0;
  if (garrison.length === 0) return;

  let health = 0;
  let maxHealth = 0;
  let attack = 0;
  for (const unit of garrison) {
    const profile = unitProfile(unit.type, turn);
    health += unit.hp;
    maxHealth += profile.hp;
    attack += profile.atk;
  }

  const reduction = damageReduction(defenseRating(regionState, region.defenseBonus));

  const set = (selector: string, text: string): void => {
    const node = readout.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };

  set('.readout__army', composition(garrison));
  set('.readout__hp', `${health}/${maxHealth} hp`);
  set('.readout__atk', `${attack} atk`);
  set('.readout__def', `-${Math.round(reduction * 100)}% dmg`);
}

function createBanner(region: RegionDef): HTMLButtonElement {
  const banner = document.createElement('button');
  banner.type = 'button';
  banner.className = 'banner';
  banner.style.left = `${region.labelPos.x * 100}%`;
  banner.style.top = `${region.labelPos.y * 100}%`;
  banner.dataset['region'] = region.id;
  banner.title = region.name;

  const name = document.createElement('span');
  name.className = 'banner__name';
  name.textContent = region.name;

  // Garrison size. Hidden entirely at zero rather than showing a bare "0".
  const count = document.createElement('span');
  count.className = 'banner__count';
  count.hidden = true;

  // An unhatched dragon egg. Every hold starts with one; they hatch on turn 5.
  const egg = document.createElement('span');
  egg.className = 'banner__egg';
  egg.textContent = '●';
  egg.setAttribute('aria-label', 'dragon egg');

  const dragon = document.createElement('span');
  dragon.className = 'banner__dragon';
  dragon.textContent = '▲';
  dragon.hidden = true;
  dragon.setAttribute('aria-label', 'dragon');

  banner.append(name, count, egg, dragon);
  return banner;
}

/**
 * Draws one line per edge between the two holds' label positions.
 *
 * The viewBox is the unit square with `preserveAspectRatio="none"`, so labelPos
 * values are used as coordinates directly. That squashes the coordinate space
 * non-uniformly, which would also squash stroke widths — hence
 * `vector-effect="non-scaling-stroke"`, which keeps strokes measured in screen
 * pixels.
 */
function createEdgeLayer(map: MapData, graph: Graph): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'board__edges');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  for (const edge of map.edges) {
    const from = graph.regions.get(edge.a);
    const to = graph.regions.get(edge.b);
    if (!from || !to) continue;

    const style = EDGE_STYLE[edge.type];
    if (!style) continue;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(from.labelPos.x));
    line.setAttribute('y1', String(from.labelPos.y));
    line.setAttribute('x2', String(to.labelPos.x));
    line.setAttribute('y2', String(to.labelPos.y));
    line.setAttribute('stroke', style.stroke);
    line.setAttribute('stroke-width', String(style.width));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if (style.dash) line.setAttribute('stroke-dasharray', style.dash);

    svg.append(line);
  }

  return svg;
}
