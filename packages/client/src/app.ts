import {
  activeTeam,
  endTurn,
  isActiveTeamMember,
  legalDestinations,
  moveUnits,
  unitsIn,
  type RegionId,
  type Unit,
  type UnitId,
} from '@shared/index';
import { createBoard } from './render/board';
import { createDefaultGame } from './setup/defaultGame';
import { createHoldPanel } from './ui/holdPanel';
import { createHud } from './ui/hud';

/**
 * The client controller.
 *
 * It owns only *selection* — which hold is open and which units are picked.
 * Every rule lives in `shared`, and this module never edits GameState directly;
 * it calls an engine function and re-renders whatever comes back. That split is
 * what lets Stage B drop an authoritative server in behind the same UI: the
 * calls become messages, and nothing here has to change shape.
 *
 * Until Phase 6 adds AI, ending a turn simply hands control to the next team,
 * so one player drives every side.
 */
export function createApp(root: HTMLElement): void {
  const { map, graph, state } = createDefaultGame();

  let selectedRegion: RegionId | null = null;
  let selectedUnits = new Set<UnitId>();

  const canOrder = (unit: Unit): boolean =>
    isActiveTeamMember(state, unit.owner) && unit.movesLeft > 0;

  const holdName = (id: RegionId): string => graph.regions.get(id)?.name ?? id;

  const hud = createHud({ state, onEndTurn });
  const panel = createHoldPanel({ graph, state, canOrder, onToggleUnit, onSelectAll });
  const board = createBoard({ map, graph, state, onSelect: onHoldClick });

  /** Holds the current selection could march into this turn. */
  function targets(): ReadonlySet<RegionId> {
    if (selectedUnits.size === 0) return new Set();
    return new Set(legalDestinations(state, graph, [...selectedUnits]));
  }

  function render(): void {
    board.refresh();
    board.select(selectedRegion);
    board.highlight(targets());
    hud.refresh();
    panel.show(selectedRegion, selectedUnits);
  }

  function selectRegion(id: RegionId | null): void {
    selectedRegion = id;
    // Opening a hold pre-picks everything that can actually march, which is the
    // common case; individual units can then be unchecked in the panel.
    selectedUnits = new Set(
      id === null ? [] : unitsIn(state, id).filter(canOrder).map((unit) => unit.id),
    );
    render();
  }

  function onHoldClick(id: RegionId): void {
    if (selectedUnits.size > 0 && targets().has(id)) {
      march(id);
      return;
    }
    selectRegion(id);
  }

  function march(to: RegionId): void {
    const ids = [...selectedUnits];
    try {
      const result = moveUnits(state, graph, ids, to);

      switch (result.outcome) {
        case 'captured':
          hud.say(`Took ${holdName(to)}.`);
          break;
        case 'reinforced':
          hud.say(`Reinforced ${holdName(to)}.`);
          break;
        case 'battle':
          hud.say(`${holdName(to)} is defended — sieges arrive in Phase 4.`, 'warn');
          render();
          return;
      }

      selectRegion(to);
    } catch (error) {
      hud.say(error instanceof Error ? error.message : 'Illegal move', 'warn');
      render();
    }
  }

  function onToggleUnit(unitId: UnitId): void {
    if (selectedUnits.has(unitId)) selectedUnits.delete(unitId);
    else selectedUnits.add(unitId);
    render();
  }

  function onSelectAll(regionId: RegionId, select: boolean): void {
    selectedUnits = new Set(
      select ? unitsIn(state, regionId).filter(canOrder).map((unit) => unit.id) : [],
    );
    render();
  }

  function onEndTurn(): void {
    const change = endTurn(state);
    selectedRegion = null;
    selectedUnits = new Set();
    hud.say(`${activeTeam(state).name} to move — turn ${change.turn}.`);
    render();
  }

  const stage = document.createElement('main');
  stage.className = 'stage';
  stage.append(board.element, panel.element);

  // Clicking bare map, outside any banner, clears the selection.
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === board.element) selectRegion(null);
  });

  root.append(hud.element, stage);
  hud.say(`${activeTeam(state).name} to move — turn ${state.turn}.`);
  render();
}
