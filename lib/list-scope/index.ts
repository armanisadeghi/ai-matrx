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
 * carries both `organization_id` and its row controls, and the client was discarding both and filtering
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
 * 🚨 NOTHING SILENT. If the registry cannot be read, this module returns `all` — the platform's
 * default lane (2026-09-30), which widens no access — and it SAYS SO through `onFallback`, which
 * the caller wires to the repo's error capture.
 *
 * WHERE THE ANSWER LIVES (2026-09-29). The landing tab is the Feature Knob family
 * `lists.landing_tab/<token>` (see LANDING_TAB_FEATURE below), read from the ONE knob snapshot
 * (`lib/scoped-config/effectiveKnobs.ts`), so an organization or a person can override where a list
 * opens without touching who can see anything. `platform.list_scope_registry` (the view) and
 * `platform.entity_default_list_scope` read the same knob's platform value for SQL callers.
 */

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { sessionKnobPrincipals } from "@/lib/scoped-config/sessionKnob";
import type { ListScope } from "./types";
import { fetchShownToContext, shownToMyOrgsFilter } from "./shownTo";

/**
 * The registry's word for where a list lands: exactly the two values
 * `platform.entity_types.default_list_scope` can hold.
 *
 * 🚨 NOT `ListScope`, and the name is load-bearing. `lib/list-scope/types.ts` — the same module
 * folder — already exports a `ListScope`, and it is a different thing: a discriminated UNION of the
 * six scopes a surface's tabs can show (`{ kind: "mine" }`, `{ kind: "orgs", organizationId }`, …).
 * Two different types called `ListScope`, reachable as `@/lib/list-scope` and
 * `@/lib/list-scope/types`, is how a file silently types a registry word as a tab descriptor and
 * type-checks anyway. Found by DD-137c while converting the clients; the union keeps the name it
 * had, and the word it maps to gets its own.
 */
export type ListScopeWord = "all" | "mine" | "organization";

const LIST_SCOPE_WORDS: readonly ListScopeWord[] = ["all", "mine", "organization"];

/**
 * The fallback when the knob cannot be read: All, the platform's default lane (Arman 2026-09-30).
 * It widens no access — every lane is what the person may already see — it only picks the tab.
 */
export const FALLBACK_LIST_SCOPE: ListScopeWord = "all";

/** Announce when a stand-in fired. Wired by the host to `captureError`. */
export type ListScopeFallbackReporter = (message: string, cause: unknown) => void;

let reportFallback: ListScopeFallbackReporter = (message) => {
  // Even with no reporter wired, the stand-in is never silent.
  console.warn(`[list-scope] ${message}`);
};

export function setListScopeFallbackReporter(fn: ListScopeFallbackReporter): void {
  reportFallback = fn;
}

/**
 * The Feature Knob family that decides WHICH TAB a list opens on: `lists.landing_tab/<token>`,
 * `mine` | `organization`, overridable per organization and per person (2026-09-29).
 *
 * 🚨 It is NOT `access.shown_to_default/<token>` and never reads it. Who a record is shown to is a
 * visibility default (law 6: defaults lean open); where a list starts is a convenience. Until
 * 2026-09-29 the landing tab was DERIVED from the visibility knob, so the only way to make
 * /education/flashcards open on Mine was to hide every new deck from the organization — which a lane
 * did. The two are separate knobs now; each row was seeded once from the old derivation.
 */
export const LANDING_TAB_FEATURE = "lists.landing_tab";

/**
 * The Feature Knob family that decides WHETHER a list offers the organization filter:
 * `lists.org_filter/<token>`, boolean, platform default true, overridable per organization and per
 * person. It adds or removes the control only — a list with the filter off shows every organization.
 */
export const ORG_FILTER_FEATURE = "lists.org_filter";

/** The key both families carry for a list with no registered record type. */
export const DEFAULT_LIST_KNOB_KEY = "default";

/**
 * Where this token's list should open, for THIS person in their active organization (person
 * override → organization override → platform value, one cached snapshot — never a read per list).
 * On any failure returns `mine` AND reports it.
 */
export async function resolveListScope(token: string): Promise<ListScopeWord> {
  const { organizationId, userId } = sessionKnobPrincipals();
  try {
    const value = await ensureEffectiveKnob(organizationId, userId, {
      feature: LANDING_TAB_FEATURE,
      key: token,
    });
    if (LIST_SCOPE_WORDS.includes(value as ListScopeWord)) return value as ListScopeWord;
    reportFallback(
      `The landing tab for "${token}" (${LANDING_TAB_FEATURE}) answered ${JSON.stringify(value)}, which is ` +
        `not "all", "mine" or "organization", so this list opened on All.`,
      null,
    );
    return FALLBACK_LIST_SCOPE;
  } catch (cause) {
    reportFallback(
      `No landing tab is registered for "${token}" (${LANDING_TAB_FEATURE}) or it could not be read, so this ` +
        `list opened on All. Types without a "Shown to" knob (Private, Confidential, child records) have ` +
        `none on purpose; any other type needs its row seeded.`,
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
export function shouldFilterToOwner(resolved: ListScopeWord, requested?: ListScopeWord): boolean {
  return (requested ?? resolved) === "mine";
}

/** Anything with the two PostgREST filters a default list needs. */
export interface ListScopeQuery<Self> {
  eq(column: string, value: string): Self;
  or(filters: string): Self;
}

/** The answer to "where does this list land?", ready to apply to every page of the query. */
export interface DefaultListFilter {
  /** True when the list shows only the viewer's own rows. */
  ownerOnly: boolean;
  /** Narrow one query (call it on every page a paged read builds). */
  apply<Q extends ListScopeQuery<Q>>(query: Q): Q;
}

export interface DefaultListFilterOpts {
  /** The viewer. */
  userId: string;
  /** A scope the person clicked; wins over the registry. */
  requested?: ListScopeWord;
  /** Column holding the row's creator. Default "created_by". */
  ownerColumn?: string;
  /** Column holding the row's organization. Default "organization_id". */
  orgColumn?: string;
  /**
   * False only for a table with no `shown_to` column (Private / Confidential types and a few
   * system tables): the organization list is then everything row security returns.
   */
  shownTo?: boolean;
}

/**
 * THE ONE CALL a client list makes for its default landing place (access ladder T-11).
 *
 * - `mine` (the registry word, or the person's click) → only the viewer's rows.
 * - `organization` → every row the viewer can open that its "Shown to" lets a list show, across
 *   every organization they belong to (each row judged by ITS organization's default and teammates,
 *   `shownToMyOrgsFilter`), plus rows outside their organizations that reached them by a share.
 *
 * It replaced `scopeToOwner`, a yes/no answer whose "no" left the caller with NO filter at all —
 * every coworker's Only-me note in the notes sidebar (T-11 verifier, 2026-09-28). There is no
 * boolean door any more: a list either applies this filter or declares an explicit scope.
 * Reading "Shown to" fails LOUDLY (fetchShownToContext throws) — never a guess wider.
 */
export async function defaultListFilter(
  token: string,
  opts: DefaultListFilterOpts,
): Promise<DefaultListFilter> {
  const ownerColumn = opts.ownerColumn ?? "created_by";
  const orgColumn = opts.orgColumn ?? "organization_id";
  const ownerOnly = opts.requested
    ? opts.requested === "mine"
    : shouldFilterToOwner(await resolveListScope(token));
  if (ownerOnly) {
    return { ownerOnly, apply: (query) => query.eq(ownerColumn, opts.userId) };
  }
  if (opts.shownTo === false) {
    return { ownerOnly, apply: (query) => query };
  }
  const filter = shownToMyOrgsFilter(
    await fetchShownToContext(token),
    opts.userId,
    ownerColumn,
    orgColumn,
  );
  return { ownerOnly, apply: (query) => (filter ? query.or(filter) : query) };
}

/**
 * THE BRIDGE BETWEEN THE TWO HALVES OF THIS MODULE.
 *
 * `lib/list-scope/types.ts` + `applyListScope.ts` were here first: a six-value scope vocabulary
 * (`mine` / `orgs` / `shared` / `industry` / `public` / `system`) that a surface renders as tabs,
 * with `DEFAULT_LIST_SCOPE = { kind: "mine" }` — a LITERAL, and exactly the literal DD-137's second
 * axis exists to replace. This function is the same answer read from the registry instead:
 *
 *   const scope = await defaultListScopeFor("transcript");   // { kind: "all" }
 *
 * A lane never carries an organization: narrowing to ONE organization is the page's organization
 * filter (`EntityListQuery.orgId`, `?org_filter=`), never a default a list invents and never the active
 * organization.
 *
 * On any failure it returns `{ kind: "all" }` and `resolveListScope` has already said so.
 */
export async function defaultListScopeFor(token: string): Promise<ListScope> {
  const word = await resolveListScope(token);
  if (word === "organization") return { kind: "orgs" };
  if (word === "mine") return { kind: "mine" };
  return { kind: "all" };
}
