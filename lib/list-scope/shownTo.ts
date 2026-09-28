// lib/list-scope/shownTo.ts
//
// "SHOWN TO" — the per-row list choice (access ladder, common-docs/policies/access-ladder.md
// "Organization behavior is knobs and filters, not row security").
//
// A record on an Organization or Public table carries `shown_to`:
//   only_me · my_team · everyone · everyone_on_ai_matrx · NULL (= the type's
//   "Shown to by default" knob, access.shown_to_default/<token>, system → organization → person).
// It decides which LISTS show a record to people who can already open it. It never locks: a coworker
// who reaches an Only-me record by its address still opens it.
//
// The server lists (`*_list_scoped` RPCs) apply `platform.shown_to_lists(...)`. A client list that
// builds its own PostgREST query applies the same rule with `applyShownTo`, fed by ONE read of
// `platform.shown_to_context(token)` (the knob per organization + the viewer's teammates).
import { supabase } from "@/utils/supabase/client";

export type ShownTo = "only_me" | "my_team" | "everyone" | "everyone_on_ai_matrx";

/** Per organization id: the type's resolved default (`d`) and the viewer's teammates (`t`). */
export type ShownToContext = Record<string, { d: ShownTo | null; t: string[] }>;

/** One read per list: the viewer's context for one type. Throws on failure (never guesses wider). */
export async function fetchShownToContext(token: string): Promise<ShownToContext> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("shown_to_context", { p_token: token });
  if (error) {
    throw new Error(`Could not read who "${token}" lists are shown to: ${error.message}`);
  }
  return (data ?? {}) as ShownToContext;
}

export interface OrCapable<Self> {
  or(filters: string): Self;
}

/**
 * The PostgREST `or` expression for "does this row belong in my list of organization X?":
 * mine always; otherwise the row's own Shown to, else a legacy `visibility = personal` read as
 * Only me (until T-13 renames the column), else the organization's default.
 */
export function shownToFilter(
  ctx: ShownToContext,
  organizationId: string,
  userId: string,
  ownerColumn = "created_by",
): string {
  const org = ctx[organizationId];
  const team = (org?.t?.length ? org.t : [userId]).join(",");
  const byDefault = org?.d ?? "everyone";
  const arms = [
    `${ownerColumn}.eq.${userId}`,
    "shown_to.in.(everyone,everyone_on_ai_matrx)",
    `and(shown_to.eq.my_team,${ownerColumn}.in.(${team}))`,
  ];
  if (byDefault === "everyone" || byDefault === "everyone_on_ai_matrx") {
    arms.push("and(shown_to.is.null,visibility.neq.personal)");
  } else if (byDefault === "my_team") {
    arms.push(`and(shown_to.is.null,visibility.neq.personal,${ownerColumn}.in.(${team}))`);
  }
  return arms.join(",");
}

/** Narrow a one-organization list query to what Shown to lets this person's list show. */
export function applyShownTo<Q extends OrCapable<Q>>(
  query: Q,
  ctx: ShownToContext,
  organizationId: string,
  userId: string,
  ownerColumn = "created_by",
): Q {
  return query.or(shownToFilter(ctx, organizationId, userId, ownerColumn));
}

/**
 * The same rule across several organizations at once (a blended "My Orgs" list): each row is
 * judged by ITS organization's default and ITS organization's teammates.
 */
export function shownToBlendedFilter(
  ctx: ShownToContext,
  organizationIds: string[],
  userId: string,
  ownerColumn = "created_by",
  orgColumn = "organization_id",
): string {
  return organizationIds
    .map((org) => `and(${orgColumn}.eq.${org},or(${shownToFilter(ctx, org, userId, ownerColumn)}))`)
    .join(",");
}
