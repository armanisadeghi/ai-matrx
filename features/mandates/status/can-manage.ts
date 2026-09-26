// features/mandates/status/can-manage.ts
//
// May THIS seat change a mandate's status (enable / disable / archive)? The
// same rule as removing it — the status control and the Remove action can
// never disagree. The admin seat always may; a person only their own soft
// mandate; an organization's manager only that organization's own soft
// mandate. A built-in (code) or system-homed job is never a member's to turn
// off. Pure.

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

export type MandateSeatLevel = "system" | "person" | "organization";

export interface MandateSeat {
  level: MandateSeatLevel;
  userId: string | null;
  orgId: string | null;
  canManageOrg: boolean;
}

export function seatCanManageMandate(
  mandate: {
    organization_id?: string | null;
    created_by?: string | null;
    origin?: string | null;
  },
  seat: MandateSeat,
): boolean {
  if (seat.level === "system") return true;
  if (mandate.origin === "code") return false;
  if ((mandate.organization_id ?? "").toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()) {
    return false;
  }
  if (seat.level === "person") return Boolean(seat.userId) && mandate.created_by === seat.userId;
  return seat.canManageOrg && Boolean(seat.orgId) && mandate.organization_id === seat.orgId;
}
