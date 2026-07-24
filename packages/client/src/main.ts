import './style.css';
import { BALANCE } from '@shared/index';

/**
 * Phase 0 — the board is just the map art, letterboxed to fill the viewport.
 *
 * The badge is deliberate scaffolding: it reads a value out of the `shared`
 * package, which proves the monorepo wiring (workspace + alias + TS) works
 * end-to-end in both `dev` and `build`. Phase 1 replaces it with a real HUD.
 */
function mount(root: HTMLElement): void {
  const board = document.createElement('div');
  board.className = 'board';

  const map = document.createElement('img');
  map.className = 'board__map';
  map.src = 'assets/map.png';
  map.alt = 'The Wilson Lake Realms — ten holds divided by Wilson Lake';

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = `Wilson Lake Realms · Turn 1 / ${BALANCE.game.turnLimit}`;

  board.append(map, badge);
  root.append(board);
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app mount point is missing from index.html');
mount(root);
