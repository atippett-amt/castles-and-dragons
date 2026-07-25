import { beforeEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  NEUTRAL,
  activeTeam,
  allUnits,
  buildGraph,
  createInitialState,
  endTurn,
  getRegion,
  loadMap,
  playerById,
  spawnUnit,
  takeAiTeamTurn,
  takeAiTurn,
  teamIsAllAI,
  unitsIn,
  type GameState,
  type Graph,
  type MapData,
  type PlayerSetup,
} from '@shared/index';
import rawHolds from '../data/maps/holds.json';
import { clearHold, clearNeutralGarrisons } from './helpers';

const map: MapData = loadMap(rawHolds);
const graph: Graph = buildGraph(map);

/** The AI holds Florence — two bridges and the map's richest income. */
function newGame(overrides: Partial<PlayerSetup> = {}): GameState {
  return createInitialState({
    map,
    players: [
      { id: 'ai', name: 'AI', teamId: 'ai', isAI: true, startRegion: 'florence', ...overrides },
      { id: 'foe', name: 'Foe', teamId: 'foe', isAI: false, startRegion: 'whiteoak' },
    ],
    teams: [
      { id: 'ai', name: 'AI' },
      { id: 'foe', name: 'Foe' },
    ],
  });
}

const rich = (state: GameState, amount = 100): void => {
  playerById(state, 'ai')!.gold = amount;
};

let state: GameState;
beforeEach(() => {
  state = newGame();
});

describe('legality', () => {
  it('never issues an order the engine refuses', () => {
    // The AI calls the same functions a human's clicks do, so an illegal order
    // throws. Playing a whole game without throwing IS the legality test.
    const both = createInitialState({
      map,
      players: [
        { id: 'a', name: 'A', teamId: 'ta', isAI: true, startRegion: 'florence' },
        { id: 'b', name: 'B', teamId: 'tb', isAI: true, difficulty: 'hard', startRegion: 'whiteoak' },
      ],
      teams: [
        { id: 'ta', name: 'A' },
        { id: 'tb', name: 'B' },
      ],
    });

    let guard = 0;
    expect(() => {
      while (both.turn <= BALANCE.game.turnLimit && guard++ < 5000) {
        takeAiTeamTurn(both, graph, activeTeam(both).id);
        endTurn(both, graph);
      }
    }).not.toThrow();

    expect(both.turn).toBeGreaterThan(BALANCE.game.turnLimit);
  });

  it('leaves the game in a coherent state after a full playthrough', () => {
    const both = createInitialState({
      map,
      players: [
        { id: 'a', name: 'A', teamId: 'ta', isAI: true, startRegion: 'florence' },
        { id: 'b', name: 'B', teamId: 'tb', isAI: true, startRegion: 'whiteoak' },
      ],
      teams: [
        { id: 'ta', name: 'A' },
        { id: 'tb', name: 'B' },
      ],
    });

    let guard = 0;
    while (both.turn <= 60 && guard++ < 3000) {
      takeAiTeamTurn(both, graph, activeTeam(both).id);
      endTurn(both, graph);
    }

    const regionIds = new Set(Object.keys(both.regions));
    for (const unit of allUnits(both)) {
      expect(regionIds.has(unit.regionId)).toBe(true);
      expect(unit.hp).toBeGreaterThan(0);
      expect(Number.isInteger(unit.hp)).toBe(true);
    }
    // Dragons are finite: conquest moves them, it never mints them.
    expect(allUnits(both).filter((u) => u.type === 'dragon').length).toBeLessThanOrEqual(
      BALANCE.dragon.total,
    );
    for (const player of both.players) expect(player.gold).toBeGreaterThanOrEqual(0);
  });

  it('does nothing for a human player', () => {
    const human = createInitialState({
      map,
      players: [
        { id: 'h', name: 'H', teamId: 'th', isAI: false, startRegion: 'florence' },
        { id: 'x', name: 'X', teamId: 'tx', isAI: true, startRegion: 'whiteoak' },
      ],
      teams: [
        { id: 'th', name: 'H' },
        { id: 'tx', name: 'X' },
      ],
    });

    expect(takeAiTurn(human, graph, 'h')).toEqual([]);
  });
});

describe('expansion', () => {
  it('walks into an undefended neutral hold', () => {
    clearNeutralGarrisons(state);
    expect(getRegion(state, 'bailey_springs').owner).toBe(NEUTRAL);

    takeAiTurn(state, graph, 'ai');

    const taken = ['bailey_springs', 'sheffield', 'muscle_shoals', 'underwood_petersville'].filter(
      (id) => getRegion(state, id).owner === 'ai',
    );
    expect(taken.length).toBeGreaterThan(0);
  });

  it('prefers the richer of two free holds', () => {
    clearNeutralGarrisons(state);
    // Leave only Muscle Shoals (3 gold) and Bailey Springs (2 gold) reachable
    // by keeping the others defended.
    for (const id of ['sheffield', 'underwood_petersville']) {
      spawnUnit(state, 'swordsman', 'foe', id);
      spawnUnit(state, 'swordsman', 'foe', id);
      spawnUnit(state, 'swordsman', 'foe', id);
      spawnUnit(state, 'swordsman', 'foe', id);
    }

    takeAiTurn(state, graph, 'ai');
    expect(getRegion(state, 'muscle_shoals').owner).toBe('ai');
  });

  it('does not throw itself at a hold it cannot take', () => {
    clearNeutralGarrisons(state);
    // A wall of defenders next door, and nowhere else to go.
    for (const id of ['bailey_springs', 'sheffield', 'muscle_shoals', 'underwood_petersville']) {
      for (let i = 0; i < 8; i++) spawnUnit(state, 'swordsman', 'foe', id);
    }
    const before = unitsIn(state, 'florence').length;

    takeAiTurn(state, graph, 'ai');

    // It stayed home rather than feeding its army in piecemeal.
    expect(unitsIn(state, 'florence').length).toBeGreaterThanOrEqual(before);
    expect(getRegion(state, 'florence').owner).toBe('ai');
  });
});

describe('building', () => {
  it('reaches for a scorpion when a dragon is next door', () => {
    rich(state);
    spawnUnit(state, 'dragon', 'foe', 'muscle_shoals');

    takeAiTurn(state, graph, 'ai');

    expect(getRegion(state, 'florence').defenses.scorpion).toBe(1);
  });

  it('fortifies a threatened bridgehead rather than raising more troops', () => {
    rich(state);
    // Florence guards two of the three bridges; put a force across one.
    for (let i = 0; i < 4; i++) spawnUnit(state, 'swordsman', 'foe', 'sheffield');
    const troopsBefore = unitsIn(state, 'florence').length;

    takeAiTurn(state, graph, 'ai');

    const defenses = getRegion(state, 'florence').defenses;
    const built = defenses.ramparts + defenses.watchtower + defenses.scorpion;
    expect(built).toBe(1);
    // The build action went on the wall, not on a recruit.
    expect(unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length).toBeLessThanOrEqual(
      troopsBefore,
    );
  });

  it('raises troops when nothing threatens it', () => {
    rich(state);
    clearNeutralGarrisons(state);
    clearHold(state, 'sheffield');
    clearHold(state, 'muscle_shoals');
    clearHold(state, 'underwood_petersville');
    clearHold(state, 'bailey_springs');

    const before = unitsIn(state, 'florence').length;
    takeAiTurn(state, graph, 'ai');

    // Some of the garrison marched out, but a recruit was raised first.
    expect(allUnits(state).filter((u) => u.owner === 'ai').length).toBeGreaterThan(before);
  });

  it('spends nothing it does not have', () => {
    playerById(state, 'ai')!.gold = 0;
    takeAiTurn(state, graph, 'ai');
    expect(playerById(state, 'ai')!.gold).toBe(0);
  });
});

describe('threat assessment', () => {
  it('does not mistake a static neutral garrison for a besieging army', () => {
    // Every hold borders a neutral one, so counting neutrals as a threat made
    // the AI wall itself in on turn one and never expand.
    rich(state);
    const actions = takeAiTurn(state, graph, 'ai');

    expect(actions.some((action) => action.kind === 'fortify')).toBe(false);
    expect(actions.some((action) => action.kind === 'recruit')).toBe(true);
  });

  it('still fortifies against a real rival', () => {
    rich(state);
    for (let i = 0; i < 4; i++) spawnUnit(state, 'swordsman', 'foe', 'sheffield');

    const actions = takeAiTurn(state, graph, 'ai');
    expect(actions.some((action) => action.kind === 'fortify')).toBe(true);
  });

  it('marches out when only neutrals are nearby, rather than holding back half', () => {
    clearNeutralGarrisons(state);
    const before = unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length;

    takeAiTurn(state, graph, 'ai');

    // Nothing hostile can reach Florence, so the whole stack was free to move.
    expect(unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length).toBeLessThan(before);
  });
});

describe('concentration', () => {
  it('walks a rear garrison toward the threatened front', () => {
    // The AI holds a block of four. Bailey Springs is deep inside it with
    // nothing to attack; Florence is the frontier facing a massed rival.
    for (const id of ['bailey_springs', 'underwood_petersville', 'killen']) {
      clearHold(state, id);
      getRegion(state, id).owner = 'ai';
    }
    for (let i = 0; i < 4; i++) spawnUnit(state, 'swordsman', 'ai', 'bailey_springs');

    // Too strong to assault, so the reserve cannot simply attack past it.
    for (let i = 0; i < 10; i++) spawnUnit(state, 'swordsman', 'foe', 'sheffield');
    playerById(state, 'ai')!.gold = 0;

    const before = unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length;
    takeAiTurn(state, graph, 'ai');

    expect(unitsIn(state, 'bailey_springs').filter((u) => u.owner === 'ai')).toHaveLength(0);
    expect(unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length).toBeGreaterThan(
      before,
    );
  });
});

describe('caution', () => {
  it('leaves a garrison on a threatened hold instead of marching out entire', () => {
    clearNeutralGarrisons(state);
    // A threat next door, and a free hold beckoning on the other side.
    spawnUnit(state, 'swordsman', 'foe', 'muscle_shoals');
    for (let i = 0; i < 3; i++) spawnUnit(state, 'swordsman', 'ai', 'florence');

    takeAiTurn(state, graph, 'ai');

    expect(unitsIn(state, 'florence').filter((u) => u.owner === 'ai').length).toBeGreaterThan(0);
  });
});

describe('difficulty', () => {
  it('makes a cautious AI refuse odds a bold one accepts', () => {
    const build = (difficulty: 'easy' | 'hard'): GameState => {
      const game = newGame({ difficulty });
      clearNeutralGarrisons(game);
      playerById(game, 'ai')!.gold = 0; // keep the build pass out of it

      // Florence's other land neighbours go to the AI, so the only hostile
      // target is Muscle Shoals and it cannot wander off to something free.
      // (Ford City is across water and unreachable by infantry anyway.)
      for (const id of ['underwood_petersville', 'bailey_springs', 'sheffield']) {
        clearHold(game, id);
        getRegion(game, id).owner = 'ai';
      }

      // Six swordsmen at home; the AI keeps half back, so three go forward
      // against three. Near enough even that the margin decides it.
      clearHold(game, 'florence');
      for (let i = 0; i < 6; i++) spawnUnit(game, 'swordsman', 'ai', 'florence');
      clearHold(game, 'muscle_shoals');
      for (let i = 0; i < 3; i++) spawnUnit(game, 'swordsman', 'foe', 'muscle_shoals');

      return game;
    };

    const attacked = (difficulty: 'easy' | 'hard'): boolean =>
      takeAiTurn(build(difficulty), graph, 'ai').some((action) => action.kind === 'attack');

    expect(attacked('hard')).toBe(true);
    expect(attacked('easy')).toBe(false);
  });
});

describe('team helpers', () => {
  it('spots an all-AI team', () => {
    expect(teamIsAllAI(state, 'ai')).toBe(true);
    expect(teamIsAllAI(state, 'foe')).toBe(false);
  });

  it('plays every AI on a team', () => {
    const pair = createInitialState({
      map,
      players: [
        { id: 'a1', name: 'A1', teamId: 'allies', isAI: true, startRegion: 'florence' },
        { id: 'a2', name: 'A2', teamId: 'allies', isAI: true, startRegion: 'killen' },
      ],
      teams: [{ id: 'allies', name: 'Allies' }],
    });
    clearNeutralGarrisons(pair);

    const actions = takeAiTeamTurn(pair, graph, 'allies');
    expect(new Set(actions.map((a) => a.playerId))).toEqual(new Set(['a1', 'a2']));
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const run = (): string => {
      const game = createInitialState({
        map,
        players: [
          { id: 'a', name: 'A', teamId: 'ta', isAI: true, startRegion: 'florence' },
          { id: 'b', name: 'B', teamId: 'tb', isAI: true, startRegion: 'whiteoak' },
        ],
        teams: [
          { id: 'ta', name: 'A' },
          { id: 'tb', name: 'B' },
        ],
        seed: 20250724,
      });
      for (let i = 0; i < 40; i++) {
        takeAiTeamTurn(game, graph, activeTeam(game).id);
        endTurn(game, graph);
      }
      return JSON.stringify(game);
    };

    expect(run()).toBe(run());
  });
});
