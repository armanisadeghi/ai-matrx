import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
// features/unified-data/hub/dataHomeScope.ts — LANE DATA-HOME-1
//
// THE DATA HOME'S FIVE FILTERS (Arman, 2026-09-27 21:20 PT). He opened /data and "Mine" read
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
import { isUuidShape } from "@ai-matrx/kit/uuid";

// THE SHELL'S LANES (Arman, 2026-09-30, common-docs/policies/access-ladder.md):
// All | Mine | My team | My Orgs | Shared | Public | System — the same words, in the same order, as
// every other list (`lib/list-scope` ListScopeKind; model /agents/all). All = Mine ∪ My team ∪ My Orgs
// ∪ Shared; Public and System are discovery lanes, never folded into All.
export const DATA_HOME_SCOPES = ["all", "mine", "team", "orgs", "shared", "public", "system"] as const;
export type DataHomeScope = (typeof DATA_HOME_SCOPES)[number];

/** The lanes the page declares to the shell's tab bar (it adds All and My team itself). */
export const DATA_HOME_SHELL_LANES = ["mine", "orgs", "shared", "public", "system"] as const;

export const DATA_HOME_SCOPE_TITLE: Record<DataHomeScope, string> = {
  all: "All",
  mine: "Mine",
  team: "My team",
  orgs: "My Orgs",
  shared: "Shared",
  public: "Public",
  system: "System",
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

/** The facts a row carries, whatever it is (a table, a form, a booking page) — its Table's. */
export interface ScopeFacts {
  mine: boolean;
  /** The Table's maker shares a live team with her in its organization (custom.data_home_tables().team). */
  team?: boolean | undefined;
  member: boolean;
  sharedWithMe: boolean;
  visibility: string | null;
  /** Its organization is one the platform keeps (custom.data_home_tables().system). */
  system?: boolean | undefined;
}

export function isPublicVisibility(visibility: string | null | undefined): boolean {
  return visibility === "public" || visibility === "link";
}

export function inDataHomeScope(facts: ScopeFacts, scope: DataHomeScope): boolean {
  switch (scope) {
    case "all":
      // Everything that is hers to see — never the discovery lanes on their own.
      return facts.mine || Boolean(facts.team) || facts.member || facts.sharedWithMe;
    case "mine":
      return facts.mine;
    case "team":
      return Boolean(facts.team);
    case "orgs":
      return facts.member;
    case "shared":
      return facts.sharedWithMe;
    case "public":
      return isPublicVisibility(facts.visibility);
    case "system":
      return Boolean(facts.system);
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
  team: "Nobody you share a team with has made any of these yet.",
  orgs: "Nothing here belongs to an organization you are a member of yet.",
  shared: "Nobody has shared any of these with you yet. When someone does, it shows here.",
  public: "None of these that you can open is public. It shows here once its owner opens it to anyone with the link.",
  system: "The platform keeps none of these for everyone yet.",
};

/** The same sentences when ONE organization is chosen in the organization dropdown (DATA-HOME-2). */
function scopeEmptyIn(scope: Exclude<DataHomeScope, "all">, organizationName: string): string {
  switch (scope) {
    case "mine":
      return `You have not made any in ${organizationName} yet. What you make there shows here.`;
    case "team":
      return `Nobody you share a team with in ${organizationName} has made any of these yet.`;
    case "orgs":
      return `Nothing in ${organizationName} is here yet.`;
    case "shared":
      return `Nobody has shared any of ${organizationName}'s with you yet. When someone does, it shows here.`;
    case "public":
      return `None of ${organizationName}'s that you can open is public. It shows here once its owner opens it to anyone with the link.`;
    case "system":
      return `${organizationName} keeps none of these for everyone.`;
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

// ── THE ORGANIZATION FILTER (Arman, 2026-09-30, common-docs/policies/access-ladder.md)
//
// Two organization concepts that never touch. The ACTIVE organization (the shell's switcher) is only
// where a new table is made; the ORGANIZATION FILTER is this page's own control (the shell's
// `EntityOrgFilter`, at the right end of the lane row), which starts at All organizations on EVERY
// visit, lives only in the address (`?org_filter=<id>`), is never remembered and is never set from the
// active organization. It narrows every lane and every listing — in the doors (`p_organization_id`).
// Only an organization the person belongs to is honoured; any other id reads as All organizations.
// (`?org=` is the link that SWITCHES the active organization — never this filter.)

export const ALL_ORGANIZATIONS = "all" as const;
export type DataHomeOrganization = string;

/** The address word of the organization filter. */
export const ORG_FILTER_PARAM = "org_filter";

/**
 * Which organization the home shows: the address, or All organizations. `memberIds` null = the
 * person's memberships have not been read yet: an id is then taken on trust (the page holds the
 * list until they are read).
 */
export function resolveDataHomeOrganization(
  fromAddress: string | null | undefined,
  memberIds: readonly string[] | null,
): DataHomeOrganization {
  if (typeof fromAddress === "string" && isUuidShape(fromAddress) && (memberIds === null || memberIds.includes(fromAddress))) {
    return fromAddress;
  }
  return ALL_ORGANIZATIONS;
}

/** The address the organization filter lives at; All organizations is no parameter at all. */
export function dataHomeOrganizationHref(
  pathname: string,
  current: URLSearchParams,
  organization: DataHomeOrganization,
): string {
  const next = new URLSearchParams(current.toString());
  if (organization === ALL_ORGANIZATIONS) next.delete(ORG_FILTER_PARAM);
  else next.set(ORG_FILTER_PARAM, organization);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
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
  page: "Pages",
  portal: "Portals",
  action: "Actions",
  checklist: "Checklists",
  booking: "Bookings",
  workflow: "Workflows",
  kit: "Kits",
  store: "The store itself",
  demo: "Demonstrations",
  app: "Platform tables",
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
  page: "Page",
  portal: "Portal",
  action: "Actions",
  checklist: "Checklist",
  booking: "Booking",
  workflow: "Workflow",
  kit: "Kit",
  store: "Store",
  demo: "Demonstration",
  app: "Platform tables",
};

function wordsOf(kind: string): string {
  return humanizeIdentifier(kind) || kind;
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
  for (const k of ITEM_KINDS_ALWAYS_OFFERED) if (!counts.has(k)) counts.set(k, 0);
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
  // A page built from tables is a dashboard record that says so (v6 lane 11, wave D).
  page: ["dashboards"],
  portal: ["portals"],
};

/** Kinds that are items of the home, not table kinds: always on offer, even when none exist yet. */
const ITEM_KINDS_ALWAYS_OFFERED = ["form", "dashboard", "portal"] as const;

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
