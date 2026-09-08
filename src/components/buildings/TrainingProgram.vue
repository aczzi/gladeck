<template>
  <div class="card bg-dark text-light mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <span
        ><i class="bi bi-mortarboard-fill" /> Training Program - Level
        {{ level }}</span
      >
      <span class="badge bg-secondary">+{{ bonusPercent }}%</span>
    </div>
    <div class="card-body">
      <div class="row g-2 align-items-end mb-2">
        <div class="col-auto">
          <label class="form-label">Gladiator</label>
          <select v-model="selectedGladiatorId" class="form-select">
            <option
              v-for="gladiator in gladiators"
              :key="gladiator.id"
              :value="gladiator.id"
              :disabled="cooldownRemaining(gladiator) > 0"
            >
              {{ gladiator.name
              }}{{
                cooldownRemaining(gladiator) > 0
                  ? ` (cooldown ${formatCooldown(cooldownRemaining(gladiator))})`
                  : ""
              }}
            </option>
          </select>
        </div>
        <div class="col-auto">
          <label class="form-label">Stat</label>
          <select v-model="selectedStat" class="form-select">
            <option value="atk">Attack</option>
            <option value="def">Defense</option>
          </select>
        </div>
        <div class="col-auto">
          <button
            class="btn btn-success"
            :disabled="
              !selectedGladiatorId ||
              gold < upgradeGladiatorCost ||
              selectedGladiatorCooldown > 0
            "
            @click="upgradeGladiator"
          >
            <i class="bi bi-magic" />
            {{
              selectedGladiatorCooldown > 0
                ? `Cooldown ${formatCooldown(selectedGladiatorCooldown)}`
                : `Train gladiator (${upgradeGladiatorCost} gold)`
            }}
          </button>
        </div>
      </div>
      <button
        class="btn btn-outline-light"
        :disabled="gold < upgradeCost"
        @click="upgradeTrainingProgram"
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
  trainingProgramBonusPercent,
  trainingProgramUpgradeCooldownRemainingMs,
  buildingUpgradeCost,
  applyTrainingProgramUpgrade,
  type TrainingProgramTrainableStat,
} from "@/core/game/gameRules";
import type { Gladiator } from "@/core/game/types";

const UPGRADE_GLADIATOR_COST = 30;

const { userData, gold, updateUserData } = useGameStore();

const level = computed(
  () => userData.value?.buildings.trainingProgram.level || 1,
);
const bonusPercent = computed(() => trainingProgramBonusPercent(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const upgradeGladiatorCost = UPGRADE_GLADIATOR_COST;

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const selectedGladiatorId = ref<string>("");
const selectedStat = ref<TrainingProgramTrainableStat>("atk");

watch(
  gladiators,
  (list) => {
    if (!selectedGladiatorId.value && list.length > 0) {
      selectedGladiatorId.value = list[0].id;
    }
  },
  { immediate: true },
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
  trainingProgramUpgradeCooldownRemainingMs(
    gladiator.lastTrainingProgramUpgradeAt,
    now.value,
  );

const formatCooldown = (ms: number) => {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
};

const selectedGladiator = computed(
  () => userData.value?.gladiators[selectedGladiatorId.value],
);
const selectedGladiatorCooldown = computed(() =>
  selectedGladiator.value ? cooldownRemaining(selectedGladiator.value) : 0,
);

const upgradeGladiator = () => {
  if (
    !userData.value ||
    !selectedGladiatorId.value ||
    gold.value < upgradeGladiatorCost
  )
    return;
  const gladiator = userData.value.gladiators[selectedGladiatorId.value];
  if (!gladiator || cooldownRemaining(gladiator) > 0) return;
  const stats = applyTrainingProgramUpgrade(
    gladiator.stats,
    selectedStat.value,
    level.value,
  );
  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        gold: gold.value - upgradeGladiatorCost,
      },
      gladiators: {
        ...userData.value.gladiators,
        [gladiator.id]: {
          ...gladiator,
          stats,
          lastTrainingProgramUpgradeAt: Timestamp.now(),
        },
      },
    },
    { immediate: true },
  );
};

const upgradeTrainingProgram = () => {
  if (!userData.value || gold.value < upgradeCost.value) return;
  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        gold: gold.value - upgradeCost.value,
      },
      buildings: {
        ...userData.value.buildings,
        trainingProgram: {
          ...userData.value.buildings.trainingProgram,
          level: level.value + 1,
        },
      },
    },
    { immediate: true },
  );
};
</script>
