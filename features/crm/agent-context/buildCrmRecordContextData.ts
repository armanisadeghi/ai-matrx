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
} from "@/features/surfaces/manifests/crm-record.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { PlatformComment as Comment } from "@ai-matrx/associations";
import {
  CONTACT_BLOCK_REASON_LABELS,
  contactPointBlockReason,
} from "../reachability";
import type { PartyDetail } from "../types";

export interface BuildCrmRecordContextDataArgs {
  detail: PartyDetail | null;
  isLoading: boolean;
  loadError?: string | null;
  lifecycleStage?: CrmRecordCategoryScope | null;
  rating?: CrmRecordCategoryScope | null;
  roles?: CrmRecordCategoryScope[];
  notes?: Comment[];
  notesLoadError?: string | null;
}

/** Newest-first interaction timestamp — `last_touch_at` is never stored. */
function deriveLastTouch(detail: PartyDetail): string | undefined {
  let latest: string | undefined;
  for (const interaction of detail.interactions) {
    const at = interaction.occurred_at;
    if (!at) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

function buildContactPoints(detail: PartyDetail): CrmRecordContactPointScope[] {
  return detail.contactPoints.map((point) => {
    const blocked = contactPointBlockReason(detail.party, point);
    return {
      id: point.id,
      channel: point.medium.channel,
      purpose: point.purpose_code,
      value: point.medium.display_value ?? point.medium.value_key,
      is_primary: Boolean(point.is_primary),
      is_identity_key: Boolean(point.is_identity_key),
      opted_out: Boolean(point.opt_out_at),
      usable: blocked === null,
      blocked_reason: blocked ? CONTACT_BLOCK_REASON_LABELS[blocked] : null,
    };
  });
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

/** Canonical `contextData` for the CRM record surface. */
export function buildCrmRecordContextData(
  args: BuildCrmRecordContextDataArgs,
): SurfaceScopePayload {
  const { detail, isLoading } = args;
  const loadError = args.loadError ?? undefined;
  const notesLoadError = args.notesLoadError ?? undefined;

  if (!detail) {
    return createCrmRecordScope({
      is_loading: isLoading,
      load_error: loadError,
      notes_load_error: notesLoadError,
    });
  }

  const party = detail.party;
  const contactPoints = buildContactPoints(detail);

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
    lifecycle_stage: args.lifecycleStage ?? undefined,
    rating: args.rating ?? undefined,
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
    interactions: detail.interactions,
    last_touch_at: deriveLastTouch(detail),
    notes: args.notes ?? [],
    notes_load_error: notesLoadError,
    merge_state: party.canonical_id
      ? { merged_into_party_id: party.canonical_id, is_canonical: false }
      : undefined,
    is_loading: isLoading,
    load_error: loadError,
  });
}
