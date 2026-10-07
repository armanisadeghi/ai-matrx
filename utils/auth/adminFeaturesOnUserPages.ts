// utils/auth/adminFeaturesOnUserPages.ts — ADMIN FEATURES BUILT INTO USER PAGES.
//
// THE RULE (Arman, 2026-10-06): the admin lane stops admin status from
// following an admin around the normal app — on a user page an admin SEES and
// READS exactly what anyone else does. That is right and stays. But some
// controls were built ON PURPOSE for admins inside normal pages, and those must
// keep working there. His example: on his own agent's page, Linked Agent Sync
// lets a super admin write into a SYSTEM agent. "This is not my admin
// capabilities following me to a normal ui in a way that it should not. This is
// a feature SPECIFICALLY BUILT to do this."
//
// The line between the two:
//   - AMBIENT reach — extra rows in a list, someone else's record opening,
//     an RLS admin arm widening a read. NEVER on a user page (admin lane).
//   - A DELIBERATE ACTION — a named control that exists for admins, does one
//     job, and is decided by one database door. ALLOWED on a user page, but
//     only when it is registered here.
//
// How a registered feature works, end to end:
//   1. The screen asks `selectAdminFeature(state, "<id>")` — true for a person
//      who holds the listed admin tier, on ANY page. Nothing else on a user
//      page may read admin identity to gate a control (`pnpm check:admin-lane`).
//   2. The ONE request the control fires is wrapped in
//      `withAdminFeature("<id>", request)`, which opens the admin lane for that
//      request alone. The database is unchanged: its admin checks still need
//      the lane AND an admin identity, so the marker grants nothing to anyone
//      who is not an admin, and no other request on the page is touched.
//      API routes under /api/admin get the lane by path already.
//   3. Reads stay ordinary. A registered action never makes another person's
//      private record visible; it acts on platform-owned things (system agents,
//      global catalogues) the feature exists to maintain.
//
// Adding an entry needs Arman's ruling, quoted with its date (law 12).
// Canonical doc: common-docs/systems/platform/access/STATE.md
// ("Admin features on user pages").

import type { AdminLevel } from "@/utils/supabase/userSessionData";
import { ADMIN_LANE_HEADER } from "@/utils/supabase/adminLane";

export interface AdminFeatureOnUserPage {
  /** Who may use it. `super_admin` = super admins only; `admin` = any admin tier. */
  level: "super_admin" | "admin";
  /** What it lets the admin do, in plain words. */
  allows: string;
  /** Where it lives in the normal app. */
  where: string;
  /** The requests that carry it: database doors / tables, or /api/admin routes. */
  doors: readonly string[];
  /** The ruling that allows it. */
  ruling: string;
}

export const ADMIN_FEATURES_ON_USER_PAGES = {
  "agent.system-sync": {
    level: "super_admin",
    allows:
      "Push changes from an agent into its linked SYSTEM agent, or pull a system agent's changes into a system copy, from Linked Agent Sync.",
    where: "Agent page → Linked Agent Sync (features/agents/components/admin/AgentSyncBody.tsx)",
    doors: ["public.agx_sync_linked_agents_reviewed"],
    ruling: "Arman, 2026-10-06: \"As a super admin, I have the ability to write to system agents, therefore, this page should allow me to do that.\"",
  },
  "agent.make-system": {
    level: "super_admin",
    allows: "Turn your own agent into a new system agent from Linked Agent Sync.",
    where: "Agent page → Linked Agent Sync → Make system agent (features/agents/components/admin/ConvertAgentToSystemBody.tsx)",
    // An /api/admin route: the proxy opens the admin lane for it by path, and
    // the route re-checks super admin before writing.
    doors: ["/api/admin/agent-builtins/convert-from-agent", "/api/admin/agent-builtins/by-source"],
    ruling: "Arman, 2026-10-06: \"As a super admin, I have the ability to write to system agents, therefore, this page should allow me to do that.\"",
  },
} as const satisfies Record<string, AdminFeatureOnUserPage>;

export type AdminFeatureOnUserPageId = keyof typeof ADMIN_FEATURES_ON_USER_PAGES;

/** Does a person with this admin tier hold this registered feature? */
export function adminTierHoldsFeature(
  tier: AdminLevel | null | undefined,
  feature: AdminFeatureOnUserPageId,
): boolean {
  if (!tier) return false;
  const needed: AdminFeatureOnUserPage["level"] = ADMIN_FEATURES_ON_USER_PAGES[feature].level;
  return needed === "admin" ? true : tier === "super_admin";
}

interface HeaderSettable<B> {
  setHeader(name: string, value: string): B;
}

/**
 * Opens the admin lane for ONE request a registered feature fires — a
 * `supabase.rpc(...)` / `.from(...)` builder, before it is awaited. The
 * database still checks the caller is an admin; for anyone else the marker
 * changes nothing.
 */
export function withAdminFeature<B extends HeaderSettable<B>>(
  feature: AdminFeatureOnUserPageId,
  request: B,
): B {
  void ADMIN_FEATURES_ON_USER_PAGES[feature];
  return request.setHeader(ADMIN_LANE_HEADER, "1");
}
