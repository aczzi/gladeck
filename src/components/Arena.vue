<template>
  <div class="container-fluid py-3">
    <!-- Step 1: send gladiators -->
    <div v-if="!sentGladiators" class="text-center">
      <p v-if="!canFight" class="alert alert-warning">
        Add at least one gladiator to your roster at the Camp before you can
        fight.
      </p>
      <button
        class="btn btn-danger btn-lg"
        :disabled="!canFight"
        @click="startCombat"
      >
        Send gladiators to combat
      </button>
    </div>

    <!-- Step 2: placement -->
    <div v-else-if="!result" class="row justify-content-center">
      <div class="col-md-8">
        <h5 class="text-center">
          Place {{ sentGladiators.length }} gladiators as Frontline or Backline
        </h5>
        <div class="row">
          <div
            v-for="gladiator in sentGladiators"
            :key="gladiator.id"
            class="col-md-6 mb-3"
          >
            <div class="card bg-dark text-light">
              <div class="card-body">
                <h6>{{ gladiator.name }}</h6>
                <p class="text-muted mb-2">
                  ATK {{ Math.round(gladiator.stats.atk) }} - DEF
                  {{ Math.round(gladiator.stats.def) }} - LUCK
                  {{ Math.round(gladiator.stats.luck) }} - HP
                  {{ Math.round(gladiator.stats.hpCurrent) }}/{{
                    Math.round(gladiator.stats.hpMax)
                  }}
                </p>
                <div class="btn-group w-100">
                  <button
                    class="btn btn-sm"
                    :class="
                      placement[gladiator.id] === 'frontline'
                        ? 'btn-primary'
                        : 'btn-outline-primary'
                    "
                    @click="placement[gladiator.id] = 'frontline'"
                  >
                    Frontline
                  </button>
                  <button
                    class="btn btn-sm"
                    :class="
                      placement[gladiator.id] === 'backline'
                        ? 'btn-info'
                        : 'btn-outline-info'
                    "
                    @click="placement[gladiator.id] = 'backline'"
                  >
                    Backline
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="text-center">
          <label for="betInput" class="form-label">
            Gold wager - win to double it back
          </label>
          <div
            class="input-group input-group-sm justify-content-center mb-3 mx-auto"
            style="max-width: 220px"
          >
            <input
              id="betInput"
              v-model.number="bet"
              type="number"
              class="form-control"
              min="0"
              :max="gold"
              @change="clampBet"
            />
            <span class="input-group-text">/ {{ gold }} gold</span>
          </div>
          <button
            class="btn btn-danger btn-lg"
            :disabled="!placementValid"
            @click="engage"
          >
            <i class="bi bi-lightning-fill" /> Engage
          </button>
          <p v-if="!placementValid" class="text-muted mt-2">
            Assign every sent gladiator to a line.
          </p>
        </div>
      </div>
    </div>

    <!-- Step 3: result -->
    <div v-else class="row justify-content-center">
      <div class="col-md-6 text-center">
        <h3 :class="result.victory ? 'text-success' : 'text-danger'">
          {{ result.victory ? "Victory!" : "Defeat" }}
        </h3>
        <p v-if="result.victory">
          +{{ result.rankPointsGained }} rank points, +{{ result.goldGained }}
          gold. Surviving gladiators come back injured.
        </p>
        <p v-else>
          The gladiators you sent were lost. Rebuild via the Barracks or the
          Market.
        </p>
        <p
          v-if="lastBet > 0"
          :class="result.victory ? 'text-success' : 'text-danger'"
        >
          {{
            result.victory
              ? `Your ${lastBet} gold wager paid off - +${lastBet} gold!`
              : `You lost your ${lastBet} gold wager.`
          }}
        </p>
        <div v-if="result.log.length > 0" class="text-start mb-3">
          <h6 class="text-center">Combat log</h6>
          <ul class="list-group" style="max-height: 300px; overflow-y: auto">
            <li
              v-for="(entry, index) in result.log"
              :key="index"
              class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center"
            >
              <span>
                Turn {{ entry.turn }} -
                <strong
                  :class="
                    entry.attacker === 'trainer'
                      ? 'text-primary'
                      : 'text-danger'
                  "
                >
                  {{ entry.attacker === "trainer" ? "You" : "Rival" }}
                </strong>
                hit{{ entry.attacker === "trainer" ? "" : "s" }} for
                {{ Math.round(entry.damage) }} dmg
              </span>
              <span class="text-muted"
                >HP left: {{ Math.round(entry.targetHpAfter) }}</span
              >
            </li>
          </ul>
        </div>
        <button class="btn btn-outline-light" @click="reset">
          Combat Again
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import type { Gladiator, Line } from "@/core/game/types";
import {
  sendGladiatorsToCombat,
  computeTeamStats,
  computeRivalBudget,
  distributeRivalBudget,
  resolveCombat,
  computeAttritionRatio,
  applyAttrition,
  computeLevelForRankPoints,
  getMaxSlots,
} from "@/core/game/gameRules";
import type { CombatResult } from "@/core/game/types";

const { userData, rankPoints, gold, updateUserData } = useGameStore();

const canFight = computed(() => {
  const count = Object.values(userData.value?.gladiators || {}).filter(
    (g) => g.inDeck,
  ).length;
  return count > 0;
});

const sentGladiators = ref<Gladiator[] | null>(null);
const placement = ref<Record<string, Line | null>>({});
const result = ref<CombatResult | null>(null);
const bet = ref(0);
const lastBet = ref(0);

const clampBet = () => {
  if (!Number.isFinite(bet.value) || bet.value < 0) {
    bet.value = 0;
  } else {
    bet.value = Math.min(Math.floor(bet.value), gold.value);
  }
};

const placementValid = computed(() => {
  if (!sentGladiators.value || sentGladiators.value.length === 0) return false;
  return sentGladiators.value.every((g) => placement.value[g.id] != null);
});

const startCombat = () => {
  if (!userData.value) return;
  const gladiators = sendGladiatorsToCombat(userData.value.gladiators);
  sentGladiators.value = gladiators;
  placement.value = Object.fromEntries(gladiators.map((g) => [g.id, null]));
  result.value = null;
  bet.value = 0;
};

const engage = () => {
  if (!userData.value || !sentGladiators.value || !placementValid.value) return;

  clampBet();
  const wager = bet.value;
  lastBet.value = wager;

  const placedGladiators = sentGladiators.value.map((gladiator) => ({
    stats: gladiator.stats,
    line: placement.value[gladiator.id] as Line,
  }));
  const trainerTeam = computeTeamStats(placedGladiators);
  const rivalBudget = computeRivalBudget(trainerTeam, rankPoints.value);
  const rivalTeam = distributeRivalBudget(rivalBudget);
  const combatResult = resolveCombat(trainerTeam, rivalTeam);
  result.value = combatResult;

  if (combatResult.victory) {
    const ratio = computeAttritionRatio(
      combatResult.trainerFinalHp,
      combatResult.trainerInitialHp,
    );
    const gladiators = { ...userData.value.gladiators };
    for (const gladiator of sentGladiators.value) {
      const stats = applyAttrition(gladiator.stats, ratio);
      gladiators[gladiator.id] = { ...gladiator, stats, injured: ratio < 1 };
    }
    const newRankPoints =
      userData.value.profile.rankPoints + combatResult.rankPointsGained;
    const newLevel = computeLevelForRankPoints(newRankPoints);
    updateUserData(
      {
        profile: {
          ...userData.value.profile,
          rankPoints: newRankPoints,
          gold: userData.value.profile.gold + combatResult.goldGained + wager,
          level: newLevel,
          maxSlots: getMaxSlots(newLevel),
        },
        gladiators,
      },
      { immediate: true },
    );
  } else {
    const gladiators = { ...userData.value.gladiators };
    for (const gladiator of sentGladiators.value) {
      delete gladiators[gladiator.id];
    }
    updateUserData(
      {
        gladiators,
        profile: {
          ...userData.value.profile,
          gold: userData.value.profile.gold - wager,
        },
      },
      { immediate: true },
    );
  }
};

const reset = () => {
  sentGladiators.value = null;
  placement.value = {};
  result.value = null;
  bet.value = 0;
  lastBet.value = 0;
};
</script>
