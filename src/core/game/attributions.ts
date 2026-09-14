import type { Attribution } from "@/core/game/types";

export function attributionIcon(attribution: Attribution): string {
  if (attribution === "dps") return "bi bi-lightning-charge-fill";
  if (attribution === "tank") return "bi bi-shield-fill";
  return "bi bi-people-fill";
}
export function attributionBadgeClass(attribution: Attribution): string {
  if (attribution === "dps") return "badge-attr-dps";
  if (attribution === "tank") return "badge-attr-tank";
  return "badge-attr-support";
}
