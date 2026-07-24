import { activeTeam, type GameState } from '@shared/index';
import { EDGE_STYLE, colorForOwner } from '../render/colors';

export interface Hud {
  readonly element: HTMLElement;
  refresh(): void;
}

/** Top bar: which realm, which turn, whose move — plus a key for the edges. */
export function createHud(state: GameState): Hud {
  const element = document.createElement('header');
  element.className = 'hud';

  const realm = document.createElement('span');
  realm.className = 'hud__realm';
  realm.textContent = state.mapName;

  const turn = document.createElement('span');
  turn.className = 'hud__turn';

  const team = document.createElement('span');
  team.className = 'hud__team';

  element.append(realm, turn, team, createLegend());

  function refresh(): void {
    turn.textContent = `Turn ${state.turn} / ${state.turnLimit}`;

    const current = activeTeam(state);
    const firstPlayer = state.players.find((player) => player.teamId === current.id);
    team.textContent = current.name;
    team.style.setProperty(
      '--owner',
      firstPlayer ? colorForOwner(state, firstPlayer.id) : 'transparent',
    );
  }

  refresh();
  return { element, refresh };
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
