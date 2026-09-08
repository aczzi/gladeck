<template>
  <div class="container-fluid py-3">
    <div class="row">
      <div class="col-md-6">
        <FanDonation />
        <School />
        <Infirmary />
        <Market />
      </div>
      <div class="col-md-6">
        <Barracks />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FanDonation from "@/components/buildings/FanDonation.vue";
import Barracks from "@/components/buildings/Barracks.vue";
import School from "@/components/buildings/School.vue";
import Infirmary from "@/components/buildings/Infirmary.vue";
import Market from "@/components/buildings/Market.vue";
</script>
