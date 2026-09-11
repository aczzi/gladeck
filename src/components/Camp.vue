<template>
  <div class="container-fluid py-3">
    <div class="row">
      <div class="col-md-6">
        <Market />
        <TrainingProgram />
        <Infirmary />
        <FanDonation />
      </div>
      <div class="col-md-6">
        <Barracks />
        <div class="text-center mt-3">
          <p v-if="!canFight" class="alert alert-warning">
            {{
              hasGladiators
                ? "All your gladiators are resting - send at least one back to duty at the Barracks."
                : "Recruit at least one gladiator at the Camp before you can fight."
            }}
          </p>
          <button
            class="btn btn-danger btn-lg"
            :disabled="!canFight"
            @click="showArenaModal = true"
          >
            Send gladiators to combat (PvE)
          </button>
        </div>
      </div>
    </div>
    <Arena v-if="showArenaModal" @close="showArenaModal = false" />
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
const canFight = computed(() =>
  Object.values(userData.value?.gladiators || {}).some((g) => !g.resting),
);

const showArenaModal = ref(false);
</script>
