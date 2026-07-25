import type { AiAction, GameState, Graph } from '@shared/index';
import { colorForOwner } from '../render/colors';

export interface TurnReport {
  readonly element: HTMLElement;
  show(actions: readonly AiAction[], turn: number): void;
  hide(): void;
}

/**
 * What the opponents did while you were not looking.
 *
 * AI turns resolve instantly between your own, so without this the board simply
 * looks different when it comes back to you and you have to work out why. The
 * phrasing lives here rather than in the engine — `shared` reports structured
 * actions and the client decides how they read.
 */
export function createTurnReport(state: GameState, graph: Graph): TurnReport {
  const element = document.createElement('section');
  element.className = 'report';
  element.hidden = true;

  const holdName = (id: string): string => graph.regions.get(id)?.name ?? id;
  const playerName = (id: string): string =>
    state.players.find((player) => player.id === id)?.name ?? id;

  function describe(action: AiAction): string {
    switch (action.kind) {
      case 'recruit':
        return `raised a ${action.what} at ${holdName(action.regionId)}`;
      case 'fortify':
        return `built ${action.what} at ${holdName(action.regionId)}`;
      case 'march':
        return `marched into ${holdName(action.regionId)}`;
      case 'attack':
        return action.captured
          ? `stormed ${holdName(action.regionId)}`
          : `was thrown back from ${holdName(action.regionId)}`;
    }
  }

  function hide(): void {
    element.hidden = true;
    element.replaceChildren();
  }

  function show(actions: readonly AiAction[], turn: number): void {
    if (actions.length === 0) {
      hide();
      return;
    }
    element.hidden = false;

    const title = document.createElement('h2');
    title.className = 'report__title';
    title.textContent = `While you waited — turn ${turn}`;

    const list = document.createElement('ul');
    list.className = 'report__list';

    for (const action of actions) {
      const item = document.createElement('li');
      item.className = `report__item${action.kind === 'attack' ? ' report__item--battle' : ''}`;
      item.style.setProperty('--owner', colorForOwner(state, action.playerId));

      const who = document.createElement('span');
      who.className = 'report__who';
      who.textContent = playerName(action.playerId);

      const what = document.createElement('span');
      what.textContent = ` ${describe(action)}.`;

      item.append(who, what);
      list.append(item);
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'button';
    dismiss.textContent = 'Close';
    dismiss.addEventListener('click', hide);

    element.replaceChildren(title, list, dismiss);
  }

  return { element, show, hide };
}
