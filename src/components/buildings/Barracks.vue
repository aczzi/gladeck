<template>
  <div class="card bg-dark text-light mb-3">
    <div
      class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span><i class="bi bi-shield-fill" /> Barracks</span>
      <div class="d-flex gap-2 flex-wrap">
        <span class="badge bg-secondary">{{ gladiatorCount }}/{{ capacity }} gladiators</span>
        <span
          class="badge"
          :class="
            restingCount >= maxResting ? 'bg-warning text-dark' : 'bg-secondary'
          "
          title="Infirmary beds available"
        >
          <i class="bi bi-moon-stars" /> {{ restingCount }}/{{ maxResting }}
          resting
        </span>
      </div>
    </div>
    <div class="card-body">
      <p
        v-if="gladiators.length === 0"
        class="text-muted m-2"
      >
        No gladiators yet - recruit some at the Market.
      </p>
      <ul
        v-else
        class="list-group m-2"
      >
        <li
          v-for="gladiator in rankedGladiators"
          :key="gladiator.id"
          class="list-group-item bg-dark text-light"
          :class="{ 'border-start border-1 border-warning': gladiator.resting }"
        >
          <div
            class="d-flex justify-content-between align-items-center gap-2 flex-wrap"
          >
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <input
                :value="gladiator.name"
                class="form-control form-control-sm bg-dark text-light gladiator-name-input"
                @change="renameGladiator(gladiator.id, $event)"
              >
              <button
                class="btn btn-sm btn-outline-light"
                title="Show gladiator details"
                @click="toggleDetails(gladiator.id)"
              >
                <i class="bi bi-info-circle" />
              </button>
              <span
                class="badge"
                :class="traitBadgeClass(gladiator.trait)"
                :title="traitDescription(gladiator.trait)"
              >
                <i :class="traitIcon(gladiator.trait)" />
                {{ traitLabel(gladiator.trait) }}
              </span>
              <span
                v-if="gladiator.resting"
                class="badge bg-warning text-dark"
              >
                <i class="bi bi-moon-stars-fill" /> Resting
              </span>
            </div>
            <span
              class="badge"
              :class="powerBadgeClass(gladiator.power)"
            >
              {{ powerTierLabel(gladiator.power) }} - {{ gladiator.power }}
              <br>
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

          <div
            v-if="expandedId === gladiator.id"
            class="mt-2 p-2 border-top"
          >
            <p class="small mb-1">
              <span
                class="badge"
                :class="traitBadgeClass(gladiator.trait)"
              >
                <i :class="traitIcon(gladiator.trait)" />
                {{ traitLabel(gladiator.trait) }}
              </span>
              {{ traitDescription(gladiator.trait) }}
            </p>
            <p class="small mb-1 text-muted">
              Since recruitment: ATK
              {{ statDelta(gladiator.stats.atk, gladiator.baseStats.atk) }} -
              DEF
              {{ statDelta(gladiator.stats.def, gladiator.baseStats.def) }} -
              LUCK
              {{ statDelta(gladiator.stats.luck, gladiator.baseStats.luck) }} -
              Max HP
              {{ statDelta(gladiator.stats.hpMax, gladiator.baseStats.hpMax) }}
            </p>
            <p class="small mb-2 text-muted">
              {{ gladiator.battlesFought }} battle{{
                gladiator.battlesFought === 1 ? "" : "s"
              }}
              won and survived.
            </p>
            <div class="d-flex gap-2 flex-wrap">
              <button
                class="btn btn-sm btn-outline-warning"
                :disabled="!gladiator.resting && restingCount >= maxResting"
                :title="
                  !gladiator.resting && restingCount >= maxResting
                    ? `All ${maxResting} Infirmary beds are occupied - upgrade the Infirmary for more`
                    : ''
                "
                @click="toggleResting(gladiator.id)"
              >
                <i class="bi bi-moon-stars" />
                {{ gladiator.resting ? "Send back to duty" : "Rest" }}
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                :disabled="!canRetireGladiator(gladiator)"
                :title="
                  canRetireGladiator(gladiator)
                    ? 'Retire for a permanent Fan Donation bonus'
                    : `Needs at least ${retireMinBattles} battles fought`
                "
                @click="retireGladiator(gladiator.id)"
              >
                <i class="bi bi-flag" /> Retire (+{{ legacyBonusPercent }}%
                gold/day forever)
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import {
  barracksCapacity,
  gladiatorPower,
  gladiatorPowerTier,
  canRetireGladiator,
  RETIRE_MIN_BATTLES_FOUGHT,
  LEGACY_BONUS_PERCENT_PER_RETIREE,
  infirmaryMaxRestingGladiators,
} from "@/core/game/gameRules";
import {
  traitLabel,
  traitIcon,
  traitBadgeClass,
  traitDescription,
} from "@/core/game/traitPresentation";

const { userData, updateUserData } = useGameStore();

const capacity = computed(() =>
  barracksCapacity(userData.value?.profile.legacyPoints || 0),
);
const retireMinBattles = RETIRE_MIN_BATTLES_FOUGHT;
const legacyBonusPercent = LEGACY_BONUS_PERCENT_PER_RETIREE;

const gladiators = computed(() =>
  Object.values(userData.value?.gladiators || {}),
);
const gladiatorCount = computed(() => gladiators.value.length);
const restingCount = computed(
  () => gladiators.value.filter((g) => g.resting).length,
);
const maxResting = computed(() =>
  infirmaryMaxRestingGladiators(userData.value?.buildings.infirmary.level || 1),
);

// Strongest gladiators surface first - the ones worth training up and
// keeping around rather than selling off.
const rankedGladiators = computed(() =>
  gladiators.value
    .map((gladiator) => ({
      ...gladiator,
      // Gladiators recruited before these fields existed fall back to sane
      // defaults instead of crashing the detail panel.
      baseStats: gladiator.baseStats || gladiator.stats,
      trait: gladiator.trait || "lucky",
      resting: gladiator.resting || false,
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

const statDelta = (current: number, base: number) => {
  const delta = Math.round(current - base);
  return delta >= 0 ? `+${delta}` : `${delta}`;
};

const expandedId = ref<string | null>(null);
const toggleDetails = (gladiatorId: string) => {
  expandedId.value = expandedId.value === gladiatorId ? null : gladiatorId;
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

const toggleResting = (gladiatorId: string) => {
  if (!userData.value) return;
  const gladiator = userData.value.gladiators[gladiatorId];
  if (!gladiator) return;
  if (!gladiator.resting && restingCount.value >= maxResting.value) return;
  updateUserData({
    gladiators: {
      ...userData.value.gladiators,
      [gladiatorId]: { ...gladiator, resting: !gladiator.resting },
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
.gladiator-name-input {
  width: 160px;
}

@media (max-width: 576px) {
  .gladiator-name-input {
    width: 120px;
  }
}
</style>
