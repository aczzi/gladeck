import {
  devLog,
  devError,
  devGroup,
  devWarn,
  devGroupEnd,
  isDevelopment,
  useEmulator,
} from "@/core/utils";

interface FirebaseCallStats {
  reads: number;
  writes: number;
  deletes: number;
  listeners: number;
  lastActivity: Date;
}

const firebaseCallStats: FirebaseCallStats = {
  reads: 0,
  writes: 0,
  deletes: 0,
  listeners: 0,
  lastActivity: new Date(),
};

// Firebase call logging system
export const FirebaseCallTracker = {
  onActivityCallback: null as
    | ((type: string, operation?: string) => void)
    | null,

  // Set callback for UI updates
  setActivityCallback(callback: (type: string, operation?: string) => void) {
    this.onActivityCallback = callback;
  },

  // Increment a call type
  track(type: "read" | "write" | "delete" | "listener", operation?: string) {
    if (!useEmulator) return; // Only in emulator mode

    switch (type) {
      case "read":
        firebaseCallStats.reads++;
        break;
      case "write":
        firebaseCallStats.writes++;
        if (this.onActivityCallback) {
          this.onActivityCallback(type, operation);
        }
        break;
      case "delete":
        firebaseCallStats.deletes++;
        if (this.onActivityCallback) {
          this.onActivityCallback(type, operation);
        }
        break;
      case "listener":
        firebaseCallStats.listeners++;
        break;
    }

    const operationText = operation ? ` (${operation})` : "";
    devLog(
      `Firebase ${type.toUpperCase()}${operationText} - Total: R:${firebaseCallStats.reads} W:${firebaseCallStats.writes} D:${firebaseCallStats.deletes} L:${firebaseCallStats.listeners} since ${firebaseCallStats.lastActivity.toISOString()}`,
    );
  },
};

export const firebaseConfig = {
  projectId: "gladeck-2000",
  appId: "1:482655840297:web:cfacbef49991aa65e0d438",
  storageBucket: "gladeck-2000.firebasestorage.app",
  apiKey: "AIzaSyDfIZstCEjDbY74kXHXhW62UoLKV4jpGfs",
  authDomain: "gladeck-2000.firebaseapp.com",
  messagingSenderId: "482655840297",
  projectNumber: "482655840297",
  version: "2",
};

import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import firebase from "firebase/compat/app";

let emulatorInitialized = false;

export const initializeFirebaseForEmulator = (app: firebase.app.App) => {
  devLog("Initializing Firebase...");
  devLog("Configuration:", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    isDevelopment,
    useEmulator,
  });

  if (useEmulator && !emulatorInitialized) {
    devLog("Development mode: using Firestore Emulator");
    devLog("Auth: using Firebase Cloud (real authentication)");

    const firestore = getFirestore(app);

    try {
      connectFirestoreEmulator(firestore, "localhost", 8080);
      devLog("Firestore Emulator connected");
      emulatorInitialized = true;
    } catch (error) {
      devWarn("Firestore Emulator already initialized:", error);
    }
  } else if (!useEmulator) {
    devLog("Production mode: using Firebase Cloud (Auth + Firestore)");
  }
};

export const getFirebaseMode = () => {
  return useEmulator ? "emulator" : "production";
};

export const validateFirebaseConfig = () => {
  devGroup("Firebase configuration validation");
  const checks = {
    apiKey: !!firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith("AIza"),
    authDomain:
      !!firebaseConfig.authDomain &&
      firebaseConfig.authDomain.includes("firebase"),
    projectId: !!firebaseConfig.projectId,
    storageBucket: !!firebaseConfig.storageBucket,
    messagingSenderId: !!firebaseConfig.messagingSenderId,
  };

  Object.entries(checks).forEach(([key, isValid]) => {
    const status = isValid ? "OK" : "MISSING";
    const value = (firebaseConfig as any)[key] || "MISSING";
    devLog(`${status} ${key}:`, value);
  });

  const isValid = Object.values(checks).every(Boolean);

  if (isValid) {
    devLog("Valid Firebase configuration");
  } else {
    devError("Incomplete or invalid Firebase configuration");
    devLog("Check your Firebase Console: https://console.firebase.google.com/");
  }

  devGroupEnd();
  return isValid;
};

export const FirebaseDebugger = {
  getStatus() {
    return {
      isDevelopment,
      useEmulator,
      mode: getFirebaseMode(),
      callStats: null,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        // @ts-expect-error - Vite env vars
        DEV: import.meta.env?.DEV,
        // @ts-expect-error - Vite env vars
        VITE_USE_EMULATOR: import.meta.env?.VITE_USE_EMULATOR,
      },
    };
  },

  logStatus() {
    const status = this.getStatus();
    devGroup("Firebase Configuration Status");
    devLog("Current mode:", status.mode);
    devLog("isDevelopment:", status.isDevelopment);
    devLog("useEmulator:", status.useEmulator);
    devLog("Environment variables:", status.env);

    if (status.callStats) {
      devLog("Call Stats:", status.callStats);
    }

    devGroupEnd();
    return status;
  },
};

// Export for use in browser console
if (typeof window !== "undefined") {
  (window as any).FirebaseDebugger = FirebaseDebugger;
  (window as any).FirebaseCallTracker = FirebaseCallTracker;
}
