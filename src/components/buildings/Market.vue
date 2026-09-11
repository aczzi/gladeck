<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span><i class="bi bi-shop" /> Market - Level {{ level }}</span>
      <div class="d-flex gap-2">
        <span class="badge bg-secondary">
          {{
            dailyTradesLeft > 0
              ? `${dailyTradesLeft} trades left today`
              : `Trades reset in ${formatCooldown(tradesResetCooldownMs)}`
          }}
        </span>
      </div>
    </div>
    <div class="card-body">
      <div class="d-flex gap-2 mb-3">
        <button
          class="btn btn-outline-primary"
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
              {{ gladiator.name }} ({{ sellValue(gladiator) }} Gold)
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
        Upgrade <span><i class="bi bi-coin" /> {{ upgradeCost }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import {
  marketDailyTrades,
  marketTradesResetCooldownRemainingMs,
  buildingUpgradeCost,
  barracksCapacity,
  createGladiator,
  gladiatorSellValue,
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

// Ticks every second so the "trades reset in..." countdown stays live.
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

const tradesResetCooldownMs = computed(() =>
  marketTradesResetCooldownRemainingMs(
    userData.value?.buildings.market.lastTradeReset,
    now.value,
  ),
);

const formatCooldown = (ms: number) => {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

// Once the 24h cooldown elapses, silently refill dailyTradesLeft - this is a
// deterministic daily refresh (unlike the Fan Donation Luck Boost roll), so
// it doesn't need an explicit player click.
watch(
  tradesResetCooldownMs,
  (remaining) => {
    if (remaining > 0 || !userData.value) return;
    updateUserData({
      buildings: {
        ...userData.value.buildings,
        market: {
          ...userData.value.buildings.market,
          dailyTradesLeft: marketDailyTrades(level.value),
          lastTradeReset: Timestamp.now(),
        },
      },
    });
  },
  { immediate: true },
);

const capacity = computed(() =>
  barracksCapacity(userData.value?.profile.legacyPoints || 0),
);
const gladiatorCount = computed(
  () => Object.keys(userData.value?.gladiators || {}).length,
);

// Resting gladiators are off duty, not off the roster - they can't be sold
// while resting.
const sellableGladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}).filter((g) => !g.resting),
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

const sellValue = (gladiator: Gladiator): number =>
  gladiatorSellValue(gladiator.stats, gladiator.battlesFought);

const recruit = () => {
  if (
    !userData.value ||
    gold.value < recruitCost ||
    gladiatorCount.value >= capacity.value ||
    dailyTradesLeft.value <= 0
  )
    return;
  const gladiator = createGladiator();
  // Immediate on purpose: createGladiator() rolls random stats, and without
  // this a player could reload before the next batch to keep re-rolling a
  // recruit's stats for free until they like the result.
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
  if (!gladiator || gladiator.resting) return;
  const gain = sellValue(gladiator);
  const gladiators = { ...userData.value.gladiators };
  delete gladiators[gladiator.id];
  // Deterministic (no RNG) and already rate-limited by dailyTradesLeft - a
  // reload before the next batch just un-sells the gladiator (no gold, no
  // trade spent), not exploitable. Safe to batch normally.
  updateUserData({
    profile: { ...userData.value.profile, gold: gold.value + gain },
    gladiators,
    buildings: {
      ...userData.value.buildings,
      market: {
        ...userData.value.buildings.market,
        dailyTradesLeft: dailyTradesLeft.value - 1,
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
      market: {
        ...userData.value.buildings.market,
        level: level.value + 1,
        dailyTradesLeft: marketDailyTrades(level.value + 1),
      },
    },
  });
};
</script>
