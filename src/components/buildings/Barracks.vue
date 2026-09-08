<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span><i class="bi bi-shield-fill" /> Barracks - Level {{ level }}</span>
      <span class="badge bg-secondary"
        >{{ gladiatorCount }}/{{ capacity }} gladiators</span
      >
    </div>
    <div class="card-body">
      <button
        class="btn btn-outline-light"
        :disabled="gold < upgradeCost"
        @click="upgrade"
      >
        Upgrade <span><i class="bi bi-coin" /> {{ upgradeCost }}</span>
      </button>
      <p v-if="gladiators.length === 0" class="text-muted m-2">
        No gladiators yet - recruit some at the Market.
      </p>
      <ul v-else class="list-group m-2">
        <li
          v-for="gladiator in rankedGladiators"
          :key="gladiator.id"
          class="list-group-item bg-dark text-light"
        >
          <div class="d-flex justify-content-between align-items-center gap-2">
            <div class="d-flex align-items-center gap-2">
              <input
                :value="gladiator.name"
                class="form-control form-control-sm bg-dark text-light"
                style="width: 160px"
                @change="renameGladiator(gladiator.id, $event)"
              />
            </div>
            <span class="badge" :class="powerBadgeClass(gladiator.power)">
              {{ powerTierLabel(gladiator.power) }} - {{ gladiator.power }}
              <br />
              <i class="bi bi-award" /> {{ gladiator.battlesFought }}
            </span>
          </div>
          <span class="ms-1 text-muted small">
            ATK {{ Math.round(gladiator.stats.atk) }} - DEF
            {{ Math.round(gladiator.stats.def) }} - LUCK
            {{ Math.round(gladiator.stats.luck) }} - HP
            {{ Math.round(gladiator.stats.hpCurrent) }}/{{
              Math.round(gladiator.stats.hpMax)
            }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import {
  barracksCapacity,
  buildingUpgradeCost,
  gladiatorPower,
  gladiatorPowerTier,
} from "@/core/game/gameRules";

const { userData, gold, updateUserData } = useGameStore();

const level = computed(() => userData.value?.buildings.barracks.level || 1);
const capacity = computed(() => barracksCapacity(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const gladiatorCount = computed(() => gladiators.value.length);

// Strongest gladiators surface first - the ones worth training up and
// keeping around rather than selling off.
const rankedGladiators = computed(() =>
  gladiators.value
    .map((gladiator) => ({
      ...gladiator,
      power: gladiatorPower(gladiator.stats, gladiator.battlesFought),
    }))
    .sort((a, b) => b.power - a.power),
);

const powerTierLabel = (power: number) => {
  const tier = gladiatorPowerTier(power);
  return tier.charAt(0).toUpperCase() + tier.slice(1);
};

const powerBadgeClass = (power: number) => {
  switch (gladiatorPowerTier(power)) {
    case "legend":
      return "bg-warning text-dark";
    case "elite":
      return "bg-success";
    case "veteran":
      return "bg-info text-dark";
    default:
      return "bg-secondary";
  }
};

const renameGladiator = (gladiatorId: string, event: Event) => {
  if (!userData.value) return;
  const input = event.target as HTMLInputElement;
  const gladiator = userData.value.gladiators[gladiatorId];
  const name = input.value.trim();
  if (!gladiator || !name || name === gladiator.name) {
    input.value = gladiator?.name || "";
    return;
  }
  updateUserData({
    gladiators: {
      ...userData.value.gladiators,
      [gladiatorId]: { ...gladiator, name },
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
