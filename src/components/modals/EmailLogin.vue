<template>
  <div
    v-if="showEmailModal"
    class="modal fade"
    :class="{ show: showEmailModal, 'd-block': showEmailModal }"
    tabindex="-1"
    @click="closeOnBackdrop"
  >
    <div class="modal-dialog" @click.stop>
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sign in with Email</h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="close"
          />
        </div>
        <div class="modal-body">
          <form @submit.prevent="createOrLogin">
            <div class="mb-3">
              <label for="email" class="form-label">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                class="form-control"
                placeholder="you@example.com"
                required
              />
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                class="form-control"
                minlength="6"
                required
              />
            </div>
            <div class="mb-3">
              <button class="btn btn-success m-2" type="submit">Sign in</button>
              <button class="btn btn-primary m-2" @click="onResetPassword">
                Forgot password?
              </button>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <div v-if="success" class="text-success">
            {{ success }}
          </div>
          <div v-else-if="error" class="text-danger">
            {{ error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  type Auth,
} from "firebase/auth";

const props = defineProps<{ showEmailModal: boolean; firebaseAuth: Auth }>();
const emits = defineEmits(["close", "signed-in"]);

const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const success = ref<string | null>(null);

const close = () => {
  error.value = null;
  emits("close");
};

const closeOnBackdrop = (e: Event) => {
  if (e.target === e.currentTarget) close();
};

// Sign in, or create the account on first attempt.
const createOrLogin = async () => {
  error.value = null;
  try {
    await signInWithEmailAndPassword(
      props.firebaseAuth,
      email.value,
      password.value,
    );
    emits("signed-in");
    close();
  } catch (err: any) {
    if (
      err.code === "auth/user-not-found" ||
      err.code === "auth/invalid-credential"
    ) {
      try {
        await createUserWithEmailAndPassword(
          props.firebaseAuth,
          email.value,
          password.value,
        );
        emits("signed-in");
        close();
      } catch (createErr: any) {
        console.error("Error creating account:", createErr);
        error.value = createErr.message || "Failed to create account";
      }
    } else {
      console.error("Error signing in with email:", err);
      error.value = err.message || "Failed to sign in";
    }
  }
};

const onResetPassword = async () => {
  error.value = null;
  success.value = null;
  try {
    const targetEmail = email.value.trim();
    if (!targetEmail) {
      error.value = "Email is required for password reset";
      return;
    }
    await sendPasswordResetEmail(props.firebaseAuth, targetEmail);
    success.value = "Password reset email sent. Check your inbox.";
  } catch (err: any) {
    console.error("Error sending password reset email:", err);
    error.value = err.message || "Failed to send password reset email";
  }
};
</script>
