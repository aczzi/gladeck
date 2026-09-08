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
  CombatResult,
  CombatLogEntry,
} from "@/core/game/types";

// ====== Constants ======
export const BASE_SLOTS = 6;
export const SLOTS_PER_LEVEL = 2;
export const GLADIATORS_PER_BATTLE = 4;
export const STAT_MIN = 0;
export const STAT_MAX = 100;

// ====== §2 Trainer progression ======

// Slots Max = 6 + (Level - 1) * 2
export function getMaxSlots(level: number): number {
  return BASE_SLOTS + (level - 1) * SLOTS_PER_LEVEL;
}

// Level-up threshold - open point in ROADMAP.md, tune during Phase 6 balancing.
export const RANK_POINTS_PER_LEVEL = 100;
export function computeLevelForRankPoints(rankPoints: number): number {
  return 1 + Math.floor(rankPoints / RANK_POINTS_PER_LEVEL);
}

// ====== §3 Roster & placement ======

// Frontline boosts ATK/LUCK by 10%, penalizes HP/DEF by 10%.
// Backline does the opposite.
export function applyLineModifiers(
  stats: GladiatorStats,
  line: Line,
): GladiatorStats {
  const atkLuckMult = line === "frontline" ? 1.1 : 0.9;
  const hpDefMult = line === "frontline" ? 0.9 : 1.1;
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

// Rival Budget = (Sum of Trainer Stats) * (0.85 + RankPoints / 1000)
export function computeRivalBudget(
  trainerTeam: TeamStats,
  rankPoints: number,
): number {
  const trainerStatSum =
    trainerTeam.atk + trainerTeam.luck + trainerTeam.hp + trainerTeam.def;
  return trainerStatSum * (0.85 + rankPoints / 1000);
}

// Randomly distributes the rival budget across the 4 stats.
export function distributeRivalBudget(budget: number): TeamStats {
  const weights = [Math.random(), Math.random(), Math.random(), Math.random()];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const [atk, luck, hp, def] = weights.map((w) => (w / weightSum) * budget);
  return { atk, luck, hp, def };
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

// ====== §4.4 Damage calculation (anti-negative floor) ======

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

// ====== §4.5 Turn resolution ======

// Flat gold reward for winning a fight, on top of the wager won back.
export const VICTORY_GOLD_REWARD = 50;

export function resolveCombat(
  trainerTeam: TeamStats,
  rivalTeam: TeamStats,
): CombatResult {
  const trainerInitialHp = trainerTeam.hp;
  let trainerHp = trainerTeam.hp;
  let rivalHp = rivalTeam.hp;
  const log: CombatLogEntry[] = [];

  const firstAttacker = determineInitiative(trainerTeam.luck, rivalTeam.luck);
  let turn = 0;

  const trainerAttacks = () => {
    const damage = computeEffectiveDamage(
      trainerTeam.atk,
      rollLuck(trainerTeam.luck),
      rivalTeam.def,
      rollLuck(rivalTeam.luck),
    );
    rivalHp = Math.max(0, rivalHp - damage);
    log.push({ turn, attacker: "trainer", damage, targetHpAfter: rivalHp });
  };

  const rivalAttacks = () => {
    const damage = computeEffectiveDamage(
      rivalTeam.atk,
      rollLuck(rivalTeam.luck),
      trainerTeam.def,
      rollLuck(trainerTeam.luck),
    );
    trainerHp = Math.max(0, trainerHp - damage);
    log.push({ turn, attacker: "rival", damage, targetHpAfter: trainerHp });
  };

  // Safety cap to guarantee termination even in degenerate stat configurations.
  const MAX_TURNS = 500;
  while (trainerHp > 0 && rivalHp > 0 && turn < MAX_TURNS) {
    turn++;
    if (firstAttacker === "trainer") {
      if (trainerHp > 0) trainerAttacks();
      if (rivalHp > 0) rivalAttacks();
    } else {
      if (rivalHp > 0) rivalAttacks();
      if (trainerHp > 0) trainerAttacks();
    }
  }

  const victory = rivalHp <= 0 && trainerHp > 0;
  const rivalStatSum =
    rivalTeam.atk + rivalTeam.luck + rivalTeam.hp + rivalTeam.def;

  return {
    victory,
    log,
    trainerFinalHp: trainerHp,
    trainerInitialHp,
    rivalTeam,
    rankPointsGained: victory ? Math.round(10 + rivalStatSum / 50) : 0,
    goldGained: victory ? VICTORY_GOLD_REWARD : 0,
  };
}

// ====== §5 Post-combat resolution ======

// Attrition ratio: R = Team Final HP / Team Initial HP, applied to each
// surviving gladiator's current HP.
export function computeAttritionRatio(
  finalHp: number,
  initialHp: number,
): number {
  if (initialHp <= 0) return 0;
  return Math.max(0, Math.min(1, finalHp / initialHp));
}

export function applyAttrition(
  stats: GladiatorStats,
  ratio: number,
): GladiatorStats {
  const hpCurrent = stats.hpMax * ratio;
  return {
    ...stats,
    hpCurrent,
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

// Barracks: Storage capacity = floor(6 * 1.35^(Level-1))
export function barracksCapacity(level: number): number {
  return Math.floor(6 * Math.pow(1.35, level - 1));
}

// School: bonus % scales with level.
export function schoolBonusPercent(level: number): number {
  return 5 + level * 2; // e.g. level 1 -> +7%, level 5 -> +15%
}

// A given gladiator can only be upgraded at the school once every 24h.
export const SCHOOL_UPGRADE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function schoolUpgradeCooldownRemainingMs(
  lastUpgradeAt: Timestamp | undefined,
  now: number = Date.now(),
): number {
  if (!lastUpgradeAt) return 0;
  const elapsed = now - lastUpgradeAt.toMillis();
  return Math.max(0, SCHOOL_UPGRADE_COOLDOWN_MS - elapsed);
}

// Only Attack and Defense can be trained at the school.
export type SchoolTrainableStat = "atk" | "def";

export function applySchoolUpgrade(
  stats: GladiatorStats,
  statKey: SchoolTrainableStat,
  schoolLevel: number,
): GladiatorStats {
  const bonus = schoolBonusPercent(schoolLevel);
  const boosted = { ...stats };
  const current = boosted[statKey];
  boosted[statKey] = Math.min(STAT_MAX, current * (1 + bonus / 100));
  return boosted;
}

// Infirmary: Heal/Hour = Max HP * (0.10 + Level * 0.05)
export function infirmaryHealPerHour(level: number): number {
  return 0.1 + level * 0.05;
}

// A gladiator can only be healed once every 30 minutes.
export const INFIRMARY_HEAL_COOLDOWN_MS = 30 * 60 * 1000;

// Gold cost of a single heal action.
export const INFIRMARY_HEAL_COST = 20;

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

// ====== Gladiator generation ======
// Base stat distribution for a newly recruited gladiator is an open point
// (ROADMAP.md §9) - uniform range is used as a placeholder.
export function generateRandomGladiatorStats(): GladiatorStats {
  const hp = 20 + uniformRandInt(41); // 20-60
  return {
    atk: 20 + uniformRandInt(41),
    def: 20 + uniformRandInt(41),
    luck: 20 + uniformRandInt(41),
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
    inDeck: false,
    injured: false,
  };
}

// Send 4 gladiators at random from the trainer's active roster into combat.
export function sendGladiatorsToCombat(
  gladiators: Record<string, Gladiator>,
): Gladiator[] {
  const rosterGladiators = Object.values(gladiators).filter(
    (gladiator) => gladiator.inDeck,
  );
  return pickRandom(rosterGladiators, GLADIATORS_PER_BATTLE);
}

// ====== Starting data ======

export const startBuildings: Buildings = {
  fanDonation: { level: 1, lastCollected: Timestamp.now() },
  barracks: { level: 1 },
  school: { level: 1 },
  infirmary: { level: 1 },
  market: { level: 1, dailyTradesLeft: marketDailyTrades(1) },
};

export const startProfile: Profile = {
  username: `Trainer${uniformRandInt(1000) + 1}`,
  level: 1,
  rankPoints: 0,
  gold: 200,
  maxSlots: getMaxSlots(1),
};

function buildStartGladiators(): Record<string, Gladiator> {
  const gladiators: Record<string, Gladiator> = {};
  for (let i = 0; i < 4; i++) {
    const gladiator = createGladiator();
    gladiator.inDeck = true;
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
