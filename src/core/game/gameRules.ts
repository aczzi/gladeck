// Game rules & formulas for Gladeck.
// from this file for consistency (see .github/copilot-instructions.md).

import { Timestamp } from "firebase/firestore";
import { uniformRandInt, type RngFn } from "@/core/utils";

import {
  MAX_COMBAT_ROUNDS,
  STAT_MAX,
  LUCK_CAP,
  CRIT_CHANCE_CAP,
  DODGE_CHANCE_CAP,
  CRIT_MULTIPLIER,
  VICTORY_GOLD_REWARD,
  EXPERIENCE_BONUS_PER_FIGHT_PERCENT,
  VICTORY_HP_MAX_GAIN,
  VICTORY_LUCK_GAIN,
  POWER_PER_BATTLE_FOUGHT,
  SELL_VALUE_PER_BATTLE_FOUGHT_GOLD,
  MAX_FRESH_RECRUIT_POWER,
  TRAINING_PROGRAM_UPGRADE_COOLDOWN_MS,
  TRAINING_PROGRAM_UPGRADE_GOLD_COST,
  TRAINING_POINT_COST_PER_UPGRADE,
  TRAINING_INJURY_LEVEL_THRESHOLD,
  TRAINING_INJURY_CHANCE,
  INFIRMARY_HEAL_COOLDOWN_MS,
  MARKET_TRADES_RESET_COOLDOWN_MS,
  COMBAT_HP_FLOOR,
  TANK_TARGET_WEIGHT_MULTIPLIER,
  TANK_DAMAGE_REDUCTION_PERCENT,
  SUPPORT_TEAM_DEF_BUFF_PERCENT,
  MAX_DPS_PER_TEAM,
  DUO_BODYGUARD_ATK_BONUS_PERCENT, // "Bodyguard"
  DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT, // "Lucky Aegis"
  DUO_TWIN_FRENZY_ATK_BONUS_PERCENT, // "Twin Frenzy"
  DUO_RAMPART_DEF_BONUS_PERCENT, // "Shield Wall"
  DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT, // "Rowdy Crowd"
  DUO_RECKLESS_DUO_ATK_BONUS_PERCENT, // "Reckless Duo"
  DUO_GLASS_CANNON_LUCK_BONUS_PERCENT, // "Glass Cannon"
  ARENA_MAX_BET_PER_FAN_DONATION_LEVEL,
  FAN_DONATION_BASE_GOLD_PER_DAY,
  DOWNED_SURVIVAL_CHANCE_MIN,
  DOWNED_SURVIVAL_CHANCE_MAX,
  MAX_BUILDING_LEVEL,
} from "@/core/game/constantes";

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

import {
  TRAIT_BRUTE_TRAINING_BONUS_MULTIPLIER,
  TRAIT_STOIC_SURVIVAL_CHANCE,
  TRAIT_LUCKY_VICTORY_LUCK_GAIN,
  TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT,
  TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT,
  TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT,
  TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD,
  CROWD_FAVORITE_MAX_STACK,
  pickRandomTrait,
} from "@/core/game/traits";

import {
  computeActiveDuoSynergies,
  type DuoRoleTag,
} from "@/core/game/synergies";

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

// ====== §3 Roster & Attribution ======

// DPS keeps its offensive edge but no longer also gets a Luck bonus on top -
// stacking a crit/dodge/initiative edge with the best raw Attack made a
// full-DPS team strictly dominant over any team using Tank or Support.
export function applyAttribution(
  stats: GladiatorStats,
  attribution: Attribution,
): GladiatorStats {
  if (attribution === "support") return { ...stats };
  if (attribution === "dps") {
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

export function isValidTeamComposition(attributions: Attribution[]): boolean {
  return (
    attributions.filter((attribution) => attribution === "dps").length <=
    MAX_DPS_PER_TEAM
  );
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

// ====== Axe B - Duo synergies (ROADMAP.md, curated combos) ======
// A short, hand-picked list of (trait, role) pairs, not an exhaustive
// matrix of the 18 possible tags - see ROADMAP.md Axe B for the full
// rationale. Applied once before combat starts, on the already
// role-modified units, the same way applySupportTeamBuff is above -
// deliberately not a per-turn mechanic, to keep this isolated from the
// active-ability work in Axe C.

function tagsFromUnits(units: CombatUnit[]): DuoRoleTag[] {
  return units
    .filter((u): u is CombatUnit & { trait: GladiatorTrait } => !!u.trait)
    .map((u) => ({ trait: u.trait, attribution: u.attribution }));
}

// Mutates units in place with the flat stat bonus of every active duo -
// "Rowdy Crowd" (gold) isn't handled here since it isn't a stat, see
// resolveCombat's reward block instead.
function applyDuoSynergyStatBonuses(units: CombatUnit[]): void {
  const active = new Set(
    computeActiveDuoSynergies(tagsFromUnits(units)).map((s) => s.id),
  );
  if (active.has("bodyguard")) {
    const dps = units.find(
      (u) => u.trait === "bloodthirsty" && u.attribution === "dps",
    );
    if (dps) dps.atk *= 1 + DUO_BODYGUARD_ATK_BONUS_PERCENT / 100;
  }
  if (active.has("lucky-aegis")) {
    const support = units.find(
      (u) => u.trait === "lucky" && u.attribution === "support",
    );
    const tank = units.find(
      (u) => u.trait === "lucky" && u.attribution === "tank",
    );
    if (support && tank) {
      tank.luck += (support.luck * DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT) / 100;
    }
  }
  if (active.has("twin-frenzy")) {
    for (const unit of units.filter(
      (u) => u.trait === "bloodthirsty" && u.attribution === "dps",
    )) {
      unit.atk *= 1 + DUO_TWIN_FRENZY_ATK_BONUS_PERCENT / 100;
    }
  }
  if (active.has("rampart")) {
    for (const unit of units.filter(
      (u) =>
        u.trait === "brute" &&
        (u.attribution === "tank" || u.attribution === "support"),
    )) {
      unit.def *= 1 + DUO_RAMPART_DEF_BONUS_PERCENT / 100;
    }
  }
  if (active.has("reckless-duo")) {
    const tank = units.find(
      (u) => u.trait === "brute" && u.attribution === "tank",
    );
    if (tank) tank.atk *= 1 + DUO_RECKLESS_DUO_ATK_BONUS_PERCENT / 100;
  }
  if (active.has("glass-cannon")) {
    const dps = units.find(
      (u) => u.trait === "incorrigible" && u.attribution === "dps",
    );
    if (dps) dps.luck *= 1 + DUO_GLASS_CANNON_LUCK_BONUS_PERCENT / 100;
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
// gladiators are sent, so a team of rookies only ever sees Easy fights

function countVeteranGladiators(
  gladiators: { stats: GladiatorStats; battlesFought: number }[],
): number {
  return gladiators.filter(
    (g) =>
      gladiatorPowerTier(gladiatorPower(g.stats, g.battlesFought)) !== "rookie",
  ).length;
}

const ARENA_DIFFICULTY_POOL_BY_VETERAN_COUNT: ArenaDifficulty[][] = [
  ["easy"],
  ["easy", "normal"],
  ["easy", "normal", "hard"],
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
  normal: 2,
  hard: 5,
};

export const DIFFICULTY_RANK_POINTS_REWARD: Record<ArenaDifficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
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
    attribution: Attribution;
    trait: GladiatorTrait;
    battlesFought?: number;
  }[],
): CombatUnit[] {
  const units = sentGladiators.map(
    ({ id, name, stats, attribution, trait, battlesFought = 0 }) => {
      const mod = applyAttribution(stats, attribution);
      return {
        id,
        name,
        attribution,
        trait,
        atk: mod.atk,
        luck: mod.luck,
        def: mod.def,
        initialHp: mod.hpCurrent,
        hpCurrent: mod.hpCurrent,
        // Tier is read off the pre-attribution base stats (same source as
        // pickArenaDifficultyForTeam's veteran count), not the role-modified
        // combat stats - a DPS/Tank/Support swing shouldn't flip whether a
        // gladiator can die.
        isVeteran:
          gladiatorPowerTier(gladiatorPower(stats, battlesFought)) !== "rookie",
      };
    },
  );
  applySupportTeamBuff(units);
  applyDuoSynergyStatBonuses(units);
  return units;
}

export const RIVAL_STAT_WEIGHT_BASELINE = 1.5;

type CappedStatKey = "atk" | "luck" | "def" | "hp";

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
    // Rivals have no battle history of their own - their tier is read off
    // the same power formula at battlesFought=0, purely from the stat
    // budget they were dealt.
    const isVeteran =
      gladiatorPowerTier(
        gladiatorPower({
          atk: stats.atk,
          def: stats.def,
          luck: stats.luck,
          hpMax: stats.hp,
          hpCurrent: stats.hp,
        }),
      ) !== "rookie";
    return {
      id: `rival-${i}`,
      name: `Rival Gladiator ${i + 1}`,
      attribution: attributions[i],
      atk: stats.atk,
      luck: stats.luck,
      def: stats.def,
      initialHp: stats.hp,
      hpCurrent: stats.hp,
      isVeteran,
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

export function computeDownedSurvivalChance(luck: number): number {
  const ratio = Math.max(0, Math.min(1, luck / LUCK_CAP));
  return (
    DOWNED_SURVIVAL_CHANCE_MIN +
    ratio * (DOWNED_SURVIVAL_CHANCE_MAX - DOWNED_SURVIVAL_CHANCE_MIN)
  );
}

// Resolves the fate of every unit still downed once the fight is over: a
// single roll per unit, so nobody is executed or spared more than once.
// Permadeath is a Hard-only stake (PvP later on) - Easy and Normal always
// leave a knocked-down gladiator alive at the HP floor, so new/casual teams
// can lose a fight without losing a gladiator. On Hard, it's also gated on
// unit.isVeteran: a rookie is never at risk, on any difficulty - only a
// veteran-or-above unit actually rolls computeDownedSurvivalChance and can
// come back at 0 HP.
function resolveDownedFates(
  units: CombatUnit[],
  rng: RngFn,
  difficulty: ArenaDifficulty,
): void {
  for (const unit of units) {
    if (!isDowned(unit)) continue;
    const survives =
      difficulty !== "hard" ||
      !unit.isVeteran ||
      rng() < computeDownedSurvivalChance(unit.luck);
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
    const bloodthirstyTriggered =
      justDowned && attacker.trait === "bloodthirsty";
    if (bloodthirstyTriggered) {
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
      bloodthirstyTriggered,
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
  resolveDownedFates(trainer, rng, difficulty);
  resolveDownedFates(rival, rng, difficulty);

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

  // Duo synergies (ROADMAP.md Axe B) are read off the trainer's final
  // (trait, role) tags - only "Rowdy Crowd" pays out gold, the other
  // curated duos were already applied as stat bonuses before the fight (see
  // applyDuoSynergyStatBonuses), but every active one is reported so the UI
  // can show the full list regardless of outcome.
  const activeDuoSynergies = computeActiveDuoSynergies(tagsFromUnits(trainer));
  const duoSynergyBonusGold =
    victory && activeDuoSynergies.some((s) => s.id === "crowd-lucky")
      ? Math.round((baseGoldReward * DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT) / 100)
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
    duoSynergyBonusGold,
    activeDuoSynergies,
    goldGained: baseGoldReward + crowdFavoriteBonusGold + duoSynergyBonusGold,
    // PvE rank points scale with difficulty (see
    // DIFFICULTY_RANK_POINTS_REWARD) so the raw total is not purely a combat
    // volume counter, tracked separately from PvP (Profile.pveRankPoints/
    // pvpRankPoints).
    rankPointsGained: victory ? DIFFICULTY_RANK_POINTS_REWARD[difficulty] : 0,
  };
}
// ====== §6 Buildings & economy ======


export function fanDonationGoldPerDay(
  level: number,
  legacyPoints: number = 0,
): number {
  const baseGold = FAN_DONATION_BASE_GOLD_PER_DAY * level ;
  const legacyMultiplier =1 + (LEGACY_BONUS_PERCENT_PER_RETIREE * legacyPoints) / 100;
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

export function generateGladiatorName(stats: GladiatorStats, id: string): string {
  let root = "S";
  if (stats.atk > stats.def)  root = "D";
  if (stats.def > stats.atk)  root = "T";
  return `${root}#${id}`;
}

export function createGladiator(
  rng: RngFn = Math.random,
): Gladiator {
  const id = `${1000000 + uniformRandInt(9000000, rng)}`
  const stats = generateRandomGladiatorStats(rng);
  const name = generateGladiatorName(stats, id);
  return {
    id: `${Date.now()}-${id}`,
    name,
    stats,
    baseStats: { ...stats },
    trait: pickRandomTrait(rng),
    injured: false,
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
