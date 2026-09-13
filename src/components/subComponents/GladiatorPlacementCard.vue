<template>
  <div
    class="gladiator-card placement-card"
    :class="roleClass"
  >
    <div class="gc-header">
      <span class="placement-card__name">{{ gladiator.name }}</span>
      <span
        class="badge"
        :class="traitBadgeClass(gladiator.trait)"
      >
        <i :class="traitIcon(gladiator.trait)" />
        {{ traitLabel(gladiator.trait) }}
      </span>
      <span class="gc-tier-stamp">
        {{ tierLabel }}
      </span>
    </div>

    <p
      v-if="role"
      class="gc-ability-label placement-card__role"
    >
      <i :class="roleIcon" /> {{ roleLabel }}
    </p>
    <p
      v-else
      class="text-muted small placement-card__role"
    >
      Pick a role to see modified stats.
    </p>

    <GladiatorStats
      :hp-current="gladiator.stats.hpCurrent"
      :hp-max="gladiator.stats.hpMax"
      :atk="displayedStats.atk"
      :def="displayedStats.def"
      :luck="displayedStats.luck"
    />

    <div
      class="btn-group btn-group-sm w-100"
      role="group"
      aria-label="Assign role"
    >
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
        :class="role === 'tank' ? 'btn-info' : 'btn-outline-info'"
        @click="$emit('select-role', 'tank')"
      >
        <i class="bi bi-shield-fill" /> Tank
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
import {
  traitLabel,
  traitIcon,
  traitBadgeClass,
} from "@/core/game/traitPresentation";
import GladiatorStats from "@/components/subComponents/GladiatorStats.vue";

const props = defineProps<{
  gladiator: Gladiator;
  role: Attribution | null;
}>();

defineEmits<{
  "select-role": [role: Attribution];
}>();

const roleClass = computed(() => (props.role ? `role-${props.role}` : ""));

const roleIcon = computed(() => {
  if (props.role === "dps") return "bi bi-lightning-charge-fill";
  if (props.role === "tank") return "bi bi-shield-fill";
  return "bi bi-people-fill";
});

const roleLabel = computed(() => {
  if (props.role === "dps") return "DPS";
  if (props.role === "tank") return "Tank";
  return "Support";
});

// gladiator.power isn't precomputed here the way Barracks.vue does it for
// GladiatorCard - this card gets the raw roster Gladiator, so its power
// tier is derived locally from the same stats/battlesFought source.
const tierLabel = computed(() => {
  const power = gladiatorPower(
    props.gladiator.stats,
    props.gladiator.battlesFought,
  );
  const tier = gladiatorPowerTier(power);
  return tier.charAt(0).toUpperCase() + tier.slice(1);
});

const displayedStats = computed(() =>
  props.role
    ? applyAttribution(props.gladiator.stats, props.role)
    : props.gladiator.stats,
);
</script>

<style scoped>
.placement-card.role-dps {
  --tier-color: var(--bs-primary);
  --tier-ink: #000;
}
.placement-card.role-tank {
  --tier-color: var(--bs-info);
  --tier-ink: #fff;
}
.placement-card.role-support {
  --tier-color: var(--bs-secondary);
  --tier-ink: #fff;
}

.placement-card__name {
  font-weight: 700;
  font-size: 0.85rem;
}

.placement-card__role {
  margin: 0;
}
</style>
