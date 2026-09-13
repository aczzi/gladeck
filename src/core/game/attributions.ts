import type { Attribution } from "@/core/game/types";

export function attributionIcon(attribution: Attribution): string {
  if (attribution === "dps") return "bi bi-lightning-charge-fill";
  if (attribution === "tank") return "bi bi-shield-fill";
  return "bi bi-people-fill";
}
export function attributionBadgeClass(attribution: Attribution): string {
  if (attribution === "dps") return "text-bg-primary";
  if (attribution === "tank") return "text-bg-info";
  return "text-bg-secondary";
}
