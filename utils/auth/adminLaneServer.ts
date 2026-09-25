// utils/auth/adminLaneServer.ts — THE ADMIN LANE for server code.
//
// Arman, 2026-09-25: "Admin privileges cannot ever extend beyond the admin
// sections of the system." A server action or Route Handler that grants an
// admin anything — a service-role read, a bypassed ownership check, another
// person's record — does it ONLY for a request that comes from the admin
// section, and only for an admin. Both halves, every time, through here:
//
//   - `requireAdminLane()` — throws the plain sentence when the request is not
//     in the admin section (`requireSuperAdmin`/`requireAdmin` call it first).
//   - `hasAdminPower(supabase, userId)` — "may this request use admin power":
//     in the lane AND an admin. Never call `checkIsSuperAdmin` /
//     `checkIsUserAdmin` / `getAdminStatus` to widen a user-side action;
//     `pnpm check:admin-lane` fails on it.
//
// The lane decision itself lives once, in `adminLaneOpenForHeaders`
// (utils/supabase/adminLane.ts).


import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import {
  ADMIN_LANE_REFUSAL,
  adminLaneOpenForHeaders,
} from "@/utils/supabase/adminLane";
import { getAdminStatus } from "@/utils/supabase/userSessionData";

export { ADMIN_LANE_REFUSAL };

export class AdminLaneRequiredError extends Error {
  readonly status = 403;
  constructor() {
    super(ADMIN_LANE_REFUSAL);
    this.name = "AdminLaneRequiredError";
  }
}

/** Is the request being served right now in the admin section? */
export async function requestInAdminLane(): Promise<boolean> {
  return adminLaneOpenForHeaders(await headers());
}

/** Throws `AdminLaneRequiredError` (the plain sentence) outside the lane. */
export async function requireAdminLane(): Promise<void> {
  if (!(await requestInAdminLane())) throw new AdminLaneRequiredError();
}

/**
 * ADMIN POWER for this request: in the admin lane AND an admin at the bar
 * (`super_admin` by default; `"any"` for a deliberately lowered surface).
 * False on every user page, whoever is asking.
 */
export async function hasAdminPower(
  supabase: SupabaseClient,
  userId: string,
  bar: "super_admin" | "any" = "super_admin",
): Promise<boolean> {
  if (!(await requestInAdminLane())) return false;
  const { isAdmin, level } = await getAdminStatus(supabase, userId);
  return bar === "any" ? isAdmin : level === "super_admin";
}
