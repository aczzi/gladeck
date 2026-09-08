<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
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
      <div class="d-flex gap-2">
        <button
          class="btn btn-success"
          :disabled="pendingGold <= 0"
          @click="collect"
        >
          <i class="bi bi-download" /> Collect
        </button>
        <button
          class="btn btn-outline-light"
          :disabled="gold < upgradeCost"
          @click="upgrade"
        >
          <i class="bi bi-arrow-up-circle" /> Upgrade ({{ upgradeCost }} gold)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import {
  fanDonationGoldPerDay,
  fanDonationGoldSinceLastCollection,
  buildingUpgradeCost,
} from "@/core/game/gameRules";

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.fanDonation.level || 1);
const lastCollected = computed(
  () => userData.value?.buildings.fanDonation.lastCollected || Timestamp.now(),
);
const goldPerDay = computed(() => fanDonationGoldPerDay(level.value));
const pendingGold = computed(() =>
  userData.value
    ? fanDonationGoldSinceLastCollection(level.value, lastCollected.value)
    : 0,
);
const upgradeCost = computed(() => buildingUpgradeCost(level.value));

const collect = () => {
  if (!userData.value || pendingGold.value <= 0) return;
  updateUserData(
    {
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
        fanDonation: {
          ...userData.value.buildings.fanDonation,
          level: level.value + 1,
        },
      },
    },
    { immediate: true },
  );
};
</script>
