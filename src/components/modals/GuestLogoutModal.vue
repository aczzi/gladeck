<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-exclamation-triangle-fill" /> Leave without saving?
          </h5>
        </div>
        <div class="modal-body">
          <p>You're playing without an account, your progress will be lost.</p>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-light"
            @click="emits('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-danger"
            @click="emits('confirm')"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean;
}>();

const emits = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>
