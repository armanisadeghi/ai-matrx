/**
 * Surface manifest — Users & Access hub (`matrx-admin/users`).
 *
 * ADMIN SURFACE. Drives `/administration/users` — the landing tab of the
 * Users & Access hub (`app/(admin)/administration/users/page.tsx`), a thin
 * shell over `features/admin/users/components/AccountsTableClient.tsx`. This
 * is the canonical account roster: one `MatrxDataTable` row per Supabase auth
 * user, merged with profile (display name, avatar) and admin level. Sibling
 * tabs (organizations, admins, invitations, entitlements, preferences, usage,
 * announcements) are separate routes/pages with their own surfaces — this
 * manifest covers ONLY the Accounts roster page.
 *
 * What an agent bound here may safely do: read the roster's aggregate shape
 * (counts, admin-level and provider breakdowns, confirmation/onboarding
 * health), read the admin's live table query (search, column filters, sort,
 * how many accounts still match), and read the ONE account the admin has
 * focused via `?user=<id>`. From that it can triage — who needs attention,
 * what the current filter is actually showing, what standing the focused user
 * has. It must NOT assume any action (magic link, password reset, email, DM,
 * onboarding flag, admin-level change) has been taken: those are all admin
 * button presses, and this surface has NO write path (see the ruling below).
 *
 * EMITTER: WIRED (2026-08-13). `AccountsTableClient.tsx` mounts
 * `<SurfaceRuntimeProvider>` and builds its scope through
 * `features/admin/users/lib/admin-users-scope.ts` (`buildAdminUsersScope`).
 * `getScope` is SYNCHRONOUS over live render state — it never fetches. That
 * matters: `useLiveSurfaceScope` polls `getScope` every 400ms for as long as a
 * Surface Context window is open, so an async emitter here would hammer
 * `/api/admin/users` continuously behind a debug panel that looks idle.
 *
 * PRIVACY — this surface emits real user records into agent context, so the
 * value set is deliberately asymmetric:
 *   - AGGREGATES over the roster (counts, breakdowns) are auto-context: they
 *     carry no PII at all and are what an agent actually reasons with.
 *   - The FOCUSED account — one user the admin explicitly navigated to — is
 *     auto-context WITH its admin-relevant fields (email included). That is
 *     the record the admin is asking about; withholding it would make the
 *     surface useless while protecting nothing the admin cannot already see.
 *   - The ROSTER SAMPLE is `autoContext: false` AND capped AND carries NO
 *     email addresses. Emails are resolvable from an id by anyone with this
 *     page open, so bulk-shipping the mailing list into every agent context
 *     buys nothing and leaks broadly. An agent that needs one user's email
 *     gets it by focusing that user.
 *
 * SECURITY: no auth tokens, magic-link/action links, or password-reset links
 * are declared or emitted — those are generated server-side per click and
 * shown once in a toast, never placed in surface scope.
 *
 * LIVE-RUN FINDING (2026-08-13) — THE `focused_user` COMPOSITE DID NOT REACH
 * THE AGENT. Across three live Badass Agent runs on this page, the agent
 * quoted `user_count`, `roster_health`, `admin_level_breakdown`,
 * `visible_user_count`, `search_query`, `focused_user_id`,
 * `focused_user_admin_level`, `focused_user_organizations` and
 * `focused_user_missing` BY NAME with values matching the screen exactly — but
 * never `focused_user`, and twice stated outright that no per-account
 * onboarding/email-confirmation field existed in its context, once even after
 * the intro was rewritten to spell out that those fields live inside
 * `focused_user`. The emitter is NOT at fault: the Surface Context window
 * shows `focused_user` fully populated and byte-matching the roster row (id,
 * email, display_name, admin_level, email_confirmed, onboarding_completed,
 * created_at, organizations), and the footer reads "14/25 supplied · contract
 * honored". Object- and array-typed values are not the problem either —
 * `roster_health` (object) and `focused_user_organizations` (array of objects)
 * both arrived. Something between the emitted scope and the model's context
 * drops this one value; the mechanism was NOT chased down here, because it
 * lives in the launch thunk / server-side context assembly rather than in this
 * surface. Practical consequence, and the reason for the two extra scalars:
 * per-account facts an agent will actually be asked about are exposed as
 * FLAT VALUES (`focused_user_admin_level`,
 * `focused_user_onboarding_completed`, `focused_user_email_confirmed`,
 * `focused_user_organizations`) beside the composite rather than only inside
 * it. `focused_user` stays declared and emitted — it is correct, it is
 * bindable, and it is the natural composite THE COMPLETENESS LAW asks for —
 * but nothing here depends on it arriving. Anyone adding values to this
 * surface should follow the same shape until the drop is diagnosed.
 *
 * WHY THE COLLECTION VALUES ARE `alwaysAvailable: false`. The emitter writes
 * `admin_level_breakdown`, `provider_breakdown`, `roster_sample` and
 * `active_column_filters` on every build — so "always written" would look
 * true — but the platform judges PRESENCE with `hasValue()` in
 * `SurfaceContextWindow.tsx`, and there an empty object or empty array counts
 * as ABSENT. Declaring them `true` therefore made the Surface Context window
 * report "1 required missing" for the whole time no filter was applied, and
 * would have reported four missing during every roster load. Rather than
 * emitting a plausible-looking blank to satisfy a promise, they are declared
 * `false` and the builder OMITS them while empty — so the window's green/grey
 * dots read as the truth: "no filters are applied", not "the surface broke
 * its contract". Scalars are unaffected (`hasValue` passes `0` and `false`),
 * which is why `user_count`, `roster_loading`, `visible_user_count`,
 * `focused_user_missing` and `dm_composer_open` stay `true`. Note this is a
 * narrower rule than the surface-authoring skill's `open_tab_ids` example
 * ("always an array even if empty → true"); the skill and the window's
 * presence check genuinely disagree on empty collections, and this manifest
 * follows the check, because the check is what the ship gate reads.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WRITE TARGETS — RULED OUT. This surface declares NO `writeTargets`, and
 * that is a decision, not an omission. Ranked against the
 * `surface-write-targets` judgment bar, every mutable thing on this page
 * lands in the bar's explicit NO column:
 *
 *   - `admin_level` (via the Admin level tab)      → PERMISSIONS. Granting or
 *     revoking super_admin is the canonical "stays human" write.
 *   - Send magic link / send password reset        → CREDENTIALS. These mint
 *     single-use auth links for a real account. Never an agent's to fire.
 *   - Email user / send in-app DM                  → OUTBOUND COMMUNICATION
 *     from the admin's own identity to a real person. Irreversible on send.
 *   - `onboarding_completed` toggle                → IDENTITY/STATE FLAG on
 *     someone else's account, and exactly the bar's "pure-mechanical toggle
 *     nobody would ask an agent to flip".
 *   - Organization membership (sibling tab)        → OWNERSHIP/ACCESS.
 *   - Everything else on the page is READ-ONLY table rendering.
 *
 * The one candidate that deserved individual ranking rather than a sweep is
 * the in-app DM composer's message body (`dm_draft` below). It IS authored
 * prose, it IS the kind of thing an agent drafts well, and `mode: "draft"`
 * would leave the Send press to the admin. It is still ruled OUT, for three
 * reasons that are specific rather than reflexive:
 *   1. The composer is a MODAL that exists only while `dmTarget !== null`.
 *      An agent cannot open it, and this surface declares no `clientTools`,
 *      so the target would be unreachable except in the narrow window where
 *      the admin has already opened the box and is already typing in it.
 *   2. What it drafts is an outbound message to a real user, sent under the
 *      admin's name. Staging text into a box whose next control is "Send
 *      message" carries real mis-send risk for very little saved effort.
 *   3. The read twin would have to carry the draft body, i.e. the surface
 *      would start emitting half-written admin-to-user messages on a 400ms
 *      poll. `dm_draft` is therefore declared `autoContext: false`.
 *
 * Also considered and rejected as low-value rather than unsafe: `ui`-mode
 * targets over the table query (set the search string / a column filter).
 * They are harmless, but an admin types a filter faster than they can ask for
 * one, and the bar's "fewer than ~2 YES fields probably doesn't earn the
 * work" applies. If demand appears, THAT is the first thing to add here —
 * `search_query` and `active_column_filters` already exist as read twins.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_USERS_SURFACE_NAME = "matrx-admin/users";

/**
 * How many accounts `roster_sample` carries. The live-scope sampler
 * `JSON.stringify`s the WHOLE scope every 400ms to fingerprint it, so the
 * roster is capped rather than emitted whole — a few hundred accounts would
 * make an idle debug panel expensive for no added signal.
 */
export const ADMIN_USERS_ROSTER_SAMPLE_LIMIT = 10;

const groups: SurfaceValueGroup[] = [
  {
    key: "roster",
    label: "Account roster",
    sortOrder: 100,
    description:
      "The user accounts loaded from /api/admin/users, their aggregate standing (admin levels, providers, confirmation and onboarding health), and the table's loading/error state.",
  },
  {
    key: "table_view",
    label: "Table view",
    sortOrder: 200,
    description:
      "The admin's live query over the roster: search text, per-column filters, sort, pagination, and how many accounts still match.",
  },
  {
    key: "focused_account",
    label: "Focused account",
    sortOrder: 300,
    description:
      "The single account the admin navigated to via ?user=<id> — the record every per-user door on the platform links into.",
  },
  {
    key: "message_composer",
    label: "Message composer",
    sortOrder: 400,
    description:
      "State of the in-app DM dialog the admin opens from a row's actions menu. Read-only here — sending is an admin button press.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Account roster ──────────────────────────────────────────────────────
  {
    name: "user_count",
    label: "Total user count",
    description:
      "Number of accounts loaded from `/api/admin/users` into the table, before any focus narrowing or client-side search/filter. Zero while the initial fetch is in flight or if it returns no rows — read `roster_loading` to tell those apart.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "roster",
  },
  {
    name: "roster_loading",
    label: "Roster loading",
    description:
      "True while the `/api/admin/users` fetch is in flight (initial load or a Refresh press). Always written. Without it a zero `user_count` is ambiguous between 'no accounts' and 'not loaded yet'.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 305,
    group: "roster",
  },
  {
    name: "roster_health",
    label: "Roster health",
    description:
      "Composite rollup over every loaded account: { total, email_confirmed, email_unconfirmed, onboarded, not_onboarded, anonymous, banned, with_organizations, without_organizations }. All counts, no PII. Always written; every field is 0 before the first successful load.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    sortOrder: 310,
    group: "roster",
  },
  {
    name: "admin_level_breakdown",
    label: "Admin level breakdown",
    description:
      'Count of loaded accounts per admin level, keyed by the raw enum value plus "none" for accounts with no admin level, e.g. { super_admin: 2, senior_admin: 1, developer: 4, none: 380 }. Absent until the roster has loaded at least one account — read `roster_loading` to tell "still fetching" from "genuinely no accounts".',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 320,
    group: "roster",
  },
  {
    name: "provider_breakdown",
    label: "Auth provider breakdown",
    description:
      'Count of loaded accounts per auth provider, e.g. { email: 300, google: 80 }. An account with several linked providers counts once per provider, so the values can sum above `user_count`. Accounts with no provider are keyed "none". Absent until the roster has loaded at least one account.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 330,
    group: "roster",
  },
  {
    name: "roster_sample",
    label: "Roster sample",
    description:
      "The first 10 loaded accounts (roster order), each { id, display_name, admin_level, providers, email_confirmed, onboarding_completed, organization_count }. DELIBERATELY carries no email addresses and is bindable-only, not auto-context — it is a shape probe, not the mailing list; resolve one account's details by focusing it via ?user=<id>. Absent until the roster has loaded at least one account.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    autoContext: false,
    sortOrder: 340,
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
    sortOrder: 350,
    group: "roster",
  },

  // ── Table view ──────────────────────────────────────────────────────────
  {
    name: "visible_user_count",
    label: "Matching account count",
    description:
      "How many accounts the table is actually showing across its pages RIGHT NOW. It is computed with the table's own filter engine and ALREADY accounts for all three narrowing steps: the `?user=` focus, the search box (`search_query`), and every per-column filter (`active_column_filters`) — you are not missing a filter you cannot see. Always written. Equals `user_count` only when nothing is filtered; whenever `search_query` or `active_column_filters` is present, THIS is the count to quote, not `user_count`.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "table_view",
  },
  {
    name: "search_query",
    label: "Table search",
    description:
      "Text in the table's search box, matched across name, email and id. Absent when the box is empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 410,
    group: "table_view",
  },
  {
    name: "active_column_filters",
    label: "Active column filters",
    description:
      'Per-column filters the admin has applied, as a plain object of column id → human-readable summary, e.g. { admin_level: "is super_admin", email_confirmed: "is false" }. Only columns with an ACTIVE filter appear (a cleared filter leaves a dead entry in the table\'s state; those are dropped). Absent when nothing is filtered — read it together with `search_query` and `visible_user_count`.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 420,
    group: "table_view",
  },
  {
    name: "sort_state",
    label: "Table sort",
    description:
      'The column the table is sorted by, as { column, direction } with direction "asc" | "desc". Absent when the admin has not sorted (roster order from the API).',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 430,
    group: "table_view",
  },
  {
    name: "table_pagination",
    label: "Table pagination",
    description:
      "Composite { page, page_size, page_count } for the table's current page position over the matching accounts. Always written; page is 1-based.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 440,
    group: "table_view",
  },

  // ── Focused account ─────────────────────────────────────────────────────
  {
    name: "focused_user_id",
    label: "Focused account id",
    description:
      "UUID from the `?user=<id>` search param — the account the admin navigated to from another console's user door. Absent when the roster is showing every account.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 500,
    group: "focused_account",
  },
  {
    name: "focused_user",
    label: "Focused account",
    description:
      "The focused account's admin-relevant record: { id, email, display_name, full_name, phone, admin_level, providers, email_confirmed, phone_confirmed, is_anonymous, banned, onboarding_completed, created_at, last_sign_in_at, organizations: [{ id, name, role }] }. This is ONE user the admin explicitly navigated to, so it carries email — unlike `roster_sample`. Absent when no `?user=` is set, or when the id is not in the loaded roster (then `focused_user_missing` is true).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 510,
    group: "focused_account",
  },
  {
    name: "focused_user_admin_level",
    label: "Focused account admin level",
    description:
      'Admin level of the focused account as the raw enum value ("developer" | "senior_admin" | "super_admin"), or "none" when the account has no admin level. Absent when no account is focused or the focused id is not in the roster.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 520,
    group: "focused_account",
  },
  {
    name: "focused_user_onboarding_completed",
    label: "Focused account onboarded",
    description:
      "Whether the focused account has completed onboarding — the same fact the roster's Onboarded column shows for that row (Yes / New). Absent when no account is focused or the focused id is not in the roster. Exposed as its own value, not only inside `focused_user`, because live agent runs read the scalars reliably and the composite less so.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 525,
    group: "focused_account",
  },
  {
    name: "focused_user_email_confirmed",
    label: "Focused account email confirmed",
    description:
      "Whether the focused account has a confirmed email address — the same fact the roster's Confirmed column shows for that row. Absent when no account is focused or the focused id is not in the roster.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 527,
    group: "focused_account",
  },
  {
    name: "focused_user_organizations",
    label: "Focused account organizations",
    description:
      "Organization memberships of the focused account, each { id, name, role } with role owner | admin | member. Absent when no account is focused; an empty array when the focused account belongs to no organization.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 530,
    group: "focused_account",
  },
  {
    name: "focused_user_missing",
    label: "Focused account missing",
    description:
      "True when `?user=<id>` is set, the roster finished loading, and no account with that id is in it — the page shows the 'that account isn't in this roster' banner. Always written; false whenever no account is focused.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 540,
    group: "focused_account",
  },

  // ── Message composer ────────────────────────────────────────────────────
  {
    name: "dm_composer_open",
    label: "Message composer open",
    description:
      "True while the in-app DM dialog is open (the admin picked 'Send in-app message' on a row). Always written.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "message_composer",
  },
  {
    name: "dm_recipient_id",
    label: "Message recipient id",
    description:
      "UUID of the account the open DM dialog is addressed to. Absent when the composer is closed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 610,
    group: "message_composer",
  },
  {
    name: "dm_draft",
    label: "Message draft",
    description:
      "Body text the admin has typed into the open DM dialog, before pressing Send. Bindable-only, never auto-context: it is a half-written message to a real person and this surface is sampled every 400ms while a Surface Context window is open. Absent when the composer is closed or empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 620,
    group: "message_composer",
  },
];

export const adminUsersManifest: SurfaceManifest = {
  surfaceName: ADMIN_USERS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired and verified live (2026-08-13): AccountsTableClient mounts SurfaceRuntimeProvider and every declared value is emitted synchronously from live render state via buildAdminUsersScope. Verified against screen ground truth in four real Badass Agent runs plus the Surface Context window (footer 'contract honored', no Undeclared entries). Short of `verified` on three counts. (1) The `ui_surface` row exists but the manifest DB sync has NOT been run — deliberately, because sync writes this branch's manifests into the shared mirror before the branch has merged; run it from /administration/ui/surfaces after merge, which is also what flips ui_surface.readiness off 'stub'. (2) The `focused_user` composite is emitted correctly and visible in the Surface Context window, but was observed NOT to reach the live agent's auto-context across three runs while every sibling value did; the per-account facts are therefore also emitted as flat scalars and the drop is documented-but-undiagnosed in the manifest header. (3) Only the roster/table/composer anchors carry `data-surface-value` — the focused-account fields render inside the focus banner and table body, which has no per-field anchor seam. Write targets are ruled OUT by design — see the manifest header.",
  label: "Users & Access — Accounts",
  urlPattern: "/administration/users",
  intro: `<surface_intro>
This is an ADMIN surface: the Users & Access hub landing tab at /administration/users, the canonical account roster for the whole platform. One row per Supabase auth user, merged with profile info and admin level, in a sortable/filterable table.

Read it in three layers. (1) The ROSTER as a whole: user_count is everything loaded; roster_health, admin_level_breakdown and provider_breakdown are count-only rollups over it — reason from these, not from individual rows. (2) The admin's LIVE QUERY: visible_user_count is how many accounts still match after the current search and column filters, so it answers "how many users match what I'm looking at" and will be smaller than user_count whenever search_query or active_column_filters is non-empty. (3) The FOCUSED account: when focused_user_id is set the admin navigated here to look at ONE person, and focused_user carries that account's admin-relevant fields — treat it as the subject of the conversation.

Per-account facts live INSIDE the focused_user object — read its fields before saying you don't have something. It carries email, display_name, full_name, phone, admin_level, providers, email_confirmed, phone_confirmed, is_anonymous, banned, onboarding_completed, created_at, last_sign_in_at and organizations. So "has this user confirmed their email / finished onboarding / when did they last sign in" IS answerable whenever an account is focused; those are not aggregate-only facts. Do not confuse focused_user (the account the ADMIN is looking at) with any ambient value describing the signed-in admin themselves — they are different people except by coincidence.

roster_sample is a capped, email-free shape probe, not the roster: never present it as the list of users, and never infer totals from it. If you need one account's email, it is in focused_user for the focused account only.

You never send an email, magic link, password reset, or in-app message, never change an admin level, and never flag onboarding — those are admin button presses on this page. This surface has no write path at all, so describe what you would do and let the admin press the button.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  // NO `writeTargets` — ruled out with evidence in the header docblock above.
};

/** One entry in `roster_sample`. Email is deliberately absent — see the header. */
export interface AdminUsersRosterSampleEntry {
  id: string;
  display_name: string | null;
  admin_level: string | null;
  providers: string[];
  email_confirmed: boolean;
  onboarding_completed: boolean;
  organization_count: number;
}

/** One entry in `focused_user_organizations` and in `focused_user.organizations`. */
export interface AdminUsersOrganizationRef {
  id: string;
  name: string;
  role: string;
}

/** The `focused_user` composite — ONE account the admin explicitly navigated to. */
export interface AdminUsersFocusedUser {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  admin_level: string | null;
  providers: string[];
  email_confirmed: boolean;
  phone_confirmed: boolean;
  is_anonymous: boolean;
  banned: boolean;
  onboarding_completed: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  organizations: AdminUsersOrganizationRef[];
}

/** The `roster_health` composite — counts only, no PII. */
export interface AdminUsersRosterHealth {
  total: number;
  email_confirmed: number;
  email_unconfirmed: number;
  onboarded: number;
  not_onboarded: number;
  anonymous: number;
  banned: number;
  with_organizations: number;
  without_organizations: number;
}

/** The `table_pagination` composite. */
export interface AdminUsersTablePagination {
  page: number;
  page_size: number;
  page_count: number;
}

/** The `sort_state` composite. */
export interface AdminUsersSortState {
  column: string;
  direction: "asc" | "desc";
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminUsersScope(values: {
  // alwaysAvailable: true → required
  user_count: number;
  roster_loading: boolean;
  roster_health: AdminUsersRosterHealth;
  visible_user_count: number;
  table_pagination: AdminUsersTablePagination;
  focused_user_missing: boolean;
  dm_composer_open: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  admin_level_breakdown?: Record<string, number>;
  provider_breakdown?: Record<string, number>;
  roster_sample?: AdminUsersRosterSampleEntry[];
  active_column_filters?: Record<string, string>;
  roster_load_error?: string;
  search_query?: string;
  sort_state?: AdminUsersSortState;
  focused_user_id?: string;
  focused_user?: AdminUsersFocusedUser;
  focused_user_admin_level?: string;
  focused_user_onboarding_completed?: boolean;
  focused_user_email_confirmed?: boolean;
  focused_user_organizations?: AdminUsersOrganizationRef[];
  dm_recipient_id?: string;
  dm_draft?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
