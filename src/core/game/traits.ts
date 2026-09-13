import type { GladiatorTrait } from "@/core/game/types";
import { uniformRandInt, type RngFn } from "@/core/utils";

export const TRAIT_BRUTE_TRAINING_BONUS_MULTIPLIER = 1.2;
// Stoic ("Increvable"): a hit that would kill instead leaves 1 HP, this often.
export const TRAIT_STOIC_SURVIVAL_CHANCE = 0.25;
// Lucky: gains a flat +2 Luck per victory instead of the usual +1.
export const TRAIT_LUCKY_VICTORY_LUCK_GAIN = 2;
// Bloodthirsty: every knockdown lands compounds the killer's own Attack for
// the rest of that same fight (resolveCombat works on cloned units, so this
// never persists between fights). Triggers exactly once per knockdown, on
// justDowned - see resolveCombat.
export const TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT = 5;
// Crowd Favorite: flat % more gold on victory, per Crowd Favorite gladiator
// sent - stacks if several are sent to the same fight, up to this cap so a
// team can't stack the bonus without limit.
export const TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT = 20;
// Incorrigible: cheaper Training Program upgrades, but an extra personal
// injury risk stacked on top of the level-gated one (see rollTrainingInjury).
export const TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT = 35;
export const TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD = 0.1;

export const CROWD_FAVORITE_MAX_STACK = 2;

const GLADIATOR_TRAITS: GladiatorTrait[] = [
  "brute",
  "stoic",
  "lucky",
  "bloodthirsty",
  "crowdFavorite",
  "incorrigible",
];

export function pickRandomTrait(rng: RngFn = Math.random): GladiatorTrait {
  return GLADIATOR_TRAITS[uniformRandInt(GLADIATOR_TRAITS.length, rng)];
}

export function traitLabel(trait: GladiatorTrait): string {
  switch (trait) {
    case "brute":
      return "Brute";
    case "stoic":
      return "Stoic";
    case "bloodthirsty":
      return "Bloodthirsty";
    case "crowdFavorite":
      return "Crowd Favorite";
    case "incorrigible":
      return "Incorrigible";
    default:
      return "Lucky";
  }
}

export function traitIcon(trait: GladiatorTrait): string {
  switch (trait) {
    case "brute":
      return "bi bi-fire";
    case "stoic":
      return "bi bi-heart-fill";
    case "bloodthirsty":
      return "bi bi-droplet-fill";
    case "crowdFavorite":
      return "bi bi-hand-thumbs-up-fill";
    case "incorrigible":
      return "bi bi-exclamation-triangle-fill";
    default:
      return "bi bi-stars";
  }
}

export function traitBadgeClass(trait: GladiatorTrait): string {
  switch (trait) {
    case "brute":
      return "text-bg-warning";
    case "stoic":
      return "text-bg-info";
    case "bloodthirsty":
      return "text-bg-danger";
    case "crowdFavorite":
      return "text-bg-bronze";
    case "incorrigible":
      return "text-bg-secondary";
    default:
      return "text-bg-success";
  }
}

export function traitDescription(trait: GladiatorTrait): string {
  switch (trait) {
    case "brute":
      return "Training Program Attack gains are 20% stronger.";
    case "stoic":
      return "A hit that would knock them down sometimes leaves them standing instead.";
    case "bloodthirsty":
      return `Gains +${TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT}% Attack (stacking) for the rest of the fight whenever it knocks an opponent down.`;
    case "crowdFavorite":
      return `Victories earn +${TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT}% gold (stacks up to ${CROWD_FAVORITE_MAX_STACK} per team).`;
    case "incorrigible":
      return `Training Program upgrades cost ${TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT}% less gold, but carry +${Math.round(TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD * 100)}% injury risk.`;
    default:
      return "Gains +2 Luck per victory instead of +1.";
  }
}
