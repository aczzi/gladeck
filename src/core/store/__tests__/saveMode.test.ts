import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildStartUserData } from "@/core/game/gameRules";
import { hasGuestUserData } from "@/core/store/guestStorage";

// The store talks to Firestore only through this module - mock it so tests
// drive onSnapshot/setDoc/etc by hand instead of hitting real Firebase.
const firestoreMocks = vi.hoisted(() => ({
  onSnapshotMock: vi.fn(),
  setDocMock: vi.fn(),
  updateDocMock: vi.fn(),
  writeBatchMock: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  onSnapshot: firestoreMocks.onSnapshotMock,
  setDoc: firestoreMocks.setDocMock,
  updateDoc: firestoreMocks.updateDocMock,
  writeBatch: firestoreMocks.writeBatchMock,
  serverTimestamp: () => "SERVER_TIMESTAMP",
  Timestamp: class {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    static now() {
      return new this(Math.floor(Date.now() / 1000), 0);
    }
  },
}));

vi.mock("@/core/firebase/store", () => ({ db: {} }));

const sessionManagerMocks = vi.hoisted(() => ({
  isSessionAliveMock: vi.fn(() => true),
}));

vi.mock("@/core/firebase/sessionManager", () => ({
  isSessionAlive: sessionManagerMocks.isSessionAliveMock,
  onSessionInvalidated: vi.fn(),
  setUpdateUserDataCallback: vi.fn(),
  setFlushBeforeInvalidationCallback: vi.fn(),
}));

// guestStorage.ts (used both by the store and directly by these tests) reads
// window.localStorage - the vitest "node" environment doesn't provide one.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}
vi.stubGlobal("localStorage", new MemoryStorage());

type CapturedSnapshotListener = {
  success: (snap: { exists: () => boolean; data: () => unknown }) => void;
  error: (err: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

let capturedListeners: CapturedSnapshotListener[];
let store: any;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  (localStorage as unknown as MemoryStorage).clear();

  capturedListeners = [];
  firestoreMocks.onSnapshotMock.mockReset();
  firestoreMocks.onSnapshotMock.mockImplementation(
    (
      _ref: unknown,
      onNext: CapturedSnapshotListener["success"],
      onError: CapturedSnapshotListener["error"],
    ) => {
      const unsubscribe = vi.fn();
      capturedListeners.push({ success: onNext, error: onError, unsubscribe });
      return unsubscribe;
    },
  );
  firestoreMocks.setDocMock.mockReset().mockResolvedValue(undefined);
  firestoreMocks.updateDocMock.mockReset().mockResolvedValue(undefined);
  firestoreMocks.writeBatchMock.mockReset();
  sessionManagerMocks.isSessionAliveMock.mockReset().mockReturnValue(true);

  const mod = await import("@/core/store/index");
  store = mod.default;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SaveMode state machine", () => {
  it("none -> guest: startGuestSession loads a fresh save and persists it", () => {
    expect(store.getters.mode).toBe("none");

    store.dispatch("startGuestSession");

    expect(store.getters.mode).toBe("guest");
    expect(store.getters.userData).not.toBeNull();
    expect(hasGuestUserData()).toBe(true);
  });

  it("guest -> cloud (success): mode only flips once bindUserData binds a real snapshot", async () => {
    store.dispatch("startGuestSession");
    expect(store.getters.mode).toBe("guest");

    await store.dispatch("convertGuestToCloud", "uid-1");
    expect(firestoreMocks.setDocMock).toHaveBeenCalledTimes(1);
    // Per the atomicity fix: writing to Firestore does not itself flip mode.
    expect(store.getters.mode).toBe("guest");

    store.commit("SET_USER", { uid: "uid-1" });
    const bindPromise = store.dispatch("bindUserData", "uid-1");
    const listener = capturedListeners.at(-1)!;
    listener.success({ exists: () => true, data: () => buildStartUserData() });
    await bindPromise;

    expect(store.getters.mode).toBe("cloud");
  });

  it("guest -> cloud (failure): a failed bind leaves mode as guest and the local save untouched", async () => {
    store.dispatch("startGuestSession");
    await store.dispatch("convertGuestToCloud", "uid-1");
    expect(store.getters.mode).toBe("guest");
    expect(hasGuestUserData()).toBe(true);

    store.commit("SET_USER", { uid: "uid-1" });
    const bindPromise = store.dispatch("bindUserData", "uid-1");
    bindPromise.catch(() => {}); // rejection is asserted below; avoid a transient unhandled-rejection warning
    const listener = capturedListeners.at(-1)!;
    listener.error(new Error("network down"));

    await expect(bindPromise).rejects.toThrow();
    expect(store.getters.mode).toBe("guest");
    // The store never clears the local save itself - that's the caller's
    // job, done only after the whole bind succeeds (see MainView.vue).
    expect(hasGuestUserData()).toBe(true);
  });

  it("timeout followed by a late snapshot: the late snapshot is ignored, mode never flips to cloud", async () => {
    store.commit("SET_USER", { uid: "uid-1" });
    const bindPromise = store.dispatch("bindUserData", "uid-1");
    bindPromise.catch(() => {}); // rejection is asserted below; avoid a transient unhandled-rejection warning
    const listener = capturedListeners.at(-1)!;

    await vi.advanceTimersByTimeAsync(10000);
    await expect(bindPromise).rejects.toThrow(/timeout/i);
    expect(listener.unsubscribe).toHaveBeenCalled();

    // A snapshot that was already in flight can still land after the
    // timeout rejected - it must be ignored, not silently commit "cloud".
    listener.success({ exists: () => true, data: () => buildStartUserData() });

    expect(store.getters.mode).not.toBe("cloud");
    expect(store.getters.userData).toBeNull();
  });

  it("external cloud disconnect: resetToNone unbinds and drops back to none", async () => {
    store.commit("SET_USER", { uid: "uid-1" });
    store.commit("SET_USERDATA", buildStartUserData());
    store.commit("SET_MODE", "cloud");

    await store.dispatch("resetToNone");

    expect(store.getters.mode).toBe("none");
    expect(store.getters.userData).toBeNull();
  });

  it("resetToNone is a no-op outside of cloud mode", async () => {
    store.dispatch("startGuestSession");
    expect(store.getters.mode).toBe("guest");

    await store.dispatch("resetToNone");

    expect(store.getters.mode).toBe("guest");
    expect(store.getters.userData).not.toBeNull();
  });

  it("none: updateUserData is rejected and touches neither Firestore nor localStorage", async () => {
    expect(store.getters.mode).toBe("none");

    await store.dispatch("updateUserData", { profile: { gold: 999 } });

    expect(store.getters.userData).toBeNull();
    expect(firestoreMocks.updateDocMock).not.toHaveBeenCalled();
    expect(firestoreMocks.writeBatchMock).not.toHaveBeenCalled();
    expect(hasGuestUserData()).toBe(false);
  });
});
