<template>
  <div
    class="alert alert-warning mb-0 rounded-0 text-center py-2 px-3 d-flex flex-wrap justify-content-center align-items-center gap-2"
  >
    <span>
      <i class="bi bi-exclamation-triangle-fill" />
      Progression is not saved and limited. Login to go further.
    </span>
    <div class="d-flex gap-2">
      <button
        type="button"
        class="btn btn-sm btn-dark"
        @click="emits('create-account-google')"
      >
        <i class="bi bi-google" /> Google
      </button>
      <button
        type="button"
        class="btn btn-sm btn-dark"
        @click="emits('create-account-email')"
      >
        <i class="bi bi-envelope-fill" /> Email
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const emits = defineEmits<{
  "create-account-google": [];
  "create-account-email": [];
}>();
</script>
