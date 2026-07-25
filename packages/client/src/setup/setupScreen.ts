import {
  DIFFICULTIES,
  PRESETS,
  playerCountFor,
  presetById,
  type Difficulty,
  type PresetId,
  type SetupChoices,
  type Side,
} from '@shared/index';

export interface SetupScreenOptions {
  /** Offered only when there is a game worth going back to. */
  readonly canResume: boolean;
  readonly onStart: (choices: SetupChoices) => void;
  readonly onResume: () => void;
}

/**
 * The screen before the game.
 *
 * Deliberately small: a preset, how many houses, which shore, and how hard the
 * opponents play. Everything else about a starting position is derived, so
 * there is nothing here that could disagree with the engine.
 */
export function createSetupScreen(root: HTMLElement, options: SetupScreenOptions): void {
  const choices = {
    preset: 'ffa' as PresetId,
    playerCount: 4,
    humanName: 'You',
    humanSide: 'north' as Side,
    difficulty: 'normal' as Difficulty,
  };

  const screen = document.createElement('div');
  screen.className = 'setup';

  const card = document.createElement('div');
  card.className = 'setup__card';

  const title = document.createElement('h1');
  title.className = 'setup__title';
  title.textContent = 'Castles & Dragons';

  const subtitle = document.createElement('p');
  subtitle.className = 'setup__subtitle';
  subtitle.textContent = 'Ten holds, one lake, and exactly ten dragons.';

  card.append(title, subtitle);

  if (options.canResume) {
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'button button--primary setup__resume';
    resume.textContent = 'Resume your game';
    resume.addEventListener('click', options.onResume);
    card.append(resume);

    const or = document.createElement('p');
    or.className = 'setup__or';
    or.textContent = 'or begin a new one';
    card.append(or);
  }

  // --- preset --------------------------------------------------------------
  const presetField = field('Game');
  const presetChoices = document.createElement('div');
  presetChoices.className = 'setup__choices';

  const presetButtons = new Map<PresetId, HTMLButtonElement>();
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button setup__choice';
    button.textContent = preset.name;
    button.title = preset.blurb;
    button.addEventListener('click', () => {
      choices.preset = preset.id;
      refresh();
    });
    presetButtons.set(preset.id, button);
    presetChoices.append(button);
  }
  presetField.append(presetChoices);

  const blurb = document.createElement('p');
  blurb.className = 'setup__blurb';
  presetField.append(blurb);

  // --- houses --------------------------------------------------------------
  const countField = field('Houses');
  const countRow = document.createElement('div');
  countRow.className = 'setup__choices';
  const fewer = stepper('−', () => {
    choices.playerCount -= 1;
    refresh();
  });
  const more = stepper('+', () => {
    choices.playerCount += 1;
    refresh();
  });
  const countLabel = document.createElement('span');
  countLabel.className = 'setup__count';
  countRow.append(fewer, countLabel, more);
  countField.append(countRow);

  const split = document.createElement('p');
  split.className = 'setup__blurb';
  countField.append(split);

  // --- shore ---------------------------------------------------------------
  const sideField = field('Your shore');
  const sideChoices = document.createElement('div');
  sideChoices.className = 'setup__choices';
  const sideButtons = new Map<Side, HTMLButtonElement>();
  for (const side of ['north', 'south'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button setup__choice';
    button.textContent = side === 'north' ? 'The North' : 'The South';
    button.addEventListener('click', () => {
      choices.humanSide = side;
      refresh();
    });
    sideButtons.set(side, button);
    sideChoices.append(button);
  }
  sideField.append(sideChoices);

  // --- difficulty ----------------------------------------------------------
  const difficultyField = field('Opponents');
  const difficultyChoices = document.createElement('div');
  difficultyChoices.className = 'setup__choices';
  const difficultyButtons = new Map<Difficulty, HTMLButtonElement>();
  for (const level of DIFFICULTIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button setup__choice';
    button.textContent = level;
    button.addEventListener('click', () => {
      choices.difficulty = level;
      refresh();
    });
    difficultyButtons.set(level, button);
    difficultyChoices.append(button);
  }
  difficultyField.append(difficultyChoices);

  // --- actions -------------------------------------------------------------
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'button button--primary setup__start';
  start.textContent = 'Take the field';
  start.addEventListener('click', () => {
    const preset = presetById(choices.preset);
    options.onStart({ ...choices, playerCount: playerCountFor(preset, choices.playerCount) });
  });

  const multiplayer = document.createElement('button');
  multiplayer.type = 'button';
  multiplayer.className = 'button setup__multiplayer';
  multiplayer.textContent = 'Multiplayer';
  multiplayer.disabled = true;
  multiplayer.title = 'Co-op arrives in Stage B';

  card.append(presetField, countField, sideField, difficultyField, start, multiplayer);
  screen.append(card);
  root.replaceChildren(screen);

  function refresh(): void {
    const preset = presetById(choices.preset);
    choices.playerCount = playerCountFor(preset, choices.playerCount);

    for (const [id, button] of presetButtons) {
      button.classList.toggle('setup__choice--on', id === choices.preset);
    }
    blurb.textContent = preset.blurb;

    countLabel.textContent = String(choices.playerCount);
    // A preset that pins the count has nothing to adjust.
    const pinned = preset.fixedPlayers !== undefined;
    fewer.disabled = pinned || choices.playerCount <= preset.minPlayers;
    more.disabled = pinned || choices.playerCount >= preset.maxPlayers;

    const sided = preset.kind === 'sides';
    sideField.hidden = !sided;
    split.textContent = sided
      ? `${Math.ceil(choices.playerCount / 2)} against ${Math.floor(choices.playerCount / 2)}, across the lake.`
      : `${choices.playerCount} houses, every one of them against you.`;

    for (const [side, button] of sideButtons) {
      button.classList.toggle('setup__choice--on', side === choices.humanSide);
    }
    for (const [level, button] of difficultyButtons) {
      button.classList.toggle('setup__choice--on', level === choices.difficulty);
    }
  }

  refresh();
}

function field(label: string): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'setup__field';
  const heading = document.createElement('h2');
  heading.className = 'setup__label';
  heading.textContent = label;
  wrapper.append(heading);
  return wrapper;
}

function stepper(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--icon';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
