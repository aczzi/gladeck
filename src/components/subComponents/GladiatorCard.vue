<template>
  <div class="gladiator-card" :class="tierPowerRank">
    <div class="gc-header">
      <div class="gc-name-edit">
        <input
          v-model="nameDraft"
          class="gc-name-input"
          maxlength="24"
          @keydown="handleNameKeydown"
        />
        <button
          v-if="isNameDirty"
          type="button"
          class="gc-name-save"
          title="Save name (overwrites the current one)"
          @click="saveName"
        >
          <i class="bi bi-check-lg" />
        </button>
      </div>
    </div>

    <GladiatorStats
      :hp-current="gladiator.stats.hpCurrent"
      :hp-max="gladiator.stats.hpMax"
      :atk="gladiator.stats.atk"
      :def="gladiator.stats.def"
      :luck="gladiator.stats.luck"
    />

    <div class="gc-ability mt-2">
      <p class="gc-ability-text">
        Since recruitment:<br />
        <span class="badge">ATK {{ statDelta(gladiator.stats.atk, gladiator.baseStats.atk) }}</span> 
        <span class="badge">DEF {{ statDelta(gladiator.stats.def, gladiator.baseStats.def) }}</span> 
        <span class="badge">LUCK {{ statDelta(gladiator.stats.luck, gladiator.baseStats.luck) }}</span> 
        <span class="badge">Max HP {{ statDelta(gladiator.stats.hpMax, gladiator.baseStats.hpMax) }}</span> 
      </p>
    </div>

    <span class="badge" :class="traitBadgeClass(gladiator.trait)">
      <i :class="traitIcon(gladiator.trait)" />
      {{ traitLabel(gladiator.trait) }}
    </span>

    <div
      class="d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span class="gc-tier-stamp">
        {{ tierLabel }}
      </span>
      <span class="gc-battles">
        <i class="bi bi-award" /> {{ gladiator.battlesFought }} won
        <i class="bi bi-lightning" /> {{ props.gladiator.power }}
      </span>
    </div>

    <button
      v-if="canRetire"
      type="button"
      class="btn btn-outline-danger btn-sm"
      @click="$emit('retire')"
    >
      <i class="bi bi-flag" /> Retire
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Gladiator } from "@/core/game/types";
import { gladiatorPowerTier } from "@/core/game/gameRules";
import { traitLabel, traitIcon, traitBadgeClass } from "@/core/game/traits";
import GladiatorStats from "@/components/subComponents/GladiatorStats.vue";

const props = withDefaults(
  defineProps<{
    gladiator: Gladiator & { power: number };
    canRetire?: boolean;
  }>(),
  {
    canRetire: false,
  },
);

const tierLabel = computed(() => {
  const tier = gladiatorPowerTier(props.gladiator.power);
  return tier.charAt(0).toUpperCase() + tier.slice(1);
});

const tierPowerRank = computed(
  () => `tier-${gladiatorPowerTier(props.gladiator.power)}`,
);

const statDelta = (current: number, base: number) => {
  const delta = Math.round(current - base);
  return delta >= 0 ? `+${delta}` : `${delta}`;
};

const emit = defineEmits<{
  rename: [name: string];
  retire: [];
}>();

// Renaming is a deliberate overwrite (Save button / Enter), not a silent
// commit on blur - the draft can diverge from the stored name until then.
const nameDraft = ref(props.gladiator.name);
watch(
  () => props.gladiator.name,
  (name) => {
    nameDraft.value = name;
  },
);

const isNameDirty = computed(() => {
  const trimmed = nameDraft.value.trim();
  return trimmed.length > 0 && trimmed !== props.gladiator.name;
});

const saveName = () => {
  const trimmed = nameDraft.value.trim();
  if (!trimmed || trimmed === props.gladiator.name) {
    nameDraft.value = props.gladiator.name;
    return;
  }
  emit("rename", trimmed);
};

const handleNameKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveName();
  } else if (event.key === "Escape") {
    nameDraft.value = props.gladiator.name;
    (event.target as HTMLInputElement).blur();
  }
};
</script>
