<template>
  <span class="duo-synergy-inputs">
    <span
      v-for="(slot, index) in slots"
      :key="index"
    >
      <span
        v-if="index > 0"
        class="m-2"
      >
        <i class="bi bi-plus" />
      </span>
      <span
        class="badge"
        :class="traitBadgeClass(slot.trait)"
      >
        <i :class="traitIcon(slot.trait)" />
      </span>
      <span
        class="badge rounded-pill"
        :class="attributionBadgeClass(slot.attribution)"
      >
        <i :class="attributionIcon(slot.attribution)" />
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import type { DuoSynergySlot } from "@/core/game/synergies";
import {
  attributionIcon,
  attributionBadgeClass,
} from "@/core/game/attributions";
import { traitIcon, traitBadgeClass } from "@/core/game/traits";

defineProps<{
  slots: [DuoSynergySlot, DuoSynergySlot];
}>();
</script>

<style scoped>
.duo-synergy-inputs {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
