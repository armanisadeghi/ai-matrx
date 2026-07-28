/**
 * Surface manifest — Users & Access hub (`matrx-admin/users`).
 *
 * ADMIN SURFACE, NEW (no `ui_surface` row yet — must be seeded before sync).
 * Drives `/administration/users` — the landing tab of the Users & Access hub
 * (`app/(admin)/administration/users/page.tsx`), a thin shell over
 * `features/admin/users/components/AccountsTableClient.tsx`. This is the
 * canonical account roster: one `MatrxDataTable` row per Supabase auth user,
 * merged with profile (display name, avatar) and admin level. Sibling tabs
 * (organizations, admins, invitations, entitlements, preferences, usage,
 * announcements) are separate routes/pages and get their own surfaces later
 * — this manifest covers ONLY the Accounts roster page.
 *
 * What an agent bound here may safely do: read the visible roster (or the
 * currently filtered/sorted subset via `visible_user_count`), summarize
 * onboarding/confirmation/provider standing, and help the admin decide who to
 * message or flag next. It must NOT assume any action (magic link, password
 * reset, email, DM, onboarding flag, admin-level change) has been taken —
 * those are all admin button presses; nothing here is a write path.
 *
 * SECURITY: no auth tokens, magic-link/action links, or password-reset links
 * are declared or emitted — those are generated server-side per click and
 * shown once in a toast, never placed in surface scope.
 *
 * Emitters: NONE YET. `AccountsTableClient.tsx` has no `SurfaceRuntimeProvider`
 * mount. Values below describe live page state (`useState` in the client
 * component) but nothing currently writes them into an `ApplicationScope`.
 * Wiring an emitter is a follow-up — see readinessNote.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_USERS_SURFACE_NAME = "matrx-admin/users";

const groups: SurfaceValueGroup[] = [
  {
    key: "roster",
    label: "Account roster",
    sortOrder: 100,
    description:
      "The user accounts currently loaded and visible in the Accounts table, and the table's loading/error state.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "user_count",
    label: "Total user count",
    description:
      "Number of accounts currently loaded from `/api/admin/users` into the table (before any client-side search/filter). Zero while the initial fetch is in flight or if it returns no rows.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 100,
    group: "roster",
  },
  {
    name: "roster_sample",
    label: "Roster sample",
    description:
      "The first several loaded accounts, each with { id, email, display_name, admin_level, providers, email_confirmed, onboarding_completed, organizations }, for shape inspection. Bindable, not auto-context — live user PII. Empty array before the first successful load.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 110,
    group: "roster",
  },
  {
    name: "roster_load_error",
    label: "Roster load error",
    description:
      "The error message from the last failed `/api/admin/users` fetch. Absent when the load succeeded or hasn't run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 120,
    group: "roster",
  },
];

export const adminUsersManifest: SurfaceManifest = {
  surfaceName: ADMIN_USERS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired. AccountsTableClient.tsx loads the roster into React state but does not mount a SurfaceRuntimeProvider or build an ApplicationScope. Values here describe real page state (user_count, roster_sample, roster_load_error) but nothing currently emits them at runtime.",
  label: "Users & Access — Accounts",
  urlPattern: "/administration/users",
  intro: `<surface_intro>
This is an ADMIN surface: the Users & Access hub landing tab at /administration/users, the canonical account roster for the whole platform.

One row per Supabase auth user, merged with profile info and admin level, in a sortable/filterable table. user_count is the total loaded; roster_sample is a few rows for shape inspection (bindable only — live account PII).

What you may safely do: summarize the roster, flag accounts needing attention (unconfirmed email, not onboarded, no admin level where expected), and help the admin decide who to contact. You never send an email, magic link, password reset, or in-app message yourself — those are admin button presses on this page, not something you can trigger from context.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** Row shape referenced by `roster_sample`. Mirrors `AdminUserRow` (features/admin/users/types.ts). */
export interface AdminUsersRosterSampleEntry {
  id: string;
  email: string | null;
  display_name: string | null;
  admin_level: string | null;
  providers: string[];
  email_confirmed: boolean;
  onboarding_completed: boolean;
  organizations: { id: string; name: string; role: string }[];
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminUsersScope(values: {
  // alwaysAvailable: true → required
  user_count: number;
  roster_sample: AdminUsersRosterSampleEntry[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  roster_load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
