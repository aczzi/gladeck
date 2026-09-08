import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { firebaseConfig } from "./index";
import { isDevelopment, useEmulator } from "@/core/utils";

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Connect to emulator if in development mode
if (useEmulator && isDevelopment) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
  } catch (error) {
    console.warn("Firestore emulator already connected:", error);
  }
}

export { app };
