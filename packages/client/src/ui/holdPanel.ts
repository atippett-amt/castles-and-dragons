import {
  DEFENSE_TYPES,
  NEUTRAL,
  RECRUITABLE_TYPES,
  buildsRemaining,
  defenseCap,
  defenseCost,
  fortifyBlockedReason,
  isActiveTeamMember,
  neighbors,
  passableBy,
  playerById,
  recruitBlockedReason,
  recruitCost,
  unitProfile,
  unitsIn,
  type DefenseType,
  type GameState,
  type Graph,
  type RecruitableType,
  type RegionId,
  type Unit,
  type UnitId,
} from '@shared/index';
import { colorForOwner } from '../render/colors';

export interface HoldPanel {
  readonly element: HTMLElement;
  show(id: RegionId | null, selectedUnitIds: ReadonlySet<UnitId>): void;
}

export interface HoldPanelOptions {
  readonly graph: Graph;
  readonly state: GameState;
  /** True when the unit belongs to the active team and can still move. */
  readonly canOrder: (unit: Unit) => boolean;
  readonly onToggleUnit: (unitId: UnitId) => void;
  readonly onSelectAll: (regionId: RegionId, select: boolean) => void;
  readonly onRecruit: (regionId: RegionId, type: RecruitableType) => void;
  readonly onFortify: (regionId: RegionId, type: DefenseType) => void;
}

/** Detail card for the selected hold, including its garrison. */
export function createHoldPanel(options: HoldPanelOptions): HoldPanel {
  const { graph, state, canOrder, onToggleUnit, onSelectAll, onRecruit, onFortify } = options;

  const element = document.createElement('aside');
  element.className = 'panel';
  element.hidden = true;

  function ownerLabel(owner: string): string {
    if (owner === NEUTRAL) return 'Neutral';
    return state.players.find((player) => player.id === owner)?.name ?? owner;
  }

  function show(id: RegionId | null, selectedUnitIds: ReadonlySet<UnitId>): void {
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
    const built = DEFENSE_TYPES.filter((type) => regionState.defenses[type] > 0)
      .map((type) => `${type} ${regionState.defenses[type]}`)
      .join(', ');

    const rows: readonly (readonly [string, string])[] = [
      ['Side', region.side === 'north' ? 'North' : 'South'],
      ['Terrain', region.terrain],
      ['Defense', `+${region.defenseBonus}`],
      ['Gold / turn', String(region.goldPerTurn)],
      ['Dragon egg', regionState.hasEgg ? 'Unhatched' : 'None'],
      ['Works', built === '' ? 'None' : built],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      stats.append(dt, dd);
    }

    element.replaceChildren(
      title,
      owner,
      stats,
      ...buildSection(id),
      ...garrisonSection(id, selectedUnitIds),
      ...bordersSection(id),
    );
  }

  /**
   * Recruit-or-fortify controls, shown only for a hold the acting team owns.
   *
   * Every button stays visible even when unavailable, with the engine's own
   * reason as its tooltip — hiding them would leave a player guessing why a
   * hold cannot act.
   */
  function buildSection(id: RegionId): HTMLElement[] {
    const regionState = state.regions[id];
    if (!regionState || regionState.owner === NEUTRAL) return [];
    if (!isActiveTeamMember(state, regionState.owner)) return [];

    const heading = document.createElement('h3');
    heading.className = 'panel__subtitle';
    heading.textContent = 'Build';

    const purse = document.createElement('p');
    purse.className = 'panel__purse';
    const gold = playerById(state, regionState.owner)?.gold ?? 0;
    const remaining = buildsRemaining(regionState);
    purse.textContent =
      remaining > 0
        ? `${gold} gold · ${remaining} action${remaining === 1 ? '' : 's'} left`
        : `${gold} gold · this hold has already acted`;

    const grid = document.createElement('div');
    grid.className = 'panel__build';

    for (const type of RECRUITABLE_TYPES) {
      grid.append(
        buildButton(
          `${type} ${recruitCost(type)}g`,
          recruitBlockedReason(state, id, type),
          () => onRecruit(id, type),
        ),
      );
    }

    for (const type of DEFENSE_TYPES) {
      const count = regionState.defenses[type];
      grid.append(
        buildButton(
          `${type} ${defenseCost(type)}g (${count}/${defenseCap(type)})`,
          fortifyBlockedReason(state, id, type),
          () => onFortify(id, type),
        ),
      );
    }

    return [heading, purse, grid];
  }

  function buildButton(label: string, blocked: string | null, onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--build';
    button.textContent = label;
    button.disabled = blocked !== null;
    button.title = blocked ?? label;
    if (blocked === null) button.addEventListener('click', onClick);
    return button;
  }

  function garrisonSection(id: RegionId, selectedUnitIds: ReadonlySet<UnitId>): HTMLElement[] {
    const heading = document.createElement('h3');
    heading.className = 'panel__subtitle';
    heading.textContent = 'Garrison';

    const units = unitsIn(state, id);
    if (units.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'panel__empty';
      empty.textContent = 'No garrison.';
      return [heading, empty];
    }

    const orderable = units.filter(canOrder);
    const list = document.createElement('ul');
    list.className = 'panel__units';

    for (const unit of units) {
      const item = document.createElement('li');
      item.className = 'unit';

      const selectable = canOrder(unit);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'unit__check';
      checkbox.checked = selectedUnitIds.has(unit.id);
      checkbox.disabled = !selectable;
      checkbox.addEventListener('change', () => onToggleUnit(unit.id));

      const label = document.createElement('span');
      label.className = 'unit__name';
      label.textContent = unit.type;

      const health = document.createElement('span');
      health.className = 'unit__hp';
      health.textContent = `${unit.hp} / ${unitProfile(unit.type, state.turn).hp} hp`;

      const moves = document.createElement('span');
      moves.className = 'unit__moves';
      // Spent units stay listed but greyed, so a player can see why a stack
      // will not move rather than wondering where it went.
      moves.textContent = unit.movesLeft > 0 ? `${unit.movesLeft} move` : 'spent';
      moves.classList.toggle('unit__moves--spent', unit.movesLeft === 0);

      item.classList.toggle('unit--disabled', !selectable);
      item.append(checkbox, label, health, moves);
      list.append(item);
    }

    const result: HTMLElement[] = [heading, list];

    if (orderable.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'panel__actions';

      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'button';
      all.textContent = 'Select all';
      all.addEventListener('click', () => onSelectAll(id, true));

      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'button';
      none.textContent = 'Clear';
      none.addEventListener('click', () => onSelectAll(id, false));

      const hint = document.createElement('p');
      hint.className = 'panel__hint';
      hint.textContent = 'Pick a stack, then click a highlighted hold to march.';

      actions.append(all, none);
      result.push(actions, hint);
    }

    return result;
  }

  function bordersSection(id: RegionId): HTMLElement[] {
    const heading = document.createElement('h3');
    heading.className = 'panel__subtitle';
    heading.textContent = 'Borders';

    const list = document.createElement('ul');
    list.className = 'panel__borders';

    for (const adjacent of neighbors(graph, id)) {
      const item = document.createElement('li');
      item.className = `border border--${adjacent.type}`;

      const name = graph.regions.get(adjacent.to)?.name ?? adjacent.to;
      const who = passableBy(adjacent.type, 'swordsman') ? 'all units' : 'dragons only';
      item.textContent = `${name} — ${adjacent.type}, ${who}`;
      list.append(item);
    }

    return [heading, list];
  }

  return { element, show };
}
