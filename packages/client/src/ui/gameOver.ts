import {
  teamHolds,
  teamStrength,
  type GameState,
  type Outcome,
  type PlayerId,
} from '@shared/index';
import { colorForOwner } from '../render/colors';

export interface GameOverScreen {
  readonly element: HTMLElement;
  show(outcome: Outcome): void;
}

export interface GameOverOptions {
  readonly state: GameState;
  /** The player at this browser, so the screen can say won or lost. */
  readonly humanPlayerId: PlayerId;
  readonly onRestart: () => void;
}

/**
 * The result screen.
 *
 * Says who won, how, and what the board looked like at the end. "How" matters:
 * winning on holds at the turn limit is a different game from wiping everyone
 * out, and a player who ran the clock down deserves to be told that is what
 * happened.
 */
export function createGameOverScreen(options: GameOverOptions): GameOverScreen {
  const { state, humanPlayerId, onRestart } = options;

  const element = document.createElement('div');
  element.className = 'gameover';
  element.hidden = true;

  const humanTeam = state.players.find((player) => player.id === humanPlayerId)?.teamId;
  const teamName = (id: string | null): string =>
    state.teams.find((team) => team.id === id)?.name ?? 'Nobody';

  function headline(outcome: Outcome): string {
    if (outcome.winningTeamId === null) return 'A draw';
    if (outcome.winningTeamId === humanTeam) return 'You win';
    return `${teamName(outcome.winningTeamId)} wins`;
  }

  function explain(outcome: Outcome): string {
    switch (outcome.kind) {
      case 'conquest':
        return 'Every rival has lost their last hold.';
      case 'holds':
        return `The realm ran out of turns. ${teamName(outcome.winningTeamId)} ended holding the most ground.`;
      case 'strength':
        return `The realm ran out of turns level on holds, so it fell to the larger army.`;
      case 'draw':
        return 'The realm ran out of turns with nothing between them.';
    }
  }

  function show(outcome: Outcome): void {
    element.hidden = false;

    const won = outcome.winningTeamId === humanTeam;
    element.classList.toggle('gameover--won', won);
    element.classList.toggle('gameover--lost', outcome.winningTeamId !== null && !won);

    const card = document.createElement('div');
    card.className = 'gameover__card';

    const title = document.createElement('h1');
    title.className = 'gameover__title';
    title.textContent = headline(outcome);

    const reason = document.createElement('p');
    reason.className = 'gameover__reason';
    reason.textContent = `${explain(outcome)} Turn ${outcome.turn} of ${state.turnLimit}.`;

    const table = document.createElement('table');
    table.className = 'gameover__table';
    const head = document.createElement('tr');
    for (const label of ['', 'Holds', 'Strength']) {
      const cell = document.createElement('th');
      cell.textContent = label;
      head.append(cell);
    }
    table.append(head);

    // Ranked as the tiebreak ranks them, so the result is checkable by eye.
    const ranked = [...state.teams].sort(
      (a, b) =>
        teamHolds(state, b.id) - teamHolds(state, a.id) ||
        teamStrength(state, b.id) - teamStrength(state, a.id),
    );

    for (const team of ranked) {
      const row = document.createElement('tr');
      if (team.id === outcome.winningTeamId) row.className = 'gameover__winner';

      const name = document.createElement('td');
      name.textContent = team.name;
      const first = state.players.find((player) => player.teamId === team.id);
      if (first) name.style.setProperty('--owner', colorForOwner(state, first.id));

      const holds = document.createElement('td');
      holds.textContent = String(teamHolds(state, team.id));
      const strength = document.createElement('td');
      strength.textContent = String(teamStrength(state, team.id));

      row.append(name, holds, strength);
      table.append(row);
    }

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'button button--primary';
    again.textContent = 'Play again';
    again.addEventListener('click', onRestart);

    card.append(title, reason, table, again);
    element.replaceChildren(card);
  }

  return { element, show };
}
