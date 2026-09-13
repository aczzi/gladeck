// Central type definitions for Gladeck. Always import game types
// from this file for consistency (see .github/copilot-instructions.md).
import type { Timestamp } from "firebase/firestore";

export type Attribution = "dps" | "tank" | "support";

// PvE matchmaking difficulty - each maps to a rival power budget multiplier
// and a target win-rate band (see gameRules.ts's RIVAL_BUDGET_MULTIPLIER_BY_DIFFICULTY).
export type ArenaDifficulty = "easy" | "normal" | "hard";

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
  tradesLeftThisHour: number;
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
  // Rank points are tracked per combat type - there is no combined total.
  pveRankPoints: number;
  pvpRankPoints: number;
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
  // gladiatorPowerTier(gladiatorPower(...)) !== "rookie" at the pre-attribution
  // base stats - only a veteran-or-above unit can actually die when knocked
  // down on Hard (see resolveDownedFates in gameRules.ts). A rookie always
  // survives at the HP floor, on every difficulty.
  isVeteran: boolean;
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
  // Hit brought the target down to the HP floor - final fate (survives
  // knocked out vs. dies) is decided once, after the fight ends, by
  // resolveDownedFates - see gameRules.ts.
  targetDowned: boolean;
  survivedLethal: boolean;
  // This hit was a Bloodthirsty knockdown - the attacker's ATK just grew for
  // the rest of the fight (see TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT
  // in gameRules.ts). Was silent before - a real stat change with nothing in
  // the log to explain it (ROADMAP.md Axe C).
  bloodthirstyTriggered: boolean;
}

// A curated (trait, role) pair present in the sent team, with a named
// pre-combat bonus - see computeActiveDuoSynergies in gameRules.ts and
// ROADMAP.md Axe B. Not exhaustive by design.
export interface DuoSynergyMatch {
  id: string;
  label: string;
  // Plain-language effect, e.g. "+10% Attack for the Bloodthirsty DPS." -
  // shown next to the label everywhere synergies are displayed, so a badge
  // is never just a name the player has to go look up.
  description: string;
}

export interface CombatResult {
  victory: boolean;
  log: CombatLogEntry[];
  trainerUnits: { id: string; initialHp: number; hpCurrent: number }[];
  rivalUnits: { id: string; initialHp: number; hpCurrent: number }[];
  // Total = baseGoldReward + crowdFavoriteBonusGold + duoSynergyBonusGold
  // (wager payout is handled separately in Arena.vue, which doesn't go
  // through resolveCombat).
  goldGained: number;
  baseGoldReward: number;
  crowdFavoriteBonusGold: number;
  // "Rowdy Crowd" duo synergy only (see computeActiveDuoSynergies) -
  // zero unless that specific combo is active and the fight was won.
  duoSynergyBonusGold: number;
  // Every duo synergy active on the trainer's sent team, win or lose - not
  // just the gold one, so the UI can show all of them (ROADMAP.md Axe B).
  activeDuoSynergies: DuoSynergyMatch[];
  // 1 on a win, 0 on a loss - resolveCombat is the PvE resolver, so this is
  // always a PvE-type gain (see Profile.pveRankPoints).
  rankPointsGained: number;
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
