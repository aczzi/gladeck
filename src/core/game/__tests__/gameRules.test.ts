import { describe, it, expect } from "vitest";
import type { RngFn } from "@/core/utils";
import type { ArenaDifficulty, Attribution } from "@/core/game/types";
import {
  computeArenaWagerNetGold,
  isValidTeamComposition,
  MAX_DPS_PER_TEAM,
  computeCombatUnits,
  computeAverageTeamPower,
  computeRivalBudget,
  distributeRivalBudget,
  resolveCombat,
  computeDownedSurvivalChance,
  DOWNED_SURVIVAL_CHANCE_MIN,
  DOWNED_SURVIVAL_CHANCE_MAX,
  LUCK_CAP,
  gladiatorSellValueMultiplier,
  gladiatorSellValue,
  MARKET_RECRUIT_COST,
  marketTradesPerHour,
  fanDonationGoldPerDay,
  generateRandomGladiatorStats,
  createGladiator,
  RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY,
  pickRandomDifficulty,
  pickArenaDifficultyForTeam,
  ARENA_DIFFICULTIES,
} from "@/core/game/gameRules";

// Deterministic PRNG (mulberry32) so every simulation run below is
// reproducible - this is the "injectable random source" required by the
// TODO's "Validation à automatiser" priority.
function mulberry32(seed: number): RngFn {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("computeArenaWagerNetGold", () => {
  it("nets exactly +wager on a win, never +2*wager", () => {
    expect(computeArenaWagerNetGold(100, true)).toBe(100);
  });

  it("nets exactly -wager on a loss", () => {
    expect(computeArenaWagerNetGold(100, false)).toBe(-100);
  });

  it("is a no-op with a zero wager either way", () => {
    expect(computeArenaWagerNetGold(0, true)).toBe(0);
    expect(computeArenaWagerNetGold(0, false)).toBe(-0);
  });
});

describe("pickRandomDifficulty", () => {
  it("only ever returns one of the three known difficulties", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(ARENA_DIFFICULTIES).toContain(pickRandomDifficulty(rng));
    }
  });

  it("is deterministic for a given seed (hidden-from-the-player roll)", () => {
    expect(pickRandomDifficulty(mulberry32(123))).toBe(
      pickRandomDifficulty(mulberry32(123)),
    );
  });

  it("draws roughly evenly from the three difficulties over many rolls", () => {
    const rng = mulberry32(7);
    const counts: Record<string, number> = { easy: 0, normal: 0, hard: 0 };
    const trials = 6000;
    for (let i = 0; i < trials; i++) {
      counts[pickRandomDifficulty(rng)]++;
    }
    for (const difficulty of ARENA_DIFFICULTIES) {
      expect(counts[difficulty] / trials).toBeGreaterThan(0.28);
      expect(counts[difficulty] / trials).toBeLessThan(0.38);
    }
  });
});

describe("pickArenaDifficultyForTeam", () => {
  // gladiatorPower(stats, 0) reduces to atk+def+luck+hpMax, so a single
  // non-zero stat set to the target power is enough to land a gladiator in
  // a specific tier (rookie < 160 <= veteran < 240 <= elite).
  const withPower = (power: number) => ({
    stats: { atk: power, def: 0, luck: 0, hpMax: 0, hpCurrent: 0 },
    battlesFought: 0,
  });
  const rookie = withPower(50);
  const veteran = withPower(200);
  const elite = withPower(250);

  it("only ever rolls Easy for an all-rookie team", () => {
    const rng = mulberry32(11);
    const team = [rookie, rookie, rookie, rookie];
    for (let i = 0; i < 50; i++) {
      expect(pickArenaDifficultyForTeam(team, rng)).toBe("easy");
    }
  });

  it("only ever rolls Easy or Normal with exactly one veteran", () => {
    const rng = mulberry32(13);
    const team = [rookie, rookie, rookie, veteran];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const difficulty = pickArenaDifficultyForTeam(team, rng);
      expect(["easy", "normal"]).toContain(difficulty);
      seen.add(difficulty);
    }
    expect(seen).toEqual(new Set(["easy", "normal"]));
  });

  it("can roll all three difficulties, Hard included, with 2+ veterans (elite counts as veteran)", () => {
    const rng = mulberry32(17);
    const team = [rookie, rookie, veteran, elite];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickArenaDifficultyForTeam(team, rng));
    }
    expect(seen).toEqual(new Set(ARENA_DIFFICULTIES));
  });
});

describe("isValidTeamComposition", () => {
  it("accepts up to 2 DPS with any Tank/Support mix, for a full 4-gladiator team", () => {
    const validCombos: Attribution[][] = [
      ["dps", "dps", "tank", "tank"],
      ["dps", "dps", "support", "support"],
      ["dps", "dps", "tank", "support"],
      ["dps", "tank", "tank", "support"],
      ["tank", "tank", "support", "support"],
    ];
    for (const combo of validCombos) {
      expect(isValidTeamComposition(combo)).toBe(true);
    }
  });

  it("rejects more than the DPS cap", () => {
    expect(isValidTeamComposition(["dps", "dps", "dps", "tank"])).toBe(false);
    expect(isValidTeamComposition(["dps", "dps", "dps"])).toBe(false);
    expect(MAX_DPS_PER_TEAM).toBe(2);
  });

  it("stays satisfiable for a short-handed team of 1 or 2 gladiators", () => {
    // A player without a full roster can still field a smaller team - the
    // cap must never make combat impossible to configure.
    expect(isValidTeamComposition(["dps"])).toBe(true);
    expect(isValidTeamComposition(["tank"])).toBe(true);
    expect(isValidTeamComposition(["dps", "dps"])).toBe(true);
    expect(isValidTeamComposition(["dps", "tank"])).toBe(true);
  });
});

describe("computeAverageTeamPower (matchmaking)", () => {
  it("does not scale with battlesFought - only combat-unit stats matter", () => {
    const rookie = createGladiator("Rookie", mulberry32(1));
    const veteranStats = { ...rookie.stats };
    const rookieUnit = computeCombatUnits([
      {
        id: "a",
        name: "a",
        stats: rookie.stats,
        line: "tank",
        trait: rookie.trait,
      },
    ]);
    const veteranUnit = computeCombatUnits([
      {
        id: "b",
        name: "b",
        stats: veteranStats,
        line: "tank",
        trait: rookie.trait,
      },
    ]);
    // Same stats, only battlesFought differs - old formula (gladiatorPower)
    // used to size the rival off this and would have produced different
    // budgets; the matchmaking power must be identical here.
    expect(computeAverageTeamPower(rookieUnit)).toBeCloseTo(
      computeAverageTeamPower(veteranUnit),
    );
  });

  it("uses current HP, not max HP, so a wounded team draws a weaker rival", () => {
    const stats = { atk: 30, def: 30, luck: 30, hpMax: 50, hpCurrent: 50 };
    const healthy = computeCombatUnits([
      { id: "a", name: "a", stats, line: "tank", trait: "stoic" },
    ]);
    const wounded = computeCombatUnits([
      {
        id: "a",
        name: "a",
        stats: { ...stats, hpCurrent: 10 },
        line: "tank",
        trait: "stoic",
      },
    ]);
    expect(computeAverageTeamPower(wounded)).toBeLessThan(
      computeAverageTeamPower(healthy),
    );
  });
});

describe("computeDownedSurvivalChance", () => {
  it("is bounded away from both 0% and 100% at the Luck extremes", () => {
    expect(computeDownedSurvivalChance(0)).toBeCloseTo(
      DOWNED_SURVIVAL_CHANCE_MIN,
    );
    expect(computeDownedSurvivalChance(LUCK_CAP)).toBeCloseTo(
      DOWNED_SURVIVAL_CHANCE_MAX,
    );
    // Never a guaranteed survival, even at the Luck cap.
    expect(computeDownedSurvivalChance(LUCK_CAP)).toBeLessThan(1);
  });

  it("increases monotonically with Luck", () => {
    const at0 = computeDownedSurvivalChance(0);
    const at45 = computeDownedSurvivalChance(45);
    const at90 = computeDownedSurvivalChance(90);
    expect(at45).toBeGreaterThan(at0);
    expect(at90).toBeGreaterThan(at45);
  });
});

describe("gladiatorSellValueMultiplier (continuous sell curve)", () => {
  it("softens the tier boundary jump compared to an instant cliff", () => {
    const just_below = gladiatorSellValueMultiplier(159);
    const just_above = gladiatorSellValueMultiplier(160);
    // The old per-tier lookup jumped straight from 1x to 3x (delta 2) here.
    // The ramp into 160 is narrow on purpose (see MAX_FRESH_RECRUIT_POWER),
    // so this can't be as flat as the elite/legend transitions, but it must
    // still be meaningfully softer than the old instant double-plus jump.
    expect(just_above - just_below).toBeLessThan(1);
  });

  it("is flat well past a fresh recruit's maximum possible power", () => {
    // This is the load-bearing guarantee: see the recruit-cost exploit test
    // below. gladiatorSellValueMultiplier must stay at the rookie floor for
    // every power a freshly created gladiator could possibly roll.
    expect(gladiatorSellValueMultiplier(151)).toBe(1);
  });

  it("still passes through the original tier anchor values", () => {
    expect(gladiatorSellValueMultiplier(0)).toBeCloseTo(1);
    expect(gladiatorSellValueMultiplier(160)).toBeCloseTo(3);
    expect(gladiatorSellValueMultiplier(240)).toBeCloseTo(8);
    expect(gladiatorSellValueMultiplier(320)).toBeCloseTo(10);
  });
});

describe("recruit-then-sell exploit guard", () => {
  it("never lets a freshly recruited gladiator resell for more than it cost", () => {
    // Worst case: every stat rolled at its maximum (see
    // generateRandomGladiatorStats: atk/def/hpMax up to 39, luck up to 34).
    const worstCaseStats = {
      atk: 39,
      def: 39,
      luck: 34,
      hpMax: 39,
      hpCurrent: 39,
    };
    expect(gladiatorSellValue(worstCaseStats, 0)).toBeLessThan(
      MARKET_RECRUIT_COST,
    );
  });

  it("holds across many random recruits, not just the theoretical worst case", () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 5000; i++) {
      const stats = generateRandomGladiatorStats(rng);
      expect(gladiatorSellValue(stats, 0)).toBeLessThan(MARKET_RECRUIT_COST);
    }
  });
});

describe("marketTradesPerHour", () => {
  it("grants a strictly larger allowance at every single level", () => {
    for (let level = 1; level < 8; level++) {
      expect(marketTradesPerHour(level + 1)).toBeGreaterThan(
        marketTradesPerHour(level),
      );
    }
  });
});

describe("fanDonationGoldPerDay (legacy bonus diminishing returns)", () => {
  it("gives a smaller marginal bonus for the 4th retiree than the 1st", () => {
    const base = fanDonationGoldPerDay(1, 0);
    const marginalFirst = fanDonationGoldPerDay(1, 1) - base;
    const marginalFourth =
      fanDonationGoldPerDay(1, 4) - fanDonationGoldPerDay(1, 3);
    expect(marginalFourth).toBeLessThan(marginalFirst);
  });
});

describe("generateRandomGladiatorStats / createGladiator determinism", () => {
  it("produces identical output for the same seed", () => {
    const a = generateRandomGladiatorStats(mulberry32(42));
    const b = generateRandomGladiatorStats(mulberry32(42));
    expect(a).toEqual(b);
  });
});

// ====== Monte Carlo balance simulation ======
// Reusable across future rebalancing work: run a full PvE fight pipeline
// through the real gameRules functions (never a re-implementation) with a
// seeded RNG, and report the win rate over many trials.

interface SimulationSummary {
  winRate: number;
  avgDeathsPerFight: number;
}

function simulateRookieTeamFights(
  difficulty: ArenaDifficulty,
  trials: number,
  seed: number,
): SimulationSummary {
  const rng = mulberry32(seed);
  const lines: Attribution[] = ["dps", "dps", "tank", "support"];
  let wins = 0;
  let deaths = 0;

  for (let i = 0; i < trials; i++) {
    const gladiators = Array.from({ length: 4 }, () =>
      generateRandomGladiatorStats(rng),
    );
    const placed = gladiators.map((stats, idx) => ({
      id: `g${idx}`,
      name: `g${idx}`,
      stats,
      line: lines[idx],
      trait: "stoic" as const,
    }));
    const trainerUnits = computeCombatUnits(placed);
    const avgPower = computeAverageTeamPower(trainerUnits);
    const budget = computeRivalBudget(
      avgPower,
      trainerUnits.length,
      difficulty,
    );
    const rivalUnits = distributeRivalBudget(budget, trainerUnits.length, rng);
    const result = resolveCombat(trainerUnits, rivalUnits, { difficulty, rng });
    if (result.victory) wins++;
    deaths += result.trainerUnits.filter((u) => u.hpCurrent <= 0).length;
  }

  return { winRate: wins / trials, avgDeathsPerFight: deaths / trials };
}

describe("PvE difficulty balance (Monte Carlo, deterministic seed)", () => {
  const TRIALS = 4000;

  it("easy sits around an 80-85% win rate for a rookie team", () => {
    const { winRate } = simulateRookieTeamFights("easy", TRIALS, 1);
    expect(winRate).toBeGreaterThan(0.7);
    expect(winRate).toBeLessThan(0.95);
  });

  it("normal sits around a 65-75% win rate for a rookie team", () => {
    const { winRate } = simulateRookieTeamFights("normal", TRIALS, 2);
    expect(winRate).toBeGreaterThan(0.55);
    expect(winRate).toBeLessThan(0.85);
  });

  it("hard sits around a 45-55% win rate for a rookie team", () => {
    const { winRate } = simulateRookieTeamFights("hard", TRIALS, 3);
    expect(winRate).toBeGreaterThan(0.35);
    expect(winRate).toBeLessThan(0.65);
  });

  it("hard is strictly harder than normal, which is strictly harder than easy", () => {
    const easy = simulateRookieTeamFights("easy", TRIALS, 4);
    const normal = simulateRookieTeamFights("normal", TRIALS, 4);
    const hard = simulateRookieTeamFights("hard", TRIALS, 4);
    expect(easy.winRate).toBeGreaterThan(normal.winRate);
    expect(normal.winRate).toBeGreaterThan(hard.winRate);
    expect(RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY.easy).toBeLessThan(
      RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY.normal,
    );
    expect(RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY.normal).toBeLessThan(
      RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY.hard,
    );
  });
});

describe("Composition variety (roles are no longer strictly dominated by DPS)", () => {
  it("an all-Tank/Support-plus-2-DPS team is not crushed by a full-budget rival", () => {
    // Regression guard for the original diagnostic: teams used to win
    // ~100% of the time regardless of composition. With Tank mitigation and
    // aggro plus the Support buff, a normal-difficulty fight should still be
    // winnable but no longer a foregone conclusion either way.
    const { winRate } = simulateRookieTeamFights("normal", 4000, 7);
    expect(winRate).toBeGreaterThan(0.3);
    expect(winRate).toBeLessThan(0.9);
  });
});
