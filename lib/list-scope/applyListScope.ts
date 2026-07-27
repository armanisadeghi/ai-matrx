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

export interface EqCapable<Self> {
  eq(column: string, value: string): Self;
}

export interface ApplyListScopeOpts {
  /** The caller's user id — required for "mine" scope. */
  userId: string;
  /** Column that stores the row owner. Default "created_by". */
  ownerColumn?: string;
  /** Column that stores the row's org. Default "organization_id". */
  orgColumn?: string;
}

/**
 * Apply a declared ListScope to a Supabase query builder.
 *
 * This helper covers only the scopes a SINGLE `.eq()` can express. Anything
 * requiring a membership join, a grant table, or a blended set needs the
 * feature's own `*_list_scoped` RPC — see lib/list-scope/FEATURE.md.
 *
 * - "mine"     → `.eq(ownerColumn, userId)`
 * - "orgs"     → `.eq(orgColumn, organizationId)` when narrowed to ONE org.
 *                Blended (`organizationId: null`) throws: it needs the caller's
 *                org membership list, which is a join, not a filter.
 * - "shared"   → throws (grant model is per-feature).
 * - "industry" → throws (needs the grant table AND the org→industry
 *                attachment join).
 * - "public"   → throws (each feature names its own published-visibility
 *                predicate; there is no universal column).
 */
export function applyListScope<Q extends EqCapable<Q>>(
  query: Q,
  scope: ListScope,
  opts: ApplyListScopeOpts,
): Q {
  const ownerColumn = opts.ownerColumn ?? "created_by";
  const orgColumn = opts.orgColumn ?? "organization_id";

  switch (scope.kind) {
    case "mine":
      return query.eq(ownerColumn, opts.userId);
    case "orgs":
      if (scope.organizationId === null) {
        throw new Error(
          "[list-scope] applyListScope cannot express a BLENDED 'orgs' scope — " +
            "it needs the caller's org membership list (a join), not a filter. " +
            "Narrow to one organizationId, or use this feature's *_list_scoped RPC.",
        );
      }
      return query.eq(orgColumn, scope.organizationId);
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
    case "public":
      throw new Error(
        "[list-scope] applyListScope does not support 'public' — each feature " +
          "names its own published-visibility predicate. Use its *_list_scoped RPC.",
      );
    default: {
      const _exhaustive: never = scope;
      throw new Error(`[list-scope] unknown scope kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
