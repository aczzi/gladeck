<template>
  <!-- How to Play Modal -->
  <div
    v-if="showHowToPlayModal"
    class="modal fade"
    :class="{ show: showHowToPlayModal, 'd-block': showHowToPlayModal }"
    tabindex="-1"
    @click="closeHowToPlayModalOnBackdrop"
  >
    <div class="modal-dialog modal-xl" @click.stop>
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="howToPlay" class="modal-title">Gladeck</h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="showHowToPlayModal = false"
          />
        </div>
        <div class="modal-body">
          <HowToPlay />
        </div>
      </div>
    </div>
  </div>
  <!-- Email Login Modal (global) -->
  <EmailLogin
    :show-email-modal="showEmailModal"
    :firebase-auth="firebaseAuth"
    @close="showEmailModal = false"
    @signed-in="
      () => {
        showEmailModal = false;
      }
    "
  />
  <!-- Error Alert -->
  <div
    v-if="error"
    class="container-fluid mt-3 position-fixed top-0 start-0 w-100"
    style="z-index: 2000"
  >
    <div class="row justify-content-center">
      <div class="col-md-8">
        <div class="alert alert-danger shadow-lg" role="alert">
          <h4 class="alert-heading">
            <i class="bi bi-exclamation-triangle-fill" />
            Access Restricted
          </h4>
          <p>{{ error }}</p>
        </div>
      </div>
    </div>
  </div>
  <!-- Connecting to Firebase -->
  <div
    v-if="!loaded"
    class="container-fluid d-flex justify-content-center align-items-center"
    style="min-height: 50vh"
  >
    <div class="text-center">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Loading game data...</p>
    </div>
  </div>
  <!-- Connected to Firebase -->
  <template v-if="loaded">
    <template v-if="adminData">
      <!-- Game is deactivated -->
      <div v-if="!adminData.active_game" class="container-fluid bg">
        <div class="welcome">
          <h1 class="gladiator">Gladeck</h1>
          <h3>The game is currently deactivated</h3>
          <p>{{ adminData.message }}</p>
        </div>
      </div>
      <!-- Game is activated -->
      <template v-if="adminData.active_game">
        <!-- Login page -->
        <div v-if="userData === null" class="container-fluid bg">
          <div class="welcome">
            <h1 class="gladiator">Gladeck</h1>
            <p>This game needs a user account to save progress.</p>
            <div
              class="d-flex flex-column flex-md-row gap-2 justify-content-center"
            >
              <button class="btn btn-outline-light btn-lg" @click="logIn()">
                <i class="bi bi-google" /> Google
              </button>
              <button
                class="btn btn-outline-light btn-lg"
                @click="showEmailModal = true"
              >
                <i class="bi bi-envelope-fill" /> Email
              </button>
            </div>
            <br />
            <a
              class="btn btn-outline-light btn-lg"
              @click="showHowToPlayModal = true"
            >
              <i class="bi bi-question-circle" /> What is this game about?
            </a>
            <br />
            <br />
            <h5>2026</h5>
          </div>
        </div>
        <!-- User authenticated -->
        <template v-if="userData !== null">
          <!-- Inactive user account message -->
          <div
            v-if="!isActiveUser"
            class="container-fluid d-flex justify-content-center align-items-center"
            style="min-height: 50vh"
          >
            <div class="text-center">
              <div class="spinner-border text-danger" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="mt-2">This account is not active.</p>
            </div>
          </div>
          <!-- User game -->
          <template v-if="isActiveUser">
            <nav class="navbar navbar-dark bg-info navbar-expand-lg sticky-top">
              <div class="container-fluid">
                <span class="navbar-brand gladiator"> Gladeck </span>
                <button
                  class="navbar-toggler"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#navbarNav"
                  aria-controls="navbarNav"
                  aria-expanded="false"
                  aria-label="Toggle navigation"
                >
                  <span class="navbar-toggler-icon" />
                </button>
                <div id="navbarNav" class="collapse navbar-collapse">
                  <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                      <a
                        class="nav-link btn"
                        @click="showLeaderboardModal = true"
                      >
                        <i class="bi bi-trophy-fill" /> Leaderboard
                      </a>
                    </li>
                    <li class="nav-item">
                      <a
                        class="nav-link btn"
                        @click="showHowToPlayModal = true"
                      >
                        <i class="bi bi-question-circle-fill" /> How to play
                      </a>
                    </li>
                    <li class="nav-item">
                      <a class="nav-link btn" @click="showUserModal = true">
                        <i class="bi bi-person-circle" /> Account
                      </a>
                    </li>
                    <li class="nav-item">
                      <a class="nav-link btn" @click="forceSave()">
                        <i v-if="isSaving" class="bi bi-check-circle" />
                        <i v-else class="bi bi-floppy2" />
                      </a>
                    </li>
                    <li class="nav-item">
                      <a
                        class="nav-link btn btn-danger"
                        @click="handleLogout()"
                      >
                        <i class="bi bi-box-arrow-right" />
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </nav>
            <TopInfo />
            <!-- Leaderboard Modal -->
            <div
              v-if="showLeaderboardModal"
              class="modal fade"
              :class="{
                show: showLeaderboardModal,
                'd-block': showLeaderboardModal,
              }"
              tabindex="-1"
              @click="closeLeaderboardModalOnBackdrop"
            >
              <div class="modal-dialog modal-xl" @click.stop>
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 id="leaderboardModalLabel" class="modal-title">
                      <i class="bi bi-trophy-fill" />
                      Leaderboard
                    </h5>
                    <button
                      type="button"
                      class="btn-close"
                      aria-label="Close"
                      @click="showLeaderboardModal = false"
                    />
                  </div>
                  <div class="modal-body">
                    <Leaderboard />
                  </div>
                </div>
              </div>
            </div>
            <!-- User Modal -->
            <div
              v-if="showUserModal"
              class="modal fade"
              :class="{ show: showUserModal, 'd-block': showUserModal }"
              tabindex="-1"
              @click="closeUserModalOnBackdrop"
            >
              <div class="modal-dialog modal-xl" @click.stop>
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 id="userModal" class="modal-title">
                      <i class="bi bi-person-circle" />
                      My account
                    </h5>
                    <button
                      type="button"
                      class="btn-close"
                      aria-label="Close"
                      @click="showUserModal = false"
                    />
                  </div>
                  <div class="modal-body">
                    <UserInfo />
                  </div>
                </div>
              </div>
            </div>
            <Camp />
          </template>
        </template>
      </template>
    </template>
  </template>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { doc, getDoc, setDoc } from "firebase/firestore";
import firebase from "firebase/compat/app";
import { db } from "@/core/firebase/store";

import TopInfo from "@/components/subComponents/TopInfo.vue";
import Camp from "@/components/Camp.vue";
import HowToPlay from "@/components/modals/HowToPlay.vue";
import Leaderboard from "@/components/modals/Leaderboard.vue";
import UserInfo from "@/components/modals/UserInfo.vue";
import EmailLogin from "@/components/modals/EmailLogin.vue";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

import {
  FirebaseCallTracker,
  firebaseConfig,
  validateFirebaseConfig,
  initializeFirebaseForEmulator,
} from "@/core/firebase/index";

import { isDevelopment } from "@/core/utils";
import { useGameStore } from "@/core/store/gameStore";
import { devLog } from "@/core/utils";
import { startUserData } from "@/core/game/gameRules";
import { markUserAsNew } from "@/core/store/index";
import {
  initializeSession,
  terminateSession,
} from "@/core/firebase/sessionManager";

// Firebase Setup
const googleProvider = new GoogleAuthProvider();
const firebaseApp = firebase.initializeApp(firebaseConfig);

if (isDevelopment) {
  validateFirebaseConfig();
  initializeFirebaseForEmulator(firebaseApp);
}

const firebaseAuth: Auth = getAuth(firebaseApp);

const {
  isActiveUser,
  userData,
  adminData,
  loaded,
  error,
  setUser,
  logout,
  bindAdminData,
  bindUserData,
  unbindUserData,
  setError,
  flushUserDataUpdates,
} = useGameStore();

const isAuthenticated = computed(() => {
  return isActiveUser.value && userData.value;
});

// Modal states
const showUserModal = ref<boolean>(false);
const showHowToPlayModal = ref<boolean>(false);
const showLeaderboardModal = ref<boolean>(false);
const showEmailModal = ref<boolean>(false);

// Save indicator state
const isSaving = ref<boolean>(false);

// Admin access control
const checkAdminAccess = async (): Promise<boolean> => {
  try {
    const adminDocRef = doc(db, "admin", "configuration");
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Admin service timeout")), 3000);
    });

    const docPromise = getDoc(adminDocRef);
    const docSnapshot = await Promise.race([docPromise, timeoutPromise]);
    devLog(
      "Admin service is accessible - document exists:",
      docSnapshot.exists(),
    );
    return true;
  } catch (error) {
    devLog("Admin service is inaccessible:", error);
    return false;
  }
};

const closeUserModalOnBackdrop = (event: Event) => {
  if (event.target === event.currentTarget) {
    showUserModal.value = false;
  }
};

const closeHowToPlayModalOnBackdrop = (event: Event) => {
  if (event.target === event.currentTarget) {
    showHowToPlayModal.value = false;
  }
};

const closeLeaderboardModalOnBackdrop = (event: Event) => {
  if (event.target === event.currentTarget) {
    showLeaderboardModal.value = false;
  }
};

const handleEscapeKey = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    if (showUserModal.value) {
      showUserModal.value = false;
    } else if (showHowToPlayModal.value) {
      showHowToPlayModal.value = false;
    } else if (showLeaderboardModal.value) {
      showLeaderboardModal.value = false;
    }
  }
};

const setupFirebaseTracking = () => {
  FirebaseCallTracker.setActivityCallback((type: string) => {
    if (type === "write" || type === "delete") {
      isSaving.value = true;
      setTimeout(() => {
        isSaving.value = false;
      }, 1000);
    }
  });
};

const forceSave = async () => {
  try {
    isSaving.value = true;
    await flushUserDataUpdates();
  } catch (error) {
    console.error("Error during manual save:", error);
  } finally {
    isSaving.value = false;
  }
};

const createUserIfNotExists = async (uid: string): Promise<boolean> => {
  try {
    const userDocRef = doc(db, "users", uid);
    FirebaseCallTracker.track("read", "getDoc user check");
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      const isAdminAccessible = await checkAdminAccess();

      if (isAdminAccessible) {
        devLog("Creating new user document (admin service accessible):", uid);
        await setDoc(userDocRef, startUserData);
        FirebaseCallTracker.track("write", "setDoc new user");
        devLog("New user created in Firebase:", uid);

        const verifySnap = await getDoc(userDocRef);
        if (!verifySnap.exists()) {
          throw new Error("Failed to create user document");
        }
        devLog("User document verified:", uid);
        return true;
      } else {
        devLog("New user creation denied (admin service inaccessible):", uid);
        throw new Error("New user registration is temporarily disabled");
      }
    }

    devLog("Existing user found:", uid);
    return false;
  } catch (error) {
    console.error("Error creating/checking user:", error);
    throw error;
  }
};

const handleLogout = async (): Promise<void> => {
  try {
    isSaving.value = true;
    await flushUserDataUpdates();

    const user = firebaseAuth.currentUser;
    if (user) {
      await terminateSession(user.uid);
    }

    isSaving.value = false;

    await unbindUserData();
    await signOut(firebaseAuth);
    logout();
  } catch (error: any) {
    isSaving.value = false;
    console.error("Error signing out:", error);
    setError("Failed to logout");
  }
};

const logIn = async (): Promise<void> => {
  try {
    setError(null);
    await signInWithPopup(firebaseAuth, googleProvider);
  } catch (error: any) {
    if (error.code === "auth/api-key-not-valid") {
      setError("Incorrect API configuration");
    } else if (error.code === "auth/popup-blocked") {
      setError("Popup blocked - allow popups for this site");
    } else if (error.code === "auth/popup-closed-by-user") {
      setError("Login cancelled by user");
    } else {
      console.error("Failed to login:", error);
      setError("Failed to login: " + error);
    }
  }
};

onMounted((): void => {
  document.title = "Gladeck";

  setupFirebaseTracking();

  const handleBeforeUnload = async () => {
    if (isAuthenticated.value) {
      try {
        isSaving.value = true;
        await flushUserDataUpdates();
        isSaving.value = false;
      } catch (error) {
        isSaving.value = false;
        console.error("Error flushing updates before page unload:", error);
      }
    }
  };

  const handleVisibilityChange = async () => {
    if (document.visibilityState === "hidden" && isAuthenticated.value) {
      try {
        isSaving.value = true;
        await flushUserDataUpdates();
        isSaving.value = false;
      } catch (error) {
        isSaving.value = false;
        console.error("Error flushing updates on visibility change:", error);
        setError("Error flushing updates on visibility change: " + error);
      }
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("keydown", handleEscapeKey);

  watch(
    () => adminData.value?.active_game,
    async (newActiveGame, oldActiveGame) => {
      if (oldActiveGame === true && newActiveGame === false) {
        devLog("Game deactivated, purging user data");
        try {
          if (isAuthenticated.value) {
            await handleLogout();
          }
        } catch (error) {
          console.error("Error during forced logout:", error);
          setError("Error during forced logout: " + error);
        }
      }

      if (oldActiveGame === false && newActiveGame === true) {
        devLog("Game reactivated, forcing page refresh for new version");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    },
  );

  onAuthStateChanged(firebaseAuth, async (user: User | null) => {
    await bindAdminData();
    if (user) {
      setUser(user);
      setError(null);
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const isAdminAccessible = await checkAdminAccess();

          if (isAdminAccessible) {
            devLog("Existing user access granted:", user.uid);
            await bindUserData(user.uid);
            await initializeSession(user.uid, async () => {
              devLog("Kicked out by another session");
              setError(
                "Your account is being used in another window/device. You have been logged out.",
              );
              await handleLogout();
            });
          } else {
            devLog(
              "Existing user access denied (admin service inaccessible):",
              user.uid,
            );
            setError("User data access is temporarily unavailable");
            return;
          }
        } else {
          const isNewUser = await createUserIfNotExists(user.uid);

          if (isNewUser) {
            devLog("New user created, marking for immediate sync");
            markUserAsNew();
            await new Promise((resolve) => setTimeout(resolve, 100));

            await bindUserData(user.uid);

            await initializeSession(user.uid, async () => {
              devLog("Kicked out by another session");
              setError(
                "Your account is being used in another window/device. You have been logged out.",
              );
              await handleLogout();
            });
          }
        }
      } catch (error: any) {
        console.error("Failed to load user data", error);
        setError(error.message || "Failed to load user data");
      }
    } else {
      // Firebase itself reports the user as signed out - this can happen
      // outside our own handleLogout() flow (token expiry/revocation,
      // cleared storage, etc). Try one last flush while a user is still on
      // hand to attribute the write to, before clearing it: setUser(null)
      // otherwise stops the periodic timer and discards anything still
      // batched without ever attempting to save it.
      try {
        await flushUserDataUpdates();
      } catch (flushError) {
        console.error(
          "Error flushing updates before clearing signed-out user:",
          flushError,
        );
      }
      setUser(null);
    }
  });

  onUnmounted(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("keydown", handleEscapeKey);
  });
});

onUnmounted(async (): Promise<void> => {
  try {
    isSaving.value = true;
    await flushUserDataUpdates();
    isSaving.value = false;
  } catch (error) {
    isSaving.value = false;
    console.error("Error flushing updates on unmount:", error);
  }

  if (isAuthenticated.value) {
    await unbindUserData();
  }
});
</script>
