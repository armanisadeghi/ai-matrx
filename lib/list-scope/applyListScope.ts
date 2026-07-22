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
 * - "mine"  → `.eq(ownerColumn, userId)`
 * - "org"   → `.eq(orgColumn, scope.organizationId)`
 * - "shared" → throws. There is no generic "shared with me" filter yet —
 *   each feature has its own grant model (or will, via the shared-with-me
 *   RPC tracked as Brief 3A). Callers requesting "shared" must call their
 *   feature's own shared-with-me fetcher instead of this helper.
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
    case "org":
      return query.eq(orgColumn, scope.organizationId);
    case "shared":
      throw new Error(
        "[list-scope] applyListScope does not support 'shared' — there is " +
          "no generic shared-with-me filter yet. Use this feature's own " +
          "shared-with-me RPC/fetcher instead (generic shared RPC is Brief " +
          "3A, not yet built).",
      );
    default: {
      const _exhaustive: never = scope;
      throw new Error(`[list-scope] unknown scope kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
