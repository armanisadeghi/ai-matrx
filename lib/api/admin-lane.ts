// lib/api/admin-lane.ts — THE ADMIN SEAT on the Python server.
//
// Arman, 2026-09-26: "No one acts as themselves in admin." Work an admin does
// inside the admin section (AI on a system mandate, a catalog probe, a
// resilience scenario, an agent review) is PLATFORM work: it is filed and billed
// to the Matrx System organization, never to the admin's own workspace, and it
// never asks the admin to "choose a workspace".
//
// Two halves, both decided at REQUEST time from the page the person is on
// (`browserAdminLaneOpen`, the same rule the Supabase admin lane and
// `lib/api/adminDoor.ts` use):
//
//   1. `adminLaneOrganizationId()` — every place that reads "the selected
//      organization" to bind a server request reads THIS first. In the admin
//      section it is the platform tenant; everywhere else it is null and the
//      selected workspace is used exactly as before. An EXPLICIT organization a
//      caller passes (a record's own org) always wins over both.
//   2. `withAdminLaneHeader(headers)` — a request bound to the platform tenant
//      from the admin section carries `x-matrx-admin-lane: 1`. The server admits
//      the tenant only when it re-verifies the caller in `admin.admins` and
//      writes an `admin.admin_audit_log` row (aidream
//      `aidream/api/middleware/admin_lane_admission.py`); the header alone
//      grants nothing.

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { ADMIN_LANE_HEADER, browserAdminLaneOpen } from "@/utils/supabase/adminLane";

/** The platform tenant on the admin seat; null on every user page. */
export function adminLaneOrganizationId(): string | null {
  return browserAdminLaneOpen() ? SYSTEM_ORGANIZATION_ID : null;
}

function isPlatformTenant(organizationId: string | null | undefined): boolean {
  return (
    typeof organizationId === "string" &&
    organizationId.trim().toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()
  );
}

/** The org header name as the transports write it (case varies by call site). */
function organizationHeaderOf(headers: Record<string, string>): string | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "x-organization-id") return value;
  }
  return undefined;
}

/**
 * Adds `x-matrx-admin-lane: 1` when — and only when — the request is bound to
 * the platform tenant from the admin section. Returns the same object shape.
 */
export function withAdminLaneHeader<H extends Record<string, string>>(headers: H): H {
  if (!browserAdminLaneOpen() || !isPlatformTenant(organizationHeaderOf(headers))) {
    return headers;
  }
  return { ...headers, [ADMIN_LANE_HEADER]: "1" };
}

/** The same decision for a transport that holds the organization id directly. */
export function adminLaneHeadersFor(
  organizationId: string | null | undefined,
): Record<string, string> {
  return browserAdminLaneOpen() && isPlatformTenant(organizationId)
    ? { [ADMIN_LANE_HEADER]: "1" }
    : {};
}
