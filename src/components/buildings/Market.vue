<template>
  <div class="card bg-dark text-light mb-3">
    <div
      class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span><i class="bi bi-shop" /> Market - Level {{ level }}</span>
      <div class="d-flex gap-2 flex-wrap">
        <span class="badge bg-secondary">
          {{
            tradesLeftThisHour > 0
              ? `${tradesLeftThisHour} trades left`
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
              tradesLeftThisHour <= 0
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
          <select
            v-model="selectedGladiatorId"
            class="form-select"
          >
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
            :disabled="!selectedGladiatorId || tradesLeftThisHour <= 0"
            @click="sellGladiator"
          >
            <i class="bi bi-currency-exchange" /> Sell
          </button>
        </div>
      </div>
      <BuildingLevelsTable
        :current-level="level"
        :rows="levelRows"
      />
      <button
        v-if="!isMaxLevel"
        class="btn btn-outline-light"
        :disabled="gold < upgradeCost || isTradeCooldownActive"
        :title="
          isTradeCooldownActive
            ? 'Wait for trades to reset before upgrading'
            : ''
        "
        @click="upgrade"
      >
        Upgrade <span><i class="bi bi-coin" /> {{ upgradeCost }}</span>
      </button>
      <span
        v-else
        class="badge bg-success"
      >Max level</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import BuildingLevelsTable from "@/components/buildings/BuildingLevelsTable.vue";
import {
  marketTradesPerHour,
  marketTradesResetCooldownRemainingMs,
  buildingUpgradeCost,
  isBuildingMaxLevel,
  MAX_BUILDING_LEVEL,
  MARKET_RECRUIT_COST,
  barracksCapacity,
  createGladiator,
  gladiatorSellValue,
} from "@/core/game/gameRules";
import type { Gladiator } from "@/core/game/types";

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.market.level || 1);
const tradesLeftThisHour = computed(
  () => userData.value?.buildings.market.tradesLeftThisHour || 0,
);
const isMaxLevel = computed(() => isBuildingMaxLevel(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const recruitCost = MARKET_RECRUIT_COST;
const levelRows = computed(() =>
  Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => i + 1).map((lvl) => ({
    level: lvl,
    cost: lvl === 1 ? null : buildingUpgradeCost(lvl - 1),
    boost: `${marketTradesPerHour(lvl)} trades/hour`,
  })),
);

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

// Upgrading refills tradesLeftThisHour to the new level's allowance, so
// allowing it mid-cooldown would let gold buy an extra free refill on top
// of the one already queued up for when the hourly reset fires.
const isTradeCooldownActive = computed(() => tradesLeftThisHour.value <= 0);

const formatCooldown = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Once the 1h cooldown elapses, silently refill tradesLeftThisHour - this is
// a deterministic hourly refresh (unlike the Fan Donation Luck Boost roll),
// so it doesn't need an explicit player click.
//
// This is a watchEffect (not a watch on tradesResetCooldownMs) on purpose:
// userData starts out null while it loads, so the cooldown briefly reads as
// 0 before the real (possibly already-expired) value arrives. A watch only
// fires on a value *change*, so if the real value is also 0 (cooldown was
// already over before the page loaded), the callback would never fire again
// and trades would stay stuck at 0 forever. watchEffect re-runs whenever
// userData.value or now.value themselves change, regardless of what the
// computed cooldown resolves to.
watchEffect(() => {
  if (!userData.value) return;
  const remaining = marketTradesResetCooldownRemainingMs(
    userData.value.buildings.market.lastTradeReset,
    now.value,
  );
  if (remaining > 0) return;
  updateUserData({
    buildings: {
      ...userData.value.buildings,
      market: {
        ...userData.value.buildings.market,
        tradesLeftThisHour: marketTradesPerHour(level.value),
        lastTradeReset: Timestamp.now(),
      },
    },
  });
});

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
    tradesLeftThisHour.value <= 0
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
          tradesLeftThisHour: tradesLeftThisHour.value - 1,
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
    tradesLeftThisHour.value <= 0
  )
    return;
  const gladiator = userData.value.gladiators[selectedGladiatorId.value];
  if (!gladiator || gladiator.resting) return;
  const gain = sellValue(gladiator);
  const gladiators = { ...userData.value.gladiators };
  delete gladiators[gladiator.id];
  // Deterministic (no RNG) and already rate-limited by tradesLeftThisHour -
  // a reload before the next batch just un-sells the gladiator (no gold, no
  // trade spent), not exploitable. Safe to batch normally.
  updateUserData({
    profile: { ...userData.value.profile, gold: gold.value + gain },
    gladiators,
    buildings: {
      ...userData.value.buildings,
      market: {
        ...userData.value.buildings.market,
        tradesLeftThisHour: tradesLeftThisHour.value - 1,
      },
    },
  });
};

const upgrade = () => {
  if (
    !userData.value ||
    gold.value < upgradeCost.value ||
    isMaxLevel.value ||
    isTradeCooldownActive.value
  )
    return;
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
        tradesLeftThisHour: marketTradesPerHour(level.value + 1),
      },
    },
  });
};
</script>
