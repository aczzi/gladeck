<template>
  <div class="card bg-dark text-light mb-3">
    <div
      class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
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
              :disabled="
                cooldownRemaining(gladiator) > 0 ||
                !canAffordTrainingProgramUpgrade(gladiator)
              "
            >
              {{ gladiator.name }} ({{ getTrainingPoints(gladiator) }} training
              pt{{ getTrainingPoints(gladiator) === 1 ? "" : "s" }}){{
                !canAffordTrainingProgramUpgrade(gladiator)
                  ? " (no training points)"
                  : cooldownRemaining(gladiator) > 0
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
            class="btn btn-outline-primary"
            :disabled="
              !selectedGladiatorId ||
              gold < upgradeGladiatorCost ||
              selectedGladiatorCooldown > 0 ||
              !selectedGladiatorCanAfford
            "
            @click="upgradeGladiator"
          >
            <i class="bi bi-magic" />
            {{
              selectedGladiatorCooldown > 0
                ? `Cooldown ${formatCooldown(selectedGladiatorCooldown)}`
                : !selectedGladiatorCanAfford
                  ? "No training points"
                  : `Train gladiator (${upgradeGladiatorCost} gold, 1 pt)`
            }}
          </button>
        </div>
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Timestamp } from "firebase/firestore";
import { useGameStore } from "@/core/store/gameStore";
import BuildingLevelsTable from "@/components/buildings/BuildingLevelsTable.vue";
import {
  trainingProgramBonusPercent,
  trainingProgramUpgradeCooldownRemainingMs,
  trainingProgramUpgradeGoldCost,
  buildingUpgradeCost,
  isBuildingMaxLevel,
  applyTrainingProgramUpgrade,
  rollTrainingInjury,
  canAffordTrainingProgramUpgrade,
  getTrainingPoints,
  gladiatorPower,
  type TrainingProgramTrainableStat,
} from "@/core/game/gameRules";
import {
  TRAINING_INJURY_HP_LOSS_PERCENT,
  TRAINING_POINT_COST_PER_UPGRADE,
  MAX_BUILDING_LEVEL,
} from "@/core/game/constantes";
import type { Gladiator } from "@/core/game/types";

const { userData, gold, updateUserData, mode } = useGameStore();

const level = computed(
  () => userData.value?.buildings.trainingProgram.level || 1,
);
const bonusPercent = computed(() => trainingProgramBonusPercent(level.value));
const isMaxLevel = computed(() => isBuildingMaxLevel(level.value));
const upgradeCost = computed(() => buildingUpgradeCost(level.value));
const levelRows = computed(() =>
  Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => i + 1).map((lvl) => ({
    level: lvl,
    cost: lvl === 1 ? null : buildingUpgradeCost(lvl - 1),
    boost: `+${trainingProgramBonusPercent(lvl)}%`,
  })),
);

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}).sort(
    (a, b) =>
      gladiatorPower(b.stats, b.battlesFought) -
      gladiatorPower(a.stats, a.battlesFought),
  ),
);
const selectedGladiatorId = ref<string>("");
const selectedStat = ref<TrainingProgramTrainableStat>("atk");

watch(
  gladiators,
  (list) => {
    if (!selectedGladiatorId.value) {
      selectedGladiatorId.value = list[0]?.id || "";
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
const selectedGladiatorCanAfford = computed(() =>
  selectedGladiator.value
    ? canAffordTrainingProgramUpgrade(selectedGladiator.value)
    : false,
);
// Incorrigible gladiators train cheaper than the base cost - see
// trainingProgramUpgradeGoldCost in gameRules.ts.
const upgradeGladiatorCost = computed(() =>
  trainingProgramUpgradeGoldCost(selectedGladiator.value?.trait),
);

const upgradeGladiator = () => {
  if (!userData.value || !selectedGladiatorId.value) return;
  const gladiator = userData.value.gladiators[selectedGladiatorId.value];
  if (!gladiator) return;
  const cost = trainingProgramUpgradeGoldCost(gladiator.trait);
  if (
    gold.value < cost ||
    cooldownRemaining(gladiator) > 0 ||
    !canAffordTrainingProgramUpgrade(gladiator)
  )
    return;
  let stats = applyTrainingProgramUpgrade(
    gladiator.stats,
    selectedStat.value,
    level.value,
    gladiator.trait,
  );
  let injured = gladiator.injured;
  if (rollTrainingInjury(level.value, gladiator.trait)) {
    stats = {
      ...stats,
      hpCurrent: Math.max(
        0,
        stats.hpCurrent - stats.hpMax * TRAINING_INJURY_HP_LOSS_PERCENT,
      ),
    };
    injured = true;
  }
  // Immediate on purpose: rollTrainingInjury() above is a random roll, and
  // without this a player could reload before the next batch to dodge a bad
  // injury outcome for free.
  updateUserData(
    {
      profile: {
        ...userData.value.profile,
        gold: gold.value - cost,
      },
      gladiators: {
        ...userData.value.gladiators,
        [gladiator.id]: {
          ...gladiator,
          stats,
          injured,
          trainingPoints:
            getTrainingPoints(gladiator) - TRAINING_POINT_COST_PER_UPGRADE,
          lastTrainingProgramUpgradeAt: Timestamp.now(),
        },
      },
    },
    { immediate: true },
  );
};

const upgrade = () => {
  if (!userData.value || gold.value < upgradeCost.value || isMaxLevel.value)
    return;
  // No RNG and no state to lock in here - gold and level move together in
  // the same write, so a reload before the next batch just re-shows the
  // pre-upgrade state with the gold unspent. Safe to batch normally.
  updateUserData({
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
  });
};
</script>
