import {
  doc,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./store";
import { devLog, devError, devWarn } from "@/core/utils";

interface SessionData {
  sessionId: string;
  lastHeartbeat: Timestamp;
  userAgent: string;
}

let sessionId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let sessionListener: Unsubscribe | null = null;
let isSessionActive = true;
let onSessionInvalidatedCallback: (() => void) | null = null;
let updateUserDataCallback: ((data: any) => Promise<void>) | null = null;
let flushBeforeInvalidationCallback: (() => Promise<void>) | null = null;

// Generate unique session ID
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

// Get browser user agent for session identification
const getUserAgent = (): string => {
  return navigator.userAgent.substring(0, 100); // Limit to 100 chars
};

// Set the updateUserData callback from the store
export const setUpdateUserDataCallback = (
  callback: (data: any) => Promise<void>,
): void => {
  updateUserDataCallback = callback;
  devLog("UpdateUserData callback registered for sessionManager");
};

// Set the callback used to flush any pending accumulated changes one last
// time, while this session can still write, right before it gets torn down
// by a conflict. Without this, unsaved progress (gold, combat outcomes,
// training) is silently discarded the moment another tab/device signs in -
// see the stopPeriodicUpdates() discard path in store/index.ts.
export const setFlushBeforeInvalidationCallback = (
  callback: () => Promise<void>,
): void => {
  flushBeforeInvalidationCallback = callback;
};

// Initialize session for a user
export const initializeSession = async (
  userId: string,
  onKickedOut: () => void,
): Promise<void> => {
  try {
    if (!updateUserDataCallback) {
      devError("UpdateUserData callback not set - waiting 100ms and retrying");
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!updateUserDataCallback) {
        throw new Error(
          "UpdateUserData callback not set after retry. Call setUpdateUserDataCallback first.",
        );
      }
    }

    sessionId = generateSessionId();
    isSessionActive = true;

    devLog(`Initializing session: ${sessionId} for user: ${userId}`);
    const sessionData: SessionData = {
      sessionId,
      lastHeartbeat: Timestamp.now(),
      userAgent: getUserAgent(),
    };

    await updateUserDataCallback({
      session: {
        currentSession: sessionData,
      },
    });
    startHeartbeat();
    listenForSessionConflicts(userId, onKickedOut);
    devLog("Session initialized successfully");
  } catch (error) {
    devError("Error initializing session:", error);
    throw error;
  }
};

// Start heartbeat interval
const startHeartbeat = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(async () => {
    if (!isSessionActive || !sessionId || !updateUserDataCallback) return;

    try {
      await updateUserDataCallback({
        session: {
          currentSession: {
            sessionId,
            lastHeartbeat: Timestamp.now(),
            userAgent: getUserAgent(),
          },
        },
      });

      devLog("Session heartbeat sent");
    } catch (error) {
      devWarn("Failed to send heartbeat:", error);
    }
  }, 10000); // Every 10 seconds
};

// Listen for session conflicts (another session taking over)
const listenForSessionConflicts = (
  userId: string,
  onKickedOut: () => void,
): void => {
  const userDocRef = doc(db, "users", userId);
  let isFirstSnapshot = true;

  sessionListener = onSnapshot(
    userDocRef,
    (docSnapshot) => {
      if (!docSnapshot.exists()) return;

      const userData = docSnapshot.data();
      const currentSession = userData?.session?.currentSession as
        | SessionData
        | undefined;

      // Skip the first snapshot (initial load)
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        devLog("First snapshot - skipping conflict check");
        return;
      }

      if (!currentSession) {
        devWarn("Session cleared remotely");
        return;
      }

      // Check if our session has been replaced
      if (currentSession.sessionId !== sessionId) {
        devWarn(
          `Session conflict detected: current: ${sessionId}, new: ${currentSession.sessionId}`,
        );

        // Flush any pending accumulated changes now, while this session is
        // still marked alive and can still write - only THEN tear it down.
        // Reversing this order (as before) meant stopPeriodicUpdates()
        // discarded unflushed progress before the "final" flush attempt
        // ever got a chance to run.
        (async () => {
          try {
            if (flushBeforeInvalidationCallback) {
              devLog("Flushing pending updates before session invalidation");
              await flushBeforeInvalidationCallback();
            }
          } catch (error) {
            devError(
              "Failed to flush pending updates before invalidation:",
              error,
            );
          } finally {
            isSessionActive = false;
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }

            if (onSessionInvalidatedCallback) {
              devLog("Calling session invalidation callback");
              onSessionInvalidatedCallback();
            }
            devLog("Session invalidated; kicking out.");
            onKickedOut();
          }
        })();
      }
    },
    (error) => {
      devError("Error listening for session conflicts:", error);
    },
  );
};

// Clean up session on logout
export const terminateSession = async (_userId: string): Promise<void> => {
  try {
    devLog("Terminating session");
    isSessionActive = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (sessionListener) {
      sessionListener();
      sessionListener = null;
    }

    if (sessionId && updateUserDataCallback) {
      await updateUserDataCallback({
        session: {
          currentSession: null,
        },
      });
    }

    sessionId = null;
    devLog("Session terminated");
  } catch (error) {
    devError("Error terminating session:", error);
  }
};

// Get current session ID (for debugging)
export const getCurrentSessionId = (): string | null => {
  return sessionId;
};

// Check if session is active
export const isSessionAlive = (): boolean => {
  return isSessionActive && sessionId !== null;
};

// Set callback to be called when session is invalidated
export const onSessionInvalidated = (callback: () => void): void => {
  onSessionInvalidatedCallback = callback;
};
