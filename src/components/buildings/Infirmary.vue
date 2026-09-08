<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span
        ><i class="bi bi-heart-pulse-fill" /> Infirmary - Level
        {{ level }}</span
      >
      <span class="badge bg-secondary"
        >{{ (healPerHour * 100).toFixed(0) }}% max HP / hour</span
      >
    </div>
    <div class="card-body">
      <p v-if="injuredGladiators.length === 0" class="text-muted">
        No injured gladiators.
      </p>
      <ul v-else class="list-group mb-2">
        <li
          v-for="gladiator in injuredGladiators"
          :key="gladiator.id"
          class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center"
        >
          <span
            >{{ gladiator.name }} -
            {{ Math.round(gladiator.stats.hpCurrent) }}/{{
              Math.round(gladiator.stats.hpMax)
            }}
            HP</span
          >
          <button
            class="btn btn-sm btn-success"
            :disabled="cooldownRemaining(gladiator) > 0 || gold < healCost"
            @click="heal(gladiator.id)"
          >
            <i class="bi bi-plus-circle" />
            {{
              cooldownRemaining(gladiator) > 0
                ? `Cooldown ${formatCooldown(cooldownRemaining(gladiator))}`
                : `Heal 1h (${healCost} gold)`
            }}
          </button>
        </li>
      </ul>
      <button
        class="btn btn-outline-light"
        :disabled="gold < upgradeCost"
        @click="upgrade"
      >
        <i class="bi bi-arrow-up-circle" /> Upgrade ({{ upgradeCost }} gold)
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import type { Gladiator } from "@/core/game/types";
import {
  infirmaryHealPerHour,
  infirmaryHeal,
  infirmaryHealCooldownRemainingMs,
  INFIRMARY_HEAL_COST,
  buildingUpgradeCost,
} from "@/core/game/gameRules";

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.infirmary.level || 1);
const healPerHour = computed(() => infirmaryHealPerHour(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const healCost = INFIRMARY_HEAL_COST;

const injuredGladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}).filter(
    (gladiator) => gladiator.stats.hpCurrent < gladiator.stats.hpMax,
  ),
);

// Ticks every second so the cooldown countdown stays live in the UI.
const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});

const cooldownRemaining = (gladiator: Gladiator) =>
  infirmaryHealCooldownRemainingMs(gladiator.lastHealedAt, now.value);

const formatCooldown = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const heal = (gladiatorId: string) => {
  if (!userData.value || gold.value < healCost) return;
  const gladiator = userData.value.gladiators[gladiatorId];
  if (!gladiator || cooldownRemaining(gladiator) > 0) return;
  const stats = infirmaryHeal(gladiator.stats, level.value, 1);
  const injured = stats.hpCurrent < stats.hpMax;
  updateUserData(
    {
      profile: { ...userData.value.profile, gold: gold.value - healCost },
      gladiators: {
        ...userData.value.gladiators,
        [gladiator.id]: {
          ...gladiator,
          stats,
          injured,
          lastHealedAt: Timestamp.now(),
        },
      },
    },
    { immediate: true },
  );
};

const upgrade = () => {
  if (!userData.value || gold.value < upgradeCost.value) return;
  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        gold: gold.value - upgradeCost.value,
      },
      buildings: {
        ...userData.value.buildings,
        infirmary: {
          ...userData.value.buildings.infirmary,
          level: level.value + 1,
        },
      },
    },
    { immediate: true },
  );
};
</script>
