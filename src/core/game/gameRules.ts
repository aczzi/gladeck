// Game rules & formulas for Gladeck.
// from this file for consistency (see .github/copilot-instructions.md).

import { Timestamp } from "firebase/firestore";
import { uniformRandInt, pickRandom } from "@/core/utils";
import type {
  Gladiator,
  GladiatorStats,
  GladiatorTrait,
  Buildings,
  Profile,
  UserData,
  Attribution,
  CombatUnit,
  CombatResult,
  CombatLogEntry,
} from "@/core/game/types";

export const GLADIATORS_PER_BATTLE = 4;
// Combat ends after this many rounds even if both sides are still standing
// (see resolveCombat's HP-sum tie-break) - exported so the UI can show
// "Round X / MAX_COMBAT_ROUNDS" during the fight.
export const MAX_COMBAT_ROUNDS = 10;
export const STAT_MIN = 0;
export const STAT_MAX = 200;
export const LUCK_CAP = 90;

export const CRIT_CHANCE_CAP = 0.3;
export const DODGE_CHANCE_CAP = 0.2;
export const CRIT_MULTIPLIER = 1.5;

// Flat gold reward on top of the arena wager payout (see arenaMaxBet and
// Arena.vue's engage() - a win returns 2x the wager plus this flat amount,
// a loss just forfeits the wager).
export const VICTORY_GOLD_REWARD = 50;

export const TRAINING_PROGRAM_UPGRADE_COOLDOWN_MS = 30 * 60 * 1000;
export const TRAINING_POINT_PER_VICTORY = 1;
export const TRAINING_POINT_COST_PER_UPGRADE = 1;

export const INFIRMARY_HEAL_COOLDOWN_MS = 15 * 60 * 1000;
export const INFIRMARY_HEAL_COST = 20;

// ====== Gladiator traits (ROADMAP Phase 2 - individuality) ======
// Rolled once at recruitment (createGladiator) and permanent. Each trait
// gives a gladiator a reason to be trained/kept rather than being an
// interchangeable stat bag.

export const GLADIATOR_TRAITS: GladiatorTrait[] = [
  "brute",
  "stoic",
  "lucky",
  "bloodthirsty",
  "crowdFavorite",
  "incorrigible",
];

// Brute: Training Program Attack upgrades get +10 percentage points.
export const TRAIT_BRUTE_TRAINING_BONUS_PERCENT_ADD = 10;
// Stoic ("Increvable"): a hit that would kill instead leaves 1 HP, this often.
export const TRAIT_STOIC_SURVIVAL_CHANCE = 0.25;
// Lucky: gains a flat +2 Luck per victory instead of the usual +1.
export const TRAIT_LUCKY_VICTORY_LUCK_GAIN = 2;
// Bloodthirsty: every confirmed kill lands compounds the killer's own Attack
// for the rest of that same fight (resolveCombat works on cloned units, so
// this never persists between fights).
export const TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT = 5;
// Crowd Favorite: flat % more gold on victory, per Crowd Favorite gladiator
// sent - stacks if several are sent to the same fight.
export const TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT = 20;
// Incorrigible: cheaper Training Program upgrades, but an extra personal
// injury risk stacked on top of the level-gated one (see rollTrainingInjury).
export const TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT = 20;
export const TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD = 0.1;

export const COMBAT_HP_FLOOR = 1;

export function pickRandomTrait(): GladiatorTrait {
  return GLADIATOR_TRAITS[uniformRandInt(GLADIATOR_TRAITS.length)];
}

// ====== §3 Roster & Attribution ======

export function applyAttribution(
  stats: GladiatorStats,
  line: Attribution,
): GladiatorStats {
  if (line === "support") return { ...stats };
  if (line === "dps") {
    return {
      atk: stats.atk * 1.2,
      luck: stats.luck * 1.1,
      def: stats.def * 0.9,
      hpMax: stats.hpMax,
      hpCurrent: stats.hpCurrent,
    };
  }
  return {
    atk: stats.atk * 0.9,
    luck: stats.luck * 0.9,
    def: stats.def * 1.2,
    hpMax: stats.hpMax,
    hpCurrent: stats.hpCurrent,
  };
}

// ====== §4.1 Rival matchmaking - power budget ======

// Rival strength is sized off the trainer team's average GladiatorPower
// rather than rankPoints - the same metric already used everywhere else to
// gauge a gladiator's real strength (raw stats plus its battle-earned
// bonus), rather than a disconnected rank counter.
export const RIVAL_BUDGET_MULTIPLIER = 0.85;

// Average GladiatorPower across the sent team - the basis for the rival
// team's total stat budget.
export function computeAverageTeamPower(
  sentGladiators: { stats: GladiatorStats; battlesFought?: number }[],
): number {
  if (sentGladiators.length === 0) return 0;
  const totalPower = sentGladiators.reduce(
    (sum, { stats, battlesFought }) =>
      sum + gladiatorPower(stats, battlesFought ?? 0),
    0,
  );
  return totalPower / sentGladiators.length;
}

export function computeRivalBudget(
  avgTeamPower: number,
  unitCount: number,
): number {
  return avgTeamPower * unitCount * RIVAL_BUDGET_MULTIPLIER;
}

// Builds the individually-tracked fighters for the trainer's side

export function computeCombatUnits(
  sentGladiators: {
    id: string;
    name: string;
    stats: GladiatorStats;
    line: Attribution;
    trait: GladiatorTrait;
  }[],
): CombatUnit[] {
  return sentGladiators.map(({ id, name, stats, line, trait }) => {
    const mod = applyAttribution(stats, line);
    return {
      id,
      name,
      attribution: line,
      trait,
      atk: mod.atk,
      luck: mod.luck,
      def: mod.def,
      initialHp: mod.hpCurrent,
      hpCurrent: mod.hpCurrent,
    };
  });
}

export const RIVAL_STAT_WEIGHT_BASELINE = 1.5;

type CappedStatKey = "atk" | "luck" | "def" | "hp";

// Water-fills `budgetTotal` across `entries` respecting each one's cap: any
// entry whose proportional share would exceed its cap is clamped there, and
// the leftover is re-shared among the still-uncapped entries by their
// relative weights (repeating until nothing exceeds its cap). This keeps a
// rival's individual stats within the same caps a player gladiator's are
// bound by (STAT_MAX for Attack/Defense, the lower LUCK_CAP for Luck)
// without dumping every bit of overflow into whichever entry happens to be
// uncapped (HP) - Atk/Def keep absorbing budget past Luck's low cap instead
// of stalling out early while HP balloons.
function allocateCappedBudget(
  budgetTotal: number,
  entries: { key: CappedStatKey; weight: number; cap: number }[],
): Record<CappedStatKey, number> {
  const result = {} as Record<CappedStatKey, number>;
  let remaining = entries;
  let remainingBudget = budgetTotal;

  while (remaining.length > 0) {
    const weightSum = remaining.reduce((sum, e) => sum + e.weight, 0);
    const overCap = remaining.find(
      (e) => (e.weight / weightSum) * remainingBudget > e.cap,
    );
    if (!overCap) {
      for (const e of remaining) {
        result[e.key] = (e.weight / weightSum) * remainingBudget;
      }
      break;
    }
    result[overCap.key] = overCap.cap;
    remainingBudget -= overCap.cap;
    remaining = remaining.filter((e) => e.key !== overCap.key);
  }
  return result;
}

export function distributeRivalBudget(
  budget: number,
  count: number,
): CombatUnit[] {
  const shareWeights = Array.from(
    { length: count },
    () => RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
  );
  const shareSum = shareWeights.reduce((a, b) => a + b, 0);

  return shareWeights.map((share, i) => {
    const unitBudget = (share / shareSum) * budget;
    const stats = allocateCappedBudget(unitBudget, [
      {
        key: "atk",
        weight: RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
        cap: STAT_MAX,
      },
      {
        key: "luck",
        weight: RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
        cap: LUCK_CAP,
      },
      {
        key: "def",
        weight: RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
        cap: STAT_MAX,
      },
      {
        key: "hp",
        weight: RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
        cap: Infinity,
      },
    ]);
    return {
      id: `rival-${i}`,
      name: `Rival Gladiator ${i + 1}`,
      attribution: i % 2 === 0 ? "dps" : "tank",
      atk: stats.atk,
      luck: stats.luck,
      def: stats.def,
      initialHp: stats.hp,
      hpCurrent: stats.hp,
    } as CombatUnit;
  });
}

// ====== §4.2 Initiative ======

export function determineInitiative(
  trainerLuck: number,
  rivalLuck: number,
): "trainer" | "rival" {
  return trainerLuck > rivalLuck ? "trainer" : "rival";
}

// ====== §4.3 Luck roll (stabilized variance) ======

// Roll = (Luck * 0.25) + Random(0, Luck * 0.75)
export function rollLuck(luck: number): number {
  return luck * 0.25 + Math.random() * (luck * 0.75);
}

// ====== §4.4 Damage calculation (anti-negative floor, crit & dodge) ======

// Damage = max((ATK + LuckRoll) - (DEF_target + LuckRoll_target), ATK * 0.05)
export function computeEffectiveDamage(
  atk: number,
  luckRollAttacker: number,
  defTarget: number,
  luckRollTarget: number,
): number {
  const raw = atk + luckRollAttacker - (defTarget + luckRollTarget);
  const floor = atk * 0.05;
  return Math.max(raw, floor);
}

export function computeCritChance(attackerLuck: number): number {
  return Math.min(CRIT_CHANCE_CAP, attackerLuck / 300);
}

export function computeDodgeChance(targetLuck: number): number {
  return Math.min(DODGE_CHANCE_CAP, targetLuck / 500);
}

function pickTarget(defenders: CombatUnit[]): CombatUnit | null {
  const alive = defenders.filter((u) => u.hpCurrent > 0);
  if (alive.length === 0) return null;
  return alive[uniformRandInt(alive.length)];
}

function isDowned(unit: CombatUnit): boolean {
  return unit.hpCurrent <= COMBAT_HP_FLOOR;
}

export function computeDownedSurvivalChance(luck: number): number {
  return Math.min(1, luck / LUCK_CAP);
}

export function resolveCombat(
  trainerUnits: CombatUnit[],
  rivalUnits: CombatUnit[],
): CombatResult {
  const trainer = trainerUnits.map((u) => ({ ...u }));
  const rival = rivalUnits.map((u) => ({ ...u }));
  const log: CombatLogEntry[] = [];

  const trainerLuck = trainer.reduce((sum, u) => sum + u.luck, 0);
  const rivalLuck = rival.reduce((sum, u) => sum + u.luck, 0);
  const firstSide = determineInitiative(trainerLuck, rivalLuck);

  let turn = 0;

  const attack = (
    side: "trainer" | "rival",
    attacker: CombatUnit,
    defenders: CombatUnit[],
  ) => {
    const target = pickTarget(defenders);
    if (!target) return;
    turn++;

    const wasDowned = isDowned(target);
    const dodged = Math.random() < computeDodgeChance(target.luck);
    let damage = 0;
    let crit = false;
    let survivedLethal = false;
    if (!dodged) {
      crit = Math.random() < computeCritChance(attacker.luck);
      damage = computeEffectiveDamage(
        attacker.atk,
        rollLuck(attacker.luck),
        target.def,
        rollLuck(target.luck),
      );
      if (crit) damage *= CRIT_MULTIPLIER;

      if (wasDowned) {
        // Already on the ground - this hit is a real death risk now.
        const survives =
          Math.random() < computeDownedSurvivalChance(target.luck);
        target.hpCurrent = survives ? COMBAT_HP_FLOOR : 0;
      } else {
        const rawHpAfter = target.hpCurrent - damage;
        if (
          rawHpAfter <= COMBAT_HP_FLOOR &&
          target.trait === "stoic" &&
          Math.random() < TRAIT_STOIC_SURVIVAL_CHANCE
        ) {
          // Would have been knocked down - Stoic keeps them just above the
          // floor so they stay in the fight this round.
          target.hpCurrent = COMBAT_HP_FLOOR + 1;
          survivedLethal = true;
        } else {
          target.hpCurrent = Math.max(COMBAT_HP_FLOOR, rawHpAfter);
        }
      }
    }

    // "Kill" is now "knockdown-or-worse": did this hit newly bring the
    // target down to the floor, or actually finish off one already there?
    const justDowned = !wasDowned && isDowned(target);
    const justKilled = wasDowned && target.hpCurrent <= 0;
    if ((justDowned || justKilled) && attacker.trait === "bloodthirsty") {
      attacker.atk *= 1 + TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT / 100;
    }

    log.push({
      turn,
      round,
      attacker: side,
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetId: target.id,
      targetName: target.name,
      damage,
      targetHpAfter: target.hpCurrent,
      crit,
      dodged,
      targetDowned: justDowned,
      targetKilled: justKilled,
      survivedLethal,
    });
  };

  // A side is still in the fight while at least one of its units hasn't
  // been knocked down to COMBAT_HP_FLOOR - nobody actually dies anymore.
  const alive = (units: CombatUnit[]) => units.some((u) => !isDowned(u));
  // Each round, every gladiator still standing attacks once, initiative
  // side first.
  const sides: ["trainer" | "rival", CombatUnit[], CombatUnit[]][] =
    firstSide === "trainer"
      ? [
          ["trainer", trainer, rival],
          ["rival", rival, trainer],
        ]
      : [
          ["rival", rival, trainer],
          ["trainer", trainer, rival],
        ];

  let round = 0;
  while (alive(trainer) && alive(rival) && round < MAX_COMBAT_ROUNDS) {
    round++;
    for (const [side, attackers, defenders] of sides) {
      for (const attacker of attackers) {
        // Knocked down: skips its turn, can't attack, stays in the pool.
        if (isDowned(attacker)) continue;
        if (!alive(defenders)) break;
        attack(side, attacker, defenders);
      }
    }
  }

  const sumHp = (units: CombatUnit[]) =>
    units.reduce((sum, u) => sum + u.hpCurrent, 0);

  let victory: boolean;
  if (!alive(rival)) {
    // Every rival gladiator is knocked down - the fight is over.
    victory = alive(trainer);
  } else if (!alive(trainer)) {
    victory = false;
  } else {
    // Round limit reached with both sides still standing.
    victory = sumHp(trainer) > sumHp(rival);
  }

  const crowdFavoriteCount = trainer.filter(
    (u) => u.trait === "crowdFavorite",
  ).length;
  const baseGoldReward = victory ? VICTORY_GOLD_REWARD : 0;
  const crowdFavoriteBonusGold = victory
    ? Math.round(
        (baseGoldReward *
          crowdFavoriteCount *
          TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT) /
          100,
      )
    : 0;

  return {
    victory,
    log,
    trainerUnits: trainer.map((u) => ({
      id: u.id,
      initialHp: u.initialHp,
      hpCurrent: u.hpCurrent,
    })),
    baseGoldReward,
    crowdFavoriteBonusGold,
    goldGained: baseGoldReward + crowdFavoriteBonusGold,
    // PvE sparring awards 1 rank point per win, tracked separately from PvP
    // (see Profile.pveRankPoints/pvpRankPoints).
    rankPointsGained: victory ? 1 : 0,
  };
}
// ====== §6 Buildings & economy ======

// Fan donation: Resources/Day = (Base * Level) * (1 + LegacyPoints * 10%)
export const FAN_DONATION_BASE_GOLD_PER_DAY = 1000;

export function fanDonationGoldPerDay(
  level: number,
  legacyPoints: number = 0,
): number {
  const baseGold = FAN_DONATION_BASE_GOLD_PER_DAY * level;
  const legacyMultiplier =
    1 + (legacyPoints * LEGACY_BONUS_PERCENT_PER_RETIREE) / 100;
  return baseGold * legacyMultiplier;
}

export function fanDonationGoldSinceLastCollection(
  level: number,
  lastCollected: Timestamp,
  legacyPoints: number = 0,
): number {
  const elapsedMs = Date.now() - lastCollected.toMillis();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return Math.floor(fanDonationGoldPerDay(level, legacyPoints) * elapsedDays);
}

// Arena wager cap: tied to Fan Donation level so betting can't outrun the
// player's actual economy - otherwise a lucky early wager can snowball into
// stakes way beyond what the current gold income supports.
export const ARENA_MAX_BET_PER_FAN_DONATION_LEVEL = 100;

export function arenaMaxBet(fanDonationLevel: number): number {
  return fanDonationLevel * ARENA_MAX_BET_PER_FAN_DONATION_LEVEL;
}

// Barracks: base storage capacity, no building upgrade. each retired
// gladiator (profile.legacyPoints) permanently adds one slot on top of it.
export const BARRACKS_BASE_CAPACITY = 8;

export function barracksCapacity(legacyPoints: number = 0): number {
  return BARRACKS_BASE_CAPACITY + legacyPoints;
}

// Training Program: bonus % scales with level.
export function trainingProgramBonusPercent(level: number): number {
  return 5 + level * 2; // e.g. level 1 -> +7%, level 5 -> +15%
}

export function trainingProgramUpgradeCooldownRemainingMs(
  lastUpgradeAt: Timestamp | undefined,
  now: number = Date.now(),
): number {
  if (!lastUpgradeAt) return 0;
  const elapsed = now - lastUpgradeAt.toMillis();
  return Math.max(0, TRAINING_PROGRAM_UPGRADE_COOLDOWN_MS - elapsed);
}

// Attack, Defense and Luck can be trained at the Training Program.
export type TrainingProgramTrainableStat = "atk" | "def" | "luck";

export function applyTrainingProgramUpgrade(
  stats: GladiatorStats,
  statKey: TrainingProgramTrainableStat,
  trainingProgramLevel: number,
  trait?: GladiatorTrait,
): GladiatorStats {
  let bonus = trainingProgramBonusPercent(trainingProgramLevel);
  if (statKey === "atk" && trait === "brute") {
    bonus += TRAIT_BRUTE_TRAINING_BONUS_PERCENT_ADD;
  }
  const boosted = { ...stats };
  const current = boosted[statKey];
  boosted[statKey] = Math.min(STAT_MAX, current * (1 + bonus / 100));
  return boosted;
}

// High-level training pushes gladiators hard enough to risk a minor injury.

export const TRAINING_INJURY_LEVEL_THRESHOLD = 5;
export const TRAINING_INJURY_CHANCE = 0.1;
export const TRAINING_INJURY_HP_LOSS_PERCENT = 0.1;

export function rollTrainingInjury(
  trainingProgramLevel: number,
  trait?: GladiatorTrait,
): boolean {
  const levelChance =
    trainingProgramLevel >= TRAINING_INJURY_LEVEL_THRESHOLD
      ? TRAINING_INJURY_CHANCE
      : 0;
  const traitChance =
    trait === "incorrigible" ? TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD : 0;
  return Math.random() < levelChance + traitChance;
}

// Gold cost of a single Training Program gladiator upgrade, before trait
// modifiers - Incorrigible gets a discount on top of this base cost.
export const TRAINING_PROGRAM_UPGRADE_GOLD_COST = 30;

export function trainingProgramUpgradeGoldCost(trait?: GladiatorTrait): number {
  const discount =
    trait === "incorrigible"
      ? TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT
      : 0;
  return Math.round(TRAINING_PROGRAM_UPGRADE_GOLD_COST * (1 - discount / 100));
}

// Infirmary: instant heal, gated by a per-gladiator cooldown.
export function infirmaryHealPercent(level: number): number {
  return Math.min(0.6, 0.15 + level * 0.05);
}

export function infirmaryHealCooldownRemainingMs(
  lastHealedAt: Timestamp | undefined,
  now: number = Date.now(),
): number {
  if (!lastHealedAt) return 0;
  const elapsed = now - lastHealedAt.toMillis();
  return Math.max(0, INFIRMARY_HEAL_COOLDOWN_MS - elapsed);
}

export function infirmaryHeal(
  stats: GladiatorStats,
  level: number,
): GladiatorStats {
  const healRatio = infirmaryHealPercent(level);
  const hpCurrent = Math.min(
    stats.hpMax,
    stats.hpCurrent + stats.hpMax * healRatio,
  );
  return { ...stats, hpCurrent };
}

// How many gladiators can be resting (excluded from the arena draw) at
// once - the Infirmary's beds are the limiting factor, so this scales with
// its level. max 4 beds, so level 4+ is the cap.
export function infirmaryMaxRestingGladiators(level: number): number {
  return Math.min(4, level);
}

// Market: trades unlocked per hour scale with level.
export function marketTradesPerHour(level: number): number {
  return (level % 2) + level;
}

// tradesLeftThisHour refills back to marketTradesPerHour(level) once every 60 minutes.
export const MARKET_TRADES_RESET_COOLDOWN_MS = 60 * 60 * 1000;

export function marketTradesResetCooldownRemainingMs(
  lastTradeReset: Timestamp | undefined,
  now: number = Date.now(),
): number {
  if (!lastTradeReset) return 0;
  const elapsed = now - lastTradeReset.toMillis();
  return Math.max(0, MARKET_TRADES_RESET_COOLDOWN_MS - elapsed);
}

// Generic building upgrade cost, shared across all 5 buildings.
export function buildingUpgradeCost(level: number): number {
  return 100 * level * level;
}

// Fan Donation, Training Program, Infirmary and Market all top out at this
// level - Barracks has no level (see barracksCapacity, legacy-point driven).
export const MAX_BUILDING_LEVEL = 9;

export function isBuildingMaxLevel(level: number): boolean {
  return level >= MAX_BUILDING_LEVEL;
}

// ====== Gladiator experience & value ======

// Veteran gladiators grow stronger with every fight survived: a small
// permanent bump to Attack/Defense on top of whatever Training Program
// upgrades already gave them, applied the same multiplicative way as
// applyTrainingProgramUpgrade - plus a flat +1 Max HP and +1 Luck per win.
// A gladiator that dies is removed from the roster (Arena.vue), so this
// only ever rewards survivors of a victory.
export const EXPERIENCE_BONUS_PER_FIGHT_PERCENT = 1;
export const VICTORY_HP_MAX_GAIN = 1;
export const VICTORY_LUCK_GAIN = 1;

// Tapers a flat Luck gain down the closer `currentLuck` already is to
// LUCK_CAP - full gain far from the cap, next to nothing just below it, and
// currentLuck can never cross LUCK_CAP as a result (also clamped below as a
// safety net).
export function computeLuckGainTowardCap(
  currentLuck: number,
  baseGain: number,
): number {
  const remainingRatio = Math.max(0, 1 - currentLuck / LUCK_CAP);
  return baseGain * remainingRatio;
}

export function applyExperienceGain(
  stats: GladiatorStats,
  trait?: GladiatorTrait,
): GladiatorStats {
  const mult = 1 + EXPERIENCE_BONUS_PER_FIGHT_PERCENT / 100;
  const baseLuckGain =
    trait === "lucky" ? TRAIT_LUCKY_VICTORY_LUCK_GAIN : VICTORY_LUCK_GAIN;
  const luckGain = computeLuckGainTowardCap(stats.luck, baseLuckGain);
  return {
    ...stats,
    atk: Math.min(STAT_MAX, stats.atk * mult),
    def: Math.min(STAT_MAX, stats.def * mult),
    luck: Math.min(LUCK_CAP, stats.luck + luckGain),
    hpMax: stats.hpMax + VICTORY_HP_MAX_GAIN,
  };
}

// A simple, at-a-glance strength score so the camp UI can highlight and
// sort the gladiators worth training up and keeping around rather than
// selling off. Battle record counts on top of raw stats: a fight survived
// already grows the stats a little via applyExperienceGain, but this flat
// per-fight bonus makes the veteran status itself visibly pay off in value,
// not just the marginal stat gain.
export const POWER_PER_BATTLE_FOUGHT = 2;

export function gladiatorPower(
  stats: GladiatorStats,
  battlesFought: number = 0,
): number {
  return Math.round(
    stats.atk +
      stats.def +
      stats.luck +
      stats.hpMax +
      battlesFought * POWER_PER_BATTLE_FOUGHT,
  );
}

export type GladiatorPowerTier = "rookie" | "veteran" | "elite" | "legend";

export function gladiatorPowerTier(power: number): GladiatorPowerTier {
  if (power >= 320) return "legend";
  if (power >= 240) return "elite";
  if (power >= 160) return "veteran";
  return "rookie";
}

// Market sell price: base value from raw combat stats, plus a flat bonus
// per battle won - a battle-tested veteran fetches more than a fresh
// recruit with identical stats. The whole thing is then scaled by the
// gladiator's power tier, steeply, so training investment actually pays
// off at resale instead of being a pure sink (see gladiatorPowerTier) -
// crossing into a higher badge is what makes the training worth it, not
// just the raw stat gain.
export const SELL_VALUE_PER_BATTLE_FOUGHT_GOLD = 10;

export const SELL_VALUE_TIER_MULTIPLIER: Record<GladiatorPowerTier, number> = {
  rookie: 1,
  veteran: 3,
  elite: 8,
  legend: 10,
};

export function gladiatorSellValue(
  stats: GladiatorStats,
  battlesFought: number = 0,
): number {
  const statValue = (stats.atk * 1.2 + stats.def * 1.2 + stats.luck * 1.1) / 3;
  const base = statValue + battlesFought * SELL_VALUE_PER_BATTLE_FOUGHT_GOLD;
  const tier = gladiatorPowerTier(gladiatorPower(stats, battlesFought));
  return Math.round(base * SELL_VALUE_TIER_MULTIPLIER[tier]);
}

// ====== Gladiator generation ======
export function generateRandomGladiatorStats(): GladiatorStats {
  const m = 20;
  const hp = m + uniformRandInt(m);
  return {
    atk: m + uniformRandInt(m),
    def: m + uniformRandInt(m),
    luck: 15 + uniformRandInt(m),
    hpMax: hp,
    hpCurrent: hp,
  };
}

export function generateGladiatorName(): string {
  return `Gladiator#${1000000 + uniformRandInt(9000000)}`;
}

let gladiatorIdCounter = 0;

export function createGladiator(
  name: string = generateGladiatorName(),
): Gladiator {
  gladiatorIdCounter += 1;
  const stats = generateRandomGladiatorStats();
  return {
    id: `${Date.now()}-${gladiatorIdCounter}-${uniformRandInt(1000)}`,
    name,
    stats,
    baseStats: { ...stats },
    trait: pickRandomTrait(),
    injured: false,
    resting: false,
    battlesFought: 0,
    trainingPoints: 1,
  };
}

export function getTrainingPoints(gladiator: Gladiator): number {
  return gladiator.trainingPoints;
}

export function canAffordTrainingProgramUpgrade(gladiator: Gladiator): boolean {
  return getTrainingPoints(gladiator) >= TRAINING_POINT_COST_PER_UPGRADE;
}

// Send 4 gladiators at random from the trainer's whole camp into combat -
// there is no separate "active roster" to curate, every recruited gladiator
// is eligible except the ones the lanista deliberately rested.
export function sendGladiatorsToCombat(
  gladiators: Record<string, Gladiator>,
): Gladiator[] {
  const eligible = Object.values(gladiators).filter((g) => !g.resting);
  return pickRandom(eligible, GLADIATORS_PER_BATTLE);
}

// ====== Retirement & legacy (ROADMAP Phase 1) ======
// A veteran can be retired instead of sold: no gold, but a permanent bump to
// Fan Donation output, forever. Gated behind a battle count so recruiting
// and immediately retiring can't be used to farm the bonus for free.
export const RETIRE_MIN_BATTLES_FOUGHT = 10;
export const LEGACY_BONUS_PERCENT_PER_RETIREE = 10;

export function canRetireGladiator(gladiator: Gladiator): boolean {
  return gladiator.battlesFought >= RETIRE_MIN_BATTLES_FOUGHT;
}

// ====== Starting data ======

export const startBuildings: Buildings = {
  fanDonation: {
    level: 1,
    lastCollected: Timestamp.now(),
  },
  barracks: {},
  trainingProgram: { level: 1 },
  infirmary: { level: 1 },
  market: {
    level: 1,
    tradesLeftThisHour: marketTradesPerHour(1),
    lastTradeReset: Timestamp.now(),
  },
};

export const startProfile: Profile = {
  username: `Trainer${uniformRandInt(1000) + 1}`,
  pveRankPoints: 0,
  pvpRankPoints: 0,
  gold: 200,
  legacyPoints: 0,
};

function buildStartGladiators(): Record<string, Gladiator> {
  const gladiators: Record<string, Gladiator> = {};
  for (let i = 0; i < 4; i++) {
    const gladiator = createGladiator();
    gladiators[gladiator.id] = gladiator;
  }
  return gladiators;
}

export const startUserData: UserData = {
  profile: startProfile,
  buildings: startBuildings,
  gladiators: buildStartGladiators(),
  user_active: true,
  session: {
    currentSession: null,
  },
};
