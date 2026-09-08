// Central type definitions for Gladeck. Always import game types
// from this file for consistency (see .github/copilot-instructions.md).
import type { Timestamp } from "firebase/firestore";

export type Line = "frontline" | "backline";

// Every gladiator stat is stored on a 0-100 scale (ROADMAP.md §2).
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
  inDeck: boolean;
  injured: boolean;
  lastHealedAt?: Timestamp;
  lastSchoolUpgradeAt?: Timestamp;
}

export type BuildingKey =
  | "fanDonation"
  | "barracks"
  | "school"
  | "infirmary"
  | "market";

export interface FanDonationBuilding {
  level: number;
  lastCollected: Timestamp;
}

export interface BarracksBuilding {
  level: number;
}

export interface SchoolBuilding {
  level: number;
}

export interface InfirmaryBuilding {
  level: number;
}

export interface MarketBuilding {
  level: number;
  dailyTradesLeft: number;
}

export interface Buildings {
  fanDonation: FanDonationBuilding;
  barracks: BarracksBuilding;
  school: SchoolBuilding;
  infirmary: InfirmaryBuilding;
  market: MarketBuilding;
}

export interface Profile {
  username: string;
  level: number;
  rankPoints: number;
  gold: number;
  maxSlots: number;
}

// One of the 4 gladiators sent into a fight, with its line assignment.
export interface CombatSlot {
  gladiatorId: string;
  line: Line | null;
}

// Aggregated team stats after line modifiers are applied (ROADMAP.md §3).
export interface TeamStats {
  atk: number;
  luck: number;
  hp: number;
  def: number;
}

export interface CombatLogEntry {
  turn: number;
  attacker: "trainer" | "rival";
  damage: number;
  targetHpAfter: number;
}

export interface CombatResult {
  victory: boolean;
  log: CombatLogEntry[];
  trainerFinalHp: number;
  trainerInitialHp: number;
  rivalTeam: TeamStats;
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
