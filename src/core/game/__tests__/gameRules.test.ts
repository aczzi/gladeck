import { describe, it, expect } from "vitest";
import type { RngFn } from "@/core/utils";
import type {
  ArenaDifficulty,
  Attribution,
  GladiatorTrait,
} from "@/core/game/types";
import {
  computeActiveDuoSynergies,
  tagMatchesSlot,
  DUO_SYNERGIES,
} from "@/core/game/synergies";
import { TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT } from "@/core/game/traits";
import {
  computeArenaWagerNetGold,
  isValidTeamComposition,
  computeCombatUnits,
  computeAverageTeamPower,
  computeRivalBudget,
  distributeRivalBudget,
  resolveCombat,
  computeDownedSurvivalChance,
  gladiatorSellValueMultiplier,
  gladiatorSellValue,
  marketTradesPerHour,
  fanDonationGoldPerDay,
  generateRandomGladiatorStats,
  createGladiator,
  RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY,
  pickRandomDifficulty,
  pickArenaDifficultyForTeam,
  ARENA_DIFFICULTIES,
  trainingProgramUpgradeGoldCost,
} from "@/core/game/gameRules";

import {
  DOWNED_SURVIVAL_CHANCE_MIN,
  DOWNED_SURVIVAL_CHANCE_MAX,
  TRAINING_PROGRAM_UPGRADE_GOLD_COST,
  LUCK_CAP,
  MARKET_RECRUIT_COST,
  COMBAT_HP_FLOOR,
  MAX_DPS_PER_TEAM,
  DUO_BODYGUARD_ATK_BONUS_PERCENT, // "Bodyguard"
  DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT, // "Lucky Aegis"
  DUO_TWIN_FRENZY_ATK_BONUS_PERCENT, // "Twin Frenzy"
  DUO_RAMPART_DEF_BONUS_PERCENT, // "Shield Wall"
  DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT, // "Rowdy Crowd"
  DUO_RECKLESS_DUO_ATK_BONUS_PERCENT, // "Reckless Duo"
  DUO_GLASS_CANNON_LUCK_BONUS_PERCENT, // "Glass Cannon"
} from "@/core/game/constantes";

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
        attribution: "tank",
        trait: rookie.trait,
      },
    ]);
    const veteranUnit = computeCombatUnits([
      {
        id: "b",
        name: "b",
        stats: veteranStats,
        attribution: "tank",
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
      { id: "a", name: "a", stats, attribution: "tank", trait: "stoic" },
    ]);
    const wounded = computeCombatUnits([
      {
        id: "a",
        name: "a",
        stats: { ...stats, hpCurrent: 10 },
        attribution: "tank",
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

describe("resolveCombat - permadeath is Hard-only and veteran-only", () => {
  // 0 Luck pins dodge chance at exactly 0 (computeDodgeChance), so the weak
  // side is guaranteed to get hit and knocked down rather than occasionally
  // dodging its way through all MAX_COMBAT_ROUNDS - the overwhelming stat
  // gap then guarantees a loss, never a mutual near-miss.
  //
  // gladiatorPower(stats, 0) = atk + def + luck + hpMax (rookie < 160 <=
  // veteran), so hpMax alone is enough to flip tier without changing how
  // fast either one folds against `strong` below.
  const rookieWeak = {
    id: "rookie-weak",
    name: "rookie-weak",
    stats: { atk: 1, def: 1, luck: 0, hpMax: 5, hpCurrent: 5 },
    attribution: "dps" as const,
    trait: "brute" as const,
  };
  const veteranWeak = {
    id: "veteran-weak",
    name: "veteran-weak",
    stats: { atk: 1, def: 1, luck: 0, hpMax: 170, hpCurrent: 170 },
    attribution: "dps" as const,
    trait: "brute" as const,
  };
  const strong = {
    id: "strong",
    name: "strong",
    stats: { atk: 200, def: 50, luck: 0, hpMax: 500, hpCurrent: 500 },
    attribution: "dps" as const,
    trait: "brute" as const,
  };

  it("never lets a knocked-down gladiator die on Easy or Normal, veteran or not", () => {
    for (const difficulty of ["easy", "normal"] as const) {
      for (const weak of [rookieWeak, veteranWeak]) {
        const rng = mulberry32(99);
        for (let i = 0; i < 100; i++) {
          const result = resolveCombat(
            computeCombatUnits([weak]),
            computeCombatUnits([strong]),
            { difficulty, rng },
          );
          expect(result.victory).toBe(false);
          expect(result.trainerUnits[0].hpCurrent).toBe(COMBAT_HP_FLOOR);
        }
      }
    }
  });

  it("never lets a rookie die, even on Hard", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const result = resolveCombat(
        computeCombatUnits([rookieWeak]),
        computeCombatUnits([strong]),
        { difficulty: "hard", rng },
      );
      expect(result.trainerUnits[0].hpCurrent).toBe(COMBAT_HP_FLOOR);
    }
  });

  it("can let a knocked-down veteran die on Hard", () => {
    const rng = mulberry32(99);
    const outcomes = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const result = resolveCombat(
        computeCombatUnits([veteranWeak]),
        computeCombatUnits([strong]),
        { difficulty: "hard", rng },
      );
      outcomes.add(result.trainerUnits[0].hpCurrent);
    }
    expect(outcomes).toEqual(new Set([0, COMBAT_HP_FLOOR]));
  });
});

describe("computeActiveDuoSynergies (ROADMAP.md Axe B)", () => {
  const tag = (trait: GladiatorTrait, attribution: Attribution) => ({
    trait,
    attribution,
  });

  it("detects Bodyguard only with a Stoic Tank and a Bloodthirsty DPS", () => {
    const active = computeActiveDuoSynergies([
      tag("stoic", "tank"),
      tag("bloodthirsty", "dps"),
    ]);
    expect(active.map((s) => s.id)).toContain("bodyguard");
  });

  it("does not detect Bodyguard if the roles don't match", () => {
    const active = computeActiveDuoSynergies([
      tag("stoic", "dps"),
      tag("bloodthirsty", "tank"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("bodyguard");
  });

  it("detects Lucky Aegis only with a Lucky Tank and a Lucky Support", () => {
    const active = computeActiveDuoSynergies([
      tag("lucky", "tank"),
      tag("lucky", "support"),
    ]);
    expect(active.map((s) => s.id)).toContain("lucky-aegis");
  });

  it("does not detect Lucky Aegis if the Tank isn't also Lucky", () => {
    const active = computeActiveDuoSynergies([
      tag("brute", "tank"),
      tag("lucky", "support"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("lucky-aegis");
  });

  it("detects Twin Frenzy only with two Bloodthirsty DPS", () => {
    const oneOnly = computeActiveDuoSynergies([
      tag("bloodthirsty", "dps"),
      tag("brute", "dps"),
    ]);
    expect(oneOnly.map((s) => s.id)).not.toContain("twin-frenzy");

    const two = computeActiveDuoSynergies([
      tag("bloodthirsty", "dps"),
      tag("bloodthirsty", "dps"),
    ]);
    expect(two.map((s) => s.id)).toContain("twin-frenzy");
  });

  it("detects Shield Wall only with a Brute Tank and a Brute Support", () => {
    const active = computeActiveDuoSynergies([
      tag("brute", "tank"),
      tag("brute", "support"),
    ]);
    expect(active.map((s) => s.id)).toContain("rampart");
  });

  it("does not detect Shield Wall if only one of the two is Brute", () => {
    const active = computeActiveDuoSynergies([
      tag("brute", "tank"),
      tag("stoic", "support"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("rampart");
  });

  it("detects Rowdy Crowd only with a Crowd Favorite Support and a Lucky DPS", () => {
    const active = computeActiveDuoSynergies([
      tag("crowdFavorite", "support"),
      tag("lucky", "dps"),
    ]);
    expect(active.map((s) => s.id)).toContain("crowd-lucky");
  });

  it("does not detect Rowdy Crowd if the roles are swapped", () => {
    const active = computeActiveDuoSynergies([
      tag("crowdFavorite", "dps"),
      tag("lucky", "support"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("crowd-lucky");
  });

  it("detects Reckless Duo only with an Incorrigible Support and a Brute Tank", () => {
    const active = computeActiveDuoSynergies([
      tag("incorrigible", "support"),
      tag("brute", "tank"),
    ]);
    expect(active.map((s) => s.id)).toContain("reckless-duo");
  });

  it("does not detect Reckless Duo if the Tank isn't Brute", () => {
    const active = computeActiveDuoSynergies([
      tag("incorrigible", "support"),
      tag("stoic", "tank"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("reckless-duo");
  });

  it("detects Glass Cannon only with a Crowd Favorite Tank and an Incorrigible DPS", () => {
    const active = computeActiveDuoSynergies([
      tag("crowdFavorite", "tank"),
      tag("incorrigible", "dps"),
    ]);
    expect(active.map((s) => s.id)).toContain("glass-cannon");
  });

  it("does not detect Glass Cannon if the roles are swapped", () => {
    const active = computeActiveDuoSynergies([
      tag("crowdFavorite", "dps"),
      tag("incorrigible", "tank"),
    ]);
    expect(active.map((s) => s.id)).not.toContain("glass-cannon");
  });

  it("stays empty for a team with none of the curated combos", () => {
    const active = computeActiveDuoSynergies([
      tag("brute", "dps"),
      tag("stoic", "dps"),
    ]);
    expect(active).toEqual([]);
  });

  it("gives every active synergy a non-empty, on-topic description", () => {
    // A badge is never just a name - readability regression guard (see
    // ROADMAP.md Axe B and DuoSynergyBadges.vue).
    const active = computeActiveDuoSynergies([
      tag("stoic", "tank"),
      tag("bloodthirsty", "dps"),
      tag("lucky", "tank"),
      tag("lucky", "support"),
    ]);
    expect(active.length).toBeGreaterThan(0);
    for (const synergy of active) {
      expect(synergy.description.length).toBeGreaterThan(0);
    }
    const bodyguard = active.find((s) => s.id === "bodyguard");
    expect(bodyguard?.description).toContain(
      `${DUO_BODYGUARD_ATK_BONUS_PERCENT}%`,
    );
    const luckyAegis = active.find((s) => s.id === "lucky-aegis");
    expect(luckyAegis?.description).toContain(
      `${DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT}%`,
    );
  });
});

describe("DUO_SYNERGIES catalog (illustration data)", () => {
  const tag = (trait: GladiatorTrait, attribution: Attribution) => ({
    trait,
    attribution,
  });

  it("has exactly 2 slots per synergy, matching computeActiveDuoSynergies' own ids", () => {
    const idsFromDetection = new Set(
      computeActiveDuoSynergies([
        tag("stoic", "tank"),
        tag("bloodthirsty", "dps"),
        tag("lucky", "support"),
        tag("crowdFavorite", "dps"),
      ]).map((s) => s.id),
    );
    for (const synergy of DUO_SYNERGIES) {
      expect(synergy.slots).toHaveLength(2);
    }
    // Every id this scenario activates via detection must also exist as a
    // catalog entry (single source of truth - no id drift between the two).
    const catalogIds = new Set(DUO_SYNERGIES.map((s) => s.id));
    for (const id of idsFromDetection) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });
});

describe("tagMatchesSlot", () => {
  const tag = (trait: GladiatorTrait, attribution: Attribution) => ({
    trait,
    attribution,
  });

  it("matches an exact (trait, role) slot only on both fields", () => {
    const slot = { trait: "stoic" as const, attribution: "tank" as const };
    expect(tagMatchesSlot(tag("stoic", "tank"), slot)).toBe(true);
    expect(tagMatchesSlot(tag("stoic", "dps"), slot)).toBe(false);
    expect(tagMatchesSlot(tag("bloodthirsty", "tank"), slot)).toBe(false);
  });
});

describe("computeCombatUnits applies duo synergy stat bonuses", () => {
  const stats = { atk: 50, def: 50, luck: 50, hpMax: 100, hpCurrent: 100 };

  it("boosts the Bloodthirsty DPS's ATK when paired with a Stoic Tank (Bodyguard)", () => {
    const withoutDuo = computeCombatUnits([
      {
        id: "dps",
        name: "dps",
        stats,
        attribution: "dps",
        trait: "bloodthirsty",
      },
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "brute" },
    ]);
    const withDuo = computeCombatUnits([
      {
        id: "dps",
        name: "dps",
        stats,
        attribution: "dps",
        trait: "bloodthirsty",
      },
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "stoic" },
    ]);
    const dpsWithout = withoutDuo.find((u) => u.id === "dps")!;
    const dpsWith = withDuo.find((u) => u.id === "dps")!;
    expect(dpsWith.atk).toBeCloseTo(
      dpsWithout.atk * (1 + DUO_BODYGUARD_ATK_BONUS_PERCENT / 100),
    );
  });

  it("shares Luck from a Lucky Support to a Lucky Tank (Lucky Aegis)", () => {
    const units = computeCombatUnits([
      {
        id: "support",
        name: "support",
        stats,
        attribution: "support",
        trait: "lucky",
      },
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "lucky" },
    ]);
    const tank = units.find((u) => u.id === "tank")!;
    const support = units.find((u) => u.id === "support")!;
    // Tank's Luck under the "tank" role is stats.luck * 0.9 (applyAttribution)
    // before the duo bonus is added on top.
    const baseTankLuck = stats.luck * 0.9;
    expect(tank.luck).toBeCloseTo(
      baseTankLuck + (support.luck * DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT) / 100,
    );
  });

  it("boosts Defense for a Brute Tank and Brute Support only (Shield Wall)", () => {
    const withDuo = computeCombatUnits([
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "brute" },
      {
        id: "support",
        name: "support",
        stats,
        attribution: "support",
        trait: "brute",
      },
      { id: "dps", name: "dps", stats, attribution: "dps", trait: "lucky" },
    ]);
    const withoutDuo = computeCombatUnits([
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "stoic" },
      {
        id: "support",
        name: "support",
        stats,
        attribution: "support",
        trait: "brute",
      },
      { id: "dps", name: "dps", stats, attribution: "dps", trait: "lucky" },
    ]);
    const tankWith = withDuo.find((u) => u.id === "tank")!;
    const tankWithout = withoutDuo.find((u) => u.id === "tank")!;
    expect(tankWith.def).toBeCloseTo(
      tankWithout.def * (1 + DUO_RAMPART_DEF_BONUS_PERCENT / 100),
    );

    // A gladiator not part of the duo (same Support count either way, so the
    // baseline applySupportTeamBuff contribution is identical) stays
    // unaffected - Shield Wall no longer buffs the whole squad.
    const dpsWith = withDuo.find((u) => u.id === "dps")!;
    const dpsWithout = withoutDuo.find((u) => u.id === "dps")!;
    expect(dpsWith.def).toBeCloseTo(dpsWithout.def);
  });

  it("boosts both Bloodthirsty DPS units under Twin Frenzy", () => {
    const solo = computeCombatUnits([
      { id: "a", name: "a", stats, attribution: "dps", trait: "bloodthirsty" },
      { id: "b", name: "b", stats, attribution: "tank", trait: "brute" },
    ]);
    const duo = computeCombatUnits([
      { id: "a", name: "a", stats, attribution: "dps", trait: "bloodthirsty" },
      { id: "b", name: "b", stats, attribution: "dps", trait: "bloodthirsty" },
    ]);
    const soloAtk = solo.find((u) => u.id === "a")!.atk;
    const duoAtk = duo.find((u) => u.id === "a")!.atk;
    expect(duoAtk).toBeCloseTo(
      soloAtk * (1 + DUO_TWIN_FRENZY_ATK_BONUS_PERCENT / 100),
    );
  });

  it("boosts the Brute Tank's ATK when paired with an Incorrigible Support (Reckless Duo)", () => {
    const withoutDuo = computeCombatUnits([
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "brute" },
      {
        id: "support",
        name: "support",
        stats,
        attribution: "support",
        trait: "stoic",
      },
    ]);
    const withDuo = computeCombatUnits([
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "brute" },
      {
        id: "support",
        name: "support",
        stats,
        attribution: "support",
        trait: "incorrigible",
      },
    ]);
    const tankWithout = withoutDuo.find((u) => u.id === "tank")!;
    const tankWith = withDuo.find((u) => u.id === "tank")!;
    expect(tankWith.atk).toBeCloseTo(
      tankWithout.atk * (1 + DUO_RECKLESS_DUO_ATK_BONUS_PERCENT / 100),
    );
  });

  it("boosts the Incorrigible DPS's Luck when paired with a Crowd Favorite Tank (Glass Cannon)", () => {
    const withoutDuo = computeCombatUnits([
      {
        id: "dps",
        name: "dps",
        stats,
        attribution: "dps",
        trait: "incorrigible",
      },
      { id: "tank", name: "tank", stats, attribution: "tank", trait: "stoic" },
    ]);
    const withDuo = computeCombatUnits([
      {
        id: "dps",
        name: "dps",
        stats,
        attribution: "dps",
        trait: "incorrigible",
      },
      {
        id: "tank",
        name: "tank",
        stats,
        attribution: "tank",
        trait: "crowdFavorite",
      },
    ]);
    const dpsWithout = withoutDuo.find((u) => u.id === "dps")!;
    const dpsWith = withDuo.find((u) => u.id === "dps")!;
    expect(dpsWith.luck).toBeCloseTo(
      dpsWithout.luck * (1 + DUO_GLASS_CANNON_LUCK_BONUS_PERCENT / 100),
    );
  });
});

describe("resolveCombat - duo synergy gold and Bloodthirsty visibility", () => {
  it("adds the Rowdy Crowd bonus gold on a win when Crowd Favorite + Lucky are both sent", () => {
    const strongStats = {
      atk: 200,
      def: 50,
      luck: 50,
      hpMax: 500,
      hpCurrent: 500,
    };
    const weakRivalStats = { atk: 1, def: 1, luck: 0, hpMax: 5, hpCurrent: 5 };
    const trainer = computeCombatUnits([
      {
        id: "a",
        name: "a",
        stats: strongStats,
        attribution: "support",
        trait: "crowdFavorite",
      },
      {
        id: "b",
        name: "b",
        stats: strongStats,
        attribution: "dps",
        trait: "lucky",
      },
    ]);
    const rival = computeCombatUnits([
      {
        id: "r",
        name: "r",
        stats: weakRivalStats,
        attribution: "dps",
        trait: "brute",
      },
    ]);
    const rng = mulberry32(42);
    const result = resolveCombat(trainer, rival, { difficulty: "easy", rng });

    expect(result.victory).toBe(true);
    expect(result.activeDuoSynergies.map((s) => s.id)).toContain("crowd-lucky");
    const expectedBonus = Math.round(
      (result.baseGoldReward * DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT) / 100,
    );
    expect(result.duoSynergyBonusGold).toBe(expectedBonus);
    expect(result.goldGained).toBe(
      result.baseGoldReward +
        result.crowdFavoriteBonusGold +
        result.duoSynergyBonusGold,
    );
  });

  it("logs bloodthirstyTriggered only on the knockdown hit from a Bloodthirsty attacker", () => {
    const strong = computeCombatUnits([
      {
        id: "strong",
        name: "strong",
        stats: { atk: 200, def: 50, luck: 0, hpMax: 500, hpCurrent: 500 },
        attribution: "dps",
        trait: "bloodthirsty",
      },
    ]);
    const weak = computeCombatUnits([
      {
        id: "weak",
        name: "weak",
        stats: { atk: 1, def: 1, luck: 0, hpMax: 5, hpCurrent: 5 },
        attribution: "dps",
        trait: "brute",
      },
    ]);
    const rng = mulberry32(7);
    const result = resolveCombat(strong, weak, { difficulty: "easy", rng });

    const knockdownEntry = result.log.find((e) => e.targetDowned);
    expect(knockdownEntry?.bloodthirstyTriggered).toBe(true);
    expect(
      result.log.every(
        (e) => !e.bloodthirstyTriggered || e.attackerId === "strong",
      ),
    ).toBe(true);
  });
});

describe("trainingProgramUpgradeGoldCost", () => {
  it("applies the Incorrigible self-discount", () => {
    const cost = trainingProgramUpgradeGoldCost("incorrigible");
    expect(cost).toBe(
      Math.round(
        TRAINING_PROGRAM_UPGRADE_GOLD_COST *
          (1 - TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT / 100),
      ),
    );
  });

  it("is unchanged for any other trait", () => {
    expect(trainingProgramUpgradeGoldCost("brute")).toBe(
      TRAINING_PROGRAM_UPGRADE_GOLD_COST,
    );
    expect(trainingProgramUpgradeGoldCost(undefined)).toBe(
      TRAINING_PROGRAM_UPGRADE_GOLD_COST,
    );
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
      attribution: lines[idx],
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
