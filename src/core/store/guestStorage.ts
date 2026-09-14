// Local persistence for guest play (no account, no Firestore).

import { Timestamp } from "firebase/firestore";
import type { UserData } from "@/core/game/types";
import { devError } from "@/core/utils";

const GUEST_STORAGE_KEY = "gladeck_guest_save";
const TIMESTAMP_TAG = "__timestamp__";

function replaceTimestamps(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return {
      [TIMESTAMP_TAG]: true,
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (Array.isArray(value)) {
    return value.map(replaceTimestamps);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = replaceTimestamps(entry);
    }
    return out;
  }
  return value;
}

function reviveTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reviveTimestamps);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (
      obj[TIMESTAMP_TAG] === true &&
      typeof obj.seconds === "number" &&
      typeof obj.nanoseconds === "number"
    ) {
      return new Timestamp(obj.seconds, obj.nanoseconds);
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      out[key] = reviveTimestamps(entry);
    }
    return out;
  }
  return value;
}

export function saveGuestUserData(userData: UserData): void {
  try {
    localStorage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify(replaceTimestamps(userData)),
    );
  } catch (error) {
    devError("Failed to save guest data to localStorage:", error);
  }
}

export function loadGuestUserData(): UserData | null {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    return reviveTimestamps(JSON.parse(raw)) as UserData;
  } catch (error) {
    devError("Failed to load guest data from localStorage:", error);
    return null;
  }
}

export function hasGuestUserData(): boolean {
  try {
    return localStorage.getItem(GUEST_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearGuestUserData(): void {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch (error) {
    devError("Failed to clear guest data from localStorage:", error);
  }
}
