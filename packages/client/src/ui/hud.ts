import { activeTeam, playersOfTeam, type GameState } from '@shared/index';
import { EDGE_STYLE, colorForOwner } from '../render/colors';

export interface Hud {
  readonly element: HTMLElement;
  refresh(): void;
  /** Shows the result of the last order, e.g. a capture or a blocked move. */
  say(message: string, tone?: 'info' | 'warn'): void;
  /** Updates the zoom readout and greys the controls at their limits. */
  setZoom(zoom: number, maxZoom: number): void;
}

export interface HudOptions {
  readonly state: GameState;
  readonly onEndTurn: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onFullscreen: () => void;
}

/** Top bar: which realm, which turn, whose move, and the End Turn control. */
export function createHud(options: HudOptions): Hud {
  const { state, onEndTurn, onZoomIn, onZoomOut, onFit, onFullscreen } = options;

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

  const iconButton = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--icon';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  };

  const zoomOut = iconButton('−', 'Zoom out', onZoomOut);
  const zoomIn = iconButton('+', 'Zoom in', onZoomIn);
  const zoomLevel = document.createElement('span');
  zoomLevel.className = 'zoom__level';
  zoomLevel.title = 'Click to fit the whole map';
  zoomLevel.addEventListener('click', onFit);

  const zoom = document.createElement('span');
  zoom.className = 'zoom';
  zoom.append(zoomOut, zoomLevel, zoomIn, iconButton('⤢', 'Fullscreen', onFullscreen));

  element.append(realm, turn, team, treasury, message, createLegend(), zoom, endTurn);

  function setZoom(current: number, max: number): void {
    zoomLevel.textContent = `${Math.round(current * 100)}%`;
    zoomOut.disabled = current <= 1.001;
    // At the ceiling one source pixel maps to one device pixel; going further
    // would upscale, so the control simply stops.
    zoomIn.disabled = current >= max - 0.001;
    zoomIn.title = zoomIn.disabled ? 'Already at the limit of the map’s detail' : 'Zoom in';
  }

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
  setZoom(1, 1);
  return { element, refresh, say, setZoom };
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
