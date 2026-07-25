import {
  DEFENSE_TYPES,
  NEUTRAL,
  RECRUITABLE_TYPES,
  buildsRemaining,
  damageReduction,
  defenseCap,
  defenseCost,
  defenseRating,
  fortifyBlockedReason,
  isActiveTeamMember,
  neighbors,
  passableBy,
  playerById,
  recruitBlockedReason,
  recruitCost,
  scorpionDamage,
  unitProfile,
  unitsIn,
  watchtowerVolley,
  type DefenseType,
  type GameState,
  type Graph,
  type PlayerId,
  type RecruitableType,
  type RegionId,
  type Unit,
  type UnitId,
  type UnitType,
} from '@shared/index';

/**
 * What each unit type actually does in a siege, in one line.
 *
 * Lifted from the design so a player does not have to infer the rules from
 * watching stacks die — the archer's first strike and the dragon's refusal to
 * die are the two things that decide most battles.
 */
const UNIT_ROLES: Readonly<Record<UnitType, string>> = {
  swordsman: 'Melee backbone. Takes the blows so the rest of the stack lives.',
  archer: 'Looses a first-strike volley before any melee. Fragile up close.',
  dragon: 'Heavy attacker, crosses open water, dies last. Scorpions are its answer.',
};
import { colorForOwner } from '../render/colors';

export interface HoldPanel {
  readonly element: HTMLElement;
  show(id: RegionId | null, selectedUnitIds: ReadonlySet<UnitId>): void;
}

export interface HoldPanelOptions {
  readonly graph: Graph;
  readonly state: GameState;
  /** The player this browser controls; build orders are issued as them. */
  readonly actingPlayer: PlayerId;
  /** True when the unit belongs to the active team and can still move. */
  readonly canOrder: (unit: Unit) => boolean;
  readonly onToggleUnit: (unitId: UnitId) => void;
  readonly onSelectAll: (regionId: RegionId, select: boolean) => void;
  readonly onRecruit: (regionId: RegionId, type: RecruitableType) => void;
  readonly onFortify: (regionId: RegionId, type: DefenseType) => void;
}

/** Detail card for the selected hold, including its garrison. */
export function createHoldPanel(options: HoldPanelOptions): HoldPanel {
  const { graph, state, actingPlayer, canOrder, onToggleUnit, onSelectAll, onRecruit, onFortify } =
    options;

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
      ...strengthSection(id),
      ...garrisonSection(id, selectedUnitIds),
      ...rolesSection(id),
      ...bordersSection(id),
    );
  }

  /**
   * The same stack is worth more at home than in the field, and nothing on
   * screen said so. This spells out both numbers side by side: what the
   * garrison deals if it marches, and what it is worth standing here behind the
   * terrain and whatever has been built.
   */
  function strengthSection(id: RegionId): HTMLElement[] {
    const region = graph.regions.get(id);
    const regionState = state.regions[id];
    const garrison = unitsIn(state, id);
    if (!region || !regionState || garrison.length === 0) return [];

    const attack = garrison.reduce(
      (sum, unit) => sum + unitProfile(unit.type, state.turn).atk,
      0,
    );
    const rating = defenseRating(regionState, region.defenseBonus);
    const reduction = damageReduction(rating);
    const volley = watchtowerVolley(regionState);
    const scorpion = scorpionDamage(regionState, true);

    const heading = document.createElement('h3');
    heading.className = 'panel__subtitle';
    heading.textContent = 'Strength';

    const grid = document.createElement('div');
    grid.className = 'strength';

    const column = (
      label: string,
      value: string,
      detail: string,
      variant: 'attack' | 'defense',
    ): HTMLElement => {
      const box = document.createElement('div');
      box.className = `strength__box strength__box--${variant}`;

      const caption = document.createElement('span');
      caption.className = 'strength__label';
      caption.textContent = label;

      const figure = document.createElement('span');
      figure.className = 'strength__value';
      figure.textContent = value;

      const note = document.createElement('span');
      note.className = 'strength__detail';
      note.textContent = detail;

      box.append(caption, figure, note);
      return box;
    };

    grid.append(
      column('Attacking', `${attack} dmg`, 'per melee round, in the open', 'attack'),
      column(
        'Defending here',
        `${attack} dmg`,
        `takes ${Math.round(reduction * 100)}% less damage (defence ${rating})`,
        'defense',
      ),
    );

    const extras: string[] = [];
    if (volley > 0) extras.push(`Watchtowers open with ${volley} damage.`);
    if (scorpion > 0) extras.push(`Scorpions put ${scorpion} a round into any attacking dragon.`);

    const result: HTMLElement[] = [heading, grid];
    if (extras.length > 0) {
      const note = document.createElement('p');
      note.className = 'panel__hint';
      note.textContent = extras.join(' ');
      result.push(note);
    }
    return result;
  }

  /** A key for the unit types actually standing here — not an abstract table. */
  function rolesSection(id: RegionId): HTMLElement[] {
    const present = [...new Set(unitsIn(state, id).map((unit) => unit.type))];
    if (present.length === 0) return [];

    const heading = document.createElement('h3');
    heading.className = 'panel__subtitle';
    heading.textContent = 'Roles';

    const list = document.createElement('dl');
    list.className = 'roles';
    for (const type of present) {
      const term = document.createElement('dt');
      term.className = `roles__type roles__type--${type}`;
      term.textContent = type;

      const detail = document.createElement('dd');
      detail.textContent = UNIT_ROLES[type];

      list.append(term, detail);
    }

    return [heading, list];
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
    if (!regionState || regionState.owner !== actingPlayer) return [];
    if (!isActiveTeamMember(state, actingPlayer)) return [];

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
          recruitBlockedReason(state, id, type, actingPlayer),
          () => onRecruit(id, type),
        ),
      );
    }

    for (const type of DEFENSE_TYPES) {
      const count = regionState.defenses[type];
      grid.append(
        buildButton(
          `${type} ${defenseCost(type)}g (${count}/${defenseCap(type)})`,
          fortifyBlockedReason(state, id, type, actingPlayer),
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
      empty.textContent = 'No garrison. This hold will fall to anyone who walks in.';
      return [heading, empty];
    }

    // Whose these are decides everything about how to read the list: your own
    // can be ordered out, anyone else's are what you would have to fight.
    const holder = units[0]!.owner;
    const allegiance = document.createElement('p');
    allegiance.className = `allegiance allegiance--${holder === actingPlayer ? 'mine' : 'theirs'}`;
    allegiance.textContent =
      holder === actingPlayer
        ? 'Yours — can be ordered out to attack.'
        : `${ownerLabel(holder)} — these defend the hold if you assault it.`;

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

      const profile = unitProfile(unit.type, state.turn);

      const health = document.createElement('span');
      health.className = 'unit__hp';
      // Attack is shown alongside health because a dragon's grows every turn,
      // and that growth is the clock the whole late game runs on.
      health.textContent = `${unit.hp}/${profile.hp} hp · ${profile.atk} atk`;

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

    const result: HTMLElement[] = [heading, allegiance, list];

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
      hint.textContent =
        selectedUnitIds.size === 0
          ? 'Tick units, or Select all, to raise a marching force.'
          : 'Now click a highlighted hold to march. Clicking elsewhere just looks.';

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
