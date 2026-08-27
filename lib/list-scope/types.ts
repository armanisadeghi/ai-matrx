// lib/list-scope/types.ts
//
// THE VIEW LAW (CLAUDE.md + common-docs/systems/platform/db-rules/FEATURE.md §6):
// RLS is the ceiling, never the view definition. Every list query MUST
// declare its own scope explicitly — a bare `.select("*")` relying on RLS
// alone to "just filter to mine" is a defect the moment a user belongs to
// more than one org (every user does: personal org + N companies).
//
// THE VOCABULARY IS FIXED AND LIVES HERE. A surface declares WHICH of these
// it supports and supplies the predicate. It may not invent one of its own —
// a scope the user learns on one page has to mean the same thing on every
// other page. See lib/list-scope/FEATURE.md.
//
//   mine     → what did I make?
//   orgs     → what does my team have?      (blended, or narrowed to one org)
//   shared   → what did someone hand me?    (explicit iam.permissions grant)
//   industry → what does my field publish?  (see below)
//   public   → what has a tenant published platform-wide?
//   system   → what does the PLATFORM ITSELF ship?  (see below)
//
// SYSTEM (added 2026-08-26) is the platform's own corpus — builtin agents,
// global shortcuts, platform content blocks: records AI Matrx publishes, not
// records a tenant published. It is admin-only on both ends: the surface only
// renders the tab for a Matrx admin, and the RPC behind it re-checks
// `public.is_platform_admin()` so a hand-crafted request returns nothing.
//
// It is a SCOPE and not a separate admin page because that separation is what
// produced the drift it repairs: /administration/agents/system-agents/agents
// was a second, poorer list UI over the same table, and every feature added to
// /agents/all (facets, server sort, the one action menu, doors, Orchestras)
// silently skipped the system corpus. One list, one more question it answers.
//
// INDUSTRY is opt-in on BOTH ends, and is "orgs" with one more hop rather than
// a new kind of thing: curators publish into an industry
// (iam.industry_curators), and an org must ATTACH that industry
// (iam.org_industries) before its members can read the corpus. Records attach
// to an industry by GRANT ROW, following rag.data_store_grants.industry_id.
//
// A page renders one tab per scope the surface supports; switching scopes
// changes the declared query, never silently reinterprets RLS output.

export type ListScopeKind =
  | "mine"
  | "orgs"
  | "shared"
  | "industry"
  | "public"
  | "system";

export type ListScope =
  | { kind: "mine" }
  /** `organizationId: null` = blended across all my non-personal orgs. */
  | { kind: "orgs"; organizationId: string | null }
  | { kind: "shared" }
  /** `industryId: null` = blended across every industry my orgs have attached. */
  | { kind: "industry"; industryId: string | null }
  | { kind: "public" }
  /** Platform-published records. Admin-only, gated again server-side. */
  | { kind: "system" };

export const DEFAULT_LIST_SCOPE: ListScope = { kind: "mine" };

// ── Narrowing helpers ───────────────────────────────────────────────────────

export function isMineScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "mine" }> {
  return scope.kind === "mine";
}

export function isOrgsScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "orgs" }> {
  return scope.kind === "orgs";
}

export function isSharedScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "shared" }> {
  return scope.kind === "shared";
}

export function isIndustryScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "industry" }> {
  return scope.kind === "industry";
}

export function isSystemScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "system" }> {
  return scope.kind === "system";
}

export function isPublicScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "public" }> {
  return scope.kind === "public";
}

/**
 * The org this scope narrows to, or null. Saves every call site from narrowing
 * the union just to read an optional id.
 */
export function scopeOrgId(scope: ListScope): string | null {
  return scope.kind === "orgs" ? scope.organizationId : null;
}

/** The industry this scope narrows to, or null. */
export function scopeIndustryId(scope: ListScope): string | null {
  return scope.kind === "industry" ? scope.industryId : null;
}

/** Stable identity for tab selection / React keys. */
export function scopeKey(scope: ListScope): string {
  if (scope.kind === "orgs")
    return scope.organizationId ? `orgs:${scope.organizationId}` : "orgs";
  if (scope.kind === "industry")
    return scope.industryId ? `industry:${scope.industryId}` : "industry";
  return scope.kind;
}

/** Build a scope from a kind + optional narrowing id (tab click handlers). */
export function makeScope(
  kind: ListScopeKind,
  narrowToId: string | null = null,
): ListScope {
  switch (kind) {
    case "orgs":
      return { kind: "orgs", organizationId: narrowToId };
    case "industry":
      return { kind: "industry", industryId: narrowToId };
    case "mine":
      return { kind: "mine" };
    case "shared":
      return { kind: "shared" };
    case "public":
      return { kind: "public" };
    case "system":
      return { kind: "system" };
    default: {
      const _exhaustive: never = kind;
      throw new Error(`[list-scope] unknown scope kind: ${String(_exhaustive)}`);
    }
  }
}
