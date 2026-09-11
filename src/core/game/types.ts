// Central type definitions for Gladeck. Always import game types
// from this file for consistency (see .github/copilot-instructions.md).
import type { Timestamp } from "firebase/firestore";

export type Attribution = "dps" | "tank" | "support";

export type GladiatorTrait =
  | "brute"
  | "stoic"
  | "lucky"
  | "bloodthirsty"
  | "crowdFavorite"
  | "incorrigible";

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
  baseStats: GladiatorStats;
  trait: GladiatorTrait;
  injured: boolean;
  resting: boolean;
  battlesFought: number;
  trainingPoints: number;
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
  legacyPoints: number;
}

export interface CombatSlot {
  gladiatorId: string;
  line: Attribution | null;
}

export interface CombatUnit {
  id: string;
  name: string;
  attribution: Attribution;
  trait?: GladiatorTrait;
  atk: number;
  luck: number;
  def: number;
  initialHp: number;
  hpCurrent: number;
}

export interface CombatLogEntry {
  turn: number;
  round: number;
  attacker: "trainer" | "rival";
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  damage: number;
  targetHpAfter: number;
  crit: boolean;
  dodged: boolean;
  targetDowned: boolean;
  targetKilled: boolean;
  survivedLethal: boolean;
}

export interface CombatResult {
  victory: boolean;
  log: CombatLogEntry[];
  trainerUnits: { id: string; initialHp: number; hpCurrent: number }[];
  goldGained: number;
}

export interface SessionData {
  sessionId: string;
  lastHeartbeat: Timestamp;
  userAgent: string;
}

export interface PendingCombat {
  gladiatorIds: string[];
  placement: Record<string, Attribution | null>;
  bet: number;
}

export interface UserData {
  profile: Profile;
  buildings: Buildings;
  gladiators: Record<string, Gladiator>;
  user_active: boolean;
  pendingCombat?: PendingCombat | null;
  session?: {
    currentSession: SessionData | null;
  };
}

export interface AdminData {
  active_game: boolean;
  message: string;
}
