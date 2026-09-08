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
      <div class="d-flex gap-2 mb-3">
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
      <hr />
      <div v-if="luckBoostAvailable">
        <p class="card-text">
          <i class="bi bi-stars text-warning" /> A Luck Boost (+{{
            LUCK_BOOST_VALUE
          }}
          Luck) is ready to hand out!
        </p>
        <div class="d-flex gap-2 align-items-end">
          <select v-model="selectedGladiatorId" class="form-select">
            <option
              v-for="gladiator in gladiators"
              :key="gladiator.id"
              :value="gladiator.id"
            >
              {{ gladiator.name }} (Luck {{ Math.round(gladiator.stats.luck) }})
            </option>
          </select>
          <button
            class="btn btn-warning"
            :disabled="!selectedGladiatorId"
            @click="applyBoost"
          >
            <i class="bi bi-magic" /> Apply
          </button>
        </div>
      </div>
      <button
        v-else
        class="btn btn-outline-warning"
        :disabled="luckBoostCooldownMs > 0"
        @click="rollBoost"
      >
        <i class="bi bi-stars" />
        {{
          luckBoostCooldownMs > 0
            ? `Next Luck Boost roll in ${formatCooldown(luckBoostCooldownMs)}`
            : `Roll for a Luck Boost (${luckBoostChancePercent}% chance)`
        }}
      </button>
      <p
        v-if="lastRollFailed && luckBoostCooldownMs > 0"
        class="text-muted small mt-2 mb-0"
      >
        No Luck Boost this time - try again in
        {{ formatCooldown(luckBoostCooldownMs) }}.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import {
  fanDonationGoldPerDay,
  fanDonationGoldSinceLastCollection,
  buildingUpgradeCost,
  luckBoostChance,
  luckBoostCooldownRemainingMs,
  rollLuckBoost,
  applyLuckBoost,
  LUCK_BOOST_VALUE,
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

const luckBoostAvailable = computed(
  () => userData.value?.buildings.fanDonation.luckBoostAvailable || false,
);
const luckBoostChancePercent = computed(() =>
  Math.round(luckBoostChance(level.value) * 100),
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

const luckBoostCooldownMs = computed(() =>
  luckBoostCooldownRemainingMs(
    userData.value?.buildings.fanDonation.lastLuckBoostRolledAt,
    now.value,
  ),
);

const formatCooldown = (ms: number) => {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const selectedGladiatorId = ref<string>("");

// Local-only feedback for the last roll this session - not persisted, just
// tells the player their click registered even when luck wasn't on their
// side (luckBoostAvailable turning false is otherwise silent).
const lastRollFailed = ref(false);

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

const rollBoost = () => {
  if (!userData.value || luckBoostCooldownMs.value > 0) return;
  const won = rollLuckBoost(level.value);
  lastRollFailed.value = !won;
  updateUserData(
    {
      buildings: {
        ...userData.value.buildings,
        fanDonation: {
          ...userData.value.buildings.fanDonation,
          lastLuckBoostRolledAt: Timestamp.now(),
          luckBoostAvailable: won,
        },
      },
    },
    { immediate: true },
  );
};

const applyBoost = () => {
  if (!userData.value || !selectedGladiatorId.value || !luckBoostAvailable.value)
    return;
  const gladiator = userData.value.gladiators[selectedGladiatorId.value];
  if (!gladiator) return;
  updateUserData(
    {
      gladiators: {
        ...userData.value.gladiators,
        [gladiator.id]: {
          ...gladiator,
          stats: applyLuckBoost(gladiator.stats),
        },
      },
      buildings: {
        ...userData.value.buildings,
        fanDonation: {
          ...userData.value.buildings.fanDonation,
          luckBoostAvailable: false,
        },
      },
    },
    { immediate: true },
  );
  selectedGladiatorId.value = "";
};
</script>
