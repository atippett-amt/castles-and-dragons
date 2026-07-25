import {
  activeTeam,
  endTurn,
  fortify,
  takeAiTeamTurn,
  teamIsAllAI,
  type AiAction,
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
import { createTurnReport } from './ui/turnReport';
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
  const turnReport = createTurnReport(state, graph);

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

  /**
   * Opens a hold for inspection. Deliberately selects NOTHING.
   *
   * This used to pre-select every unit that could march, which meant clicking a
   * neighbouring hold just to look at it marched your whole garrison into it
   * and left the first hold empty. Picking up an army is now an explicit act:
   * tick units, or use Select all, and only then does a click on a highlighted
   * hold become an order.
   */
  function selectRegion(id: RegionId | null): void {
    selectedRegion = id;
    selectedUnits = new Set();
    render();
  }

  function onHoldClick(id: RegionId): void {
    if (selectedUnits.size > 0 && targets().has(id)) {
      march(id);
      return;
    }
    selectRegion(id);
  }

  /** Total hit points standing in a hold, whoever they belong to. */
  function holdHealth(id: RegionId): number {
    return unitsIn(state, id).reduce((sum, unit) => sum + unit.hp, 0);
  }

  /**
   * Floats the health swing over both holds an order touched.
   *
   * Measured across the whole order rather than read out of the battle report,
   * so a bloodless reinforcement reads the same way a siege does — the hold
   * that gained shows a plus, the one that bled shows a minus.
   */
  function flashHealthChange(ids: readonly RegionId[], before: ReadonlyMap<RegionId, number>): void {
    for (const id of ids) {
      const was = before.get(id) ?? 0;
      const now = holdHealth(id);
      if (was !== now) board.flash(id, now - was, now);
    }
  }

  function march(to: RegionId): void {
    const ids = [...selectedUnits];
    const from = selectedRegion;
    const touched = from === null ? [to] : [from, to];
    const before = new Map(touched.map((id) => [id, holdHealth(id)]));

    try {
      const result = moveUnits(state, graph, ids, to, humanPlayerId);
      if (result.battle) battleLog.show(result.battle);
      flashHealthChange(touched, before);

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
    const before = new Map([[regionId, holdHealth(regionId)]]);
    try {
      recruit(state, regionId, type, humanPlayerId);
      hud.say(`Raised a ${type} at ${holdName(regionId)}.`);
      flashHealthChange([regionId], before);
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

  /**
   * Ends your turn, then plays every AI turn until the board is yours again.
   *
   * The opponents resolve in one go rather than pausing between them: with up
   * to seven of them a per-turn pause would be tedious, and the turn report
   * says what happened. The guard is a safety net — a game with no human team
   * would otherwise spin forever.
   */
  function onEndTurn(): void {
    selectedRegion = null;
    selectedUnits = new Set();

    let change = endTurn(state, graph);
    let hatched = change.hatchings.length;
    const aiActions: AiAction[] = [];

    let guard = 0;
    while (teamIsAllAI(state, activeTeam(state).id) && guard++ < 64) {
      aiActions.push(...takeAiTeamTurn(state, graph, activeTeam(state).id));
      change = endTurn(state, graph);
      hatched += change.hatchings.length;
    }

    turnReport.show(aiActions, change.turn);

    if (hatched > 0) {
      // The one turn in the game that changes everything at once.
      hud.say(`The eggs have hatched — ${hatched} dragons wake across the realm. Turn ${change.turn}.`);
    } else {
      announceTurn(change.turn, change.incomeCollected);
    }

    render();
  }

  function announceTurn(turn: number, income: number): void {
    if (isAiTurn()) {
      // Only reachable if every team is AI — nothing for a human to do.
      hud.say(`${activeTeam(state).name} (AI) holds the turn. Turn ${turn}.`, 'warn');
    } else {
      hud.say(`Your move — turn ${turn}. Collected ${income} gold.`);
    }
  }

  const stage = document.createElement('main');
  stage.className = 'stage';
  stage.append(board.element, panel.element, battleLog.element, turnReport.element);

  // Clicking bare map, outside any banner, clears the selection.
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === board.element) selectRegion(null);
  });

  // Dev-only handle for poking at the engine from the console. Stripped from
  // production builds by the import.meta.env.DEV guard.
  if (import.meta.env.DEV) {
    (globalThis as unknown as Record<string, unknown>)['__game'] = { state, graph, map };
  }

  root.append(hud.element, stage);
  announceTurn(state.turn, 0);
  render();
}
