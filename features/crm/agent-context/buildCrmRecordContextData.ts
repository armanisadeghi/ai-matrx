/**
 * Pure `contextData` builder for `matrx-user/crm-record` (`/crm/[partyId]`).
 *
 * Mirrors `features/cms/agent-context/buildCmsPageContextData.ts`: ONE function
 * turning the loaded `PartyDetail` into the surface's `SurfaceScopePayload`, so
 * the record page's `SurfaceRuntimeProvider` and its context menu emit
 * identical values.
 *
 * The one piece of real work here is REACHABILITY. A contact point's raw row
 * does not say whether it may be used — that answer is the shared rule in
 * `features/crm/reachability.ts` (record DNC → point opt-out → medium DNC /
 * invalid / suppressed). We resolve it here and hand the agent the verdict
 * plus the reason, so no agent has to re-derive suppression from raw columns
 * and get it wrong.
 */

import {
  createCrmRecordScope,
  type CrmRecordCategoryScope,
  type CrmRecordContactPointScope,
  type CrmRecordContactableSummary,
  type CrmRecordContactCandidateScope,
} from "@/features/surfaces/manifests/crm-record.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { ContactCandidateView } from "../enrichment/service";
import type { DealRow } from "../deals/types";
import type { PlatformComment as Comment } from "@ai-matrx/associations";
import {
  CONTACT_BLOCK_REASON_LABELS,
  contactPointBlockReason,
  mediumDisplay,
} from "../reachability";
import {
  buildModelSafeInteractionReference,
  type ModelSafeInteractionReference,
} from "../inbox/attributes";
import type { InteractionRow, PartyDetail } from "../types";

export interface BuildCrmRecordContextDataArgs {
  detail: PartyDetail | null;
  isLoading: boolean;
  loadError?: string | null;
  lifecycleStage?: CrmRecordCategoryScope | null;
  rating?: CrmRecordCategoryScope | null;
  roles?: CrmRecordCategoryScope[];
  notes?: Comment[];
  notesLoadError?: string | null;
  /** Suggested ways to reach this record, as the Contact details card shows them. `null` = not read yet. */
  contactCandidates?: ContactCandidateView[] | null;
  contactCandidatesLoadError?: string | null;
  /** The Deals card's rows (`null` = not read yet) and its failure sentence. */
  deals?: DealRow[] | null;
  dealsLoadError?: string | null;
  /** The choices the Stage / Rating / Roles controls offer (loaded categories). */
  lifecycleStageOptions?: CrmRecordCategoryScope[];
  ratingOptions?: CrmRecordCategoryScope[];
  roleOptions?: CrmRecordCategoryScope[];
  /** Ids of the tasks and files attached to this record (the Tasks / Files tiles). */
  attachedTaskIds?: string[];
  attachedFileIds?: string[];
}

/** The exact non-content interaction context permitted across the model boundary. */
export function buildModelSafeInteractionContext(
  interactions: readonly InteractionRow[],
): {
  interactions: ModelSafeInteractionReference[];
  lastTouchAt: undefined;
} {
  return {
    interactions: interactions.map(buildModelSafeInteractionReference),
    // Even derived interaction metadata stays closed until provenance is
    // authoritative; the reference list preserves count and IDs only.
    lastTouchAt: undefined,
  };
}

function buildContactPoints(detail: PartyDetail): CrmRecordContactPointScope[] {
  return detail.contactPoints.map((point) => {
    const blocked = contactPointBlockReason(detail.party, point);
    return {
      id: point.id,
      channel: point.medium.channel,
      purpose: point.purpose_code,
      value: mediumDisplay(point.medium).text || point.medium.value_key,
      is_primary: Boolean(point.is_primary),
      is_identity_key: Boolean(point.is_identity_key),
      opted_out: Boolean(point.opt_out_at),
      usable: blocked === null,
      blocked_reason: blocked ? CONTACT_BLOCK_REASON_LABELS[blocked] : null,
    };
  });
}

function candidateScope(
  row: ContactCandidateView,
): CrmRecordContactCandidateScope {
  return {
    id: row.id,
    address: row.address,
    person_name: row.person_name ?? null,
    role_title: row.role_title ?? null,
    verification_status: row.verification_status ?? "unverified",
    is_role_address: Boolean(row.is_role_address),
    engagement_score: row.engagement_score ?? null,
    source: row.source,
    why: row.why ?? [],
  };
}

function summarize(
  points: CrmRecordContactPointScope[],
): CrmRecordContactableSummary {
  const usable: Record<string, number> = {};
  const blocked: Record<string, number> = {};
  const reasons = new Set<string>();
  for (const point of points) {
    const bucket = point.usable ? usable : blocked;
    bucket[point.channel] = (bucket[point.channel] ?? 0) + 1;
    if (point.blocked_reason) reasons.add(point.blocked_reason);
  }
  return {
    usable_by_channel: usable,
    blocked_by_channel: blocked,
    blocked_reasons: [...reasons],
  };
}

/** What the Stage and Rating selects show when nothing is chosen: "None". */
const NONE_CHOSEN = { id: null, name: "None" } as const;

/** Canonical `contextData` for the CRM record surface. */
export function buildCrmRecordContextData(
  args: BuildCrmRecordContextDataArgs,
): SurfaceScopePayload {
  const { detail, isLoading } = args;
  const loadError = args.loadError ?? undefined;
  const notesLoadError = args.notesLoadError ?? undefined;
  const contactCandidatesLoadError =
    args.contactCandidatesLoadError ?? undefined;

  if (!detail) {
    return createCrmRecordScope({
      is_loading: isLoading,
      load_error: loadError,
      notes_load_error: notesLoadError,
      contact_candidates_load_error: contactCandidatesLoadError,
    });
  }

  const party = detail.party;
  const contactPoints = buildContactPoints(detail);
  const interactionContext = buildModelSafeInteractionContext(
    detail.interactions,
  );

  return createCrmRecordScope({
    party_id: party.id,
    party_kind: party.party_kind,
    display_name: party.display_name,
    record: party,
    first_name: party.first_name ?? undefined,
    last_name: party.last_name ?? undefined,
    preferred_name: party.preferred_name ?? undefined,
    legal_name: party.legal_name ?? undefined,
    job_title: party.job_title ?? undefined,
    headline: party.headline ?? undefined,
    bio: party.bio ?? undefined,
    primary_domain: party.primary_domain ?? undefined,
    timezone: party.timezone ?? undefined,
    // Shown on the page as "None" when unset — so the agent sees it as set to
    // nothing (null), never as a value it was not told about.
    lifecycle_stage: args.lifecycleStage ?? NONE_CHOSEN,
    rating: args.rating ?? NONE_CHOSEN,
    lifecycle_stage_options: args.lifecycleStageOptions,
    rating_options: args.ratingOptions,
    role_options: args.roleOptions,
    roles: args.roles ?? [],
    expert_status: party.expert_status ?? undefined,
    record_class: party.record_class,
    source: party.source ?? undefined,
    source_detail: party.source_detail ?? undefined,
    organization_id: party.organization_id,
    visibility: party.visibility,
    assigned_to: party.assigned_to ?? undefined,
    primary_employer: party.employer
      ? { id: party.employer.id, name: party.employer.display_name }
      : undefined,
    aliases: party.aka,
    pronouns: party.pronouns ?? undefined,
    locale: party.locale ?? undefined,
    date_of_birth: party.date_of_birth ?? undefined,
    founded_year: party.founded_year ?? undefined,
    industry_id: party.industry_id ?? undefined,
    do_not_contact_reason: party.do_not_contact_reason ?? undefined,
    became_customer_at: party.became_customer_at ?? undefined,
    created_at: party.created_at,
    updated_at: party.updated_at,
    identity: {
      first_name: party.first_name,
      last_name: party.last_name,
      headline: party.headline,
      bio: party.bio,
      job_title: party.job_title,
      primary_domain: party.primary_domain,
      primary_employer: party.employer
        ? { id: party.employer.id, name: party.employer.display_name }
        : null,
      lifecycle_stage_id: party.lifecycle_stage_id,
      rating_id: party.rating_id,
      expert_status: party.expert_status,
      source: party.source,
      source_detail: party.source_detail,
      visibility: party.visibility,
      organization_id: party.organization_id,
      created_at: party.created_at,
      updated_at: party.updated_at,
    },
    do_not_contact: Boolean(party.do_not_contact),
    contact_points: contactPoints,
    contactable_summary: summarize(contactPoints),
    addresses: detail.addresses,
    affiliations: detail.affiliations,
    members: detail.members,
    interactions: interactionContext.interactions,
    last_touch_at: interactionContext.lastTouchAt,
    notes: args.notes ?? [],
    notes_load_error: notesLoadError,
    // Omitted until read; a failed read reports only its sentence.
    contact_candidates: args.contactCandidates?.map(candidateScope),
    contact_candidates_load_error: contactCandidatesLoadError,
    deals: args.deals?.map((deal) => ({
      id: deal.id,
      name: deal.name,
      amount: deal.amount,
      currency: deal.currency,
      status: deal.status,
      stage_id: deal.stage_id,
      expected_close_date: deal.expected_close_date,
    })),
    deals_load_error: args.dealsLoadError ?? undefined,
    attached_task_ids: args.attachedTaskIds,
    attached_file_ids: args.attachedFileIds,
    merge_state: party.canonical_id
      ? { merged_into_party_id: party.canonical_id, is_canonical: false }
      : undefined,
    is_loading: isLoading,
    load_error: loadError,
  });
}
