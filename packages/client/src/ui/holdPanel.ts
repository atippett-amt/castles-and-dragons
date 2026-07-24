import {
  NEUTRAL,
  neighbors,
  passableBy,
  type GameState,
  type Graph,
  type RegionId,
} from '@shared/index';
import { colorForOwner } from '../render/colors';

export interface HoldPanel {
  readonly element: HTMLElement;
  show(id: RegionId | null): void;
}

export interface HoldPanelOptions {
  readonly graph: Graph;
  readonly state: GameState;
}

/** Detail card for the selected hold. Hidden until something is clicked. */
export function createHoldPanel(options: HoldPanelOptions): HoldPanel {
  const { graph, state } = options;

  const element = document.createElement('aside');
  element.className = 'panel';
  element.hidden = true;

  function ownerLabel(owner: string): string {
    if (owner === NEUTRAL) return 'Neutral';
    return state.players.find((player) => player.id === owner)?.name ?? owner;
  }

  function show(id: RegionId | null): void {
    if (id === null) {
      element.hidden = true;
      element.replaceChildren();
      return;
    }

    const region = graph.regions.get(id);
    const regionState = state.regions[id];
    if (!region || !regionState) {
      element.hidden = true;
      return;
    }

    element.hidden = false;
    element.style.setProperty('--owner', colorForOwner(state, regionState.owner));

    const title = document.createElement('h2');
    title.className = 'panel__title';
    title.textContent = region.name;

    const owner = document.createElement('p');
    owner.className = 'panel__owner';
    owner.textContent = ownerLabel(regionState.owner);

    const stats = document.createElement('dl');
    stats.className = 'panel__stats';
    const rows: readonly (readonly [string, string])[] = [
      ['Side', region.side === 'north' ? 'North' : 'South'],
      ['Terrain', region.terrain],
      ['Defense', `+${region.defenseBonus}`],
      ['Gold / turn', String(region.goldPerTurn)],
      ['Dragon egg', regionState.hasEgg ? 'Unhatched' : 'None'],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      stats.append(dt, dd);
    }

    const bordersTitle = document.createElement('h3');
    bordersTitle.className = 'panel__subtitle';
    bordersTitle.textContent = 'Borders';

    const borders = document.createElement('ul');
    borders.className = 'panel__borders';
    for (const adjacent of neighbors(graph, id)) {
      const item = document.createElement('li');
      item.className = `border border--${adjacent.type}`;

      const name = graph.regions.get(adjacent.to)?.name ?? adjacent.to;
      // Spelling out who can use the crossing makes the lake's role obvious
      // before any units exist to demonstrate it.
      const who = passableBy(adjacent.type, 'swordsman') ? 'all units' : 'dragons only';
      item.textContent = `${name} — ${adjacent.type}, ${who}`;
      borders.append(item);
    }

    element.replaceChildren(title, owner, stats, bordersTitle, borders);
  }

  return { element, show };
}
