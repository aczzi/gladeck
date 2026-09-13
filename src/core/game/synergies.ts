import type {
  Attribution,
  GladiatorTrait,
  DuoSynergyMatch,
} from "@/core/game/types";
import {
  DUO_BODYGUARD_ATK_BONUS_PERCENT, // "Bodyguard"
  DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT, // "Lucky Aegis"
  DUO_TWIN_FRENZY_ATK_BONUS_PERCENT, // "Twin Frenzy"
  DUO_RAMPART_DEF_BONUS_PERCENT, // "Shield Wall"
  DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT, // "Rowdy Crowd"
  DUO_RECKLESS_DUO_ATK_BONUS_PERCENT, // "Reckless Duo"
  DUO_GLASS_CANNON_LUCK_BONUS_PERCENT, // "Glass Cannon"
} from "@/core/game/constantes";

export type DuoRoleTag = { trait: GladiatorTrait; attribution: Attribution };

function hasTag(
  tags: DuoRoleTag[],
  trait: GladiatorTrait,
  attribution?: Attribution,
): boolean {
  return tags.some(
    (t) =>
      t.trait === trait &&
      (attribution === undefined || t.attribution === attribution),
  );
}

export interface DuoSynergySlot {
  trait: GladiatorTrait;
  attribution: Attribution;
}

export interface DuoSynergyDefinition {
  id: string;
  label: string;
  description: string;
  slots: [DuoSynergySlot, DuoSynergySlot];
  matches: (tags: DuoRoleTag[]) => boolean;
}

export const DUO_SYNERGIES: DuoSynergyDefinition[] = [
  {
    id: "bodyguard",
    label: "Bodyguard",
    description: `Stoic Tank + Bloodthirsty DPS: +${DUO_BODYGUARD_ATK_BONUS_PERCENT}% Attack for the Bloodthirsty DPS while the Tank is standing.`,
    slots: [
      { trait: "stoic", attribution: "tank" },
      { trait: "bloodthirsty", attribution: "dps" },
    ],
    matches: (tags) =>
      hasTag(tags, "stoic", "tank") && hasTag(tags, "bloodthirsty", "dps"),
  },
  {
    id: "lucky-aegis",
    label: "Lucky Aegis",
    description: `Lucky Tank + Lucky Support: the Tank gets +${DUO_LUCKY_AEGIS_LUCK_SHARE_PERCENT}% of the Support's Luck.`,
    slots: [
      { trait: "lucky", attribution: "tank" },
      { trait: "lucky", attribution: "support" },
    ],
    matches: (tags) =>
      hasTag(tags, "lucky", "tank") && hasTag(tags, "lucky", "support"),
  },
  {
    id: "twin-frenzy",
    label: "Twin Frenzy",
    description: `Two Bloodthirsty DPS: both get +${DUO_TWIN_FRENZY_ATK_BONUS_PERCENT}% Attack.`,
    slots: [
      { trait: "bloodthirsty", attribution: "dps" },
      { trait: "bloodthirsty", attribution: "dps" },
    ],
    matches: (tags) =>
      tags.filter((t) => t.trait === "bloodthirsty" && t.attribution === "dps")
        .length >= 2,
  },
  {
    id: "rampart",
    label: "Shield Wall",
    description: `Brute Tank + Brute Support: both get +${DUO_RAMPART_DEF_BONUS_PERCENT}% Defense.`,
    slots: [
      { trait: "brute", attribution: "tank" },
      { trait: "brute", attribution: "support" },
    ],
    matches: (tags) =>
      hasTag(tags, "brute", "tank") && hasTag(tags, "brute", "support"),
  },
  {
    id: "crowd-lucky",
    label: "Rowdy Crowd",
    description: `Crowd Favorite Support + Lucky DPS: +${DUO_CROWD_LUCKY_GOLD_BONUS_PERCENT}% bonus gold on a win.`,
    slots: [
      { trait: "crowdFavorite", attribution: "support" },
      { trait: "lucky", attribution: "dps" },
    ],
    matches: (tags) =>
      hasTag(tags, "crowdFavorite", "support") && hasTag(tags, "lucky", "dps"),
  },
  {
    id: "reckless-duo",
    label: "Reckless Duo",
    description: `Incorrigible Support + Brute Tank: +${DUO_RECKLESS_DUO_ATK_BONUS_PERCENT}% Attack for the Brute Tank, egged on by the Incorrigible Support.`,
    slots: [
      { trait: "incorrigible", attribution: "support" },
      { trait: "brute", attribution: "tank" },
    ],
    matches: (tags) =>
      hasTag(tags, "incorrigible", "support") && hasTag(tags, "brute", "tank"),
  },
  {
    id: "glass-cannon",
    label: "Glass Cannon",
    description: `Crowd Favorite Tank + Incorrigible DPS: +${DUO_GLASS_CANNON_LUCK_BONUS_PERCENT}% Luck for the Incorrigible DPS, riding the crowd's momentum.`,
    slots: [
      { trait: "crowdFavorite", attribution: "tank" },
      { trait: "incorrigible", attribution: "dps" },
    ],
    matches: (tags) =>
      hasTag(tags, "crowdFavorite", "tank") &&
      hasTag(tags, "incorrigible", "dps"),
  },
];

export function computeActiveDuoSynergies(
  tags: DuoRoleTag[],
): DuoSynergyMatch[] {
  return DUO_SYNERGIES.filter((synergy) => synergy.matches(tags)).map(
    ({ id, label, description }) => ({ id, label, description }),
  );
}

export function tagMatchesSlot(tag: DuoRoleTag, slot: DuoSynergySlot): boolean {
  return slot.trait === tag.trait && slot.attribution === tag.attribution;
}
