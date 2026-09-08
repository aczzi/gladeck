<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span><i class="bi bi-shop" /> Market - Level {{ level }}</span>
      <div class="d-flex gap-2">
        <span class="badge bg-secondary"
          >{{ gladiatorCount }}/{{ capacity }} gladiators</span
        >
        <span class="badge bg-secondary"
          >{{ dailyTradesLeft }} trades left today</span
        >
      </div>
    </div>
    <div class="card-body">
      <div class="d-flex gap-2 mb-3">
        <button
          class="btn btn-success"
          :disabled="
            gold < recruitCost ||
            gladiatorCount >= capacity ||
            dailyTradesLeft <= 0
          "
          @click="recruit"
        >
          <i class="bi bi-person-plus" /> Recruit gladiator ({{ recruitCost }}
          gold)
        </button>
      </div>
      <div class="row g-2 align-items-end mb-2">
        <div class="col-auto">
          <label class="form-label">Sell a gladiator</label>
          <select v-model="selectedGladiatorId" class="form-select">
            <option
              v-for="gladiator in sellableGladiators"
              :key="gladiator.id"
              :value="gladiator.id"
            >
              {{ gladiator.name }} ({{ sellValue(gladiator) }} gold)
            </option>
          </select>
        </div>
        <div class="col-auto">
          <button
            class="btn btn-danger"
            :disabled="!selectedGladiatorId || dailyTradesLeft <= 0"
            @click="sellGladiator"
          >
            <i class="bi bi-currency-exchange" /> Sell
          </button>
        </div>
      </div>
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
import { computed, ref, watch } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import {
  marketDailyTrades,
  buildingUpgradeCost,
  barracksCapacity,
  createGladiator,
} from "@/core/game/gameRules";
import type { Gladiator } from "@/core/game/types";

const RECRUIT_COST = 50;

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.market.level || 1);
const dailyTradesLeft = computed(
  () => userData.value?.buildings.market.dailyTradesLeft || 0,
);
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const recruitCost = RECRUIT_COST;

const capacity = computed(() =>
  barracksCapacity(userData.value?.buildings.barracks.level || 1),
);
const gladiatorCount = computed(
  () => Object.keys(userData.value?.gladiators || {}).length,
);

const sellableGladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}).filter(
    (gladiator) => !gladiator.inDeck,
  ),
);
const selectedGladiatorId = ref<string>("");

watch(
  sellableGladiators,
  (list) => {
    if (!list.find((g) => g.id === selectedGladiatorId.value)) {
      selectedGladiatorId.value = list[0]?.id || "";
    }
  },
  { immediate: true },
);

const sellValue = (gladiator: Gladiator): number => {
  const { atk, luck, hpMax, def } = gladiator.stats;
  return Math.round((atk * 1.2 + def * 1.2 + luck * 0.7 + hpMax * 0.7) / 4);
};

const recruit = () => {
  if (
    !userData.value ||
    gold.value < recruitCost ||
    gladiatorCount.value >= capacity.value ||
    dailyTradesLeft.value <= 0
  )
    return;
  const gladiator = createGladiator();
  updateUserData(
    {
      profile: { ...userData.value.profile, gold: gold.value - recruitCost },
      gladiators: { ...userData.value.gladiators, [gladiator.id]: gladiator },
      buildings: {
        ...userData.value.buildings,
        market: {
          ...userData.value.buildings.market,
          dailyTradesLeft: dailyTradesLeft.value - 1,
        },
      },
    },
    { immediate: true },
  );
};

const sellGladiator = () => {
  if (
    !userData.value ||
    !selectedGladiatorId.value ||
    dailyTradesLeft.value <= 0
  )
    return;
  const gladiator = userData.value.gladiators[selectedGladiatorId.value];
  if (!gladiator) return;
  const gain = sellValue(gladiator);
  const gladiators = { ...userData.value.gladiators };
  delete gladiators[gladiator.id];
  updateUserData(
    {
      profile: { ...userData.value.profile, gold: gold.value + gain },
      gladiators,
      buildings: {
        ...userData.value.buildings,
        market: {
          ...userData.value.buildings.market,
          dailyTradesLeft: dailyTradesLeft.value - 1,
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
        market: {
          level: level.value + 1,
          dailyTradesLeft: marketDailyTrades(level.value + 1),
        },
      },
    },
    { immediate: true },
  );
};
</script>
