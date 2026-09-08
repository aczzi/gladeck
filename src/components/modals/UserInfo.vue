<template>
  <div v-show="isAuthenticated" class="container-fluid">
    <ul class="list-group">
      <li class="list-group-item">Email: {{ user.email }}</li>
      <li class="list-group-item">UID: {{ user.uid }}</li>
      <li class="list-group-item">
        Status: {{ isActiveUser ? "Active" : "Inactive" }}
      </li>
      <li class="list-group-item">Rank points: {{ rankPoints }}</li>
      <li class="list-group-item">Gold: {{ gold }}</li>
      <li class="list-group-item">
        <div class="row g-3 align-items-center">
          <div class="col-auto">Username:</div>
          <div class="col-auto">
            <input
              v-model="usernameInput"
              class="form-control"
              placeholder="Enter your username"
              @keyup.enter="saveUsername"
            />
          </div>
          <div class="col-auto">
            <button
              class="btn btn-primary"
              :disabled="!hasUsernameChanged"
              type="button"
              @click="saveUsername"
            >
              Save
            </button>
          </div>
        </div>
      </li>
      <li class="list-group-item">
        <div class="row g-3 align-items-center">
          <div class="col-auto">Delete my account and my game:</div>
          <div class="col-auto">
            <input
              id="deleteInput"
              class="form-control"
              placeholder="Type DELETE"
              autocomplete="off"
              @input="getDelete"
            />
          </div>
          <div class="col-auto">
            <span class="form-text">
              <button
                v-show="userDelete"
                class="btn btn-outline-danger"
                type="button"
                @click="deleteAccount"
              >
                Confirm
              </button>
            </span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import firebase from "firebase/compat/app";
import { signOut, getAuth } from "firebase/auth";
import { useGameStore } from "@/core/store/gameStore";
import { firebaseConfig } from "@/core/firebase/index";

const firebaseApp = firebase.apps.length
  ? firebase.app()
  : firebase.initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

const {
  user,
  userName,
  isActiveUser,
  userData,
  rankPoints,
  gold,
  logout,
  deleteUserData,
  updateUserData,
} = useGameStore();

const isAuthenticated = computed(() => {
  return isActiveUser.value && userData.value;
});

const userDelete = ref<boolean>(false);
const usernameInput = ref<string>("");

if (userName.value) {
  usernameInput.value = userName.value;
}

const hasUsernameChanged = computed(() => {
  return (
    usernameInput.value.trim() !== (userName.value || "") &&
    usernameInput.value.trim() !== ""
  );
});

const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), wait);
  };
};

const deleteAccount = async (): Promise<void> => {
  try {
    await deleteUserData();
    await firebaseAuth.currentUser?.delete();
    logout();
    await signOut(firebaseAuth);
  } catch (error) {
    console.error("Error deleting account:", error);
  }
};

const saveUsername = async (): Promise<void> => {
  const username = usernameInput.value.trim();
  if (username && username !== userName.value && userData.value) {
    try {
      await updateUserData({
        profile: { ...userData.value.profile, username },
      });
      console.log("Username updated successfully");
    } catch (error) {
      console.error("Error updating username:", error);
    }
  }
};

const getDelete = debounce((event: Event): void => {
  const target = event.target as HTMLInputElement;
  const isDeleteConfirm = target.value.toLowerCase() === "delete";
  userDelete.value = isDeleteConfirm;
}, 100);
</script>
