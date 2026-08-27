/**
 * Surface manifest — CRM record page (`matrx-user/crm-record`).
 *
 * The 360° view of ONE person or company at `/crm/[partyId]`. This is the
 * surface an agent is on when the user says "who is this?", "draft an email to
 * them", "what did we last discuss?" — so it emits the whole record the user
 * can see: identity, every contact point (with its deliverability state),
 * addresses, employment in both directions, and the interaction timeline.
 *
 * The record is agent-writable through approval-gated targets that reuse the
 * same canonical services and component handlers as the visible controls.
 * Identity/ownership changes (party kind, organization, merge/delete/purge)
 * remain human-only; normal record maintenance and additive activity are not.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  ADDRESS_PURPOSES,
  CONTACT_PURPOSES,
  CRM_RECORD_ADDABLE_CONTACT_CHANNELS,
  EXPERT_STATUSES,
  INTERACTION_CHANNELS,
  INTERACTION_DIRECTIONS,
} from "@/features/crm/types";

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
  {
    key: "collaboration",
    label: "Collaboration",
    sortOrder: 500,
    description: "Notes attached to the CRM record.",
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
    name: "record",
    label: "Complete CRM record",
    description:
      "The complete readable crm.party row plus its resolved primary employer. This is the exhaustive core record, including names, aliases, profile fields, classification ids, ownership/provenance metadata, timestamps, attributes, and version state.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2600,
    autoContext: false,
    group: "record_identity",
    sortOrder: 125,
  },
  {
    name: "first_name",
    label: "First name",
    description: "Person first name. Empty for companies or when unknown.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "record_identity",
    sortOrder: 126,
  },
  {
    name: "last_name",
    label: "Last name",
    description: "Person last name. Empty for companies or when unknown.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "record_identity",
    sortOrder: 127,
  },
  {
    name: "preferred_name",
    label: "Preferred name",
    description: "The name this person prefers to be called, when recorded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "record_identity",
    sortOrder: 128,
  },
  {
    name: "legal_name",
    label: "Legal name",
    description:
      "Organization legal name, when different from its display name.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "record_identity",
    sortOrder: 129,
  },
  {
    name: "job_title",
    label: "Job title",
    description: "The person's current job title shown on the identity card.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 50,
    group: "record_identity",
    sortOrder: 130,
  },
  {
    name: "headline",
    label: "Headline",
    description: "Short profile headline shown on the identity card.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "record_identity",
    sortOrder: 131,
  },
  {
    name: "bio",
    label: "Biography",
    description:
      "Full multiline biography or company profile from the identity card.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "record_identity",
    sortOrder: 132,
  },
  {
    name: "primary_domain",
    label: "Primary domain",
    description:
      "Canonical website domain associated with this person or company.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "record_identity",
    sortOrder: 133,
  },
  {
    name: "timezone",
    label: "Timezone",
    description:
      "IANA timezone recorded for this party, such as America/Los_Angeles.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 32,
    group: "record_identity",
    sortOrder: 134,
  },
  {
    name: "lifecycle_stage",
    label: "Lifecycle stage",
    description:
      "The record's current CRM lifecycle category as { id, name }, or empty when unset.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "record_identity",
    sortOrder: 135,
  },
  {
    name: "rating",
    label: "Rating",
    description:
      "The record's current CRM rating category as { id, name }, or empty when unset.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "record_identity",
    sortOrder: 136,
  },
  {
    name: "roles",
    label: "CRM roles",
    description:
      "Every party-role category currently assigned to this record as { id, name } objects.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 250,
    group: "record_identity",
    sortOrder: 137,
  },
  {
    name: "expert_status",
    label: "Expert status",
    description:
      "Expert review tier: registered, approved, vetted, or empty when this is not an expert record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 138,
  },
  {
    name: "record_class",
    label: "Record class",
    description:
      "Whether the record is a user-worked contact or was discovered by the platform.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 139,
  },
  {
    name: "source",
    label: "Record source",
    description:
      "Canonical provenance source that created or resolved this record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "record_identity",
    sortOrder: 140,
  },
  {
    name: "source_detail",
    label: "Record source detail",
    description:
      "Human-readable detail for the record's provenance source, when recorded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "record_identity",
    sortOrder: 141,
  },
  {
    name: "organization_id",
    label: "Owning organization ID",
    description:
      "UUID of the organization workspace that owns this CRM record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "record_identity",
    sortOrder: 142,
  },
  {
    name: "visibility",
    label: "Visibility",
    description: "The persisted platform visibility tier on this record.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    autoContext: false,
    group: "record_identity",
    sortOrder: 143,
  },
  {
    name: "assigned_to",
    label: "Assigned user ID",
    description: "UUID of the user assigned to this record, when assigned.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "record_identity",
    sortOrder: 144,
  },
  {
    name: "primary_employer",
    label: "Primary employer",
    description: "Resolved current primary employer as { id, name }, when set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "relationships",
    sortOrder: 290,
  },
  {
    name: "aliases",
    label: "Aliases",
    description: "Alternative names recorded for this person or company.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    group: "record_identity",
    sortOrder: 145,
  },
  {
    name: "pronouns",
    label: "Pronouns",
    description: "The person's recorded pronouns, when supplied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    autoContext: false,
    group: "record_identity",
    sortOrder: 146,
  },
  {
    name: "locale",
    label: "Locale",
    description: "The record's language/region locale, when supplied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    autoContext: false,
    group: "record_identity",
    sortOrder: 147,
  },
  {
    name: "date_of_birth",
    label: "Date of birth",
    description:
      "Person date of birth, when recorded. Bind only when the task requires it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    autoContext: false,
    group: "record_identity",
    sortOrder: 148,
  },
  {
    name: "founded_year",
    label: "Founded year",
    description: "Organization founding year, when recorded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    autoContext: false,
    group: "record_identity",
    sortOrder: 149,
  },
  {
    name: "industry_id",
    label: "Industry category ID",
    description: "UUID of the record's industry category, when classified.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "record_identity",
    sortOrder: 151,
  },
  {
    name: "do_not_contact_reason",
    label: "Do-not-contact reason",
    description:
      "Recorded reason for the party-level do-not-contact stance, when present.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "reachability",
    sortOrder: 205,
  },
  {
    name: "became_customer_at",
    label: "Became customer at",
    description:
      "ISO timestamp when this record became a customer, when recorded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    group: "record_identity",
    sortOrder: 152,
  },
  {
    name: "created_at",
    label: "Record created at",
    description: "ISO timestamp when this CRM record was created.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    group: "record_identity",
    sortOrder: 153,
  },
  {
    name: "updated_at",
    label: "Record updated at",
    description: "ISO timestamp of the record's latest persisted update.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    group: "record_identity",
    sortOrder: 154,
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
    sortOrder: 150,
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
    name: "notes",
    label: "Notes",
    description:
      "Every note attached to this record, oldest first: id, full multiline body, author identity, created_at, and updated_at.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    group: "collaboration",
    sortOrder: 500,
  },
  {
    name: "notes_load_error",
    label: "Notes load error",
    description:
      "The error currently shown by the Notes card, if notes could not be loaded. Empty when the note list is trustworthy.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "collaboration",
    sortOrder: 510,
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
    sortOrder: 160,
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
    sortOrder: 170,
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
    sortOrder: 180,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "identity_fields",
    label: "Identity fields",
    description:
      "Persists a partial identity patch through the same update path as the inline Identity card. Value is an object containing one or more of: display_name, first_name, last_name, job_title, headline, legal_name, primary_domain, timezone, bio; omitted fields are preserved and null clears an optional field.",
    valueType: "object",
    updatesValue: "identity",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 100,
  },
  {
    name: "lifecycle_stage_id",
    label: "Lifecycle stage",
    description:
      "Persists the CRM lifecycle-stage category selected in the Identity card. Value is a category UUID from lifecycle_stage, or null to clear; unknown ids are refused.",
    valueType: "string",
    updatesValue: "lifecycle_stage",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 110,
  },
  {
    name: "rating_id",
    label: "Rating",
    description:
      "Persists the CRM rating category selected in the Identity card. Value is a rating category UUID, or null to clear; unknown ids are refused.",
    valueType: "string",
    updatesValue: "rating",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 120,
  },
  {
    name: "party_role_ids",
    label: "CRM roles",
    description:
      "Replaces the complete party-role category set shown in the Identity card. Value is an array of role category UUIDs from roles; category edges from other dimensions are preserved.",
    valueType: "array",
    updatesValue: "roles",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 130,
  },
  {
    name: "expert_status",
    label: "Expert status",
    description: `Persists the expert-review tier through the record's canonical update path. Value is ${EXPERT_STATUSES.join(" | ")}, or null to clear.`,
    valueType: "string",
    updatesValue: "expert_status",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 140,
  },
  {
    name: "do_not_contact",
    label: "Do not contact",
    description:
      "Changes the record-level do-not-contact stance through the same audited block/allow path as the Identity switch. Value is boolean; lifting the record flag does not lift independent suppressions on an email or phone medium.",
    valueType: "boolean",
    updatesValue: "do_not_contact",
    mode: "entity",
    applyPolicy: "ask",
    group: "reachability",
    sortOrder: 200,
  },
  {
    name: "add_contact_point",
    label: "Add contact point",
    description: `Adds an email, phone, social handle, or URL through the Contact card's canonical medium-resolution path. Value: { channel: ${CRM_RECORD_ADDABLE_CONTACT_CHANNELS.join(" | ")}, value: string, label?: string, purpose?: ${CONTACT_PURPOSES.join(" | ")}, make_primary?: boolean }.`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "reachability",
    sortOrder: 210,
  },
  {
    name: "set_primary_contact_point",
    label: "Set primary contact point",
    description:
      "Makes one existing contact point the primary for its channel through crm_set_primary_contact_point, the same path as the star control. Value is an id from contact_points; an id not on this record is refused.",
    valueType: "string",
    updatesValue: "contact_points",
    mode: "entity",
    applyPolicy: "ask",
    group: "reachability",
    sortOrder: 220,
  },
  {
    name: "add_address",
    label: "Add address",
    description: `Adds a structured address through the Addresses card's canonical service. Value: { purpose: ${ADDRESS_PURPOSES.join(" | ")}, line1?: string, line2?: string, locality?: string, region?: string, postal_code?: string, country_code?: two-letter string, label?: string }; at least line1 or locality is required.`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "reachability",
    sortOrder: 230,
  },
  {
    name: "add_employment",
    label: "Add employment",
    description:
      "Adds an employment stint for a person through crm.affiliation, the same path as the Employment card. Value: { employer_party_id: company UUID, title?: string, department?: string, start_date?: YYYY-MM-DD, is_current?: boolean, is_primary?: boolean }; the employer must be a visible company in the same organization.",
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "relationships",
    sortOrder: 300,
  },
  {
    name: "end_employment",
    label: "End employment",
    description:
      "Ends one current employment stint today while preserving its history, exactly like the Employment card action. Value is an id from affiliations; an id not on this record or already ended is refused.",
    valueType: "string",
    updatesValue: "affiliations",
    mode: "entity",
    applyPolicy: "ask",
    group: "relationships",
    sortOrder: 310,
  },
  {
    name: "log_interaction",
    label: "Log interaction",
    description: `Adds a completed timeline entry through the Activity composer. Value: { channel: ${INTERACTION_CHANNELS.join(" | ")}, direction: ${INTERACTION_DIRECTIONS.join(" | ")}, subject?: string, body?: multiline string, duration_seconds?: non-negative number, occurred_at?: ISO timestamp }; subject or body is required.`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "activity",
    sortOrder: 400,
  },
  {
    name: "add_note",
    label: "Add note",
    description:
      "Adds a full multiline note through platform.comments, the same path as the Notes composer. Value is the non-empty note body string.",
    valueType: "string",
    updatesValue: "notes",
    mode: "entity",
    applyPolicy: "ask",
    group: "collaboration",
    sortOrder: 500,
  },
  {
    name: "promote_to_contact",
    label: "Promote to contact",
    description:
      "Promotes a platform-discovered record into the user's worked CRM contacts, the same action shown by the provenance card. Value must be true; contact records are never demoted by this target.",
    valueType: "boolean",
    updatesValue: "record_class",
    mode: "entity",
    applyPolicy: "ask",
    group: "record_identity",
    sortOrder: 150,
  },
];

export const crmRecordManifest: SurfaceManifest = {
  surfaceName: CRM_RECORD_SURFACE_NAME,
  readiness: "verified",
  label: "CRM Record",
  urlPattern: "/crm/[partyId]",
  intro: `<surface_intro>
You are on a CRM record — the 360° view of ONE person or company the user's organization knows. The complete record value is the exhaustive readable crm.party row; the direct values expose the core fields most useful for binding. Contact points, addresses, roles, employment in both directions, interactions, and notes carry the rest of the visible record context.

REACHABILITY IS NOT A GUESS. Before you propose emailing or calling anyone, read do_not_contact and contactable_summary. A contact point can be blocked by the record's own do-not-contact flag, by that point's opt-out, or by the shared medium being marked DNC / invalid / suppressed — and a medium is shared, so a suppression set by anyone applies here too. Never propose using a blocked value; say it is blocked and why.

NORMAL RECORD MAINTENANCE IS WRITABLE WITH APPROVAL. Use the declared write targets to update visible identity/classification fields, CRM roles and do-not-contact stance; add contact points, addresses, employment, interactions and notes; end an employment stint; or promote a discovered record into the contact list. Every target validates against the live page and writes through the same canonical path as its visible control. Party kind, organization/ownership, merge, delete, purge, removing historical rows, suppression overrides and candidate verdicts remain human-only.

last_touch_at is derived from the timeline, not stored. If the timeline is empty there has been no recorded interaction — that is not the same as no relationship.
</surface_intro>`,
  groups,
  values,
  writeTargets,
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

export interface CrmRecordCategoryScope {
  id: string;
  name: string;
}

export function createCrmRecordScope(values: {
  party_id?: string;
  party_kind?: string;
  display_name?: string;
  record?: unknown;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  legal_name?: string;
  job_title?: string;
  headline?: string;
  bio?: string;
  primary_domain?: string;
  timezone?: string;
  lifecycle_stage?: CrmRecordCategoryScope;
  rating?: CrmRecordCategoryScope;
  roles?: CrmRecordCategoryScope[];
  expert_status?: string;
  record_class?: string;
  source?: string;
  source_detail?: string;
  organization_id?: string;
  visibility?: string;
  assigned_to?: string;
  primary_employer?: CrmRecordCategoryScope;
  aliases?: string[];
  pronouns?: string;
  locale?: string;
  date_of_birth?: string;
  founded_year?: number;
  industry_id?: string;
  do_not_contact_reason?: string;
  became_customer_at?: string;
  created_at?: string;
  updated_at?: string;
  identity?: Record<string, unknown>;
  do_not_contact?: boolean;
  contact_points?: CrmRecordContactPointScope[];
  contactable_summary?: CrmRecordContactableSummary;
  addresses?: unknown[];
  affiliations?: unknown[];
  members?: unknown[];
  interactions?: unknown[];
  last_touch_at?: string;
  notes?: unknown[];
  notes_load_error?: string;
  merge_state?: Record<string, unknown>;
  is_loading: boolean;
  load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
