<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span><i class="bi bi-shield-fill" /> Barracks - Level {{ level }}</span>
      <div class="d-flex gap-2">
        <span class="badge bg-secondary"
          >{{ gladiatorCount }}/{{ capacity }} gladiators</span
        >
        <span
          class="badge"
          :class="rosterFull ? 'bg-success' : 'bg-warning text-dark'"
        >
          {{ rosterCount }}/{{ maxSlots }} in combat roster
        </span>
      </div>
    </div>
    <div class="card-body">
      <p v-if="gladiators.length === 0" class="text-muted">
        No gladiators yet - recruit some at the Market.
      </p>
      <ul v-else class="list-group mb-2">
        <li
          v-for="gladiator in gladiators"
          :key="gladiator.id"
          class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center"
        >
          <div>
            <strong>{{ gladiator.name }}</strong>
            <span class="ms-2">
              ATK {{ Math.round(gladiator.stats.atk) }} - DEF
              {{ Math.round(gladiator.stats.def) }} - LUCK
              {{ Math.round(gladiator.stats.luck) }} - HP
              {{ Math.round(gladiator.stats.hpCurrent) }}/{{
                Math.round(gladiator.stats.hpMax)
              }}
            </span>
          </div>
          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              :checked="gladiator.inDeck"
              :disabled="!gladiator.inDeck && rosterFull"
              @change="toggleInRoster(gladiator.id, !gladiator.inDeck)"
            />
          </div>
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
import { computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import { barracksCapacity, buildingUpgradeCost } from "@/core/game/gameRules";

const { userData, gold, maxSlots, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.barracks.level || 1);
const capacity = computed(() => barracksCapacity(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const gladiatorCount = computed(() => gladiators.value.length);
const rosterCount = computed(
  () => gladiators.value.filter((g) => g.inDeck).length,
);
const rosterFull = computed(() => rosterCount.value >= maxSlots.value);

const toggleInRoster = (gladiatorId: string, inDeck: boolean) => {
  if (!userData.value) return;
  const gladiator = userData.value.gladiators[gladiatorId];
  if (!gladiator) return;
  if (inDeck && rosterFull.value) return;
  updateUserData({
    gladiators: {
      ...userData.value.gladiators,
      [gladiatorId]: { ...gladiator, inDeck },
    },
  });
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
        barracks: {
          ...userData.value.buildings.barracks,
          level: level.value + 1,
        },
      },
    },
    { immediate: true },
  );
};
</script>
