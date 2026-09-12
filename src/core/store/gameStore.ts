import { computed, ComputedRef, getCurrentInstance } from "vue";
import type { UserData, AdminData } from "@/core/game/types";

// Composable to use the Vuex store
export function useGameStore() {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      "useGameStore must be called within a component setup function",
    );
  }

  const store = instance.appContext.app.config.globalProperties.$store;

  const initStoreSync = () => {
    store.dispatch("initStore").catch(console.error);
  };

  // Call immediately to ensure the sessionManager callback is registered.
  initStoreSync();

  const user: ComputedRef<any | null> = computed(() => store.getters.user);
  const userName: ComputedRef<string> = computed(
    () => store.getters.userData?.profile?.username || "",
  );
  const userData: ComputedRef<UserData | null> = computed(
    () => store.getters.userData,
  );
  const adminData: ComputedRef<AdminData | null> = computed(
    () => store.getters.adminData,
  );
  const loaded: ComputedRef<boolean> = computed(() => store.getters.loaded);
  const isActiveUser: ComputedRef<boolean> = computed(
    () => store.getters.userData?.user_active || false,
  );
  const error: ComputedRef<string | null> = computed(() => store.getters.error);
  const rankPoints: ComputedRef<number> = computed(
    () => store.getters.rankPoints,
  );
  const gold: ComputedRef<number> = computed(() => store.getters.gold);
  const isUserDataLoaded: ComputedRef<boolean> = computed(
    () => store.getters.isUserDataLoaded,
  );
  const hasPendingChanges: ComputedRef<boolean> = computed(
    () => store.getters.hasPendingChanges,
  );
  const logout = () => {
    store.dispatch("logout");
  };
  const setUser = (user: any | null) => {
    store.commit("SET_USER", user);
  };
  const setError = (error: string | null) => {
    store.commit("SET_ERROR", error);
  };
  const bindUserData = async (userId: string) => {
    await store.dispatch("bindUserData", userId);
  };
  const unbindUserData = async () => {
    await store.dispatch("unbindUserData");
  };
  const bindAdminData = async () => {
    await store.dispatch("bindAdminData");
  };
  const unbindAdminData = async () => {
    await store.dispatch("unbindAdminData");
  };
  const syncLeaderboardEntry = async () => {
    await store.dispatch("syncLeaderboardEntry");
  };
  const deleteUserData = async () => {
    await store.dispatch("deleteUserData");
  };

  // The only allowed path to persist game state - see CRITICAL note in
  // src/core/store/index.ts. Never write to Firestore directly.
  // Pass { immediate: true } for high-stakes actions (combat outcome, gold
  // spent/gained) so they don't sit in the batch window waiting to be flushed.
  const updateUserData = async (
    partialData: Partial<UserData>,
    options?: { immediate?: boolean },
  ) => {
    await store.dispatch("updateUserData", partialData);
    if (options?.immediate) {
      await store.dispatch("flushUserDataUpdates");
    }
  };
  const flushUserDataUpdates = async () => {
    await store.dispatch("flushUserDataUpdates");
  };

  return {
    user,
    userName,
    userData,
    adminData,
    loaded,
    isActiveUser,
    error,
    rankPoints,
    gold,
    isUserDataLoaded,
    hasPendingChanges,
    logout,
    setUser,
    deleteUserData,
    updateUserData,
    flushUserDataUpdates,
    bindUserData,
    unbindUserData,
    bindAdminData,
    unbindAdminData,
    syncLeaderboardEntry,
    setError,
  };
}
