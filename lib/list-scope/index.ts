/**
 * THE LIST-SCOPE AXIS — where a list LANDS, read from the registry instead of hard-coded.
 *
 * Design: common-docs `/projects/data-doctrine-adoption/discovery/VISIBILITY-BY-CLASS.md` §3.3
 * (chair R2). Landed in the database by DD-137b1
 * (`platform.entity_types.default_list_scope` ∈ `mine` | `organization`) and DD-137b7 (the nine
 * list RPCs that take their default from it).
 *
 * WHY THIS EXISTS
 * ---------------
 * Four people in one organization each researched SEO keywords and each of them saw only their own.
 * Every one of those rows was readable by every one of those people — `content_ir.kind_instance`
 * carries both `organization_id` and `visibility`, and the client was discarding both and filtering
 * on `created_by` instead. Measured across the two repos on 2026-09-12: **27 HIGH call sites** do
 * the same thing to the organization's own data, and 17 more are ambiguous.
 *
 * So this is NOT an access fix. Access is decided by RLS and by `data_class`; this decides only
 * where a screen OPENS. The two axes are deliberately separate, because changing where a list lands
 * must never change a table's security posture — that conflation is what produced the complaint.
 *
 * THE RULE THIS MODULE ENFORCES
 * -----------------------------
 * A list applies an owner filter when — and only when — the registry says the token lands on
 * `mine`. It never applies one "to be safe": a default that shows LESS than it should is the bug,
 * and RLS is already the ceiling. And the other scope is always one click away and never blocked
 * (§3.3), so a caller may always pass an explicit scope and get exactly that.
 *
 * 🚨 NOTHING SILENT. If the registry cannot be read, this module returns `mine` — the narrower
 * screen, which is never WRONG, only sometimes emptier than it should be — and it SAYS SO through
 * `onFallback`, which the caller wires to the repo's error capture. A screen that quietly shows one
 * person's rows where the organization's belong is the defect; a screen that says "showing only
 * yours — the registry was unreachable" is honest.
 *
 * DESTINATION. The registry metadata this reads is already mirrored client-side by
 * `@ai-matrx/associations` (see `features/scopes/registry/entityRegistry.ts`), and
 * `default_list_scope` belongs in that generated metadata so every client app inherits it without a
 * query. Until that package regenerates, this module reads the column directly — once per session,
 * for the whole registry — rather than 27 features each inventing their own read.
 */

import { supabase } from "@/utils/supabase/client";

export type ListScope = "mine" | "organization";

/** The narrower screen is the safe fallback: never wrong, only sometimes emptier. */
export const FALLBACK_LIST_SCOPE: ListScope = "mine";

/** A whole-registry snapshot, fetched once per browser session. */
let registryPromise: Promise<Map<string, ListScope>> | null = null;

/** Announce when a stand-in fired. Wired by the host to `captureError`. */
export type ListScopeFallbackReporter = (message: string, cause: unknown) => void;

let reportFallback: ListScopeFallbackReporter = (message) => {
  // Even with no reporter wired, the stand-in is never silent.
  console.warn(`[list-scope] ${message}`);
};

export function setListScopeFallbackReporter(fn: ListScopeFallbackReporter): void {
  reportFallback = fn;
}

/** Test seam: forget the cached registry so a test can serve a different one. */
export function resetListScopeCache(): void {
  registryPromise = null;
}

async function loadRegistry(): Promise<Map<string, ListScope>> {
  const { data, error } = await supabase
    .schema("platform")
    .from("entity_types")
    .select("token,default_list_scope")
    .eq("is_active", true)
    .not("default_list_scope", "is", null);
  if (error) {
    throw new Error(error.message);
  }
  const map = new Map<string, ListScope>();
  for (const row of data ?? []) {
    const scope = row.default_list_scope;
    if (scope === "mine" || scope === "organization") map.set(row.token, scope);
  }
  if (map.size === 0) {
    // An empty registry is not a registry. Treating it as "everything is mine" would hide every
    // organization's data behind a silent read failure.
    throw new Error("platform.entity_types returned no list scopes");
  }
  return map;
}

/**
 * Where this token's list should open. Reads the registry once per session; on any failure returns
 * `mine` AND reports it.
 */
export async function resolveListScope(token: string): Promise<ListScope> {
  try {
    registryPromise ??= loadRegistry();
    const map = await registryPromise;
    const scope = map.get(token);
    if (scope) return scope;
    reportFallback(
      `No default_list_scope is registered for "${token}", so this list is showing only your own rows. ` +
        `Classify the token in platform.entity_types (DD-137b) and the screen will open where it belongs.`,
      null,
    );
    return FALLBACK_LIST_SCOPE;
  } catch (cause) {
    // A failed read must not poison the session forever — the next call retries.
    registryPromise = null;
    reportFallback(
      `Could not read where this list should open (platform.entity_types), so it is showing only your ` +
        `own rows. If the organization's data is missing from this screen, that is why.`,
      cause,
    );
    return FALLBACK_LIST_SCOPE;
  }
}

/**
 * THE PURE RULE, so it can be tested without a database and reused by any query builder.
 *
 * Returns true when the caller must apply its owner filter. An explicit scope always wins — "one
 * click away and never blocked".
 */
export function shouldFilterToOwner(resolved: ListScope, requested?: ListScope): boolean {
  return (requested ?? resolved) === "mine";
}

/**
 * The one call a list site makes: "should I scope this to me?" — answered by the registry unless
 * the caller (a scope toggle the person clicked) says otherwise.
 */
export async function scopeToOwner(token: string, requested?: ListScope): Promise<boolean> {
  if (requested) return requested === "mine";
  return shouldFilterToOwner(await resolveListScope(token));
}
