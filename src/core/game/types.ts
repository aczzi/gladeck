// Central type definitions for Gladeck. Always import game types
// from this file for consistency (see .github/copilot-instructions.md).
import type { Timestamp } from "firebase/firestore";

export type Line = "dps" | "tank";

// Attack/Defense/Luck are stored on a 0-200 scale (see STAT_MAX in
// gameRules.ts, ROADMAP.md §2). HP has no upper bound.
export interface GladiatorStats {
  atk: number;
  luck: number;
  hpMax: number;
  hpCurrent: number;
  def: number;
}

export interface Gladiator {
  id: string;
  name: string;
  stats: GladiatorStats;
  injured: boolean;
  battlesFought: number;
  lastHealedAt?: Timestamp;
  lastTrainingProgramUpgradeAt?: Timestamp;
}

export type BuildingKey =
  | "fanDonation"
  | "barracks"
  | "trainingProgram"
  | "infirmary"
  | "market";

export interface FanDonationBuilding {
  level: number;
  lastCollected: Timestamp;
}

// Barracks has a fixed capacity (see BARRACKS_CAPACITY) - no upgrade.
export type BarracksBuilding = Record<string, never>;

export interface TrainingProgramBuilding {
  level: number;
}

export interface InfirmaryBuilding {
  level: number;
}

export interface MarketBuilding {
  level: number;
  dailyTradesLeft: number;
  // Anchors the 24h cooldown before dailyTradesLeft refills back to
  // marketDailyTrades(level).
  lastTradeReset: Timestamp;
}

export interface Buildings {
  fanDonation: FanDonationBuilding;
  barracks: BarracksBuilding;
  trainingProgram: TrainingProgramBuilding;
  infirmary: InfirmaryBuilding;
  market: MarketBuilding;
}

export interface Profile {
  username: string;
  rankPoints: number;
  gold: number;
}

// One of the 4 gladiators sent into a fight, with its line assignment.
export interface CombatSlot {
  gladiatorId: string;
  line: Line | null;
}

// Aggregated team stats, used for rival matchmaking budget only
// (ROADMAP.md §4.1). Individual fights are resolved per-gladiator, see
// CombatUnit.
export interface TeamStats {
  atk: number;
  luck: number;
  hp: number;
  def: number;
}

// A single fighter as tracked during combat resolution: line modifiers
// already applied, HP tracked individually rather than pooled per team
// (ROADMAP.md §4.5).
export interface CombatUnit {
  id: string;
  name: string;
  line: Line;
  atk: number;
  luck: number;
  def: number;
  initialHp: number;
  hpCurrent: number;
}

export interface CombatLogEntry {
  turn: number;
  attacker: "trainer" | "rival";
  attackerName: string;
  targetName: string;
  damage: number;
  targetHpAfter: number;
  crit: boolean;
  dodged: boolean;
  targetDefeated: boolean;
}

export interface CombatResult {
  victory: boolean;
  log: CombatLogEntry[];
  // Final state of each trainer gladiator sent to combat, for per-gladiator
  // attrition (ROADMAP.md §5) instead of a single team-wide ratio.
  trainerUnits: { id: string; initialHp: number; hpCurrent: number }[];
  rankPointsGained: number;
  goldGained: number;
}

export interface SessionData {
  sessionId: string;
  lastHeartbeat: Timestamp;
  userAgent: string;
}

export interface UserData {
  profile: Profile;
  buildings: Buildings;
  gladiators: Record<string, Gladiator>;
  user_active: boolean;
  session?: {
    currentSession: SessionData | null;
  };
}

export interface AdminData {
  active_game: boolean;
  message: string;
}
