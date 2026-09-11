<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span
        ><i class="bi bi-heart-pulse-fill" /> Infirmary - Level
        {{ level }}</span
      >
      <div class="d-flex gap-2">
        <span class="badge bg-secondary"
          >{{ (healPercent * 100).toFixed(0) }}% max HP / heal</span
        >
        <span
          class="badge"
          :class="
            restingCount >= restSlots ? 'bg-warning text-dark' : 'bg-secondary'
          "
        >
          <i class="bi bi-moon-stars" /> {{ restingCount }}/{{ restSlots }}
          rest beds
        </span>
      </div>
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
                : `Heal (${healCost} gold)`
            }}
          </button>
        </li>
      </ul>
      <button
        class="btn btn-outline-light"
        :disabled="gold < upgradeCost"
        @click="upgrade"
      >
        Upgrade <span><i class="bi bi-coin" /> {{ upgradeCost }}</span>
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
  infirmaryHealPercent,
  infirmaryHeal,
  infirmaryHealCooldownRemainingMs,
  infirmaryMaxRestingGladiators,
  INFIRMARY_HEAL_COST,
  buildingUpgradeCost,
} from "@/core/game/gameRules";

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.infirmary.level || 1);
const healPercent = computed(() => infirmaryHealPercent(level.value));
const restSlots = computed(() => infirmaryMaxRestingGladiators(level.value));
const restingCount = computed(
  () =>
    Object.values(userData.value?.gladiators || {}).filter((g) => g.resting)
      .length,
);
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const healCost = INFIRMARY_HEAL_COST;

const injuredGladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}).filter(
    (gladiator) => gladiator.injured,
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
  const stats = infirmaryHeal(gladiator.stats, level.value);
  const injured = stats.hpCurrent < stats.hpMax;
  // Deterministic (no RNG) and already cooldown-gated per gladiator, so a
  // lost write just means re-clicking heal later - safe to batch normally.
  updateUserData({
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
  });
};

const upgrade = () => {
  if (!userData.value || gold.value < upgradeCost.value) return;
  updateUserData({
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
  });
};
</script>
