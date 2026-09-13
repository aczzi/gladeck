<template>
  <div
    class="top-info position-fixed start-50 translate-middle-x"
    style="bottom: 16px; z-index: 200"
  >
    <div
      v-if="isActiveUser"
      class="bg-dark text-light px-3 py-2 rounded-pill shadow-sm border border-info"
    >
      <div class="d-flex align-items-center gap-3">
        <span><i class="bi bi-trophy-fill" /> RP {{ pveRankPoints }} PvE -
          {{ pvpRankPoints }} PvP</span>
        <span><i class="bi bi-coin" /> {{ gold }} Gold</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from "@/core/store/gameStore";

const { pveRankPoints, pvpRankPoints, gold, isActiveUser } = useGameStore();
</script>

<style scoped>
.top-info {
  transition: all 0.3s ease;
}

@media (max-width: 768px) {
  .top-info {
    bottom: 8px;
    font-size: 0.9rem;
  }
}
</style>
