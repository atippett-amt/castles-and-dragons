import './style.css';
import { createBoard } from './render/board';
import { createDefaultGame } from './setup/defaultGame';
import { createHoldPanel } from './ui/holdPanel';
import { createHud } from './ui/hud';

/**
 * Phase 1 — the map is a live region graph.
 *
 * Ten holds render with owner colours and their dragon eggs, every edge is
 * drawn (land and bridge solid, water dashed), and clicking a hold shows its
 * terrain, income and borders. There are no units yet; Phase 2 adds movement.
 */
function mount(root: HTMLElement): void {
  const { map, graph, state } = createDefaultGame();

  const hud = createHud(state);
  const panel = createHoldPanel({ graph, state });
  const board = createBoard({
    map,
    graph,
    state,
    onSelect: (id) => panel.show(id),
  });

  const stage = document.createElement('main');
  stage.className = 'stage';
  stage.append(board.element, panel.element);

  // Clicking the bare map (not a banner) clears the selection.
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === board.element) {
      board.select(null);
      panel.show(null);
    }
  });

  root.append(hud.element, stage);
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app mount point is missing from index.html');
mount(root);
