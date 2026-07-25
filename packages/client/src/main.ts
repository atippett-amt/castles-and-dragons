import './style.css';
import type { SetupChoices } from '@shared/index';
import { createApp } from './app';
import { gameFromChoices, gameFromSave } from './setup/game';
import { createSetupScreen } from './setup/setupScreen';
import { clearGame, loadGame } from './setup/storage';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app mount point is missing from index.html');

function showSetup(): void {
  createSetupScreen(root!, {
    // The save is left alone until a new game actually starts, so a player who
    // hits New game and thinks better of it can still pick up where they were.
    canResume: loadGame() !== null,
    onResume: resume,
    onStart: (choices: SetupChoices) => {
      clearGame();
      createApp(root!, gameFromChoices(choices), { onNewGame: showSetup });
    },
  });
}

function resume(): void {
  const save = loadGame();
  if (!save) {
    showSetup();
    return;
  }
  createApp(root!, gameFromSave(save), { onNewGame: showSetup });
}

// A game in progress is picked up straight away; otherwise, the setup screen.
if (loadGame() !== null) resume();
else showSetup();
