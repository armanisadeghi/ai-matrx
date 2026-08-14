/**
 * Surface manifest — CRM record page (`matrx-user/crm-record`).
 *
 * The 360° view of ONE person or company at `/crm/[partyId]`. This is the
 * surface an agent is on when the user says "who is this?", "draft an email to
 * them", "what did we last discuss?" — so it emits the whole record the user
 * can see: identity, every contact point (with its deliverability state),
 * addresses, employment in both directions, and the interaction timeline.
 *
 * READ-ONLY BY DESIGN. There are no write targets: every mutation on a party
 * is either governed (the server-side party resolver — see aidream
 * `services/crm/`) or destructive (merge, delete, purge, primary flips through
 * `crm_set_primary_contact_point`). An agent that wants to change this record
 * proposes it; the human presses the button, or the change lands through the
 * governed `resolve_contact` path where deduplication actually happens.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const CRM_RECORD_SURFACE_NAME = "matrx-user/crm-record";

const groups: SurfaceValueGroup[] = [
  {
    key: "record_identity",
    label: "Record identity",
    sortOrder: 100,
    description: "Who this CRM record is, and its curation/merge state.",
  },
  {
    key: "reachability",
    label: "Reachability",
    sortOrder: 200,
    description:
      "Contact points and addresses, with the suppression state that decides whether they may be used.",
  },
  {
    key: "relationships",
    label: "Relationships",
    sortOrder: 300,
    description: "Employment in both directions (employers and members).",
  },
  {
    key: "activity",
    label: "Activity",
    sortOrder: 400,
    description: "The interaction history recorded against this record.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "party_id",
    label: "Record ID",
    description:
      "UUID of the CRM record open on this page. Always populated once the record loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "record_identity",
    sortOrder: 100,
  },
  {
    name: "party_kind",
    label: "Record kind",
    description:
      "Whether this record is a person or an organization (a company the user works with — never one of the platform's own tenant organizations).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 110,
  },
  {
    name: "display_name",
    label: "Display name",
    description:
      "The record's canonical display name as shown in the page header.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "record_identity",
    sortOrder: 120,
  },
  {
    name: "identity",
    label: "Identity",
    description:
      "Full identity block: first/last name, headline, bio, primary domain, job title, current employer, lifecycle stage and rating ids, expert status, source and source detail, visibility, organization, timestamps.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "record_identity",
    sortOrder: 130,
  },
  {
    name: "do_not_contact",
    label: "Do not contact",
    description:
      "True when the record itself is flagged do-not-contact. When true, NOTHING on this record may be emailed or dialed regardless of what the contact points say.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "reachability",
    sortOrder: 200,
  },
  {
    name: "contact_points",
    label: "Contact points",
    description:
      "Every contact point on this record, each joined to its shared medium: channel, purpose, value, is_primary, is_identity_key, opt-out state, and the medium's verification / bounce / DNC / suppression state. A medium is shared across records, so its suppression applies everywhere.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "reachability",
    sortOrder: 210,
  },
  {
    name: "contactable_summary",
    label: "Contactable summary",
    description:
      "Derived counts of usable versus blocked contact points by channel, plus the reason each blocked one is blocked. Use this before proposing outreach instead of re-deriving suppression rules.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "reachability",
    sortOrder: 220,
  },
  {
    name: "addresses",
    label: "Addresses",
    description:
      "Structured postal addresses on the record (label, lines, city, region, postal code, country).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "reachability",
    sortOrder: 230,
  },
  {
    name: "affiliations",
    label: "Employment (person side)",
    description:
      "Where this person works or has worked: employer name and id, job title, current flag, start/end dates. Empty for company records.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "relationships",
    sortOrder: 300,
  },
  {
    name: "members",
    label: "People here (company side)",
    description:
      "People affiliated with this company: person name and id, job title, current flag, dates. Empty for person records.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "relationships",
    sortOrder: 310,
  },
  {
    name: "interactions",
    label: "Interactions",
    description:
      "The recorded interaction timeline (calls, emails, meetings — planned and completed), newest first: kind, direction, subject, body, outcome, occurred_at.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "activity",
    sortOrder: 400,
  },
  {
    name: "last_touch_at",
    label: "Last touch",
    description:
      "ISO timestamp of the most recent recorded interaction, derived from the timeline. Empty when there has never been one. This is deliberately NOT a stored column on the record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "activity",
    sortOrder: 410,
  },
  {
    name: "merge_state",
    label: "Merge state",
    description:
      "Whether this record was merged into another (canonical_id) and therefore is not the record to work from. Empty when this record is canonical.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "record_identity",
    sortOrder: 140,
  },
  {
    name: "is_loading",
    label: "Record is loading",
    description:
      "True while the record and its children are still being fetched. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "record_identity",
    sortOrder: 150,
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "The error currently shown on the record page, if any. Empty when the record loaded cleanly.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "record_identity",
    sortOrder: 160,
  },
];

export const crmRecordManifest: SurfaceManifest = {
  surfaceName: CRM_RECORD_SURFACE_NAME,
  readiness: "verified",
  label: "CRM Record",
  urlPattern: "/crm/[partyId]",
  intro: `<surface_intro>
You are on a CRM record — the 360° view of ONE person or company the user's organization knows. Everything the user can see is given to you: identity, every contact point with its real deliverability state, addresses, employment in both directions, and the interaction history.

REACHABILITY IS NOT A GUESS. Before you propose emailing or calling anyone, read do_not_contact and contactable_summary. A contact point can be blocked by the record's own do-not-contact flag, by that point's opt-out, or by the shared medium being marked DNC / invalid / suppressed — and a medium is shared, so a suppression set by anyone applies here too. Never propose using a blocked value; say it is blocked and why.

YOU CANNOT CHANGE THIS RECORD FROM HERE. There are no write controls on this surface, on purpose. Saving a person or company goes through the governed contact resolver (the resolve_contact operation on the data_action tool), which deduplicates against existing records rather than creating a second copy; merging, deleting and setting a primary contact point are human actions. Propose the change and say exactly what you would do; the user presses the button.

last_touch_at is derived from the timeline, not stored. If the timeline is empty there has been no recorded interaction — that is not the same as no relationship.
</surface_intro>`,
  groups,
  values,
  skipBaselineValues: false,
};

export interface CrmRecordContactPointScope {
  id: string;
  channel: string;
  purpose: string | null;
  value: string;
  is_primary: boolean;
  is_identity_key: boolean;
  opted_out: boolean;
  usable: boolean;
  blocked_reason: string | null;
}

export interface CrmRecordContactableSummary {
  usable_by_channel: Record<string, number>;
  blocked_by_channel: Record<string, number>;
  blocked_reasons: string[];
}

export function createCrmRecordScope(values: {
  party_id?: string;
  party_kind?: string;
  display_name?: string;
  identity?: Record<string, unknown>;
  do_not_contact?: boolean;
  contact_points?: CrmRecordContactPointScope[];
  contactable_summary?: CrmRecordContactableSummary;
  addresses?: unknown[];
  affiliations?: unknown[];
  members?: unknown[];
  interactions?: unknown[];
  last_touch_at?: string;
  merge_state?: Record<string, unknown>;
  is_loading: boolean;
  load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
