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
  type CrmRecordContactPointScope,
  type CrmRecordContactableSummary,
} from "@/features/surfaces/manifests/crm-record.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  CONTACT_BLOCK_REASON_LABELS,
  contactPointBlockReason,
} from "../reachability";
import type { PartyDetail } from "../types";

export interface BuildCrmRecordContextDataArgs {
  detail: PartyDetail | null;
  isLoading: boolean;
  loadError?: string | null;
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

  if (!detail) {
    return createCrmRecordScope({
      is_loading: isLoading,
      load_error: loadError,
    });
  }

  const party = detail.party;
  const contactPoints = buildContactPoints(detail);

  return createCrmRecordScope({
    party_id: party.id,
    party_kind: party.party_kind,
    display_name: party.display_name,
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
    merge_state: party.canonical_id
      ? { merged_into_party_id: party.canonical_id, is_canonical: false }
      : undefined,
    is_loading: isLoading,
    load_error: loadError,
  });
}
