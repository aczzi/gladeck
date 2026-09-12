// Game rules & formulas for Gladeck.
// from this file for consistency (see .github/copilot-instructions.md).

import { Timestamp } from "firebase/firestore";
import { uniformRandInt, pickRandom, type RngFn } from "@/core/utils";
import type {
  Gladiator,
  GladiatorStats,
  GladiatorTrait,
  Buildings,
  Profile,
  UserData,
  Attribution,
  ArenaDifficulty,
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

// The wager itself is debited up front (Arena.vue's engage()) and this is
// the net effect it should have once the fight resolves: +wager on a win
// (the debited wager plus 2x back), -wager on a loss (never returned) -
// never +2*wager, which would mean the wager was paid out twice without
// ever having been debited.
export function computeArenaWagerNetGold(
  wager: number,
  victory: boolean,
): number {
  return victory ? wager : -wager;
}

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

// Brute: Training Program Attack upgrades get +20% of the normal bonus
// (multiplicative, not a flat point add) - a flat +10pp used to nearly
// double the level-1 bonus (17% vs 7% for everyone else); scaling with the
// base bonus instead keeps it proportionate at every Training Program level.
export const TRAIT_BRUTE_TRAINING_BONUS_MULTIPLIER = 1.2;
// Stoic ("Increvable"): a hit that would kill instead leaves 1 HP, this often.
export const TRAIT_STOIC_SURVIVAL_CHANCE = 0.25;
// Lucky: gains a flat +2 Luck per victory instead of the usual +1.
export const TRAIT_LUCKY_VICTORY_LUCK_GAIN = 2;
// Bloodthirsty: every knockdown lands compounds the killer's own Attack for
// the rest of that same fight (resolveCombat works on cloned units, so this
// never persists between fights). Triggers exactly once per knockdown, on
// justDowned - see resolveCombat.
export const TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT = 5;
// Crowd Favorite: flat % more gold on victory, per Crowd Favorite gladiator
// sent - stacks if several are sent to the same fight, up to this cap so a
// team can't stack the bonus without limit.
export const TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT = 20;
export const CROWD_FAVORITE_MAX_STACK = 2;
// Incorrigible: cheaper Training Program upgrades, but an extra personal
// injury risk stacked on top of the level-gated one (see rollTrainingInjury).
export const TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT = 35;
export const TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD = 0.1;

export const COMBAT_HP_FLOOR = 1;

export function pickRandomTrait(rng: RngFn = Math.random): GladiatorTrait {
  return GLADIATOR_TRAITS[uniformRandInt(GLADIATOR_TRAITS.length, rng)];
}

// ====== §3 Roster & Attribution ======

// DPS keeps its offensive edge but no longer also gets a Luck bonus on top -
// stacking a crit/dodge/initiative edge with the best raw Attack made a
// full-DPS team strictly dominant over any team using Tank or Support.
export function applyAttribution(
  stats: GladiatorStats,
  line: Attribution,
): GladiatorStats {
  if (line === "support") return { ...stats };
  if (line === "dps") {
    return {
      atk: stats.atk * 1.2,
      luck: stats.luck,
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

// ====== §3.1 Role combat mechanics ======
// These act on CombatUnit.attribution at fight time, so they apply
// identically to the trainer's team and to the rival team (see
// distributeRivalBudget), rather than only through applyAttribution's stat
// multipliers which only the trainer's own gladiators go through.

// Tank: gets targeted roughly 3x as often as a non-Tank ally...
export const TANK_TARGET_WEIGHT_MULTIPLIER = 3;
// ...and shrugs off 10% of any hit that does land.
export const TANK_DAMAGE_REDUCTION_PERCENT = 10;
// Support: each one grants the whole side +8% Defense, stacking per Support
// present - a flat collective buff applied once before the fight starts.
export const SUPPORT_TEAM_DEF_BUFF_PERCENT = 8;
// Composition rule: at most this many DPS per team. A full 4-gladiator team
// still frees up its other two slots for Tank/Support in any mix (TT, SS or
// TS all end up allowed simply by leaving them unconstrained), but the cap
// is a ceiling rather than an exact requirement so it also works when fewer
// than GLADIATORS_PER_BATTLE gladiators are available to send (a team of 1
// or 2 can never exceed it anyway - the cap only actually bites at 3 or 4).
export const MAX_DPS_PER_TEAM = 2;

export function isValidTeamComposition(lines: Attribution[]): boolean {
  return lines.filter((line) => line === "dps").length <= MAX_DPS_PER_TEAM;
}

// Applies the Support team buff in place, once, before combat starts.
function applySupportTeamBuff(units: CombatUnit[]): void {
  const supportCount = units.filter((u) => u.attribution === "support").length;
  if (supportCount === 0) return;
  const multiplier = 1 + (SUPPORT_TEAM_DEF_BUFF_PERCENT * supportCount) / 100;
  for (const unit of units) {
    unit.def *= multiplier;
  }
}

// ====== §4.1 Rival matchmaking - power budget ======

// Rival strength is sized off the trainer team's average *combat* power -
// computed from the CombatUnit list (post-role stats, current HP), not from
// the raw roster. This intentionally differs from gladiatorPower (used for
// the camp UI's power tiers and market sell value): it must not count
// battlesFought, since that already shows up as higher stats via
// applyExperienceGain, and double-counting it as "more danger" on top
// artificially over-scales rivals against veterans. Fatigue is represented
// by using hpCurrent (not hpMax) directly in the sum, so a wounded team
// draws a weaker rival instead of one sized for full health.
export function computeMatchmakingUnitPower(unit: CombatUnit): number {
  return unit.atk + unit.def + unit.luck + unit.hpCurrent;
}

export function computeAverageTeamPower(units: CombatUnit[]): number {
  if (units.length === 0) return 0;
  const totalPower = units.reduce(
    (sum, unit) => sum + computeMatchmakingUnitPower(unit),
    0,
  );
  return totalPower / units.length;
}

// Each difficulty targets a measurable PvE win-rate band (see the
// simulation suite in gameRules.test.ts) and pays out accordingly - harder
// fights are worth more.
// Calibrated by Monte Carlo simulation (see gameRules.test.ts) against a
// fresh 4-gladiator "rookie" team: easy ~80-85%, normal ~65-75%, hard
// ~45-55% win rate, holding stable across many seeds. The win-rate curve is
// extremely steep around budget parity (a couple of percentage points of
// multiplier swing the win rate by tens of points), so these were tuned
// empirically rather than picked by hand.
export const RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY: Record<
  ArenaDifficulty,
  number
> = {
  easy: 0.922,
  normal: 0.947,
  hard: 0.968,
};

// The difficulty is rolled once per fight and never shown to the player -
// see Arena.vue's startPvECombat - so this is the only place it's chosen.
export const ARENA_DIFFICULTIES: ArenaDifficulty[] = ["easy", "normal", "hard"];

export function pickRandomDifficulty(
  rng: RngFn = Math.random,
): ArenaDifficulty {
  return ARENA_DIFFICULTIES[uniformRandInt(ARENA_DIFFICULTIES.length, rng)];
}

// The difficulty pool for a fight widens with how many veteran-or-above
// gladiators (see gladiatorPowerTier) are in the sent team, so a fresh
// rookie squad is never unfairly thrown at Hard, while a team stacked with
// veterans can't just keep farming Easy: 0 veterans -> Easy only, 1 veteran
// -> Easy/Normal, 2+ veterans -> the full Easy/Normal/Hard pool.
function countVeteranGladiators(
  gladiators: { stats: GladiatorStats; battlesFought: number }[],
): number {
  return gladiators.filter(
    (g) =>
      gladiatorPowerTier(gladiatorPower(g.stats, g.battlesFought)) !==
      "rookie",
  ).length;
}

const ARENA_DIFFICULTY_POOL_BY_VETERAN_COUNT: ArenaDifficulty[][] = [
  ["easy"],
  ["easy", "normal"],
];

export function pickArenaDifficultyForTeam(
  gladiators: { stats: GladiatorStats; battlesFought: number }[],
  rng: RngFn = Math.random,
): ArenaDifficulty {
  const veteranCount = countVeteranGladiators(gladiators);
  const pool =
    ARENA_DIFFICULTY_POOL_BY_VETERAN_COUNT[veteranCount] ?? ARENA_DIFFICULTIES;
  return pool[uniformRandInt(pool.length, rng)];
}

export const DIFFICULTY_GOLD_REWARD_MULTIPLIER: Record<
  ArenaDifficulty,
  number
> = {
  easy: 1,
  normal: 1,
  hard: 1.5,
};

// PvE rank points scale with difficulty rather than a flat 1-per-win, so the
// raw total reflects some of the risk actually taken on rather than pure
// combat volume (farming Easy wins no longer earns rank as fast as Hard).
export const DIFFICULTY_RANK_POINTS_REWARD: Record<ArenaDifficulty, number> = {
  easy: 1,
  normal: 1,
  hard: 2,
};

export function computeRivalBudget(
  avgTeamPower: number,
  unitCount: number,
  difficulty: ArenaDifficulty = "normal",
): number {
  return (
    avgTeamPower * unitCount * RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY[difficulty]
  );
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
  const units = sentGladiators.map(({ id, name, stats, line, trait }) => {
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
  applySupportTeamBuff(units);
  return units;
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

// Same composition rule as the trainer's team (up to MAX_DPS_PER_TEAM DPS,
// the rest a random Tank/Support mix) so rivals play by the same rules the
// player does - see the "Give roles a real function" TODO priority.
function rollRivalAttributions(count: number, rng: RngFn): Attribution[] {
  const dpsSlots = Math.min(MAX_DPS_PER_TEAM, count);
  return Array.from({ length: count }, (_, i) => {
    if (i < dpsSlots) return "dps";
    return rng() < 0.5 ? "tank" : "support";
  });
}

export function distributeRivalBudget(
  budget: number,
  count: number,
  rng: RngFn = Math.random,
): CombatUnit[] {
  const shareWeights = Array.from(
    { length: count },
    () => RIVAL_STAT_WEIGHT_BASELINE + rng(),
  );
  const shareSum = shareWeights.reduce((a, b) => a + b, 0);
  const attributions = rollRivalAttributions(count, rng);

  const units = shareWeights.map((share, i) => {
    const unitBudget = (share / shareSum) * budget;
    const stats = allocateCappedBudget(unitBudget, [
      {
        key: "atk",
        weight: RIVAL_STAT_WEIGHT_BASELINE + rng(),
        cap: STAT_MAX,
      },
      {
        key: "luck",
        weight: RIVAL_STAT_WEIGHT_BASELINE + rng(),
        cap: LUCK_CAP,
      },
      {
        key: "def",
        weight: RIVAL_STAT_WEIGHT_BASELINE + rng(),
        cap: STAT_MAX,
      },
      {
        key: "hp",
        weight: RIVAL_STAT_WEIGHT_BASELINE + rng(),
        cap: Infinity,
      },
    ]);
    return {
      id: `rival-${i}`,
      name: `Rival Gladiator ${i + 1}`,
      attribution: attributions[i],
      atk: stats.atk,
      luck: stats.luck,
      def: stats.def,
      initialHp: stats.hp,
      hpCurrent: stats.hp,
    } as CombatUnit;
  });

  applySupportTeamBuff(units);
  return units;
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
export function rollLuck(luck: number, rng: RngFn = Math.random): number {
  return luck * 0.25 + rng() * (luck * 0.75);
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

// Tank draws a disproportionate share of incoming attacks (weighted random
// pick) instead of every unit being equally likely to be targeted -
// otherwise there is no reason to ever field one.
function pickTarget(defenders: CombatUnit[], rng: RngFn): CombatUnit | null {
  const targetable = defenders.filter((u) => !isDowned(u));
  if (targetable.length === 0) return null;
  const weights = targetable.map((u) =>
    u.attribution === "tank" ? TANK_TARGET_WEIGHT_MULTIPLIER : 1,
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < targetable.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return targetable[i];
  }
  return targetable[targetable.length - 1];
}

// A unit at or below the HP floor is knocked out of the fight for good: it
// can no longer act nor be targeted (see pickTarget), and its final fate
// (survives knocked out, or dies) is rolled exactly once, after the whole
// fight ends - see resolveDownedFates. This replaces the old model where a
// downed unit stayed in the target pool and re-rolled survival on every
// subsequent hit, which both let 90-Luck units become unkillable in
// practice (chained near-certain rolls) and kept "dead weight" absorbing
// attacks that should have gone to a unit still able to fight back.
function isDowned(unit: CombatUnit): boolean {
  return unit.hpCurrent <= COMBAT_HP_FLOOR;
}

// Baseline 15% survival chance at 0 Luck, scaling up to a capped 85% at
// LUCK_CAP - high Luck makes a knockout much less likely to be fatal, but
// never a guarantee, so no gladiator is ever completely deathproof.
export const DOWNED_SURVIVAL_CHANCE_MIN = 0.15;
export const DOWNED_SURVIVAL_CHANCE_MAX = 0.85;

export function computeDownedSurvivalChance(luck: number): number {
  const ratio = Math.max(0, Math.min(1, luck / LUCK_CAP));
  return (
    DOWNED_SURVIVAL_CHANCE_MIN +
    ratio * (DOWNED_SURVIVAL_CHANCE_MAX - DOWNED_SURVIVAL_CHANCE_MIN)
  );
}

// Resolves the fate of every unit still downed once the fight is over: a
// single roll per unit, so nobody is executed or spared more than once.
function resolveDownedFates(units: CombatUnit[], rng: RngFn): void {
  for (const unit of units) {
    if (!isDowned(unit)) continue;
    const survives = rng() < computeDownedSurvivalChance(unit.luck);
    unit.hpCurrent = survives ? COMBAT_HP_FLOOR : 0;
  }
}

export interface ResolveCombatOptions {
  difficulty?: ArenaDifficulty;
  rng?: RngFn;
}

export function resolveCombat(
  trainerUnits: CombatUnit[],
  rivalUnits: CombatUnit[],
  options: ResolveCombatOptions = {},
): CombatResult {
  const { difficulty = "normal", rng = Math.random } = options;
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
    const target = pickTarget(defenders, rng);
    if (!target) return;
    turn++;

    const dodged = rng() < computeDodgeChance(target.luck);
    let damage = 0;
    let crit = false;
    let survivedLethal = false;
    if (!dodged) {
      crit = rng() < computeCritChance(attacker.luck);
      damage = computeEffectiveDamage(
        attacker.atk,
        rollLuck(attacker.luck, rng),
        target.def,
        rollLuck(target.luck, rng),
      );
      if (target.attribution === "tank") {
        damage *= 1 - TANK_DAMAGE_REDUCTION_PERCENT / 100;
      }
      if (crit) damage *= CRIT_MULTIPLIER;

      const rawHpAfter = target.hpCurrent - damage;
      if (
        rawHpAfter <= COMBAT_HP_FLOOR &&
        target.trait === "stoic" &&
        rng() < TRAIT_STOIC_SURVIVAL_CHANCE
      ) {
        // Would have been knocked down - Stoic keeps them just above the
        // floor so they stay in the fight this round.
        target.hpCurrent = COMBAT_HP_FLOOR + 1;
        survivedLethal = true;
      } else {
        target.hpCurrent = Math.max(COMBAT_HP_FLOOR, rawHpAfter);
      }
    }

    // The target entered this attack alive (pickTarget only returns
    // targetable, non-downed units), so any resulting knockdown is new.
    const justDowned = isDowned(target);
    if (justDowned && attacker.trait === "bloodthirsty") {
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
      survivedLethal,
    });
  };

  // A side is still in the fight while at least one of its units hasn't
  // been knocked down to COMBAT_HP_FLOOR.
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

  // Knockouts are only actually resolved to "survives" or "dies" once the
  // fight is fully over - see resolveDownedFates.
  resolveDownedFates(trainer, rng);
  resolveDownedFates(rival, rng);

  // Crowd Favorite's bonus is capped per team so stacking several doesn't
  // snowball the reward - it also only ever applies to this flat/bonus
  // reward, never to the wager payout (handled separately in Arena.vue).
  const crowdFavoriteCount = Math.min(
    CROWD_FAVORITE_MAX_STACK,
    trainer.filter((u) => u.trait === "crowdFavorite").length,
  );
  const baseGoldReward = victory
    ? Math.round(
        VICTORY_GOLD_REWARD * DIFFICULTY_GOLD_REWARD_MULTIPLIER[difficulty],
      )
    : 0;
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
    rivalUnits: rival.map((u) => ({
      id: u.id,
      initialHp: u.initialHp,
      hpCurrent: u.hpCurrent,
    })),
    baseGoldReward,
    crowdFavoriteBonusGold,
    goldGained: baseGoldReward + crowdFavoriteBonusGold,
    // PvE rank points scale with difficulty (see
    // DIFFICULTY_RANK_POINTS_REWARD) so the raw total is not purely a combat
    // volume counter, tracked separately from PvP (Profile.pveRankPoints/
    // pvpRankPoints).
    rankPointsGained: victory ? DIFFICULTY_RANK_POINTS_REWARD[difficulty] : 0,
  };
}
// ====== §6 Buildings & economy ======

// Fan donation: Resources/Day = (Base * Level) * (1 + 10% * sqrt(LegacyPoints))
export const FAN_DONATION_BASE_GOLD_PER_DAY = 1000;

export function fanDonationGoldPerDay(
  level: number,
  legacyPoints: number = 0,
): number {
  const baseGold = FAN_DONATION_BASE_GOLD_PER_DAY * level;
  // Diminishing returns via sqrt: retiree #1 is worth the full +10%, but the
  // 4th is only worth +5% more (20% total instead of 40%) and the 9th only
  // +3% more (30% instead of 90%) - retiring gladiators no longer compounds
  // into an unbounded income multiplier.
  const legacyMultiplier =
    1 + (LEGACY_BONUS_PERCENT_PER_RETIREE * Math.sqrt(legacyPoints)) / 100;
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
    bonus *= TRAIT_BRUTE_TRAINING_BONUS_MULTIPLIER;
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

// Market: trades unlocked per hour scale with level - every level grants an
// immediate extra trade (the old (level % 2) + level formula gave the same
// count for two consecutive levels, e.g. levels 1-2 and 3-4).
export function marketTradesPerHour(level: number): number {
  return level + 1;
}

// Gold cost to recruit a fresh gladiator (createGladiator()) at the Market.
// gladiatorSellValueMultiplier's flat rookie floor is calibrated against
// this - a freshly recruited gladiator must never be resellable for more
// than this, or recruit-then-sell becomes an infinite money exploit.
export const MARKET_RECRUIT_COST = 50;

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
// recruit with identical stats. The whole thing is then scaled by a
// continuous curve over the gladiator's power, so training investment pays
// off smoothly at resale instead of being a pure sink - the curve still
// passes through the same anchor values the old per-tier multiplier used
// (1x/3x/8x/10x at the tier thresholds from gladiatorPowerTier), but
// interpolates between them instead of jumping the instant a single stat
// point crosses a badge threshold (e.g. power 159 -> 160 used to almost
// triple the sell value outright).
export const SELL_VALUE_PER_BATTLE_FOUGHT_GOLD = 10;

// generateRandomGladiatorStats rolls atk/def/hpMax up to 39 and luck up to
// 34, so a freshly recruited gladiator's power (see gladiatorPower) can
// never exceed 39+39+34+39 = 151. The curve MUST stay flat at the rookie
// multiplier (1x) for every power at or below that, with margin - otherwise
// a fresh recruit could be resold for more than MARKET_RECRUIT_COST paid to
// create it, an infinite-money exploit. This is guarded by a regression
// test in gameRules.test.ts. Only widen this floor if the stat generation
// range above ever changes too.
const MAX_FRESH_RECRUIT_POWER = 151;

const SELL_VALUE_MULTIPLIER_CURVE: { power: number; multiplier: number }[] = [
  { power: 0, multiplier: 1 },
  { power: MAX_FRESH_RECRUIT_POWER + 3, multiplier: 1 },
  { power: 160, multiplier: 3 },
  { power: 220, multiplier: 3 },
  { power: 240, multiplier: 8 },
  { power: 300, multiplier: 8 },
  { power: 320, multiplier: 10 },
];

export function gladiatorSellValueMultiplier(power: number): number {
  const curve = SELL_VALUE_MULTIPLIER_CURVE;
  if (power <= curve[0].power) return curve[0].multiplier;
  for (let i = 1; i < curve.length; i++) {
    if (power <= curve[i].power) {
      const prev = curve[i - 1];
      const next = curve[i];
      const ratio = (power - prev.power) / (next.power - prev.power);
      return prev.multiplier + ratio * (next.multiplier - prev.multiplier);
    }
  }
  return curve[curve.length - 1].multiplier;
}

export function gladiatorSellValue(
  stats: GladiatorStats,
  battlesFought: number = 0,
): number {
  const statValue = (stats.atk * 1.2 + stats.def * 1.2 + stats.luck * 1.1) / 3;
  const base = statValue + battlesFought * SELL_VALUE_PER_BATTLE_FOUGHT_GOLD;
  const power = gladiatorPower(stats, battlesFought);
  return Math.round(base * gladiatorSellValueMultiplier(power));
}

// ====== Gladiator generation ======
export function generateRandomGladiatorStats(
  rng: RngFn = Math.random,
): GladiatorStats {
  const m = 20;
  const hp = m + uniformRandInt(m, rng);
  return {
    atk: m + uniformRandInt(m, rng),
    def: m + uniformRandInt(m, rng),
    luck: 15 + uniformRandInt(m, rng),
    hpMax: hp,
    hpCurrent: hp,
  };
}

export function generateGladiatorName(rng: RngFn = Math.random): string {
  return `Gladiator#${1000000 + uniformRandInt(9000000, rng)}`;
}

let gladiatorIdCounter = 0;

export function createGladiator(
  name: string = generateGladiatorName(),
  rng: RngFn = Math.random,
): Gladiator {
  gladiatorIdCounter += 1;
  const stats = generateRandomGladiatorStats(rng);
  return {
    id: `${Date.now()}-${gladiatorIdCounter}-${uniformRandInt(1000, rng)}`,
    name,
    stats,
    baseStats: { ...stats },
    trait: pickRandomTrait(rng),
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
