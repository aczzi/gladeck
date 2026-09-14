<template>
  <div class="card bg-dark text-light mb-3">
    <div
      class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span
        ><i class="bi bi-gift-fill" /> Fan donation - Level {{ level }}</span
      >
      <span class="badge bg-secondary"
        >{{ goldPerDay.toFixed(0) }} gold / day</span
      >
    </div>
    <div class="card-body">
      <p class="card-text">
        <strong>{{ pendingGold }}</strong> gold to collect.
      </p>
      <p v-if="legacyPoints > 0" class="text-muted small">
        <i class="bi bi-award-fill" /> {{ legacyPoints }} retired legend{{
          legacyPoints > 1 ? "s" : ""
        }}
        (+{{ legacyPoints * LEGACY_BONUS_PERCENT_PER_RETIREE }}% gold/day).
      </p>
      <div class="d-flex gap-2 mb-3">
        <button
          class="btn btn-outline-primary"
          :disabled="pendingGold <= 0"
          @click="collect"
        >
          <i class="bi bi-download" /> Collect
        </button>
      </div>
      <BuildingLevelsTable :current-level="level" :rows="levelRows" />
      <div v-if="mode === 'cloud'" class="d-flex gap-2 mb-3">
        <button
          v-if="!isMaxLevel"
          class="btn btn-outline-light"
          :disabled="gold < upgradeCost"
          @click="upgrade"
        >
          Upgrade <span><i class="bi bi-coin" /> {{ upgradeCost }}</span>
        </button>
        <span v-else class="badge bg-success align-self-center">Max level</span>
      </div>
      <span v-else class="btn btn-outline-secondary">
        Upgrade <span><i class="bi bi-coin" /></span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import BuildingLevelsTable from "@/components/buildings/BuildingLevelsTable.vue";
import {
  fanDonationGoldPerDay,
  fanDonationGoldSinceLastCollection,
  buildingUpgradeCost,
  isBuildingMaxLevel,
  LEGACY_BONUS_PERCENT_PER_RETIREE,
} from "@/core/game/gameRules";

import { MAX_BUILDING_LEVEL } from "@/core/game/constantes";

const { userData, gold, updateUserData, mode } = useGameStore();

const level = computed(() => userData.value?.buildings.fanDonation.level || 1);
const lastCollected = computed(
  () => userData.value?.buildings.fanDonation.lastCollected || Timestamp.now(),
);
const legacyPoints = computed(() => userData.value?.profile.legacyPoints || 0);
const goldPerDay = computed(() =>
  fanDonationGoldPerDay(level.value, legacyPoints.value),
);
const pendingGold = computed(() =>
  userData.value
    ? fanDonationGoldSinceLastCollection(
        level.value,
        lastCollected.value,
        legacyPoints.value,
      )
    : 0,
);
const isMaxLevel = computed(() => isBuildingMaxLevel(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const levelRows = computed(() =>
  Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => i + 1).map((lvl) => ({
    level: lvl,
    cost: lvl === 1 ? null : buildingUpgradeCost(lvl - 1),
    boost: `${fanDonationGoldPerDay(lvl, legacyPoints.value).toFixed(0)} gold/day`,
  })),
);

const collect = () => {
  if (!userData.value || pendingGold.value <= 0) return;
  updateUserData({
    profile: {
      ...userData.value.profile,
      gold: userData.value.profile.gold + pendingGold.value,
    },
    buildings: {
      ...userData.value.buildings,
      fanDonation: {
        ...userData.value.buildings.fanDonation,
        lastCollected: Timestamp.now(),
      },
    },
  });
};

const upgrade = () => {
  if (!userData.value || gold.value < upgradeCost.value || isMaxLevel.value)
    return;
  updateUserData({
    profile: {
      ...userData.value.profile,
      gold: gold.value - upgradeCost.value,
    },
    buildings: {
      ...userData.value.buildings,
      fanDonation: {
        ...userData.value.buildings.fanDonation,
        level: level.value + 1,
      },
    },
  });
};
</script>
