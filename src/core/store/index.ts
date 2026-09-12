import { devLog, devError, devWarn } from "@/core/utils";
import { createStore } from "vuex";
import { db } from "@/core/firebase/store";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type { UserData, AdminData } from "@/core/game/types";
import { gladiatorSellValue } from "@/core/game/gameRules";
import {
  isSessionAlive,
  onSessionInvalidated,
  setUpdateUserDataCallback,
  setFlushBeforeInvalidationCallback,
} from "@/core/firebase/sessionManager";

// Keep the two listeners independent: binding user data must never orphan the
// admin listener (and vice versa).
let unsubscribeUserData: Unsubscribe | null = null;
let unsubscribeAdminData: Unsubscribe | null = null;

const UPDATE_DELAY_MS = 25000; // 25 seconds

// Accumulator for batched updates with timing.
// CRITICAL: this is the only path allowed to write to Firestore - never call
// updateDoc()/setDoc() directly from a component or service.
let updateAccumulator: Partial<UserData> = {};
let updateTimer: NodeJS.Timeout | null = null;
let storeCommitFunction: any = null;
let storeGettersFunction: any = null;
let isNewUser: boolean = false;
let canCommitUpdates: boolean = true;
let commitPromise: Promise<void> | null = null;

const hasAccumulatedUpdates = () => Object.keys(updateAccumulator).length > 0;

const buildLeaderboardEntry = (userData: UserData) => ({
  username: userData.profile.username,
  rankPoints: userData.profile.rankPoints,
  rosterValue: Object.values(userData.gladiators).reduce(
    (sum, gladiator) =>
      sum + gladiatorSellValue(gladiator.stats, gladiator.battlesFought || 0),
    0,
  ),
  updatedAt: serverTimestamp(),
});

// Drain accumulated updates through one serialized writer. A batch is detached
// before awaiting Firestore so changes arriving during the request remain in
// the accumulator for the next loop iteration.
const drainAccumulatedUpdates = async () => {
  while (hasAccumulatedUpdates()) {
    if (!canCommitUpdates) {
      throw new Error("Session invalidated - update remains pending");
    }

    if (!isSessionAlive()) {
      throw new Error("Session not alive - update remains pending");
    }

    devLog(
      `Firebase update is triggered`,
      Object.keys(updateAccumulator).length,
      "key object accumulated",
    );

    const user = storeGettersFunction?.user;
    if (!user || !user.uid) {
      throw new Error("No user authenticated - update remains pending");
    }

    const pendingBatch = updateAccumulator;
    updateAccumulator = {};
    const userDocRef = doc(db, "users", user.uid);
    try {
      const updatesLeaderboard =
        "profile" in pendingBatch || "gladiators" in pendingBatch;
      const currentUserData = storeGettersFunction?.userData as UserData | null;

      if (updatesLeaderboard && currentUserData) {
        const batch = writeBatch(db);
        batch.update(userDocRef, pendingBatch);
        batch.set(
          doc(db, "leaderboard", user.uid),
          buildLeaderboardEntry(currentUserData),
        );
        await batch.commit();
      } else {
        await updateDoc(userDocRef, pendingBatch);
      }
    } catch (error) {
      // Newer local values win when restoring the failed batch.
      updateAccumulator = { ...pendingBatch, ...updateAccumulator };
      storeCommitFunction?.("SET_PENDING_CHANGES", true);
      throw error;
    }
  }

  storeCommitFunction?.("SET_PENDING_CHANGES", false);
};

const commitAccumulatedUpdates = (): Promise<void> => {
  if (!commitPromise) {
    commitPromise = drainAccumulatedUpdates()
      .catch((error) => {
        devError("Error committing accumulated updates:", error);
        storeCommitFunction?.(
          "SET_ERROR",
          `Failed to commit user data updates:\n${error}`,
        );
        throw error;
      })
      .finally(() => {
        commitPromise = null;
      });
  }
  return commitPromise;
};

// Start the periodic timer for automatic updates
const startPeriodicUpdates = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
  }

  canCommitUpdates = true;
  updateTimer = setInterval(() => {
    void commitAccumulatedUpdates().catch(() => {
      // The accumulator is preserved and the next interval will retry it.
    });
  }, UPDATE_DELAY_MS);
  devLog(`Periodic updates started every ${UPDATE_DELAY_MS / 1000}s`);
};

// Stop the periodic timer
const stopPeriodicUpdates = (discardPending = false) => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
    devLog("Periodic updates stopped");
  }
  canCommitUpdates = false;
  if (discardPending && hasAccumulatedUpdates()) {
    devWarn(
      `Discarding ${Object.keys(updateAccumulator).length} pending updates`,
    );
    updateAccumulator = {};
    storeCommitFunction?.("SET_PENDING_CHANGES", false);
  }
};

const restartPeriodicUpdates = () => {
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = null;
  startPeriodicUpdates();
};

// Mark user as newly created (forces immediate sync for first updates)
export const markUserAsNew = () => {
  isNewUser = true;
  devLog("User marked as new - first updates will be immediate");
};

const resetNewUserFlag = () => {
  if (isNewUser) {
    isNewUser = false;
    devLog("New user flag reset - returning to normal batch updates");
  }
};

// State interface
export interface RootState {
  user: any;
  gameState: {
    loaded: boolean;
    error: string | null;
    hasPendingChanges: boolean;
  };
  userData: UserData | null;
  adminData: AdminData | null;
}

const initialState: RootState = {
  user: null,
  gameState: {
    loaded: true,
    error: null,
    hasPendingChanges: false,
  },
  userData: null,
  adminData: null,
};

export default createStore({
  state: initialState,

  mutations: {
    SET_USER(state: RootState, user: any | null) {
      state.user = user;

      if (user && !updateTimer) {
        startPeriodicUpdates();
      }
      if (!user && updateTimer) {
        stopPeriodicUpdates(true);
      }
    },

    SET_LOADED(state: RootState, loaded: boolean) {
      state.gameState.loaded = loaded;
    },

    SET_ERROR(state: RootState, error: string | null) {
      state.gameState.error = error;
    },

    SET_PENDING_CHANGES(state: RootState, hasPendingChanges: boolean) {
      state.gameState.hasPendingChanges = hasPendingChanges;
    },

    SET_USERDATA(state: RootState, userData: UserData | any) {
      state.userData = userData;
    },

    SET_ADMIN_DATA(state: RootState, adminData: AdminData | any) {
      state.adminData = adminData;
    },

    CLEAR_USER_DATA(state: RootState) {
      state.user = null;
      state.userData = null;
      state.gameState = {
        loaded: false,
        error: null,
        hasPendingChanges: false,
      };
      stopPeriodicUpdates(true);
      updateAccumulator = {};
    },
  },

  actions: {
    // Initialize store references for global timer
    initStore({ commit, getters, dispatch }: any) {
      storeCommitFunction = commit;
      storeGettersFunction = getters;

      onSessionInvalidated(() => {
        devWarn("Session invalidated - stopping all updates");
        stopPeriodicUpdates(true);
      });

      setUpdateUserDataCallback(async (data: any) => {
        await dispatch("updateUserData", data);
      });

      setFlushBeforeInvalidationCallback(async () => {
        await dispatch("flushUserDataUpdates");
      });

      devLog("Store initialized with all callbacks");
    },

    async logout({ commit, dispatch }: any) {
      try {
        await dispatch("flushUserDataUpdates");
      } catch (error) {
        devError("Error flushing updates during logout:", error);
      }
      commit("CLEAR_USER_DATA");
    },

    bindAdminData({ commit }: any) {
      return new Promise((resolve, reject) => {
        try {
          commit("SET_LOADED", false);
          devLog("Binding admin data");
          unsubscribeAdminData?.();
          unsubscribeAdminData = null;
          const userDocRef = doc(db, "admin", "configuration");

          const timeout = setTimeout(() => {
            devError("Timeout waiting for admin data");
            commit("SET_ERROR", "Timeout loading admin data");
            commit("SET_LOADED", true);
            reject(new Error("Timeout loading admin data"));
          }, 10000);

          unsubscribeAdminData = onSnapshot(
            userDocRef,
            (docSnapshot) => {
              clearTimeout(timeout);

              if (docSnapshot.exists()) {
                const adminData = docSnapshot.data() as AdminData;
                devLog("Admin data loaded successfully");
                commit("SET_ADMIN_DATA", adminData);
                commit("SET_LOADED", true);
                resolve(adminData);
              } else {
                devError("Admin data does not exist");
                commit("SET_ERROR", "Admin data not found");
                commit("SET_ADMIN_DATA", null);
                commit("SET_LOADED", true);
                reject(new Error("Admin data not found"));
              }
            },
            (error) => {
              clearTimeout(timeout);
              devError("Error listening to admin data:", error);
              commit("SET_ERROR", "Failed to load admin data");
              commit("SET_LOADED", true);
              reject(error);
            },
          );
        } catch (error) {
          commit("SET_ERROR", "Failed to bind user data");
          commit("SET_LOADED", true);
          reject(error);
        }
      });
    },

    bindUserData({ commit }: any, userId: string) {
      return new Promise((resolve, reject) => {
        try {
          commit("SET_LOADED", false);
          devLog("Binding user data for:", userId);
          unsubscribeUserData?.();
          unsubscribeUserData = null;

          const userDocRef = doc(db, "users", userId);

          const timeout = setTimeout(() => {
            devError("Timeout waiting for user data");
            commit("SET_ERROR", "Timeout loading user data");
            commit("SET_LOADED", true);
            reject(new Error("Timeout loading user data"));
          }, 10000);

          unsubscribeUserData = onSnapshot(
            userDocRef,
            (docSnapshot) => {
              clearTimeout(timeout);

              if (docSnapshot.exists()) {
                const userData = docSnapshot.data() as UserData;
                devLog("User data loaded successfully:", userId);
                // Re-apply any still-unflushed local changes on top of this
                // snapshot: it may be an echo of an earlier write that
                // predates a change already accumulated but not yet sent to
                // Firestore, and a bare overwrite would otherwise revert the
                // UI (and any update built next would use that stale base).
                const merged =
                  Object.keys(updateAccumulator).length > 0
                    ? { ...userData, ...updateAccumulator }
                    : userData;
                commit("SET_USERDATA", merged);
                commit("SET_LOADED", true);
                resolve(userData);
              } else {
                devError("User document does not exist:", userId);
                commit("SET_USERDATA", null);
                commit("SET_LOADED", true);
                resolve(null);
              }
            },
            (error) => {
              clearTimeout(timeout);
              devError("Error listening to user data:", error);
              commit("SET_ERROR", "Failed to load user data");
              commit("SET_LOADED", true);
              reject(error);
            },
          );
        } catch (error) {
          commit("SET_ERROR", "Failed to bind user data");
          commit("SET_LOADED", true);
          reject(error);
        }
      });
    },

    async unbindUserData({ commit, dispatch }: any) {
      if (hasAccumulatedUpdates()) {
        await dispatch("flushUserDataUpdates");
      }

      if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
      }

      stopPeriodicUpdates();

      commit("SET_USERDATA", null);
    },

    unbindAdminData({ commit }: any) {
      unsubscribeAdminData?.();
      unsubscribeAdminData = null;
      commit("SET_ADMIN_DATA", null);
    },

    async syncLeaderboardEntry({ getters }: any) {
      const user = getters.user;
      const userData = getters.userData as UserData | null;
      if (!user?.uid || !userData) return;
      await setDoc(
        doc(db, "leaderboard", user.uid),
        buildLeaderboardEntry(userData),
      );
    },

    async deleteUserData({ commit, dispatch, getters }: any) {
      const user = getters.user;
      if (!user || !user.uid) {
        throw new Error("No user authenticated");
      }
      try {
        commit("SET_LOADED", false);
        await dispatch("unbindUserData");
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", user.uid));
        batch.delete(doc(db, "leaderboard", user.uid));
        await batch.commit();
        commit("SET_USERDATA", null);
        commit("SET_USER", null);
      } catch (error) {
        devError("Error deleting user data:", error);
        commit("SET_ERROR", "Failed to delete user data");
        throw error;
      } finally {
        commit("SET_LOADED", true);
      }
    },

    // Update user data partially in Firestore
    async updateUserData(
      { commit, getters }: any,
      partialData: Partial<UserData>,
    ) {
      const user = getters.user;
      if (!user || !user.uid) {
        throw new Error("No user authenticated");
      }

      if (!canCommitUpdates || !isSessionAlive()) {
        devWarn("Session invalid - rejecting update");
        return;
      }

      try {
        if (!storeCommitFunction) {
          storeCommitFunction = commit;
          storeGettersFunction = getters;
        }

        const currentUserData = getters.userData;
        if (currentUserData) {
          const updatedUserData = { ...currentUserData, ...partialData };
          commit("SET_USERDATA", updatedUserData);
        }

        updateAccumulator = { ...updateAccumulator, ...partialData };

        commit("SET_PENDING_CHANGES", true);

        devLog(
          "Data accumulated for next periodic update:",
          Object.keys(partialData),
        );
        if (isNewUser) {
          devLog("New user detected - forcing immediate sync");
          await commitAccumulatedUpdates();
          resetNewUserFlag();
        }
      } catch (error) {
        devError("Error updating user data:", error);
        commit("SET_ERROR", "Failed to update user data");
        throw error;
      }
    },

    async flushUserDataUpdates({ getters, commit }: any) {
      const user = getters.user;
      if (!user || !user.uid) {
        return;
      }

      try {
        if (!storeCommitFunction) {
          storeCommitFunction = commit;
          storeGettersFunction = getters;
        }

        await commitAccumulatedUpdates();

        restartPeriodicUpdates();

        devLog("Forced update completed, timer reset");
      } catch (error) {
        devError("Error flushing user data updates:", error);
        commit("SET_ERROR", "Failed to flush user data updates");
        throw error;
      }
    },
  },

  getters: {
    user: (state: RootState) => state.user,
    userData: (state: RootState) => state.userData,
    adminData: (state: RootState) => state.adminData,

    isUserDataLoaded: (state: RootState) => {
      return !!(
        state.userData &&
        state.userData?.buildings &&
        state.userData?.profile
      );
    },
    loaded: (state: RootState) => state.gameState.loaded,
    error: (state: RootState) => state.gameState.error,
    hasPendingChanges: (state: RootState) => state.gameState.hasPendingChanges,
    rankPoints: (state: RootState) => state.userData?.profile?.rankPoints || 0,
    gold: (state: RootState) => state.userData?.profile?.gold || 0,
  },
});
