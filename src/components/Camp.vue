<template>
  <div class="container-fluid py-3">
    <Arena v-if="showArenaModal" @close="showArenaModal = false" />
    <div class="row">
      <div class="col-md-6">
        <Market />
        <TrainingProgram />
        <Infirmary />
        <FanDonation />
      </div>
      <div class="col-md-6">
        <div class="text-center">
          <p v-if="!hasGladiators" class="alert alert-danger">
            No gladiator available for combat.
          </p>
          <button v-else
            class="btn btn-danger w-100 mb-3"
            @click="showArenaModal = true"
          >
            Send gladiators to combat (PvE)
          </button>
        </div>
        <Barracks />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useGameStore } from "@/core/store/gameStore";
import FanDonation from "@/components/buildings/FanDonation.vue";
import Barracks from "@/components/buildings/Barracks.vue";
import TrainingProgram from "@/components/buildings/TrainingProgram.vue";
import Infirmary from "@/components/buildings/Infirmary.vue";
import Market from "@/components/buildings/Market.vue";
import Arena from "@/components/Arena.vue";

const { userData } = useGameStore();

const hasGladiators = computed(
  () => Object.keys(userData.value?.gladiators || {}).length > 0,
);

const showArenaModal = ref(false);
</script>
