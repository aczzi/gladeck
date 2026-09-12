// Centralized utility functions

// Development environment detection
export const isDevelopment = import.meta.env?.DEV || false;
export const useEmulator =
  isDevelopment && import.meta.env?.VITE_USE_EMULATOR !== "false";

// Development-only console logging
export const devLog = (...args: any[]) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

export const devError = (...args: any[]) => {
  if (isDevelopment) {
    console.error(...args);
  }
};

export const devWarn = (...args: any[]) => {
  if (isDevelopment) {
    console.warn(...args);
  }
};

export const devGroup = (label: string) => {
  if (isDevelopment) {
    console.group(label);
  }
};

export const devGroupEnd = () => {
  if (isDevelopment) {
    console.groupEnd();
  }
};

// ====== Math Utilities ======

// Injectable random source - defaults to Math.random everywhere, but lets
// the combat engine and its test/simulation suite swap in a seeded PRNG so
// a fight is reproducible (see gameRules.ts's resolveCombat/RngFn usage).
export type RngFn = () => number;

export function uniformRandInt(max: number, rng: RngFn = Math.random): number {
  if (max <= 0) return 0;
  return Math.floor(rng() * max);
}

// Pick n distinct random items from an array
export function pickRandom<T>(
  items: T[],
  n: number,
  rng: RngFn = Math.random,
): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const index = uniformRandInt(pool.length, rng);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/**
 * Generic cron setup for components
 */
export const setupComponentCron = (
  cronFunction: () => void,
  intervalMs: number,
): (() => void) => {
  const intervalId = setInterval(cronFunction, intervalMs) as unknown as number;

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
};
