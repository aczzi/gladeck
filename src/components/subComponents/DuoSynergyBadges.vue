<template>
  <div
    v-if="synergies.length > 0"
    class="duo-synergy-list"
  >
    <div
      v-for="synergy in synergies"
      :key="synergy.id"
      class="duo-synergy-item"
    >
      <span class="badge bg-info text-dark duo-synergy-item__label">
        <i class="bi bi-stars" /> {{ synergy.label }}
      </span>
      <span class="duo-synergy-item__desc">{{ synergy.description }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DuoSynergyMatch } from "@/core/game/types";

// A synergy badge is never just a name - the description travels with it
// everywhere this renders, so the player never has to go look up what
// "Bodyguard" or "Shield Wall" actually does (see ROADMAP.md Axe B's own
// readability warning).
defineProps<{
  synergies: DuoSynergyMatch[];
}>();
</script>

<style scoped>
.duo-synergy-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 1rem;
}

.duo-synergy-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
}

.duo-synergy-item__label {
  flex: 0 0 auto;
}

.duo-synergy-item__desc {
  font-size: 0.75rem;
  color: #cbb9a0;
  text-align: left;
}

@media (max-width: 576px) {
  .duo-synergy-item {
    flex-direction: column;
    text-align: center;
    gap: 0.15rem;
  }

  .duo-synergy-item__desc {
    text-align: center;
  }
}
</style>
