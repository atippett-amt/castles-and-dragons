import type { BattleReport, Graph } from '@shared/index';

export interface BattleLog {
  readonly element: HTMLElement;
  show(report: BattleReport): void;
  hide(): void;
}

/**
 * A blow-by-blow account of the last siege.
 *
 * Sieges resolve instantly and can swing a whole game, so the outcome alone is
 * not enough — a player needs to see that the watchtowers fired, that the
 * scorpions found the dragon, and how close the melee was, or the result reads
 * as arbitrary.
 */
export function createBattleLog(graph: Graph): BattleLog {
  const element = document.createElement('section');
  element.className = 'battlelog';
  element.hidden = true;

  function hide(): void {
    element.hidden = true;
    element.replaceChildren();
  }

  function show(report: BattleReport): void {
    element.hidden = false;
    element.classList.toggle('battlelog--won', report.outcome === 'captured');

    const holdName = graph.regions.get(report.regionId)?.name ?? report.regionId;

    const title = document.createElement('h2');
    title.className = 'battlelog__title';
    title.textContent =
      report.outcome === 'captured' ? `${holdName} has fallen` : `Repelled at ${holdName}`;

    const summary = document.createElement('p');
    summary.className = 'battlelog__summary';
    const parts = [
      `${report.rounds} round${report.rounds === 1 ? '' : 's'}`,
      `${report.attackerLosses.length} attacker${report.attackerLosses.length === 1 ? '' : 's'} lost`,
      `${report.defenderLosses.length} defender${report.defenderLosses.length === 1 ? '' : 's'} lost`,
    ];
    if (report.claimedDragonIds.length > 0) {
      parts.push(`${report.claimedDragonIds.length} dragon claimed`);
    }
    summary.textContent = parts.join(' · ');

    const list = document.createElement('ol');
    list.className = 'battlelog__events';
    for (const event of report.log) {
      const item = document.createElement('li');
      item.textContent = event.text;
      list.append(item);
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'button battlelog__dismiss';
    dismiss.textContent = 'Close';
    dismiss.addEventListener('click', hide);

    element.replaceChildren(title, summary, list, dismiss);
  }

  return { element, show, hide };
}
