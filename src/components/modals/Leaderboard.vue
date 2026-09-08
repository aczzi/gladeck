<template>
  <div class="container-fluid">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading leaderboard...</span>
      </div>
      <p class="mt-2">Loading leaderboard...</p>
    </div>
    <div v-else-if="error" class="alert alert-danger" role="alert">
      <i class="bi bi-exclamation-triangle" />
      Error loading leaderboard: {{ error }}
    </div>
    <table
      v-else-if="players.length > 0"
      class="table table-responsive table-dark"
    >
      <thead>
        <tr>
          <th scope="col">
            <button
              type="button"
              class="btn btn-primary"
              @click="refreshLeaderboard"
            >
              <i class="bi bi-arrow-clockwise" />
            </button>
          </th>
          <th scope="col">Lanista</th>
          <th scope="col">Rank points</th>
          <th scope="col" class="hide-right">Roster value</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(player, index) in players" :key="player.id">
          <td scope="row">
            <span v-if="index < 3" class="badge bg-dark">
              <i class="bi bi-trophy-fill" /> {{ index + 1 }}
            </span>
            <span v-else class="badge bg-secondary">
              {{ index + 1 }}
            </span>
          </td>
          <td>
            <strong>{{ player.username }}</strong>
          </td>
          <td>{{ formatNumber(player.rankPoints) }}</td>
          <td class="hide-right">
            {{ formatNumber(player.rosterValue) }} gold
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="text-center py-5">
      <i class="bi bi-people display-1 text-muted" />
      <p class="mt-3 text-muted">No players found in the leaderboard yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDocsFromServer,
} from "firebase/firestore";
import { db } from "@/core/firebase/store";
import { gladiatorSellValue } from "@/core/game/gameRules";
import type { Gladiator } from "@/core/game/types";

interface LeaderboardPlayer {
  id: string;
  username: string;
  rankPoints: number;
  rosterValue: number;
}

const rosterValue = (
  gladiators: Record<string, Gladiator> | undefined,
): number =>
  Object.values(gladiators || {}).reduce(
    (sum, g) => sum + gladiatorSellValue(g.stats, g.battlesFought || 0),
    0,
  );

const players = ref<LeaderboardPlayer[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat().format(num);
};

const fetchLeaderboard = async (forceRefresh = false): Promise<void> => {
  loading.value = true;
  error.value = null;

  try {
    const leaderboardQuery = query(
      collection(db, "users"),
      orderBy("profile.rankPoints", "desc"),
      limit(50),
    );

    const querySnapshot = forceRefresh
      ? await getDocsFromServer(leaderboardQuery)
      : await getDocs(leaderboardQuery);
    const leaderboardData: LeaderboardPlayer[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      leaderboardData.push({
        id: doc.id,
        username: data.profile?.username || "Anonymous Trainer",
        rankPoints: data.profile?.rankPoints || 0,
        rosterValue: rosterValue(data.gladiators),
      });
    });

    players.value = leaderboardData;
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    error.value = "Failed to load leaderboard data";
  } finally {
    loading.value = false;
  }
};

const refreshLeaderboard = async (): Promise<void> => {
  await fetchLeaderboard(true);
};

onMounted(() => {
  fetchLeaderboard();
});
</script>

<style scoped>
.table-responsive {
  overflow-x: hidden;
}
@media (max-width: 768px) {
  .hide-right {
    display: none;
  }
}
</style>
