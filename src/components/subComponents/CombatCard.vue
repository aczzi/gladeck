<template>
  <div
    class="gladiator-card combat-card"
    :class="[
      side === 'trainer' ? 'side-trainer' : 'side-rival',
      { 'combat-card--active': active },
      { 'combat-card--targeted': targeted },
      { 'combat-card--downed': isDowned && !isDead },
      { 'combat-card--dead': isDead },
      effect ? `combat-card--${effect}` : '',
    ]"
  >
    <div class="gc-header">
      <span class="combat-card__name">{{ name }}</span>
      <span class="badge rounded-pill" :class="setAttributionBadgeClass">
        <i :class="setAttributionIcon" />
      </span>
    </div>

    <span
      v-if="trait"
      class="badge combat-card__trait"
      :class="traitBadgeClass(trait)"
    >
      <i :class="traitIcon(trait)" />
      {{ traitLabel(trait) }}
    </span>

    <GladiatorStats
      :hp-current="hpCurrent"
      :hp-max="hpMax"
      :atk="atk"
      :def="def"
      :luck="luck"
      :hp-state-override="isDead ? 'dead' : isDowned ? 'downed' : null"
    />

    <div
      v-if="isDead || isDowned"
      class="combat-card__status small text-center"
    >
      <span v-if="isDead" class="text-danger"
        ><i class="bi bi-skull" /> Dead</span
      >
      <span v-else class="text-warning"
        ><i class="bi bi-emoji-dizzy" /> Down</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Attribution, GladiatorTrait } from "@/core/game/types";
import { traitLabel, traitIcon, traitBadgeClass } from "@/core/game/traits";
import GladiatorStats from "@/components/subComponents/GladiatorStats.vue";
import {
  attributionIcon,
  attributionBadgeClass,
} from "@/core/game/attributions";

const props = defineProps<{
  name: string;
  atk: number;
  def: number;
  luck: number;
  hpMax: number;
  hpCurrent: number;
  trait?: GladiatorTrait;
  attribution: Attribution;
  side: "trainer" | "rival";
  active: boolean;
  targeted: boolean;
  effect: "hit" | "crit" | "dodge" | "frenzy" | null;
}>();

const isDowned = computed(() => props.hpCurrent > 0 && props.hpCurrent <= 1);
const isDead = computed(() => props.hpCurrent <= 0);

const setAttributionIcon = computed(() => {
  return attributionIcon(props.attribution);
});

const setAttributionBadgeClass = computed(() => {
  return attributionBadgeClass(props.attribution);
});
</script>

<style scoped>
/* Shared frame/bars/stats come from gladiator.css (.gladiator-card, .gc-*) -
   only the combat-only bits live here: which side a unit is on, the
   active/targeted/downed/dead states, and the hit/crit/dodge animations. */
.combat-card {
  width: 170px;
}

.combat-card.side-trainer {
  --tier-color: var(--gladiator-gold);
  --tier-glow: color-mix(in srgb, var(--gladiator-gold) 40%, transparent);
  --tier-ink: #000;
}
.combat-card.side-rival {
  --tier-color: var(--gladiator-blood);
  --tier-glow: color-mix(in srgb, var(--gladiator-blood) 45%, transparent);
  --tier-ink: #fff;
}

.combat-card__name {
  font-weight: 700;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combat-card__trait {
  align-self: flex-start;
}

.combat-card__status {
  margin-top: -0.1rem;
}

/* These two HP states only exist in combat (GladiatorStats renders the
   class, but only CombatCard ever passes hp-state-override to trigger it) -
   :deep() is needed since the bar itself is inside a child component now. */
.combat-card :deep(.gc-bar-fill.gc-hp-downed) {
  background: var(--gladiator-gold);
}
.combat-card :deep(.gc-bar-fill.gc-hp-dead) {
  background: var(--bs-secondary);
}

.combat-card--active {
  transform: translateY(-8px) scale(1.05);
  box-shadow: 0 0 12px 2px var(--gladiator-gold-bright);
  z-index: 2;
}

.combat-card--targeted {
  box-shadow: 0 0 10px 2px var(--gladiator-blood);
}

.combat-card--downed {
  opacity: 0.6;
  filter: grayscale(40%);
}

.combat-card--dead {
  opacity: 0.35;
  filter: grayscale(100%);
}

@keyframes combat-hit-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px);
  }
  40% {
    transform: translateX(5px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(3px);
  }
}

@keyframes combat-crit-flash {
  0%,
  100% {
    box-shadow: 0 0 0 0
      color-mix(in srgb, var(--gladiator-gold-bright) 0%, transparent);
  }
  30% {
    box-shadow: 0 0 20px 6px
      color-mix(in srgb, var(--gladiator-gold-bright) 90%, transparent);
  }
}

@keyframes combat-dodge-hop {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.combat-card--hit {
  animation: combat-hit-shake 0.4s ease;
}

.combat-card--crit {
  animation:
    combat-hit-shake 0.4s ease,
    combat-crit-flash 0.5s ease;
}

.combat-card--dodge {
  animation: combat-dodge-hop 0.4s ease;
}

@keyframes combat-frenzy-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0
      color-mix(in srgb, var(--gladiator-blood) 0%, transparent);
  }
  40% {
    box-shadow: 0 0 18px 5px
      color-mix(in srgb, var(--gladiator-blood) 85%, transparent);
  }
}

/* Bloodthirsty's stacking ATK gain on a knockdown - shown on the attacker,
   not the target (ROADMAP.md Axe C: make an existing but silent trait
   trigger visible). */
.combat-card--frenzy {
  animation: combat-frenzy-pulse 0.5s ease;
}
</style>
