import { unitsIn, type GameState, type Graph, type MapData, type RegionDef, type RegionId } from '@shared/index';
import { EDGE_STYLE, colorForOwner } from './colors';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Board {
  readonly element: HTMLElement;
  /** Repaints owner colours, garrison counts, eggs and selection from state. */
  refresh(): void;
  select(id: RegionId | null): void;
  /** Marks holds the current selection could move into. */
  highlight(ids: ReadonlySet<RegionId>): void;
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
  let selected: RegionId | null = null;

  for (const region of map.regions) {
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
      }
    },
  };

  board.refresh();
  return board;
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
