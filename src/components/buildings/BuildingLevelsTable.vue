<template>
  <div class="mb-2">
    <button
      class="btn btn-sm btn-outline-secondary"
      type="button"
      @click="expanded = !expanded"
    >
      <i
        class="bi"
        :class="expanded ? 'bi-chevron-up' : 'bi-chevron-down'"
      />
      {{ expanded ? "Hide" : "Show" }} levels
    </button>
    <div
      v-if="expanded"
      class="table-responsive mt-2"
    >
      <table class="table table-dark table-sm mb-0">
        <thead>
          <tr>
            <th scope="col">
              Level
            </th>
            <th scope="col">
              Price
            </th>
            <th scope="col">
              Boost
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.level"
            :class="{ 'table-active': row.level === currentLevel }"
          >
            <td>
              {{ row.level
              }}<span v-if="row.level === currentLevel"> (current)</span>
            </td>
            <td>
              <span
                v-if="row.cost === null"
                class="text-muted"
              >-</span>
              <span v-else><i class="bi bi-coin" /> {{ row.cost }}</span>
            </td>
            <td>{{ row.boost }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  currentLevel: number;
  rows: { level: number; cost: number | null; boost: string }[];
}>();

const expanded = ref(false);
</script>
