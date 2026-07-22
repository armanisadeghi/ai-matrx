// lib/list-scope/types.ts
//
// THE VIEW LAW (CLAUDE.md + common-docs/systems/db-rules/FEATURE.md §6):
// RLS is the ceiling, never the view definition. Every list query MUST
// declare its own scope explicitly — a bare `.select("*")` relying on RLS
// alone to "just filter to mine" is a defect the moment a user belongs to
// more than one org (every user does: personal org + N companies).
//
// Canonical scopes a list surface can request:
//   - "mine"   → rows created by the caller, across ALL of their orgs.
//   - "shared" → rows explicitly granted to the caller (not owned, not by org).
//   - "org"    → rows belonging to ONE specific org the caller is a member of.
//
// A page renders one chip/tab per scope the surface supports; switching
// scopes changes the declared query, never silently reinterprets RLS output.

export type ListScope =
  | { kind: "mine" }
  | { kind: "shared" }
  | { kind: "org"; organizationId: string };

export type ListScopeKind = ListScope["kind"];

/** Narrow a ListScope to a specific kind (type-guard helper for callers/switch statements). */
export function isOrgScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "org" }> {
  return scope.kind === "org";
}

export function isMineScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "mine" }> {
  return scope.kind === "mine";
}

export function isSharedScope(
  scope: ListScope,
): scope is Extract<ListScope, { kind: "shared" }> {
  return scope.kind === "shared";
}
