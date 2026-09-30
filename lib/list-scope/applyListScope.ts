// lib/list-scope/applyListScope.ts
//
// THE VIEW LAW primitive: turns a declared `ListScope` into the `.eq(...)`
// that makes a list query's scope explicit instead of relying on RLS alone
// to narrow rows to "what the user probably meant."
//
// Usage:
//   let q = supabase.schema("transcripts").from("transcripts").select("*");
//   q = applyListScope(q, { kind: "mine" }, { userId });
//
// Pragmatic typing: supabase-js's PostgrestFilterBuilder generics are
// deep and callsite-specific (Row/Result/Relationships...); we accept any
// object exposing `.eq(column, value)` and returning the same shape, which
// covers PostgrestFilterBuilder / PostgrestTransformBuilder generically
// without erasing to `any`.
import type { ListScope } from "./types";
import { shownToFilter, type ShownToContext } from "./shownTo";

export interface EqCapable<Self> {
  eq(column: string, value: string): Self;
  or(filters: string): Self;
}

export interface ApplyListScopeOpts {
  /** The caller's user id — required for "mine" scope. */
  userId: string;
  /** Column that stores the row owner. Default "created_by". */
  ownerColumn?: string;
  /** Column that stores the row's org. Default "organization_id". */
  orgColumn?: string;
  /**
   * The viewer's "Shown to" context for this list's type (`fetchShownToContext(token)`). When
   * given, an organization list shows only what each row's Shown to lets it show (access ladder
   * T-11). Omit only for a table with no `shown_to` column (Private / Confidential types).
   */
  shownTo?: ShownToContext;
  /**
   * THE ORGANIZATION FILTER (`EntityListQuery.orgId`; null = All organizations). It narrows
   * EVERY lane — never the active organization (common-docs
   * /policies/active-org-is-never-a-list-filter.md).
   */
  organizationId?: string | null;
}

/**
 * Apply a declared ListScope to a Supabase query builder.
 *
 * This helper covers only the scopes a SINGLE `.eq()` can express. Anything
 * requiring a membership join, a grant table, or a blended set needs the
 * feature's own `*_list_scoped` RPC — see lib/list-scope/FEATURE.md.
 *
 * - "mine"     → `.eq(ownerColumn, userId)` (+ `.eq(orgColumn, organizationId)`
 *                when the organization filter names one)
 * - "orgs"     → `.eq(orgColumn, organizationId)` when the organization filter
 *                names ONE org. Blended (no filter) throws: it needs the caller's
 *                org membership list, which is a join, not a filter.
 * - "all"      → throws (a union of four lanes; use the feature's RPC).
 * - "shared"   → throws (grant model is per-feature).
 * - "industry" → throws (needs the grant table AND the org→industry
 *                attachment join).
 * - "public"   → throws (each feature names its own published-visibility
 *                predicate; there is no universal column).
 * - "system"   → throws (the platform corpus is admin-gated, and the gate has
 *                to be re-checked server-side; a client `.eq()` cannot be the
 *                authorization for it).
 */
export function applyListScope<Q extends EqCapable<Q>>(
  query: Q,
  scope: ListScope,
  opts: ApplyListScopeOpts,
): Q {
  const ownerColumn = opts.ownerColumn ?? "created_by";
  const orgColumn = opts.orgColumn ?? "organization_id";

  const organizationId = opts.organizationId ?? null;
  switch (scope.kind) {
    case "mine": {
      const mine = query.eq(ownerColumn, opts.userId);
      return organizationId ? mine.eq(orgColumn, organizationId) : mine;
    }
    case "all":
      throw new Error(
        "[list-scope] applyListScope cannot express 'all' — it is Mine ∪ My team ∪ " +
          "My Orgs ∪ Shared, a union of joins. Use this feature's *_list_scoped RPC.",
      );
    case "orgs":
      if (organizationId === null) {
        throw new Error(
          "[list-scope] applyListScope cannot express a BLENDED 'orgs' scope — " +
            "it needs the caller's org membership list (a join), not a filter. " +
            "Pass the organization filter (opts.organizationId), or use this feature's *_list_scoped RPC.",
        );
      }
      return opts.shownTo
        ? query
            .eq(orgColumn, organizationId)
            .or(shownToFilter(opts.shownTo, organizationId, opts.userId, ownerColumn))
        : query.eq(orgColumn, organizationId);
    case "team":
      throw new Error(
        "[list-scope] applyListScope does not support 'team' — it needs the " +
          "caller's team reach first (an async read). Fetch it with " +
          "fetchMyTeamReach and filter with teamReachOrFilter " +
          "(lib/list-scope/teamReach.ts), or use this feature's *_list_scoped RPC.",
      );
    case "shared":
      throw new Error(
        "[list-scope] applyListScope does not support 'shared' — there is " +
          "no generic shared-with-me filter yet. Use this feature's own " +
          "shared-with-me RPC/fetcher instead (generic shared RPC is Brief " +
          "3A, not yet built).",
      );
    case "industry":
      throw new Error(
        "[list-scope] applyListScope does not support 'industry' — reach is " +
          "'record granted to industry I' AND 'one of my orgs has attached I', " +
          "which is two joins. Use this feature's *_list_scoped RPC.",
      );
    case "system":
      throw new Error(
        "[list-scope] applyListScope does not support 'system' — the platform " +
          "corpus is admin-gated, and a client-side .eq() is not an " +
          "authorization check. Use this feature's *_list_scoped RPC, which " +
          "re-verifies public.is_platform_admin() server-side.",
      );
    case "public":
      throw new Error(
        "[list-scope] applyListScope does not support 'public' — each feature " +
          "names its own published-visibility predicate. Use its *_list_scoped RPC.",
      );
    case "platform_orgs":
    case "platform_users":
    case "platform_all":
      throw new Error(
        `[list-scope] applyListScope does not support '${scope.kind}' — the admin ` +
          "platform scopes are admin-gated and need the org/person classification " +
          "(system vs organization vs personal), which is a join. Use this feature's " +
          "admin RPC, which re-verifies public.is_platform_admin() server-side.",
      );
    default: {
      const _exhaustive: never = scope;
      throw new Error(`[list-scope] unknown scope kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
