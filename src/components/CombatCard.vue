<template>
  <div
    class="combat-card card bg-dark text-light"
    :class="[
      side === 'trainer' ? 'border-primary' : 'border-danger',
      { 'combat-card--active': active },
      { 'combat-card--targeted': targeted },
      { 'combat-card--downed': isDowned && !isDead },
      { 'combat-card--dead': isDead },
      effect ? `combat-card--${effect}` : '',
    ]"
  >
    <div class="card-body p-2">
      <div class="d-flex justify-content-between align-items-start gap-1">
        <h6 class="mb-1 combat-card__name">
          {{ name }}
        </h6>
        <span
          class="badge"
          :class="attributionBadgeClass"
        >
          <i :class="attributionIcon" />
        </span>
      </div>
      <span
        v-if="trait"
        class="badge mb-1"
        :class="traitBadgeClass(trait)"
      >
        <i :class="traitIcon(trait)" />
        {{ traitLabel(trait) }}
      </span>
      <div
        class="progress mt-1"
        style="height: 8px"
      >
        <div
          class="progress-bar combat-card__hp-bar"
          :class="hpBarClass"
          :style="{ width: hpPercent + '%' }"
        />
      </div>
      <div class="small text-center mt-1">
        {{ Math.round(Math.max(0, hpCurrent)) }} / {{ Math.round(hpMax) }} HP
      </div>
      <div class="combat-card__status small text-center">
        <span
          v-if="isDead"
          class="text-danger"
        >
          <i class="bi bi-skull" /> Dead
        </span>
        <span
          v-else-if="isDowned"
          class="text-warning"
        >
          <i class="bi bi-emoji-dizzy" /> Down
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Attribution, GladiatorTrait } from "@/core/game/types";
import {
  traitLabel,
  traitIcon,
  traitBadgeClass,
} from "@/core/game/traitPresentation";

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
  effect: "hit" | "crit" | "dodge" | null;
}>();

const hpPercent = computed(() =>
  props.hpMax > 0
    ? Math.max(0, Math.min(100, (props.hpCurrent / props.hpMax) * 100))
    : 0,
);

const isDowned = computed(() => props.hpCurrent > 0 && props.hpCurrent <= 1);
const isDead = computed(() => props.hpCurrent <= 0);

const hpBarClass = computed(() => {
  if (isDead.value) return "bg-dark";
  if (isDowned.value) return "bg-warning";
  if (hpPercent.value <= 33) return "bg-danger";
  return "bg-success";
});

const attributionIcon = computed(() => {
  if (props.attribution === "dps") return "bi bi-lightning-charge-fill";
  if (props.attribution === "tank") return "bi bi-shield-fill";
  return "bi bi-people-fill";
});

const attributionBadgeClass = computed(() => {
  if (props.attribution === "dps") return "text-bg-primary";
  if (props.attribution === "tank") return "text-bg-info";
  return "text-bg-secondary";
});
</script>

<style scoped>
.combat-card {
  width: 150px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.3s ease;
}

.combat-card__name {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combat-card__hp-bar {
  transition: width 0.4s ease;
}

.combat-card--active {
  transform: translateY(-8px) scale(1.05);
  box-shadow: 0 0 12px 2px var(--gladiator-gold-bright, #e0b64d);
  z-index: 2;
}

.combat-card--targeted {
  box-shadow: 0 0 10px 2px var(--gladiator-blood, #8b2e2e);
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
    box-shadow: 0 0 0 0 rgba(224, 182, 77, 0);
  }
  30% {
    box-shadow: 0 0 20px 6px rgba(224, 182, 77, 0.9);
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
</style>
