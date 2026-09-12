// Shared UI presentation for GladiatorTrait - used by Arena.vue and
// Barracks.vue so the label/icon/color/description for a trait can't drift
// between the two places it's shown.
import type { GladiatorTrait } from "@/core/game/types";
import {
  TRAIT_BLOODTHIRSTY_ATK_GAIN_PER_KILL_PERCENT,
  TRAIT_CROWD_FAVORITE_GOLD_BONUS_PERCENT,
  CROWD_FAVORITE_MAX_STACK,
  TRAIT_INCORRIGIBLE_TRAINING_COST_DISCOUNT_PERCENT,
  TRAIT_INCORRIGIBLE_INJURY_CHANCE_ADD,
} from "@/core/game/gameRules";

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
      return "text-bg-primary";
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
