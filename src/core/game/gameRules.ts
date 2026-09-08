// Game rules & formulas for Gladeck.
// Every formula below is numbered after its section in ROADMAP.md so the
// two documents stay easy to cross-check.
import { Timestamp } from "firebase/firestore";
import { uniformRandInt, pickRandom } from "@/core/utils";
import type {
  Gladiator,
  GladiatorStats,
  Buildings,
  Profile,
  UserData,
  Line,
  TeamStats,
  CombatUnit,
  CombatResult,
  CombatLogEntry,
} from "@/core/game/types";

// There is no separate combat roster: every gladiator in the camp is
// eligible, and GLADIATORS_PER_BATTLE of them are drawn at random per fight.
export const GLADIATORS_PER_BATTLE = 4;
export const STAT_MIN = 0;
export const STAT_MAX = 100;

// Crit chance grows with the attacker's Luck, capped at 30%.
// Dodge chance grows with the target's Luck, capped at 20% - lower than
// crit so a lucky attacker still tends to come out ahead of a lucky target.
export const CRIT_CHANCE_CAP = 0.3;
export const DODGE_CHANCE_CAP = 0.2;
export const CRIT_MULTIPLIER = 1.5;
export const VICTORY_GOLD_REWARD = 50;

// A given gladiator can only be upgraded at the Training Program once every 30 min.
export const TRAINING_PROGRAM_UPGRADE_COOLDOWN_MS = 30 * 60 * 1000;
// A gladiator can only be healed once every 30 minutes.
export const INFIRMARY_HEAL_COOLDOWN_MS = 30 * 60 * 1000;
// Gold cost of a single heal action.
export const INFIRMARY_HEAL_COST = 20;

// ====== §3 Roster & placement ======

// DPS boosts ATK/LUCK by 10%, penalizes HP/DEF by 10%.
// Tank does the opposite.
export function applyLineModifiers(
  stats: GladiatorStats,
  line: Line,
): GladiatorStats {
  const atkLuckMult = line === "dps" ? 1.1 : 0.9;
  const hpDefMult = line === "dps" ? 0.9 : 1.1;
  return {
    atk: stats.atk * atkLuckMult,
    luck: stats.luck * atkLuckMult,
    hpMax: stats.hpMax * hpDefMult,
    hpCurrent: stats.hpCurrent * hpDefMult,
    def: stats.def * hpDefMult,
  };
}

// Sums the modified stats of the 4 sent gladiators into team stats (0-400 per stat).
export function computeTeamStats(
  sentGladiators: { stats: GladiatorStats; line: Line }[],
): TeamStats {
  return sentGladiators.reduce(
    (team, { stats, line }) => {
      const mod = applyLineModifiers(stats, line);
      return {
        atk: team.atk + mod.atk,
        luck: team.luck + mod.luck,
        hp: team.hp + mod.hpCurrent,
        def: team.def + mod.def,
      };
    },
    { atk: 0, luck: 0, hp: 0, def: 0 } as TeamStats,
  );
}

// ====== §4.1 Rival matchmaking - point budget ======

// Rival Budget = (Sum of Trainer Stats) * mult, mult ramping from
// RIVAL_BUDGET_FLOOR up to RIVAL_BUDGET_CAP as RankPoints grow.
// resolveCombat plays out as ~40 individual hits per battle, so with more
// than a handful of rank points, small budget edges compound into a near-
// certain outcome instead of a close fight (variance from crit/dodge/luck
// rolls per hit gets washed out by the sheer number of hits). Balance
// simulation showed the fair-fight zone sits in a narrow band just under
// budget parity, so the cap is kept below 1.0 rather than let rivals reach
// or exceed the trainer's own stat total.
export const RIVAL_BUDGET_FLOOR = 0.85;
export const RIVAL_BUDGET_CAP = 0.975;
export const RIVAL_BUDGET_GROWTH_DIVISOR = 3000;

export function computeRivalBudget(
  trainerTeam: TeamStats,
  rankPoints: number,
): number {
  const trainerStatSum =
    trainerTeam.atk + trainerTeam.luck + trainerTeam.hp + trainerTeam.def;
  const mult = Math.min(
    RIVAL_BUDGET_CAP,
    RIVAL_BUDGET_FLOOR + rankPoints / RIVAL_BUDGET_GROWTH_DIVISOR,
  );
  return trainerStatSum * mult;
}

// Builds the individually-tracked fighters for the trainer's side, with line
// modifiers already baked in (ROADMAP.md §3/§4.5). Replaces the old
// team-wide HP pool with one HP total per gladiator.
export function computeCombatUnits(
  sentGladiators: {
    id: string;
    name: string;
    stats: GladiatorStats;
    line: Line;
  }[],
): CombatUnit[] {
  return sentGladiators.map(({ id, name, stats, line }) => {
    const mod = applyLineModifiers(stats, line);
    return {
      id,
      name,
      line,
      atk: mod.atk,
      luck: mod.luck,
      def: mod.def,
      initialHp: mod.hpCurrent,
      hpCurrent: mod.hpCurrent,
    };
  });
}

// Splits the rival budget across `count` individual rival gladiators, each
// getting its own random share of the budget spread randomly over its 4
// stats, and alternating DPS/Tank like a real roster.
//
// Weights are `RIVAL_STAT_WEIGHT_BASELINE + Math.random()` rather than a
// bare Math.random(): pure Math.random() weights let a unit's share collapse
// toward 0 on some stats, which regularly produced degenerate rivals (an
// all-DEF/HP "tank" with near-zero ATK/LUCK, or the reverse glass cannon).
// Because computeEffectiveDamage has no diminishing returns on DEF, those
// tanks were effectively unkillable and won fights on the MAX_ROUNDS HP
// tie-break alone. The baseline keeps every stat/unit share within a
// bounded range of the even split while still leaving room for variety.
export const RIVAL_STAT_WEIGHT_BASELINE = 1.5;

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
    const statWeights = [
      RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
      RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
      RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
      RIVAL_STAT_WEIGHT_BASELINE + Math.random(),
    ];
    const statSum = statWeights.reduce((a, b) => a + b, 0);
    const [atk, luck, hp, def] = statWeights.map(
      (w) => (w / statSum) * unitBudget,
    );
    return {
      id: `rival-${i}`,
      name: `Rival Gladiator ${i + 1}`,
      line: i % 2 === 0 ? "dps" : "tank",
      atk,
      luck,
      def,
      initialHp: hp,
      hpCurrent: hp,
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
  const rivalStatSum = rival.reduce(
    (sum, u) => sum + u.atk + u.luck + u.def + u.initialHp,
    0,
  );

  let turn = 0;

  const attack = (
    side: "trainer" | "rival",
    attacker: CombatUnit,
    defenders: CombatUnit[],
  ) => {
    const target = pickTarget(defenders);
    if (!target) return;
    turn++;

    const dodged = Math.random() < computeDodgeChance(target.luck);
    let damage = 0;
    let crit = false;
    if (!dodged) {
      crit = Math.random() < computeCritChance(attacker.luck);
      damage = computeEffectiveDamage(
        attacker.atk,
        rollLuck(attacker.luck),
        target.def,
        rollLuck(target.luck),
      );
      if (crit) damage *= CRIT_MULTIPLIER;
      target.hpCurrent = Math.max(0, target.hpCurrent - damage);
    }

    log.push({
      turn,
      attacker: side,
      attackerName: attacker.name,
      targetName: target.name,
      damage,
      targetHpAfter: target.hpCurrent,
      crit,
      dodged,
      targetDefeated: target.hpCurrent <= 0,
    });
  };

  const alive = (units: CombatUnit[]) => units.some((u) => u.hpCurrent > 0);
  // Each round, every living gladiator attacks once, initiative side first.
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

  const MAX_ROUNDS = 10;

  let round = 0;
  while (alive(trainer) && alive(rival) && round < MAX_ROUNDS) {
    round++;
    for (const [side, attackers, defenders] of sides) {
      for (const attacker of attackers) {
        if (attacker.hpCurrent <= 0) continue;
        if (!alive(defenders)) break;
        attack(side, attacker, defenders);
      }
    }
  }

  const sumHp = (units: CombatUnit[]) =>
    units.reduce((sum, u) => sum + u.hpCurrent, 0);

  let victory: boolean;
  if (!alive(rival)) {
    victory = alive(trainer);
  } else if (!alive(trainer)) {
    victory = false;
  } else {
    // Round limit reached with both sides still standing.
    victory = sumHp(trainer) > sumHp(rival);
  }

  return {
    victory,
    log,
    trainerUnits: trainer.map((u) => ({
      id: u.id,
      initialHp: u.initialHp,
      hpCurrent: u.hpCurrent,
    })),
    rankPointsGained: victory ? Math.round(10 + rivalStatSum / 50) : 0,
    goldGained: victory ? VICTORY_GOLD_REWARD : 0,
  };
}
// ====== §6 Buildings & economy ======

// Fan donation: Resources/Day = Base * (1 + Level * 0.5)
export const FAN_DONATION_BASE_GOLD_PER_DAY = 100;
export function fanDonationGoldPerDay(level: number): number {
  return FAN_DONATION_BASE_GOLD_PER_DAY * (1 + level * 0.5);
}

export function fanDonationGoldSinceLastCollection(
  level: number,
  lastCollected: Timestamp,
): number {
  const elapsedMs = Date.now() - lastCollected.toMillis();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return Math.floor(fanDonationGoldPerDay(level) * elapsedDays);
}

// Fan donation also rolls, at most once every 24h, for a Luck Boost the
// trainer can hand to any one gladiator. The roll itself (not just its
// value) is gated by level: chance grows from 15% at level 1 by +5%/level,
// capped at 100%. The boost's magnitude stays flat (+1 Luck) regardless of
// level - only the odds of getting one improve.
export const LUCK_BOOST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const LUCK_BOOST_VALUE = 1;

export function luckBoostChance(level: number): number {
  return Math.min(1, 0.1 + level * 0.05);
}

export function luckBoostCooldownRemainingMs(
  lastRolledAt: Timestamp | undefined,
  now: number = Date.now(),
): number {
  if (!lastRolledAt) return 0;
  const elapsed = now - lastRolledAt.toMillis();
  return Math.max(0, LUCK_BOOST_COOLDOWN_MS - elapsed);
}

export function rollLuckBoost(level: number): boolean {
  return Math.random() < luckBoostChance(level);
}

export function applyLuckBoost(stats: GladiatorStats): GladiatorStats {
  return { ...stats, luck: Math.min(STAT_MAX, stats.luck + LUCK_BOOST_VALUE) };
}

// Barracks: Storage capacity = floor(6 * 1.35^(Level-1))
export function barracksCapacity(level: number): number {
  return Math.floor(6 * Math.pow(1.35, level - 1));
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

// Only Attack and Defense can be trained at the Training Program.
export type TrainingProgramTrainableStat = "atk" | "def";

export function applyTrainingProgramUpgrade(
  stats: GladiatorStats,
  statKey: TrainingProgramTrainableStat,
  trainingProgramLevel: number,
): GladiatorStats {
  const bonus = trainingProgramBonusPercent(trainingProgramLevel);
  const boosted = { ...stats };
  const current = boosted[statKey];
  boosted[statKey] = Math.min(STAT_MAX, current * (1 + bonus / 100));
  return boosted;
}

// Infirmary: Heal/Hour = Max HP * (0.10 + Level * 0.05)
export function infirmaryHealPerHour(level: number): number {
  return 0.1 + level * 0.05;
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
  hours: number,
): GladiatorStats {
  const healRatio = infirmaryHealPerHour(level) * hours;
  const hpCurrent = Math.min(
    stats.hpMax,
    stats.hpCurrent + stats.hpMax * healRatio,
  );
  return { ...stats, hpCurrent };
}

// Market: daily trades unlocked scale with level.
export function marketDailyTrades(level: number): number {
  return 3 + level * 2;
}

// Generic building upgrade cost, shared across all 5 buildings.
// Placeholder curve - tune during Phase 6 balancing (ROADMAP.md Phase 6).
export function buildingUpgradeCost(level: number): number {
  return 100 * level * level;
}

// ====== Gladiator experience & value ======

// Veteran gladiators grow stronger with every fight survived: a small
// permanent bump to Attack/Defense/Luck on top of whatever Training Program
// upgrades already gave them, applied the same multiplicative way as
// applyTrainingProgramUpgrade. A gladiator that dies is removed from the
// roster (Arena.vue), so this only ever rewards survivors.
export const EXPERIENCE_BONUS_PER_FIGHT_PERCENT = 1;

export function applyExperienceGain(stats: GladiatorStats): GladiatorStats {
  const mult = 1 + EXPERIENCE_BONUS_PER_FIGHT_PERCENT / 100;
  return {
    ...stats,
    atk: Math.min(STAT_MAX, stats.atk * mult),
    def: Math.min(STAT_MAX, stats.def * mult),
    luck: Math.min(STAT_MAX, stats.luck * mult),
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
export const SELL_VALUE_PER_BATTLE_FOUGHT_GOLD = 2;

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
// Base stat distribution for a newly recruited gladiator is an open point
// (ROADMAP.md §9) - uniform range is used as a placeholder.
export function generateRandomGladiatorStats(): GladiatorStats {
  const m = 20;
  const hp = 20 + uniformRandInt(m);
  return {
    atk: 20 + uniformRandInt(m),
    def: 20 + uniformRandInt(m),
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
  return {
    id: `${Date.now()}-${gladiatorIdCounter}-${uniformRandInt(1000)}`,
    name,
    stats: generateRandomGladiatorStats(),
    injured: false,
    battlesFought: 0,
  };
}

// Send 4 gladiators at random from the trainer's whole camp into combat -
// there is no separate "active roster" to curate, every recruited gladiator
// is eligible.
export function sendGladiatorsToCombat(
  gladiators: Record<string, Gladiator>,
): Gladiator[] {
  return pickRandom(Object.values(gladiators), GLADIATORS_PER_BATTLE);
}

// ====== Starting data ======

export const startBuildings: Buildings = {
  fanDonation: {
    level: 1,
    lastCollected: Timestamp.now(),
    luckBoostAvailable: false,
  },
  barracks: { level: 1 },
  trainingProgram: { level: 1 },
  infirmary: { level: 1 },
  market: { level: 1, dailyTradesLeft: marketDailyTrades(1) },
};

export const startProfile: Profile = {
  username: `Trainer${uniformRandInt(1000) + 1}`,
  rankPoints: 0,
  gold: 200,
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
