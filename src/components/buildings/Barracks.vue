<template>
  <div class="card bg-dark text-light mb-3">
    <div
      class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span><i class="bi bi-shield-fill" /> Barracks</span>
      <div class="d-flex gap-2 flex-wrap">
        <span class="badge bg-secondary">{{ gladiatorCount }}/{{ capacity }} gladiators</span>
      </div>
    </div>
    <div class="card-body">
      <p
        v-if="gladiators.length === 0"
        class="text-muted m-2"
      >
        No gladiators yet - recruit some at the Market.
      </p>
      <div
        v-else
        class="gladiator-grid m-2"
      >
        <GladiatorCard
          v-for="gladiator in rankedGladiators"
          :key="gladiator.id"
          :gladiator="gladiator"
          :expanded="expandedId === gladiator.id"
          :can-retire="canRetireGladiator(gladiator)"
          :retire-bonus-percent="nextRetireeMarginalPercent"
          @toggle-details="toggleDetails(gladiator.id)"
          @rename="(name) => renameGladiator(gladiator.id, name)"
          @retire="retireGladiator(gladiator.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import GladiatorCard from "@/components/subComponents/GladiatorCard.vue";
import {
  barracksCapacity,
  gladiatorPower,
  canRetireGladiator,
  fanDonationGoldPerDay,
} from "@/core/game/gameRules";

const { userData, updateUserData } = useGameStore();

const capacity = computed(() =>
  barracksCapacity(userData.value?.profile.legacyPoints || 0),
);

const nextRetireeMarginalPercent = computed(() => {
  const legacyPoints = userData.value?.profile.legacyPoints || 0;
  const current = fanDonationGoldPerDay(1, legacyPoints);
  const next = fanDonationGoldPerDay(1, legacyPoints + 1);
  return Math.round(((next - current) / current) * 100);
});

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const gladiatorCount = computed(() => gladiators.value.length);

const rankedGladiators = computed(() =>
  gladiators.value
    .map((gladiator) => ({
      ...gladiator,
      baseStats: gladiator.stats,
      trait: gladiator.trait,
      power: gladiatorPower(gladiator.stats, gladiator.battlesFought),
    }))
    .sort((a, b) => b.power - a.power),
);

const expandedId = ref<string | null>(null);
const toggleDetails = (gladiatorId: string) => {
  expandedId.value = expandedId.value === gladiatorId ? null : gladiatorId;
};

const renameGladiator = (gladiatorId: string, name: string) => {
  if (!userData.value) return;
  const gladiator = userData.value.gladiators[gladiatorId];
  if (!gladiator) return;
  updateUserData({
    gladiators: {
      ...userData.value.gladiators,
      [gladiatorId]: { ...gladiator, name },
    },
  });
};

const retireGladiator = (gladiatorId: string) => {
  if (!userData.value) return;
  const gladiator = userData.value.gladiators[gladiatorId];
  if (!gladiator || !canRetireGladiator(gladiator)) return;
  const remaining = { ...userData.value.gladiators };
  delete remaining[gladiatorId];
  if (expandedId.value === gladiatorId) expandedId.value = null;
  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        legacyPoints: (userData.value.profile.legacyPoints || 0) + 1,
      },
      gladiators: remaining,
    },
    { immediate: true },
  );
};
</script>

<style scoped>
.gladiator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.9rem;
}

@media (max-width: 576px) {
  .gladiator-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
}
</style>
