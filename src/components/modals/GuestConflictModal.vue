<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-exclamation-triangle-fill" /> Save found
          </h5>
        </div>
        <div class="modal-body">
          <p>
            This account already has a saved game online, but you also have
            unsaved guest progress on this device. Which one do you want to
            keep?
          </p>
          <div v-if="guestUserData" class="border rounded p-2 mb-2">
            <strong>Guest progress on this device</strong>
            <ul class="mb-0 mt-1">
              <li>
                {{ Object.keys(guestUserData.gladiators).length }} gladiators
              </li>
              <li>{{ guestUserData.profile.gold }} gold</li>
            </ul>
          </div>
          <p class="text-danger mb-0">
            Whichever you don't pick will be permanently lost.
          </p>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-light"
            @click="emits('keep-cloud')"
          >
            Go to my online save
          </button>
          <button
            type="button"
            class="btn btn-danger"
            @click="emits('keep-local')"
          >
            Overwrite with guest progress
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserData } from "@/core/game/types";

defineProps<{
  show: boolean;
  guestUserData: UserData | null;
}>();

const emits = defineEmits<{
  "keep-cloud": [];
  "keep-local": [];
}>();
</script>
