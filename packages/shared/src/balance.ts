/**
 * balance.ts — THE SINGLE SOURCE OF TRUTH FOR ALL GAME NUMBERS
 * ============================================================================
 * Every tunable value in the game lives here. The rules engine (combat.ts,
 * dragons.ts, holds.ts, defense.ts, victory.ts) must READ from BALANCE and
 * never hardcode a number. To rebalance the entire game, edit this file only.
 *
 * Design intent (keep this in mind when tuning):
 *   - DRAGONS ARE THE DECISIVE FORCE. Exactly 10 exist (one per region). They
 *     hatch on turn 5 and grow to a crushing peak by turn 100.
 *   - Gaining ONE extra dragon (by capturing a defended hold and claiming its
 *     dragon) should be a war-changing swing.
 *   - The only reliable dragon-killer is the SCORPION. Otherwise dragons die
 *     last and are usually claimed, not destroyed.
 *
 * All values are integers unless noted. Comments show the reasoning so future
 * tuning is informed, not blind.
 * ============================================================================
 */

export const BALANCE = {
  // ---------------------------------------------------------------------------
  // GAME LENGTH
  // ---------------------------------------------------------------------------
  game: {
    turnLimit: 100,        // hard cap; if undecided, most holds wins (tiebreak: total army strength)
  },

  // ---------------------------------------------------------------------------
  // ECONOMY
  // Per-hold Gold income comes from holds.json (goldPerTurn: 2–3). A hold gets
  // ONE build action per turn: recruit a unit OR construct one defense.
  // ---------------------------------------------------------------------------
  economy: {
    buildsPerHoldPerTurn: 1,   // set to 2 (or higher) to allow recruit AND fortify same turn
    startingGold: 5,           // each player's treasury at game start
  },

  // ---------------------------------------------------------------------------
  // STARTING FORCES — what every hold on the map begins with, player-held or
  // not. Deliberately mirrors `neutral` below, so an early grab at a neutral
  // hold is a real fight rather than a free gift.
  //
  // Holds start UNWALLED. A free rampart was measured and dropped: it halved
  // the attacker's odds at parity (42% -> 21% on forest, 21% -> 0% on
  // mountains) and cut captures per game by a third. It also ate half the
  // rampart cap of 2, so building one could only ever double existing walls
  // rather than raise them from nothing — which made fortifying a far duller
  // decision than it should be.
  // ---------------------------------------------------------------------------
  start: {
    swordsmen: 1,
    archers: 2,
    ramparts: 0,
  },

  // Costs in Gold. With holds yielding 2–3/turn, a unit is ~1 turn's income,
  // a defense ~2 turns — so fortifying is a real tempo cost.
  //
  // Archers are the cheap unit and swordsmen the premium one: volume of
  // first-strike fire is easy to buy, staying power is what you pay for.
  cost: {
    swordsman: 5,
    archer: 3,
    ramparts: 5,
    watchtower: 5,
    scorpion: 6,       // premium: the anti-dragon tool
  },

  // ---------------------------------------------------------------------------
  // ATTACK UNITS (fixed stats; do NOT scale with turn)
  //   atk = damage dealt per melee round (summed across the stack)
  //   hp  = hit points
  // Combat focus-fire order is Archer -> Swordsman -> Dragon (dragons die last).
  // ---------------------------------------------------------------------------
  swordsman: {
    atk: 10,
    hp: 30,
    move: 1,           // holds per turn; land + bridge only
  },
  archer: {
    atk: 6,            // weak in melee...
    hp: 15,            // ...and fragile
    move: 1,           // land + bridge only
    volley: 12,        // FIRST-STRIKE ranged damage, once at battle start (per archer)
  },

  // ---------------------------------------------------------------------------
  // DRAGONS — finite (10 total), hatch on turn 5, grow to turn 100.
  // Stats interpolate LINEARLY by progress p = clamp01((turn - hatchTurn) / (turnLimit - hatchTurn)).
  //   atk(turn) = lerp(atkAtHatch, atkAtMax, p)
  //   hp(turn)  = lerp(hpAtHatch,  hpAtMax,  p)
  // See dragonStat() helper below.
  //
  // Feel these produce (vs a plain Swordsman: atk 10 / hp 30):
  //   turn  5 (hatch): atk 15,  hp 60   ~ two swordsmen        (beatable by 3–4)
  //   turn 50 (mid):   atk 46,  hp 220  ~ six swordsmen        (a major asset)
  //   turn 100 (max):  atk 80,  hp 400  ~ shrugs off armies    (needs Scorpions)
  // ---------------------------------------------------------------------------
  dragon: {
    total: 10,             // one egg per region; informational (enforced by the map)
    hatchTurn: 5,
    move: 2,               // holds per turn; crosses land + bridge + WATER (ignores the lake)
    atkAtHatch: 15,
    atkAtMax: 80,
    hpAtHatch: 60,
    hpAtMax: 400,
    // On capture, a surviving defending dragon is CLAIMED by the attacker (set
    // false to make losing dragons die instead of switching sides).
    claimOnCapture: true,
  },

  // ---------------------------------------------------------------------------
  // DEFENSES (built at a hold; persist until the hold is captured).
  // Each has a stack cap. Effects are read by defense.ts / combat.ts.
  // ---------------------------------------------------------------------------
  ramparts: {
    cap: 2,
    defensePoints: 2,      // each rampart adds this to the hold's defense rating
  },
  watchtower: {
    cap: 2,
    volley: 15,            // damage to attackers once at battle start (per watchtower)
  },
  scorpion: {
    cap: 3,
    vsDragonPerRound: 40,  // damage to the strongest attacking dragon EVERY melee round (per scorpion)
    vsOtherPerRound: 5,    // minor damage if no dragon is attacking
    // Why 40 x cap 3 = 120/round: enough that 2–3 scorpions + a garrison can
    // bring down even a maxed dragon (400 hp) before it takes the hold.
  },

  // ---------------------------------------------------------------------------
  // DEFENSE MATH — how the defense rating reduces incoming damage to defenders.
  //   defenseRating = terrainDefenseBonus (from holds.json, 1–3)
  //                 + rampartCount * ramparts.defensePoints
  //   reduction = min(maxReduction, defenseRating * reductionPerPoint)
  //   damageToDefenders = rawDamage * (1 - reduction)
  // Example: mountains (3) + 2 ramparts (4) = 7 -> 35% reduction.
  //
  // Tuned down from 6% a point after measuring attacker win rates at parity
  // against the standard 3-unit garrison:
  //
  //   hold                              was      now
  //   forest, unwalled (the default)    2%       42%
  //   forest + 1 rampart                0%       21%
  //   forest + 2 ramparts               0%        0%
  //   mountains, unwalled               0%       21%
  //   mountains + 2 ramparts + tower    0%        0%  (15% with one more unit)
  //
  // One extra unit still takes an ordinary hold outright. What changed is that
  // an even assault is now a gamble rather than a certain loss, and stonework
  // still buys real safety — each rampart roughly halves the attacker's odds.
  // ---------------------------------------------------------------------------
  defense: {
    reductionPerPoint: 0.05,   // 5% less damage per defense point
    maxReduction: 0.60,        // never reduce incoming damage by more than 60%
  },

  // ---------------------------------------------------------------------------
  // COMBAT RANDOMNESS — a small seeded swing so battles aren't fully identical.
  // Each damage figure is multiplied by a factor in [1 - variance, 1 + variance]
  // drawn from the game's seeded RNG (deterministic given the seed).
  // ---------------------------------------------------------------------------
  combat: {
    variance: 0.10,            // +/-10%; set 0 for fully deterministic battles
  },

  // ---------------------------------------------------------------------------
  // NEUTRAL HOLDS — the garrison guarding an unowned hold (before you conquer it).
  // ---------------------------------------------------------------------------
  neutral: {
    swordsmen: 1,              // starting garrison per neutral hold
    archers: 2,
    ramparts: 0,               // unclaimed holds are unwalled, like everyone's
    // (its dragon hatches on turn 5 like any region's, and defends in place)
  },
} as const;

// ============================================================================
// HELPERS — pure functions the engine uses to derive turn-scaled dragon stats.
// Keep these here so the growth model lives next to its numbers.
// ============================================================================

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress of a dragon's growth at a given turn: 0 at hatch, 1 at turnLimit. */
export function dragonProgress(turn: number): number {
  const { hatchTurn } = BALANCE.dragon;
  const { turnLimit } = BALANCE.game;
  return clamp01((turn - hatchTurn) / (turnLimit - hatchTurn));
}

/** A dragon's current attack and hp for the given turn. */
export function dragonStat(turn: number): { atk: number; hp: number } {
  const p = dragonProgress(turn);
  const d = BALANCE.dragon;
  return {
    atk: Math.round(lerp(d.atkAtHatch, d.atkAtMax, p)),
    hp: Math.round(lerp(d.hpAtHatch, d.hpAtMax, p)),
  };
}

export type Balance = typeof BALANCE;
