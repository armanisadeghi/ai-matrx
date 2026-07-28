// features/crm/types.ts
//
// Types for the CRM feature — ALL row shapes derive from the generated
// `types/database.types.ts` (`crm` schema). Never hand-mirror a table shape.
//
// Read features/crm/FEATURE.md before touching contact data: a MEDIUM
// (crm.contact_medium — the value + its deliverability/suppression state) is
// not a CONTACT POINT (crm.party_contact_point — who uses it, how, since when).

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

// ── Generated row aliases ───────────────────────────────────────────────────

export type PartyRow = Database["crm"]["Tables"]["party"]["Row"];
export type PartyInsert = Database["crm"]["Tables"]["party"]["Insert"];
export type PartyUpdate = Database["crm"]["Tables"]["party"]["Update"];

export type ContactMediumRow =
  Database["crm"]["Tables"]["contact_medium"]["Row"];
export type ContactMediumInsert =
  Database["crm"]["Tables"]["contact_medium"]["Insert"];

export type PartyContactPointRow =
  Database["crm"]["Tables"]["party_contact_point"]["Row"];
export type PartyContactPointInsert =
  Database["crm"]["Tables"]["party_contact_point"]["Insert"];

export type AddressRow = Database["crm"]["Tables"]["address"]["Row"];
export type AddressInsert = Database["crm"]["Tables"]["address"]["Insert"];

export type AffiliationRow = Database["crm"]["Tables"]["affiliation"]["Row"];
export type AffiliationInsert =
  Database["crm"]["Tables"]["affiliation"]["Insert"];

export type InteractionRow = Database["crm"]["Tables"]["interaction"]["Row"];
export type InteractionInsert =
  Database["crm"]["Tables"]["interaction"]["Insert"];

export type CampaignRow = Database["crm"]["Tables"]["campaign"]["Row"];

// ── Joined shapes (embeds — compositions of generated rows, never mirrors) ──

/** The minimal party reference an embed resolves (employer, member, …). */
export type PartyRef = Pick<PartyRow, "id" | "display_name" | "party_kind">;

/** One list row: the party plus its resolved primary employer. */
export type PartyListRow = PartyRow & { employer: PartyRef | null };

/** A contact point JOINED to its medium — the only legal read shape. */
export type ContactPoint = PartyContactPointRow & { medium: ContactMediumRow };

/** An affiliation joined to the employer party (person side). */
export type AffiliationWithEmployer = AffiliationRow & {
  employer: PartyRef | null;
};

/** An affiliation joined to the person (company side — "people here"). */
export type AffiliationWithPerson = AffiliationRow & {
  person: PartyRef | null;
};

/** Everything the record page needs, loaded in one parallel batch. */
export interface PartyDetail {
  party: PartyListRow;
  contactPoints: ContactPoint[];
  addresses: AddressRow[];
  /** Person side: where this person works / worked. */
  affiliations: AffiliationWithEmployer[];
  /** Company side: who works / worked here. */
  members: AffiliationWithPerson[];
  interactions: InteractionRow[];
}

// ── Closed vocabularies (from the live CHECK constraints; see crm_02_core) ──

export const PARTY_KINDS = ["person", "organization"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export const CONTACT_CHANNELS = [
  "email",
  "phone",
  "social",
  "messaging",
  "url",
  "external_id",
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_PURPOSES = [
  "work",
  "personal",
  "mobile",
  "direct",
  "switchboard",
  "main",
  "billing",
  "support",
  "other",
] as const;
export type ContactPurpose = (typeof CONTACT_PURPOSES)[number];

export const ADDRESS_PURPOSES = [
  "office",
  "billing",
  "shipping",
  "home",
  "mailing",
  "other",
] as const;
export type AddressPurpose = (typeof ADDRESS_PURPOSES)[number];

export const INTERACTION_CHANNELS = [
  "call",
  "email",
  "meeting",
  "sms",
  "social",
  "note",
  "task",
  "other",
] as const;
export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export const INTERACTION_DIRECTIONS = ["outbound", "inbound"] as const;
export type InteractionDirection = (typeof INTERACTION_DIRECTIONS)[number];

// ── List query (THE VIEW LAW — this surface's declared scopes) ──────────────

/**
 * Which of the fixed five scopes this surface supports. "shared" needs a
 * per-feature grant reader (no generic one exists yet — Brief 3A); it joins
 * this list the moment `crm` grows one.
 */
export const CRM_LIST_SCOPES: ListScopeKind[] = ["mine", "orgs", "public"];

/** The list's kind facet — People / Companies / All. */
export type PartyKindFilter = "all" | PartyKind;

/** Relative "updated within" buckets the date filters offer. */
export const DATE_BUCKETS = [
  { value: "1d", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "90d", label: "Last 90 days", hours: 24 * 90 },
] as const;
export type DateBucket = (typeof DATE_BUCKETS)[number]["value"];

/** Column filters the party list can serve SERVER-SIDE via PostgREST. */
export interface PartyListFilters {
  display_name?: string;
  job_title?: string;
  primary_domain?: string;
  party_kind?: PartyKind[];
  do_not_contact?: boolean;
  updated_at?: DateBucket;
  created_at?: DateBucket;
}

export interface PartyListQuery {
  scope: import("@/lib/list-scope/types").ListScope;
  search: string;
  kind: PartyKindFilter;
  filters: PartyListFilters;
  /** One-based, matching the pagination UI. */
  page: number;
}

export const DEFAULT_PARTY_QUERY: PartyListQuery = {
  scope: { kind: "mine" },
  search: "",
  kind: "all",
  filters: {},
  page: 1,
};

/** Sort keys the service whitelists (DB columns only — never rendered cells). */
export const PARTY_SORT_KEYS = [
  "display_name",
  "party_kind",
  "job_title",
  "primary_domain",
  "created_at",
  "updated_at",
] as const;
export type PartySortKey = (typeof PARTY_SORT_KEYS)[number];

export interface PartySortOpts {
  sort: string;
  direction: "asc" | "desc";
  pageSize: number;
}

/** The caller's identity + org membership, resolved once by the hook. */
export interface CrmQueryContext {
  userId: string;
  /** Every org the user belongs to (personal + companies), for "orgs". */
  orgIds: string[];
  /** Org names for the My Orgs narrowing dropdown, from getUserOrganizations. */
  orgNames: Record<string, string>;
}
