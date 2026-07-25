/**
 * AI opponents.
 *
 * The AI has no private channel into the rules: it calls recruit, fortify and
 * moveUnits exactly as a human's clicks do, with its own player id. Anything it
 * is not allowed to do throws, the same as for anyone else. That is why there
 * is no separate "is this legal for the AI" code to drift out of step, and why
 * Stage B can run this untouched inside the Durable Object.
 *
 * It plays in three passes: build, then dragons, then infantry. Dragons move
 * first and alone because they are the only thing that crosses open water, and
 * bundling them with foot soldiers would strand them on the near shore.
 */

import { BALANCE } from './balance';
import {
  damageReduction,
  defenseRating,
  isAtCap,
  scorpionDamage,
  watchtowerVolley,
} from './defense';
import type { Graph } from './graph';
import { fortify, fortifyBlockedReason, recruit, recruitBlockedReason } from './holds';
import { legalDestinations, moveUnits } from './orders';
import { areAllied, playerById } from './players';
import { allRegions, getRegion } from './regions';
import { defendersAgainst, dominantUnitType, unitProfile, unitsIn } from './units';
import {
  NEUTRAL,
  type DefenseType,
  type Difficulty,
  type GameState,
  type PlayerId,
  type RecruitableType,
  type RegionId,
  type Unit,
  type UnitType,
} from './types';

export interface AiSettings {
  /** Higher takes worse odds. Scales the margin demanded before attacking. */
  readonly aggression: number;
  /** Higher favours raising troops over building works. */
  readonly economy: number;
}

export const AI_SETTINGS: Readonly<Record<Difficulty, AiSettings>> = {
  easy: { aggression: 0.15, economy: 0.8 },
  normal: { aggression: 0.5, economy: 0.55 },
  hard: { aggression: 0.85, economy: 0.4 },
};

/**
 * A record of something an AI did, for the client's turn report.
 *
 * Structured rather than pre-worded: phrasing and hold names are the client's
 * business, and `shared` has no place deciding how a sentence reads.
 */
export interface AiAction {
  readonly playerId: PlayerId;
  readonly kind: 'recruit' | 'fortify' | 'march' | 'attack';
  /** The hold acted on — built at, marched into, or assaulted. */
  readonly regionId: RegionId;
  /** Where a march or assault set out from, so the client can draw it. */
  readonly from?: RegionId;
  /** What was raised or built, for build actions. */
  readonly what?: RecruitableType | DefenseType;
  /** What led the attack, so the client knows whether to draw a dragon. */
  readonly spearhead?: UnitType;
  /** Whether an attack took the hold. */
  readonly captured?: boolean;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

function stackAttack(state: GameState, units: readonly Unit[]): number {
  return units.reduce((sum, unit) => sum + unitProfile(unit.type, state.turn).atk, 0);
}

function stackHealth(units: readonly Unit[]): number {
  return units.reduce((sum, unit) => sum + unit.hp, 0);
}

/**
 * Hostile forces next door that could actually come at us.
 *
 * Neutral garrisons are excluded on purpose: they defend in place and never
 * march. Counting them made every hold on the map look besieged — since almost
 * every hold borders a neutral one — so the AI walled itself in on turn one and
 * never expanded. Threat means someone who can attack you.
 */
function hostileNeighbours(
  state: GameState,
  graph: Graph,
  regionId: RegionId,
  owner: PlayerId,
): readonly Unit[] {
  const units: Unit[] = [];
  for (const adjacent of graph.adjacency.get(regionId) ?? []) {
    for (const unit of defendersAgainst(state, adjacent.to, owner)) {
      if (unit.owner !== NEUTRAL) units.push(unit);
    }
  }
  return units;
}

function threatAgainst(
  state: GameState,
  graph: Graph,
  regionId: RegionId,
  owner: PlayerId,
): number {
  return stackAttack(state, hostileNeighbours(state, graph, regionId, owner));
}

/** Whether a rival — not a static neutral garrison — has a dragon within reach. */
function dragonNearby(state: GameState, graph: Graph, regionId: RegionId, owner: PlayerId): boolean {
  return hostileNeighbours(state, graph, regionId, owner).some((unit) => unit.type === 'dragon');
}

/**
 * Whether this stack should take on that hold.
 *
 * A race between two clocks: how many rounds we need to break them, against how
 * many they need to break us — after the defence reduction, the watchtower
 * volley and any scorpions have had their say. Aggression widens the margin the
 * AI will accept.
 */
export function attackIsWorthwhile(
  state: GameState,
  graph: Graph,
  attackers: readonly Unit[],
  target: RegionId,
  owner: PlayerId,
  settings: AiSettings,
): boolean {
  const defenders = defendersAgainst(state, target, owner);
  if (defenders.length === 0) return true;
  if (attackers.length === 0) return false;

  const region = getRegion(state, target);
  const terrain = graph.regions.get(target)?.defenseBonus ?? 0;
  const reduction = damageReduction(defenseRating(region, terrain));

  const ourAttack = Math.max(1, stackAttack(state, attackers) * (1 - reduction));
  const theirAttack = Math.max(1, stackAttack(state, defenders));

  // Defensive fire lands before a blow is struck, so it comes off our health
  // before the race is scored.
  const opening =
    watchtowerVolley(region) +
    scorpionDamage(region, attackers.some((unit) => unit.type === 'dragon'));
  const ourHealth = Math.max(1, stackHealth(attackers) - opening);

  const roundsToBreakThem = stackHealth(defenders) / ourAttack;
  const roundsToBreakUs = ourHealth / theirAttack;

  return roundsToBreakThem <= roundsToBreakUs * (0.75 + settings.aggression * 0.65);
}

// ---------------------------------------------------------------------------
// Build pass
// ---------------------------------------------------------------------------

function chooseDefense(
  state: GameState,
  graph: Graph,
  regionId: RegionId,
  owner: PlayerId,
): DefenseType | null {
  const region = getRegion(state, regionId);

  // Scorpions are the only reliable answer to a dragon, so they come first
  // whenever one is breathing down this hold's neck.
  if (dragonNearby(state, graph, regionId, owner) && !isAtCap(region, 'scorpion')) {
    return 'scorpion';
  }
  if (!isAtCap(region, 'ramparts')) return 'ramparts';
  if (!isAtCap(region, 'watchtower')) return 'watchtower';
  return null;
}

function chooseRecruit(state: GameState, regionId: RegionId): RecruitableType {
  // Archers hit first and hardest but fold in melee, so they are kept as a
  // minority stiffened by swordsmen.
  const garrison = unitsIn(state, regionId);
  const swords = garrison.filter((unit) => unit.type === 'swordsman').length;
  const archers = garrison.filter((unit) => unit.type === 'archer').length;
  return archers * 2 < swords ? 'archer' : 'swordsman';
}

function buildPass(
  state: GameState,
  graph: Graph,
  owner: PlayerId,
  settings: AiSettings,
): AiAction[] {
  const actions: AiAction[] = [];

  for (const region of allRegions(state)) {
    if (region.owner !== owner) continue;

    const threat = threatAgainst(state, graph, region.id, owner);
    const garrison = stackAttack(
      state,
      unitsIn(state, region.id).filter((unit) => unit.owner === owner),
    );

    /**
     * Fortify only when genuinely outmatched, not merely because someone is
     * next door.
     *
     * This used to be `threat > 0`, which fired from turn one — every hold has
     * a rival somewhere on its border — and kept firing until every defence
     * was at its cap. Measured over the first thirty turns of a four-house
     * game, the AI spent half its build actions on stonework, put up 28
     * structures, raised no troops at all between turns 9 and 19, and launched
     * exactly one attack. It turtled itself out of the game.
     *
     * Comparing threat against the garrison already present means a token
     * force next door no longer triggers a building programme, while a real
     * massing still does. The economy knob sets how much of an edge a rival
     * needs before it is worth answering with walls.
     */
    const outmatched = threat > garrison * (1 + settings.economy);

    // A dragon is not answered by counting attack points. It dies last, shrugs
    // off infantry, and only a scorpion reliably kills one — so a hold with a
    // dragon on its border always gets its first scorpion, whatever the raw
    // numbers say. Further scorpions still have to justify themselves.
    const needsAnswerToDragon =
      region.defenses.scorpion === 0 && dragonNearby(state, graph, region.id, owner);

    const preferDefense = outmatched || needsAnswerToDragon;

    const defense = preferDefense ? chooseDefense(state, graph, region.id, owner) : null;
    if (defense && fortifyBlockedReason(state, region.id, defense, owner) === null) {
      fortify(state, region.id, defense, owner);
      actions.push({ playerId: owner, kind: 'fortify', regionId: region.id, what: defense });
      continue;
    }

    const unitType = chooseRecruit(state, region.id);
    if (recruitBlockedReason(state, region.id, unitType, owner) === null) {
      recruit(state, region.id, unitType, owner);
      actions.push({ playerId: owner, kind: 'recruit', regionId: region.id, what: unitType });
      continue;
    }

    // Could not afford the preferred option — fall back to whatever fits.
    const fallback = chooseDefense(state, graph, region.id, owner);
    if (fallback && fortifyBlockedReason(state, region.id, fallback, owner) === null) {
      fortify(state, region.id, fallback, owner);
      actions.push({ playerId: owner, kind: 'fortify', regionId: region.id, what: fallback });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Movement passes
// ---------------------------------------------------------------------------

/** How many units must stay behind to keep a threatened hold from falling free. */
function garrisonToKeep(state: GameState, graph: Graph, regionId: RegionId, owner: PlayerId): number {
  const threat = threatAgainst(state, graph, regionId, owner);
  if (threat <= 0) return 0;
  // Never strip a frontier hold bare; half the stack stays on the wall.
  return Math.ceil(unitsIn(state, regionId).filter((unit) => unit.owner === owner).length / 2);
}

/** Picks the best hold for this stack to move into, or null to stay put. */
function chooseTarget(
  state: GameState,
  graph: Graph,
  stack: readonly Unit[],
  owner: PlayerId,
  settings: AiSettings,
): RegionId | null {
  const destinations = legalDestinations(
    state,
    graph,
    stack.map((unit) => unit.id),
  );
  if (destinations.length === 0) return null;

  const hostile = destinations.filter((id) => !areAllied(state, getRegion(state, id).owner, owner));

  // An undefended hold is free real estate; take the richest one going.
  const undefended = hostile.filter((id) => defendersAgainst(state, id, owner).length === 0);
  if (undefended.length > 0) {
    return [...undefended].sort(
      (a, b) =>
        (graph.regions.get(b)?.goldPerTurn ?? 0) - (graph.regions.get(a)?.goldPerTurn ?? 0),
    )[0]!;
  }

  const winnable = hostile
    .filter((id) => attackIsWorthwhile(state, graph, stack, id, owner, settings))
    .sort(
      (a, b) =>
        stackHealth(defendersAgainst(state, a, owner)) -
        stackHealth(defendersAgainst(state, b, owner)),
    );
  if (winnable.length > 0) return winnable[0]!;

  return marchToTheFront(state, graph, stack, destinations, owner);
}

/**
 * With nothing worth attacking, walk toward the fighting.
 *
 * Without this, every hold decides alone and a hold with no winnable neighbour
 * sits on its army forever. Rear holds piled up troops that never reached the
 * front, so the AI grabbed the easy neutral holds and then stalled for the rest
 * of the game. Moving surplus toward the most threatened friendly hold is what
 * lets it mass a stack big enough to be worth committing.
 */
function marchToTheFront(
  state: GameState,
  graph: Graph,
  stack: readonly Unit[],
  destinations: readonly RegionId[],
  owner: PlayerId,
): RegionId | null {
  const here = stack[0]?.regionId;
  if (here === undefined) return null;

  const hereThreat = threatAgainst(state, graph, here, owner);
  const forward = destinations
    .filter((id) => areAllied(state, getRegion(state, id).owner, owner))
    .map((id) => ({ id, threat: threatAgainst(state, graph, id, owner) }))
    .filter((candidate) => candidate.threat > hereThreat)
    .sort((a, b) => b.threat - a.threat);

  return forward[0]?.id ?? null;
}

function movePass(
  state: GameState,
  graph: Graph,
  owner: PlayerId,
  settings: AiSettings,
  dragons: boolean,
): AiAction[] {
  const actions: AiAction[] = [];

  for (const region of allRegions(state)) {
    const here = unitsIn(state, region.id).filter(
      (unit) =>
        unit.owner === owner &&
        unit.movesLeft > 0 &&
        (dragons ? unit.type === 'dragon' : unit.type !== 'dragon'),
    );
    if (here.length === 0) continue;

    // Dragons roam alone; infantry leaves a garrison behind when threatened.
    const stack = dragons ? here.slice(0, 1) : here.slice(garrisonToKeep(state, graph, region.id, owner));
    if (stack.length === 0) continue;

    const target = chooseTarget(state, graph, stack, owner, settings);
    if (target === null) continue;

    const contested = defendersAgainst(state, target, owner).length > 0;
    const spearhead = dominantUnitType(stack);
    const origin = region.id;
    const result = moveUnits(
      state,
      graph,
      stack.map((unit) => unit.id),
      target,
      owner,
    );

    actions.push(
      contested
        ? {
            playerId: owner,
            kind: 'attack',
            regionId: target,
            from: origin,
            spearhead,
            captured: result.outcome === 'captured',
          }
        : { playerId: owner, kind: 'march', regionId: target, from: origin, spearhead },
    );
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Plays one AI player's whole turn: build, then dragons, then infantry.
 *
 * Every decision reads from state and the map only, and every effect goes
 * through the same engine calls a human's UI makes, so an AI turn is replayable
 * from a seed exactly like a human one.
 */
export function takeAiTurn(state: GameState, graph: Graph, playerId: PlayerId): AiAction[] {
  const player = playerById(state, playerId);
  if (!player || !player.isAI) return [];

  const settings = AI_SETTINGS[player.difficulty];

  return [
    ...buildPass(state, graph, playerId, settings),
    ...movePass(state, graph, playerId, settings, true),
    ...movePass(state, graph, playerId, settings, false),
  ];
}

/** Plays every AI player on the team currently holding the turn. */
export function takeAiTeamTurn(state: GameState, graph: Graph, teamId: string): AiAction[] {
  const actions: AiAction[] = [];
  for (const player of state.players) {
    if (player.teamId !== teamId || !player.isAI) continue;
    actions.push(...takeAiTurn(state, graph, player.id));
  }
  return actions;
}

/** True when nobody on the given team is a human. */
export function teamIsAllAI(state: GameState, teamId: string): boolean {
  const members = state.players.filter((player) => player.teamId === teamId);
  return members.length > 0 && members.every((player) => player.isAI);
}
