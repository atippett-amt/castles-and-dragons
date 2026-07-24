import { activeTeam, playersOfTeam, type GameState } from '@shared/index';
import { EDGE_STYLE, colorForOwner } from '../render/colors';

export interface Hud {
  readonly element: HTMLElement;
  refresh(): void;
  /** Shows the result of the last order, e.g. a capture or a blocked move. */
  say(message: string, tone?: 'info' | 'warn'): void;
}

export interface HudOptions {
  readonly state: GameState;
  readonly onEndTurn: () => void;
}

/** Top bar: which realm, which turn, whose move, and the End Turn control. */
export function createHud(options: HudOptions): Hud {
  const { state, onEndTurn } = options;

  const element = document.createElement('header');
  element.className = 'hud';

  const realm = document.createElement('span');
  realm.className = 'hud__realm';
  realm.textContent = state.mapName;

  const turn = document.createElement('span');
  turn.className = 'hud__turn';

  const team = document.createElement('span');
  team.className = 'hud__team';

  const treasury = document.createElement('span');
  treasury.className = 'hud__treasury';

  const message = document.createElement('span');
  message.className = 'hud__message';

  const endTurn = document.createElement('button');
  endTurn.type = 'button';
  endTurn.className = 'button button--primary';
  endTurn.textContent = 'End Turn';
  endTurn.addEventListener('click', onEndTurn);

  element.append(realm, turn, team, treasury, message, createLegend(), endTurn);

  function refresh(): void {
    turn.textContent = `Turn ${state.turn} / ${state.turnLimit}`;

    const current = activeTeam(state);
    const members = playersOfTeam(state, current.id);
    const first = members[0];

    team.textContent = current.name;
    team.style.setProperty('--owner', first ? colorForOwner(state, first.id) : 'transparent');

    // Only the acting team's purses — showing every player's gold would leak
    // information the opponent should not have once Stage B is multiplayer.
    treasury.replaceChildren();
    for (const player of members) {
      const entry = document.createElement('span');
      entry.className = 'purse';
      entry.style.setProperty('--owner', colorForOwner(state, player.id));
      entry.textContent = `${player.name} ${player.gold}g`;
      treasury.append(entry);
    }
  }

  function say(text: string, tone: 'info' | 'warn' = 'info'): void {
    message.textContent = text;
    message.classList.toggle('hud__message--warn', tone === 'warn');
  }

  refresh();
  return { element, refresh, say };
}

function createLegend(): HTMLElement {
  const legend = document.createElement('span');
  legend.className = 'legend';

  const entries: readonly (readonly [string, string])[] = [
    ['land', 'Land'],
    ['bridge', 'Bridge'],
    ['water', 'Water — dragons only'],
  ];

  for (const [type, label] of entries) {
    const style = EDGE_STYLE[type];
    const item = document.createElement('span');
    item.className = 'legend__item';

    const swatch = document.createElement('span');
    swatch.className = 'legend__swatch';
    swatch.style.borderTopColor = style?.stroke ?? 'transparent';
    swatch.style.borderTopWidth = `${style?.width ?? 1}px`;
    swatch.style.borderTopStyle = style?.dash ? 'dashed' : 'solid';

    const text = document.createElement('span');
    text.textContent = label;

    item.append(swatch, text);
    legend.append(item);
  }

  return legend;
}
