/**
 * Siege resolution.
 *
 * The sequence is fixed and matches the build plan exactly, because the numbers
 * in balance.ts were tuned against it:
 *
 *   1. Defensive fire, once      — every Watchtower volleys the attackers, and
 *                                  Scorpions pick out the strongest attacking
 *                                  dragon.
 *   2. Archer volley, once       — both sides' archers loose a first strike.
 *   3. Melee rounds, repeating   — Scorpions fire again, then both sides trade
 *                                  their summed attack.
 *
 * Damage focus-fires in the order Archer → Swordsman → Dragon, overflowing from
 * one casualty into the next, which is what makes dragons die last.
 *
 * WHEN A HOLD FALLS. The garrison breaks once no non-dragon defenders remain,
 * not when every last defender is dead. That is the difference between the
 * dragon-claim mechanic working and being unreachable: a dragon that outlives
 * its garrison changes sides rather than dying. Overflow damage in the final
 * round can still spill into it and kill it outright — the plan's "total wipe" —
 * so claiming is likely but never guaranteed.
 *
 * A hold defended ONLY by dragons is the exception: with no infantry, the
 * dragons ARE the garrison and have to be beaten down, so a dragon parked alone
 * is not free loot.
 */

import { BALANCE } from './balance';
import {
  damageReduction,
  defenseRating,
  razeDefenses,
  scorpionDamage,
  watchtowerVolley,
} from './defense';
import type { Graph } from './graph';
import { areAllied } from './players';
import { getRegion } from './regions';
import { nextInRange } from './rng';
import { getUnit, removeUnit, unitProfile, unitsIn } from './units';
import {
  type GameState,
  type Owner,
  type RegionId,
  type Unit,
  type UnitId,
  type UnitType,
} from './types';

/** Casualties are taken in this order, so dragons outlive their escort. */
const FOCUS_ORDER: readonly UnitType[] = ['archer', 'swordsman', 'dragon'];

/** Safety valve. Real sieges resolve in a handful of rounds. */
const MAX_ROUNDS = 50;

export type BattleOutcome =
  /** Defenders broken; the hold changed hands. */
  | 'captured'
  /** The attacking stack was destroyed, or could not finish the job. */
  | 'repelled';

export interface BattleEvent {
  readonly round: number;
  readonly text: string;
}

export interface BattleReport {
  readonly outcome: BattleOutcome;
  readonly regionId: RegionId;
  readonly rounds: number;
  readonly attackerLosses: readonly UnitId[];
  readonly defenderLosses: readonly UnitId[];
  /** Defending dragons that survived and changed sides. */
  readonly claimedDragonIds: readonly UnitId[];
  readonly survivingAttackerIds: readonly UnitId[];
  readonly log: readonly BattleEvent[];
}

function focusRank(unit: Unit): number {
  const index = FOCUS_ORDER.indexOf(unit.type);
  return index < 0 ? FOCUS_ORDER.length : index;
}

/**
 * Concentrates `amount` damage on a stack, killing in focus order and carrying
 * the remainder into the next target.
 *
 * Rounded on the way in. The variance multiplier and the defence reduction are
 * both fractions, so without this a unit ends up on 73.99799986699969 hit
 * points and that figure reaches the screen.
 */
function focusFire(targets: readonly Unit[], amount: number): void {
  let remaining = Math.round(amount);
  for (const unit of [...targets].sort((a, b) => focusRank(a) - focusRank(b))) {
    if (remaining <= 0) break;
    const dealt = Math.min(remaining, unit.hp);
    unit.hp -= dealt;
    remaining -= dealt;
  }
}

export function resolveSiege(
  state: GameState,
  graph: Graph,
  attackerIds: readonly UnitId[],
  regionId: RegionId,
  attackerOwner: Owner,
): BattleReport {
  const region = getRegion(state, regionId);
  const terrainBonus = graph.regions.get(regionId)?.defenseBonus ?? 0;
  const reduction = damageReduction(defenseRating(region, terrainBonus));
  const { rng, turn } = state;
  const log: BattleEvent[] = [];

  let attackers = attackerIds.map((id) => getUnit(state, id));
  let defenders = unitsIn(state, regionId).filter(
    (unit) => !areAllied(state, unit.owner, attackerOwner),
  );

  const attackerLosses: UnitId[] = [];
  const defenderLosses: UnitId[] = [];

  // Decided once, up front: a garrison of nothing but dragons must be beaten
  // outright rather than walking away the moment the fight starts.
  const dragonsOnlyGarrison = defenders.length > 0 && defenders.every((u) => u.type === 'dragon');

  const garrisonBroken = (): boolean =>
    dragonsOnlyGarrison ? defenders.length === 0 : defenders.every((u) => u.type === 'dragon');

  const swing = (amount: number): number => {
    // Widened deliberately: `as const` in balance.ts gives this the literal type
    // 0.1, which would make the "set variance to 0" escape hatch a type error.
    const variance: number = BALANCE.combat.variance;
    return variance === 0 ? amount : amount * nextInRange(rng, 1 - variance, 1 + variance);
  };

  const totalAttack = (units: readonly Unit[]): number =>
    units.reduce((sum, unit) => sum + unitProfile(unit.type, turn).atk, 0);

  const note = (round: number, text: string): void => {
    log.push({ round, text });
  };

  /** Removes the dead from state and from the working rosters. */
  const prune = (): void => {
    for (const unit of attackers) {
      if (unit.hp <= 0) {
        attackerLosses.push(unit.id);
        removeUnit(state, unit.id);
      }
    }
    for (const unit of defenders) {
      if (unit.hp <= 0) {
        defenderLosses.push(unit.id);
        removeUnit(state, unit.id);
      }
    }
    attackers = attackers.filter((unit) => unit.hp > 0);
    defenders = defenders.filter((unit) => unit.hp > 0);
  };

  /** Scorpions hunt the healthiest attacking dragon; no overflow if it dies. */
  const fireScorpions = (round: number): void => {
    if (region.defenses.scorpion === 0) return;

    const dragons = attackers.filter((unit) => unit.type === 'dragon');
    const target = dragons.reduce<Unit | null>(
      (best, unit) => (best === null || unit.hp > best.hp ? unit : best),
      null,
    );

    const damage = Math.round(swing(scorpionDamage(region, target !== null)));
    if (damage <= 0) return;

    if (target) {
      target.hp -= damage;
      note(round, `Scorpions strike the dragon for ${damage}.`);
    } else {
      focusFire(attackers, damage);
      note(round, `Scorpions rake the attackers for ${Math.round(damage)}.`);
    }
  };

  // --- 1. Defensive fire, once ---------------------------------------------
  const volley = watchtowerVolley(region);
  if (volley > 0) {
    const damage = swing(volley);
    focusFire(attackers, damage);
    note(0, `Watchtowers volley the attackers for ${Math.round(damage)}.`);
  }
  fireScorpions(0);
  prune();

  // --- 2. Archer first strike, once ----------------------------------------
  const attackingArchers = attackers.filter((unit) => unit.type === 'archer').length;
  const defendingArchers = defenders.filter((unit) => unit.type === 'archer').length;

  if (attackingArchers > 0) {
    const damage = swing(attackingArchers * BALANCE.archer.volley) * (1 - reduction);
    focusFire(defenders, damage);
    note(0, `Attacking archers loose for ${Math.round(damage)}.`);
  }
  if (defendingArchers > 0) {
    const damage = swing(defendingArchers * BALANCE.archer.volley);
    focusFire(attackers, damage);
    note(0, `Defending archers loose for ${Math.round(damage)}.`);
  }
  prune();

  // --- 3. Melee ------------------------------------------------------------
  let rounds = 0;
  while (attackers.length > 0 && !garrisonBroken() && rounds < MAX_ROUNDS) {
    rounds += 1;

    fireScorpions(rounds);
    prune();
    if (attackers.length === 0 || garrisonBroken()) break;

    // Both sides swing from their pre-round rosters, so trades are simultaneous
    // and a stack that dies this round still lands its blow.
    const dealtToDefenders = swing(totalAttack(attackers)) * (1 - reduction);
    const dealtToAttackers = swing(totalAttack(defenders));

    focusFire(defenders, dealtToDefenders);
    focusFire(attackers, dealtToAttackers);
    note(
      rounds,
      `Melee: attackers deal ${Math.round(dealtToDefenders)}, defenders deal ${Math.round(dealtToAttackers)}.`,
    );
    prune();
  }

  // --- Resolution ----------------------------------------------------------
  const claimedDragonIds: UnitId[] = [];
  const captured = attackers.length > 0 && garrisonBroken();

  if (captured) {
    for (const survivor of defenders) {
      if (survivor.type === 'dragon' && BALANCE.dragon.claimOnCapture) {
        survivor.owner = attackerOwner;
        // The prize does not get to fly on the turn it changes hands.
        survivor.movesLeft = 0;
        claimedDragonIds.push(survivor.id);
        note(rounds, `The defending dragon is claimed by the attacker.`);
      } else {
        defenderLosses.push(survivor.id);
        removeUnit(state, survivor.id);
      }
    }

    region.owner = attackerOwner;
    razeDefenses(region);
    for (const unit of attackers) {
      unit.regionId = regionId;
      unit.movesLeft -= 1;
    }
    note(rounds, `The hold falls.`);
  } else {
    for (const unit of attackers) unit.movesLeft -= 1;
    note(rounds, `The attack is repelled.`);
  }

  return {
    outcome: captured ? 'captured' : 'repelled',
    regionId,
    rounds,
    attackerLosses,
    defenderLosses,
    claimedDragonIds,
    survivingAttackerIds: attackers.map((unit) => unit.id),
    log,
  };
}
