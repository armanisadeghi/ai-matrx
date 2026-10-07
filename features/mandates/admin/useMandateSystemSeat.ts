"use client";

// Admin feature "mandate.system-seat" (registry: utils/auth/adminFeaturesOnUserPages.ts).
// Does this viewer hold the system seat on THIS mandate? Only a SYSTEM mandate
// (homed in the Matrx System organization) is ever the system seat's to act on;
// another organization's or person's mandate never is.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectAdminFeature } from "@/lib/redux/selectors/userSelectors";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

export function isSystemHomedMandate(
  mandate: { organization_id?: string | null } | null | undefined,
): boolean {
  return (
    (mandate?.organization_id ?? "").toLowerCase() ===
    SYSTEM_ORGANIZATION_ID.toLowerCase()
  );
}

export function useMandateSystemSeat(
  mandate: { organization_id?: string | null } | null | undefined,
): boolean {
  const holdsSeat = useAppSelector((s) =>
    selectAdminFeature(s, "mandate.system-seat"),
  );
  return holdsSeat && isSystemHomedMandate(mandate);
}
