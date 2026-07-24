import {
  activeTeam,
  endTurn,
  fortify,
  isActiveTeamMember,
  legalDestinations,
  moveUnits,
  recruit,
  unitsIn,
  type DefenseType,
  type RecruitableType,
  type RegionId,
  type Unit,
  type UnitId,
} from '@shared/index';
import { createBoard } from './render/board';
import { createDefaultGame } from './setup/defaultGame';
import { createBattleLog } from './ui/battleLog';
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
  const { map, graph, state, humanPlayerId } = createDefaultGame();

  let selectedRegion: RegionId | null = null;
  let selectedUnits = new Set<UnitId>();

  /**
   * Only your own units, and only on your own turn.
   *
   * Scoped to the player rather than the team on purpose: an ally shares your
   * turn but not your chain of command, so you never end up steering someone
   * else's holds. Until Phase 6 lands, the AI players simply do nothing on
   * their turns.
   */
  const canOrder = (unit: Unit): boolean =>
    unit.owner === humanPlayerId &&
    isActiveTeamMember(state, humanPlayerId) &&
    unit.movesLeft > 0;

  /** True when nobody on the active team is human — an AI's turn to act. */
  const isAiTurn = (): boolean => !isActiveTeamMember(state, humanPlayerId);

  const holdName = (id: RegionId): string => graph.regions.get(id)?.name ?? id;

  const hud = createHud({ state, onEndTurn });
  const panel = createHoldPanel({
    graph,
    state,
    actingPlayer: humanPlayerId,
    canOrder,
    onToggleUnit,
    onSelectAll,
    onRecruit,
    onFortify,
  });
  const board = createBoard({ map, graph, state, onSelect: onHoldClick });
  const battleLog = createBattleLog(graph);

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
      const result = moveUnits(state, graph, ids, to, humanPlayerId);
      if (result.battle) battleLog.show(result.battle);

      switch (result.outcome) {
        case 'captured':
          hud.say(
            result.battle
              ? `${holdName(to)} stormed and taken.`
              : `Took ${holdName(to)}.`,
          );
          selectRegion(to);
          return;
        case 'reinforced':
          hud.say(`Reinforced ${holdName(to)}.`);
          selectRegion(to);
          return;
        case 'repelled':
          // The survivors, if any, are still standing where they started.
          hud.say(`The assault on ${holdName(to)} was thrown back.`, 'warn');
          selectRegion(selectedRegion);
          return;
      }
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

  function onRecruit(regionId: RegionId, type: RecruitableType): void {
    try {
      recruit(state, regionId, type, humanPlayerId);
      hud.say(`Raised a ${type} at ${holdName(regionId)}.`);
      // Re-open the hold so the new unit appears and is picked up for orders.
      selectRegion(regionId);
    } catch (error) {
      hud.say(error instanceof Error ? error.message : 'Cannot recruit', 'warn');
      render();
    }
  }

  function onFortify(regionId: RegionId, type: DefenseType): void {
    try {
      fortify(state, regionId, type, humanPlayerId);
      hud.say(`Built ${type} at ${holdName(regionId)}.`);
      render();
    } catch (error) {
      hud.say(error instanceof Error ? error.message : 'Cannot build', 'warn');
      render();
    }
  }

  function onEndTurn(): void {
    const change = endTurn(state, graph);
    selectedRegion = null;
    selectedUnits = new Set();

    if (change.hatchings.length > 0) {
      // The one turn in the game that changes everything at once.
      hud.say(
        `The eggs have hatched — ${change.hatchings.length} dragons wake across the realm. Turn ${change.turn}.`,
      );
      render();
      return;
    }

    announceTurn(change.turn, change.incomeCollected);
    render();
  }

  function announceTurn(turn: number, income: number): void {
    const name = activeTeam(state).name;
    if (isAiTurn()) {
      // Phase 6 makes this turn play itself. Saying so beats leaving a player
      // clicking at a board that will not respond.
      hud.say(`${name} (AI) — no AI yet, End Turn to continue. Turn ${turn}.`, 'warn');
    } else {
      hud.say(`Your move — turn ${turn}. Collected ${income} gold.`);
    }
  }

  const stage = document.createElement('main');
  stage.className = 'stage';
  stage.append(board.element, panel.element, battleLog.element);

  // Clicking bare map, outside any banner, clears the selection.
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === board.element) selectRegion(null);
  });

  root.append(hud.element, stage);
  announceTurn(state.turn, 0);
  render();
}
