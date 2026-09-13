<template>
  <div class="gc-hp-row">
    <span class="gc-hp-label">HP</span>
    <div class="gc-bar-track">
      <div
        class="gc-bar-fill"
        :class="hpBarClass"
        :style="{ width: hpPercent + '%' }"
      />
    </div>
    <span class="gc-hp-value">
      {{ Math.round(Math.max(0, hpCurrent)) }}/{{ Math.round(hpMax) }}
    </span>
  </div>

  <div class="gc-stats">
    <div class="gc-stat-row">
      <span class="gc-stat-label"><i class="bi bi-lightning-fill" /> ATK</span>
      <div class="gc-bar-track">
        <div
          class="gc-bar-fill gc-atk"
          :style="{ width: statPercent(atk, STAT_MAX) + '%' }"
        />
      </div>
      <span class="gc-stat-value">{{ Math.round(atk) }}</span>
    </div>
    <div class="gc-stat-row">
      <span class="gc-stat-label"><i class="bi bi-shield-fill" /> DEF</span>
      <div class="gc-bar-track">
        <div
          class="gc-bar-fill gc-def"
          :style="{ width: statPercent(def, STAT_MAX) + '%' }"
        />
      </div>
      <span class="gc-stat-value">{{ Math.round(def) }}</span>
    </div>
    <div class="gc-stat-row">
      <span class="gc-stat-label"><i class="bi bi-stars" /> LUCK</span>
      <div class="gc-bar-track">
        <div
          class="gc-bar-fill gc-luck"
          :style="{ width: statPercent(luck, LUCK_CAP) + '%' }"
        />
      </div>
      <span class="gc-stat-value">{{ Math.round(luck) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { STAT_MAX, LUCK_CAP } from "@/core/game/gameRules";

const props = withDefaults(
  defineProps<{
    hpCurrent: number;
    hpMax: number;
    atk: number;
    def: number;
    luck: number;
    hpStateOverride?: "downed" | "dead" | null;
  }>(),
  {
    hpStateOverride: null,
  },
);

const statPercent = (value: number, max: number) =>
  Math.min(100, Math.max(0, (value / max) * 100));

const hpPercent = computed(() =>
  props.hpMax > 0
    ? Math.max(0, Math.min(100, (props.hpCurrent / props.hpMax) * 100))
    : 0,
);

const hpBarClass = computed(() => {
  if (props.hpStateOverride === "dead") return "gc-hp-dead";
  if (props.hpStateOverride === "downed") return "gc-hp-downed";
  if (hpPercent.value > 50) return "gc-hp-high";
  if (hpPercent.value > 20) return "gc-hp-mid";
  return "gc-hp-low";
});
</script>
