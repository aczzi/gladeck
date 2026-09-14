<template>
  <div class="gladiator-card squad-slot" :class="tierPowerRankAttribut">
    <div class="gc-header">
      <span v-if="inSquad" class="squad-slot__position">#{{ position }}</span>
      <span class="squad-slot__name">{{ gladiator.name }}</span>
      <span v-if="!inSquad" class="gc-tier-stamp">
        {{ tierLabel }}
      </span>
      <button
        v-if="inSquad"
        type="button"
        class="btn-close btn-close-white squad-slot__remove"
        aria-label="Remove from squad"
        @click="$emit('remove')"
      />
    </div>

    <GladiatorStats
      :hp-current="gladiator.stats.hpCurrent"
      :hp-max="gladiator.stats.hpMax"
      :atk="displayedStats.atk"
      :def="displayedStats.def"
      :luck="displayedStats.luck"
    />

    <div
      v-if="inSquad"
      class="btn-group btn-group-sm w-100 mt-2"
      role="group"
      aria-label="Assign role"
    >
      <button
        type="button"
        class="btn"
        :class="role === 'tank' ? 'btn-info' : 'btn-outline-info'"
        @click="$emit('select-role', 'tank')"
      >
        <i class="bi bi-shield-fill" /> Tank
      </button>
      <button
        type="button"
        class="btn"
        :class="role === 'dps' ? 'btn-primary' : 'btn-outline-primary'"
        @click="$emit('select-role', 'dps')"
      >
        <i class="bi bi-lightning-charge-fill" /> DPS
      </button>
      <button
        type="button"
        class="btn"
        :class="role === 'support' ? 'btn-secondary' : 'btn-outline-secondary'"
        @click="$emit('select-role', 'support')"
      >
        <i class="bi bi-people-fill" /> Support
      </button>
    </div>
    <button
      v-else
      type="button"
      class="btn btn-outline-light btn-sm w-100 mt-2"
      :disabled="disabled"
      @click="$emit('toggle')"
    >
      <i class="bi bi-plus-circle" /> Add to squad
    </button>

    <div
      class="d-flex justify-content-between align-items-center flex-wrap gap-2"
    >
      <span class="badge" :class="traitBadgeClass(gladiator.trait)">
        <i :class="traitIcon(gladiator.trait)" />
        {{ traitLabel(gladiator.trait) }}
      </span>
      <span class="gc-battles">
        <i class="bi bi-award" /> {{ gladiator.battlesFought }} won
        <i class="bi bi-lightning" /> {{ power }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Attribution, Gladiator } from "@/core/game/types";
import {
  applyAttribution,
  gladiatorPower,
  gladiatorPowerTier,
} from "@/core/game/gameRules";
import { traitLabel, traitIcon, traitBadgeClass } from "@/core/game/traits";
import GladiatorStats from "@/components/subComponents/GladiatorStats.vue";

// Two modes in one card, merged from the former GladiatorSelectCard (pick)
// and GladiatorPlacementCard (role) so a gladiator's role is set right where
// it's picked, in the same squad row, instead of a separate screen
// (ROADMAP.md Axe A/B UX simplification).
const props = withDefaults(
  defineProps<{
    gladiator: Gladiator;
    inSquad: boolean;
    position?: number;
    role?: Attribution | null;
    disabled?: boolean;
  }>(),
  {
    position: 0,
    role: null,
    disabled: false,
  },
);

defineEmits<{
  toggle: []; // pick mode: add to squad
  remove: []; // squad mode: remove from squad
  "select-role": [role: Attribution];
}>();

const power = computed(() =>
  gladiatorPower(props.gladiator.stats, props.gladiator.battlesFought),
);

const tierLabel = computed(() => {
  const tier = gladiatorPowerTier(power.value);
  return tier.charAt(0).toUpperCase() + tier.slice(1);
});

const tierPowerRankAttribut = computed(() => {
  if (props.inSquad) return props.role ? `role-${props.role}` : "role-unknown";
  return `tier-${gladiatorPowerTier(power.value)}`;
});

const displayedStats = computed(() =>
  props.role
    ? applyAttribution(props.gladiator.stats, props.role)
    : props.gladiator.stats,
);
</script>

<style scoped>
.squad-slot.role-dps {
  --tier-color: var(--bs-primary);
  --tier-ink: #000;
}
.squad-slot.role-tank {
  --tier-color: var(--bs-info);
  --tier-ink: #fff;
}
.squad-slot.role-support {
  --tier-color: var(--bs-secondary);
  --tier-ink: #fff;
}
.squad-slot.role-unknown {
  --tier-color: var(--gladiator-bronze);
  --tier-ink: #fff;
}

.squad-slot__name {
  font-weight: 700;
  font-size: 0.85rem;
}

.squad-slot__position {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--tier-color);
}

.squad-slot__remove {
  flex: 0 0 auto;
  width: 0.6rem;
  height: 0.6rem;
  opacity: 0.7;
}

.squad-slot__remove:hover {
  opacity: 1;
}
</style>
