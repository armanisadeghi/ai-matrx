// features/admin/users/lib/admin-users-scope.ts
//
// Runtime scope builder for the `matrx-admin/users` surface (the Accounts
// roster at /administration/users).
//
// Why a module beside the feature rather than a helper in the manifest: the
// page's raw state is a roster array plus the table's live query state, and
// every emitted value is a DERIVATION over those (rollups, breakdowns, a
// capped sample, filter summaries). Keeping that here means the emitter in
// `AccountsTableClient.tsx` stays a single call, and the derivations are
// unit-inspectable in one place.
//
// THREE CONTRACTS THIS MODULE EXISTS TO HOLD:
//
//  1. SYNCHRONOUS. Everything below is pure computation over values the page
//     has already rendered. `getScope` is polled every 400ms by
//     `useLiveSurfaceScope` while a Surface Context window is open — a build
//     step that fetched would turn an idle debug panel into a continuous load
//     on `/api/admin/users`.
//
//  2. NO Set / Map ESCAPES. `JSON.stringify(new Set(["a"]))` is `{}`, so a Set
//     or Map that reaches the scope hands every agent an empty object while
//     the UI shows real data. The breakdown builders below accumulate into
//     plain `Record<string, number>` objects for exactly that reason; nothing
//     here returns a Set, a Map, or a class instance.
//
//  3. BOUNDED. The sampler `JSON.stringify`s the WHOLE scope to fingerprint
//     it. The roster is therefore never emitted whole — `roster_sample` is
//     capped at `ADMIN_USERS_ROSTER_SAMPLE_LIMIT` and carries no emails, and
//     the only per-account record that ships in full is the ONE account the
//     admin focused via `?user=<id>`.

import { isColumnFilterActive } from "@/components/official/matrx-data-table/filter-engine";
import type {
  ColumnFiltersState,
  ColumnFilterValue,
  SortState,
} from "@/components/official/matrx-data-table/types";
import {
  ADMIN_USERS_ROSTER_SAMPLE_LIMIT,
  createAdminUsersScope,
  type AdminUsersFocusedUser,
  type AdminUsersOrganizationRef,
  type AdminUsersRosterHealth,
  type AdminUsersRosterSampleEntry,
} from "@/features/surfaces/manifests/admin-users.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { AdminUserRow } from "../types";

/** Admin level key used for accounts that have none. */
const NO_ADMIN_LEVEL = "none";
/** Provider key used for accounts with no linked auth provider. */
const NO_PROVIDER = "none";

/** Count-only rollup over the whole loaded roster. No PII. */
export function buildRosterHealth(rows: AdminUserRow[]): AdminUsersRosterHealth {
  const health: AdminUsersRosterHealth = {
    total: rows.length,
    email_confirmed: 0,
    email_unconfirmed: 0,
    onboarded: 0,
    not_onboarded: 0,
    anonymous: 0,
    banned: 0,
    with_organizations: 0,
    without_organizations: 0,
  };
  for (const row of rows) {
    if (row.email_confirmed) health.email_confirmed += 1;
    else health.email_unconfirmed += 1;
    if (row.onboarding_completed) health.onboarded += 1;
    else health.not_onboarded += 1;
    if (row.is_anonymous) health.anonymous += 1;
    if (row.banned) health.banned += 1;
    if (row.organizations.length > 0) health.with_organizations += 1;
    else health.without_organizations += 1;
  }
  return health;
}

/** Accounts per admin level, keyed by raw enum value plus `none`. */
export function buildAdminLevelBreakdown(
  rows: AdminUserRow[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const row of rows) {
    const key = row.admin_level ?? NO_ADMIN_LEVEL;
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  return breakdown;
}

/**
 * Accounts per auth provider. An account with several linked providers counts
 * once per provider, so these can sum above the roster total — the manifest
 * description says so rather than silently under-reporting multi-provider
 * accounts.
 */
export function buildProviderBreakdown(
  rows: AdminUserRow[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const row of rows) {
    if (row.providers.length === 0) {
      breakdown[NO_PROVIDER] = (breakdown[NO_PROVIDER] ?? 0) + 1;
      continue;
    }
    for (const provider of row.providers) {
      breakdown[provider] = (breakdown[provider] ?? 0) + 1;
    }
  }
  return breakdown;
}

/**
 * A capped, EMAIL-FREE shape probe over the head of the roster. Bindable-only
 * on the manifest; see the privacy note in the manifest header for why the
 * mailing list does not ship into agent context.
 */
export function buildRosterSample(
  rows: AdminUserRow[],
): AdminUsersRosterSampleEntry[] {
  return rows.slice(0, ADMIN_USERS_ROSTER_SAMPLE_LIMIT).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    admin_level: row.admin_level,
    providers: [...row.providers],
    email_confirmed: row.email_confirmed,
    onboarding_completed: row.onboarding_completed,
    organization_count: row.organizations.length,
  }));
}

/** Trim an org membership down to the three fields an agent can act on. */
function toOrganizationRef(
  membership: AdminUserRow["organizations"][number],
): AdminUsersOrganizationRef {
  return {
    id: membership.id,
    name: membership.name,
    role: membership.role,
  };
}

/** The ONE focused account, with its admin-relevant fields (email included). */
export function buildFocusedUser(row: AdminUserRow): AdminUsersFocusedUser {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    full_name: row.full_name,
    phone: row.phone,
    admin_level: row.admin_level,
    providers: [...row.providers],
    email_confirmed: row.email_confirmed,
    phone_confirmed: row.phone_confirmed,
    is_anonymous: row.is_anonymous,
    banned: row.banned,
    onboarding_completed: row.onboarding_completed,
    created_at: row.created_at,
    last_sign_in_at: row.last_sign_in_at,
    organizations: row.organizations.map(toOrganizationRef),
  };
}

/**
 * Human-readable one-liner for an active column filter. The agent reads these
 * to explain what the admin is looking at, so they spell out the operator
 * rather than dumping the filter's internal shape.
 */
export function summarizeColumnFilter(
  filter: ColumnFilterValue,
): string | null {
  switch (filter.kind) {
    case "text": {
      if (filter.mode === "empty") return "is empty";
      if (filter.mode === "not_empty") return "is not empty";
      const text = filter.value.trim();
      return text ? `contains "${text}"` : null;
    }
    case "select": {
      if (filter.values && filter.values.length > 0) {
        return filter.values.length === 1
          ? `is ${filter.values[0]}`
          : `is any of ${filter.values.join(", ")}`;
      }
      return filter.value ? `is ${filter.value}` : null;
    }
    case "boolean":
      return `is ${filter.value}`;
    case "number": {
      if (filter.min !== undefined && filter.max !== undefined) {
        return `between ${filter.min} and ${filter.max}`;
      }
      if (filter.min !== undefined) return `at least ${filter.min}`;
      if (filter.max !== undefined) return `at most ${filter.max}`;
      return null;
    }
  }
}

/**
 * Active column filters as a PLAIN object (column id → summary). The table's
 * own `ColumnFiltersState` is already a Record, but this pass also drops the
 * inactive entries the table leaves behind when a filter is cleared — those
 * would otherwise read to an agent as "the admin filtered on this column".
 */
export function buildActiveColumnFilters(
  columnFilters: ColumnFiltersState,
): Record<string, string> {
  const active: Record<string, string> = {};
  for (const [columnId, filter] of Object.entries(columnFilters)) {
    if (!filter || !isColumnFilterActive(filter)) continue;
    const summary = summarizeColumnFilter(filter);
    if (summary) active[columnId] = summary;
  }
  return active;
}

export interface BuildAdminUsersScopeInput {
  /** Every account loaded from `/api/admin/users`, before focus narrowing. */
  rows: AdminUserRow[];
  /** True while the roster fetch is in flight. */
  loading: boolean;
  /** Message from the last failed roster fetch, if any. */
  error: string | null;
  /** `?user=<id>` — the account the admin navigated to, if any. */
  focusedUserId: string | null;
  /** The focused account's row, when it is present in the loaded roster. */
  focusedUser: AdminUserRow | null;
  /** Focus is set, the roster finished loading, and the id is not in it. */
  focusMissed: boolean;
  /** Accounts matching focus + search + column filters (the table's own count). */
  matchingCount: number;
  /** Live table query state. */
  search: string;
  columnFilters: ColumnFiltersState;
  sort: SortState | null;
  page: number;
  pageSize: number;
  /** In-app DM dialog state. */
  dmRecipientId: string | null;
  dmDraft: string;
}

/**
 * Assemble the live `matrx-admin/users` scope. Called at Run time (and by the
 * 400ms Surface Context sampler) with the page's current render state — never
 * with stale captures, and never asynchronously.
 */
export function buildAdminUsersScope(
  input: BuildAdminUsersScopeInput,
): SurfaceScopePayload {
  const {
    rows,
    loading,
    error,
    focusedUserId,
    focusedUser,
    focusMissed,
    matchingCount,
    search,
    columnFilters,
    sort,
    page,
    pageSize,
    dmRecipientId,
    dmDraft,
  } = input;

  const trimmedSearch = search.trim();
  const safePageSize = Math.max(1, pageSize);
  const draft = dmDraft.trim();

  // Empty collections are OMITTED, not emitted blank: the platform's presence
  // check (`hasValue` in SurfaceContextWindow.tsx) counts `{}` and `[]` as
  // absent, so emitting them empty reads as a broken contract rather than as
  // "nothing is filtered yet". See the manifest header for the full rationale.
  const hasRows = rows.length > 0;
  const activeColumnFilters = buildActiveColumnFilters(columnFilters);

  return createAdminUsersScope({
    // ── Roster ──────────────────────────────────────────────────────────
    user_count: rows.length,
    roster_loading: loading,
    roster_health: buildRosterHealth(rows),
    ...(hasRows
      ? {
          admin_level_breakdown: buildAdminLevelBreakdown(rows),
          provider_breakdown: buildProviderBreakdown(rows),
          roster_sample: buildRosterSample(rows),
        }
      : {}),
    ...(error ? { roster_load_error: error } : {}),

    // ── Table view ──────────────────────────────────────────────────────
    visible_user_count: matchingCount,
    ...(trimmedSearch ? { search_query: trimmedSearch } : {}),
    ...(Object.keys(activeColumnFilters).length > 0
      ? { active_column_filters: activeColumnFilters }
      : {}),
    ...(sort
      ? { sort_state: { column: sort.id, direction: sort.direction } }
      : {}),
    table_pagination: {
      page,
      page_size: safePageSize,
      page_count: Math.max(1, Math.ceil(matchingCount / safePageSize)),
    },

    // ── Focused account ─────────────────────────────────────────────────
    ...(focusedUserId ? { focused_user_id: focusedUserId } : {}),
    ...(focusedUser
      ? {
          focused_user: buildFocusedUser(focusedUser),
          focused_user_admin_level: focusedUser.admin_level ?? NO_ADMIN_LEVEL,
          // Also flattened to scalars beside the composite: live agent runs
          // read these reliably, and the composite has been observed not to
          // reach auto-context. See the manifest header.
          focused_user_onboarding_completed: focusedUser.onboarding_completed,
          focused_user_email_confirmed: focusedUser.email_confirmed,
          focused_user_organizations:
            focusedUser.organizations.map(toOrganizationRef),
        }
      : {}),
    focused_user_missing: focusMissed,

    // ── Message composer ────────────────────────────────────────────────
    dm_composer_open: dmRecipientId !== null,
    ...(dmRecipientId ? { dm_recipient_id: dmRecipientId } : {}),
    ...(draft ? { dm_draft: draft } : {}),
  });
}
