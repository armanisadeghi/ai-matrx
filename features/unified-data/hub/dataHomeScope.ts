// features/unified-data/hub/dataHomeScope.ts — LANE DATA-HOME-1
//
// THE DATA HOME'S FIVE FILTERS (Arman, 2026-09-27 21:20 PT). He opened /data-v2 and "Mine" read
// 0 of everything: the home showed ONE organization, and he had made his tables in another. The
// ruling, under his doctrine "access is personal": the home opens on EVERYTHING the person can see
// across ALL their organizations, each row labelled with its organization, and it offers exactly
//
//     All · Mine · My Orgs · Shared · Public
//
// Each is a fact the store decides, never a guess made here (custom.data_home_tables()):
//   All      everything the person can see
//   Mine     the Table record's own created_by is the person — in any organization
//   My Orgs  the Table belongs to an organization the person is a member of
//   Shared   a live grant names the person, given by somebody else
//   Public   open to anyone with its link (visibility public / link)
//
// RECONCILED WITH THE FOUR VISIBILITY LANES (mine · org · community · world): those are who can
// SEE a thing; this page's list is Arman's own for this page and wins here. "My Orgs" is the org
// lane widened to every organization; "Public" folds community and world together, because no
// table can be opened to every signed-in account yet (the store refuses it); "Shared" is the
// grant lane the four never named.
//
// WHICH ONE THE HOME OPENS ON is the Feature Knob `custom.data_home_default_scope` (platform
// default "all"; an organization and a person may override it). The address wins over the knob:
// `?scope=<word>` is what the person chose, and choosing is a navigation, so Back undoes it.

import type { VisibilityLane } from "@ai-matrx/records-ui";

export const DATA_HOME_SCOPES = ["all", "mine", "orgs", "shared", "public"] as const;
export type DataHomeScope = (typeof DATA_HOME_SCOPES)[number];

export const DATA_HOME_SCOPE_TITLE: Record<DataHomeScope, string> = {
  all: "All",
  mine: "Mine",
  orgs: "My Orgs",
  shared: "Shared",
  public: "Public",
};

/** The knob's one registry address. */
export const DATA_HOME_DEFAULT_SCOPE_KNOB = { feature: "custom", key: "data_home_default_scope" } as const;

/** What the home opens on when neither the address nor the knob says: everything. */
export const PLATFORM_DEFAULT_SCOPE: DataHomeScope = "all";

export function isDataHomeScope(value: unknown): value is DataHomeScope {
  return typeof value === "string" && (DATA_HOME_SCOPES as readonly string[]).includes(value);
}

/** The address first (what the person chose), then the knob, then everything. */
export function resolveDataHomeScope(fromAddress: string | null | undefined, fromKnob: unknown): DataHomeScope {
  if (isDataHomeScope(fromAddress)) return fromAddress;
  if (isDataHomeScope(fromKnob)) return fromKnob;
  return PLATFORM_DEFAULT_SCOPE;
}

/**
 * The address a filter lives at. The choice is always written out, so pressing a filter is a
 * real step in the browser's history and Back returns to where the person was.
 */
export function dataHomeScopeHref(pathname: string, current: URLSearchParams, scope: DataHomeScope): string {
  const next = new URLSearchParams(current.toString());
  next.set("scope", scope);
  return `${pathname}?${next.toString()}`;
}

/** The four facts a row carries, whatever it is (a table, a form, a booking page). */
export interface ScopeFacts {
  mine: boolean;
  member: boolean;
  sharedWithMe: boolean;
  visibility: string | null;
}

export function isPublicVisibility(visibility: string | null | undefined): boolean {
  return visibility === "public" || visibility === "link";
}

export function inDataHomeScope(facts: ScopeFacts, scope: DataHomeScope): boolean {
  switch (scope) {
    case "all":
      return true;
    case "mine":
      return facts.mine;
    case "orgs":
      return facts.member;
    case "shared":
      return facts.sharedWithMe;
    case "public":
      return isPublicVisibility(facts.visibility);
  }
}

/** A visibility lane word, as the row's `visibility` for the Public filter. */
export function visibilityOfLane(lane: VisibilityLane | null): string | null {
  return lane === "world" || lane === "community" ? "public" : lane === null ? null : "internal";
}

/**
 * WHY A FILTER IS EMPTY, IN ONE PLAIN SENTENCE — never a dead tab. Each line is only what is true
 * of that filter and names no control this app does not have.
 */
export const DATA_HOME_SCOPE_EMPTY: Record<Exclude<DataHomeScope, "all">, string> = {
  mine: "You have not made any here yet, in any of your organizations. What you make shows here.",
  orgs: "Nothing here belongs to an organization you are a member of yet.",
  shared: "Nobody has shared any of these with you yet. When someone does, it shows here.",
  public: "None of these that you can open is public. It shows here once its owner opens it to anyone with the link.",
};

/** The same sentences when ONE organization is chosen in the organization dropdown (DATA-HOME-2). */
function scopeEmptyIn(scope: Exclude<DataHomeScope, "all">, organizationName: string): string {
  switch (scope) {
    case "mine":
      return `You have not made any in ${organizationName} yet. What you make there shows here.`;
    case "orgs":
      return `Nothing in ${organizationName} is here yet.`;
    case "shared":
      return `Nobody has shared any of ${organizationName}'s with you yet. When someone does, it shows here.`;
    case "public":
      return `None of ${organizationName}'s that you can open is public. It shows here once its owner opens it to anyone with the link.`;
  }
}

/**
 * Under a filter other than All; under All a listing says its own empty sentence (what to do).
 * With one organization chosen, the sentence names it and never says "any of your organizations".
 */
export function emptyInScope(
  capabilityTitle: string,
  scope: Exclude<DataHomeScope, "all">,
  organizationName?: string | null,
): string {
  const why = organizationName ? scopeEmptyIn(scope, organizationName) : DATA_HOME_SCOPE_EMPTY[scope];
  return `No ${capabilityTitle.toLowerCase()} under ${DATA_HOME_SCOPE_TITLE[scope]}. ${why}`;
}

// ── THE ORGANIZATION DROPDOWN (lane DATA-HOME-2, Arman 2026-09-28 ~14:00 PT) ─────────────────────
//
// "With titanium selected, the home still lists every organization." The only organization control
// on the bar was the ACTIVE-organization picker ("Forms and pages from … · Change"): it governed the
// forms and pages below, and the Tables listing — read from `custom.data_home_tables()`, which took no
// organization — ignored it. A control shown and not honoured is a lie. The ruling:
//
//   1. the bar reads All · Mine · My Orgs · Shared · Public, then (after Kind) an organization
//      dropdown at the END, starting on "All Orgs";
//   2. the dropdown is honoured always, in every lane and kind, IN THE DOOR
//      (`custom.data_home_tables(p_organization_id)`), not only in the browser;
//   3. a person's pick is saved to THEIR ACCOUNT (userPreferences.lists.dataHomeOrganizationId —
//      synced per person, never per organization) so the next visit lands on it; a person who never
//      picked opens on the Feature Knob `custom.data_home_default_organization` (platform default
//      "all", no organization or user rung: those rungs are keyed by the active organization); and
//      switching the active organization elsewhere in the app never changes this filter.
//
// Order of precedence: the address (`?org=<id>|all`, what the person chose this visit, so Back
// undoes it) → the saved pick → the knob → All Orgs. Only an organization the person belongs to is
// honoured; any other id falls through to the next source.

export const ALL_ORGANIZATIONS = "all" as const;
export type DataHomeOrganization = string;

export const DATA_HOME_DEFAULT_ORGANIZATION_KNOB = { feature: "custom", key: "data_home_default_organization" } as const;

export const ALL_ORGANIZATIONS_TITLE = "All Orgs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which organization the home shows. `memberIds` null = the person's memberships have not been
 * read yet: an id is then taken on trust (the page holds the list until they are read).
 */
export function resolveDataHomeOrganization(
  fromAddress: string | null | undefined,
  fromSaved: unknown,
  fromKnob: unknown,
  memberIds: readonly string[] | null,
): DataHomeOrganization {
  for (const candidate of [fromAddress, fromSaved, fromKnob]) {
    if (candidate === ALL_ORGANIZATIONS) return ALL_ORGANIZATIONS;
    if (typeof candidate === "string" && UUID.test(candidate) && (memberIds === null || memberIds.includes(candidate))) {
      return candidate;
    }
  }
  return ALL_ORGANIZATIONS;
}

export function dataHomeOrganizationHref(
  pathname: string,
  current: URLSearchParams,
  organization: DataHomeOrganization,
): string {
  const next = new URLSearchParams(current.toString());
  next.set("org", organization);
  return `${pathname}?${next.toString()}`;
}

// ── THE KIND FILTER (Arman, 2026-09-27 21:40 PT) ────────────────────────────────────────────────
//
// The home hides nothing: every table in the store is listed, the person's own AND the ones the
// app keeps for itself (the lists behind dropdowns, scopes, booking slots, checklists, workflows,
// kits). The "Show everything" fold is gone from this page; a Kind filter on the same bar
// narrows instead. The kind is the store's word (`custom.data_home_tables().kind`), and which
// kind the home opens on is the Feature Knob `custom.data_home_default_kind` (default all).

export const ALL_KINDS = "all" as const;
export type DataHomeKind = string;

export const DATA_HOME_DEFAULT_KIND_KNOB = { feature: "custom", key: "data_home_default_kind" } as const;

/** Plural, for the filter. A word the store adds later is shown in its own words. */
const KIND_TITLE: Record<string, string> = {
  table: "Tables",
  list: "Lists",
  scope: "Scopes",
  form: "Forms",
  view: "Saved views",
  comment: "Comments",
  dashboard: "Dashboards",
  action: "Actions",
  checklist: "Checklists",
  booking: "Bookings",
  workflow: "Workflows",
  kit: "Kits",
  store: "The store itself",
  demo: "Demonstrations",
  app: "Kept by the app",
};

/** Singular, for the row. */
const KIND_ONE: Record<string, string> = {
  table: "Table",
  list: "List",
  scope: "Scope",
  form: "Form",
  view: "Saved view",
  comment: "Comments",
  dashboard: "Dashboard",
  action: "Actions",
  checklist: "Checklist",
  booking: "Booking",
  workflow: "Workflow",
  kit: "Kit",
  store: "Store",
  demo: "Demonstration",
  app: "Kept by the app",
};

function wordsOf(kind: string): string {
  const spaced = kind.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function kindTitle(kind: string): string {
  return kind === ALL_KINDS ? "All kinds" : (KIND_TITLE[kind] ?? wordsOf(kind));
}

export function kindOne(kind: string): string {
  return KIND_ONE[kind] ?? wordsOf(kind);
}

/** The address first, then the knob, then every kind. Any store word is a kind. */
export function resolveDataHomeKind(fromAddress: string | null | undefined, fromKnob: unknown): DataHomeKind {
  const valid = (v: unknown): v is string => typeof v === "string" && /^[a-z_]{1,40}$/.test(v);
  if (valid(fromAddress)) return fromAddress;
  if (valid(fromKnob)) return fromKnob;
  return ALL_KINDS;
}

/** The kinds on offer: every kind a row carries (the person's own tables first), and the chosen one. */
export function kindsOnOffer(kinds: readonly string[], chosen: DataHomeKind): string[] {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  if (chosen !== ALL_KINDS && !counts.has(chosen)) counts.set(chosen, 0);
  const ordered = [...counts.entries()]
    .sort(([a, na], [b, nb]) => (a === "table" ? -1 : b === "table" ? 1 : nb - na || a.localeCompare(b)))
    .map(([k]) => k);
  return [ALL_KINDS, ...ordered];
}

/**
 * THE OTHER LISTINGS UNDER A KIND. The Tables listing narrows to the kind; a listing of things of
 * that kind (Forms under Form) stays; everything else waits under All kinds.
 */
const KIND_LISTING: Record<string, readonly string[]> = {
  table: ["shared-with-me"],
  form: ["forms"],
  booking: ["bookings"],
  checklist: ["checklists"],
  dashboard: ["dashboards"],
};

export function listingShownUnderKind(capabilityId: string, kind: DataHomeKind): boolean {
  if (kind === ALL_KINDS || capabilityId === "tables") return true;
  return (KIND_LISTING[kind] ?? []).includes(capabilityId);
}

export function dataHomeKindHref(pathname: string, current: URLSearchParams, kind: DataHomeKind): string {
  const next = new URLSearchParams(current.toString());
  next.set("kind", kind);
  return `${pathname}?${next.toString()}`;
}

// ── THE ORDER (chair ruling 2026-09-27; Arman 2026-09-29) ──────────────────────────────────────
//
// Rows come most recently updated first (Notion, Airtable, Google Drive open this way) — or A to Z —
// per the Feature Knob `custom.data_home_default_order`, in ONE flat list. Nothing on the home is
// grouped or sectioned by organization (Arman, 2026-09-29): the organization is a filter on the bar,
// and a row names its organization the way the agents and workflows lists do.

export const DATA_HOME_ORDERS = ["updated", "name"] as const;
export type DataHomeOrder = (typeof DATA_HOME_ORDERS)[number];
export const DATA_HOME_DEFAULT_ORDER_KNOB = { feature: "custom", key: "data_home_default_order" } as const;

export function resolveDataHomeOrder(fromKnob: unknown): DataHomeOrder {
  return typeof fromKnob === "string" && (DATA_HOME_ORDERS as readonly string[]).includes(fromKnob)
    ? (fromKnob as DataHomeOrder)
    : "updated";
}

/** Sorted copy: most recent change first (a row with no known change last), or by title. */
export function inDataHomeOrder<T extends { title: string; changedAt?: string | null | undefined }>(
  items: readonly T[],
  order: DataHomeOrder,
): T[] {
  const copy = [...items];
  if (order === "name") return copy.sort((a, b) => a.title.localeCompare(b.title));
  const at = (item: T) => (item.changedAt ? Date.parse(item.changedAt) : Number.NaN);
  return copy.sort((a, b) => {
    const x = at(a);
    const y = at(b);
    if (Number.isNaN(x) && Number.isNaN(y)) return a.title.localeCompare(b.title);
    if (Number.isNaN(x)) return 1;
    if (Number.isNaN(y)) return -1;
    return y - x;
  });
}
