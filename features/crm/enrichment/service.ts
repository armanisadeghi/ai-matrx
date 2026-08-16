import type { components } from "@/types/python-generated/api-types";
import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";

/**
 * The enrichment doors (WP3). Every one is a thin call onto a server service
 * function — the same code path a scheduled sweep or a workflow node uses.
 *
 * The rule this whole surface exists to serve: **a candidate is never a
 * contact.** Nothing here makes anybody reachable except `confirmCandidate`,
 * which is the human act, and the server re-checks everything again at send
 * time regardless of what this UI does.
 */

export type ContactCandidateView =
  components["schemas"]["ContactCandidateView"];
export type WaterfallResult = components["schemas"]["WaterfallResult"];
export type FinalMileResult = components["schemas"]["FinalMileResult"];
export type ActivityVerdict = components["schemas"]["ActivityVerdict"];
export type BeatProfile = components["schemas"]["BeatProfile"];

const CANDIDATES = "/crm/parties/{party_id}/contacts";
const FIND = "/crm/parties/{party_id}/contacts/find";
const CONFIRM = "/crm/parties/{party_id}/contacts/{candidate_id}/confirm";
const REJECT = "/crm/parties/{party_id}/contacts/{candidate_id}/reject";
const VERIFY = "/crm/parties/{party_id}/contacts/verify";
const ACTIVITY = "/crm/parties/{party_id}/journalist-activity";
const BEAT = "/crm/parties/{party_id}/journalist-beat";

/** IC-3 — the ONE ranked list of ways to reach someone here. Writes nothing. */
export async function fetchContactCandidates(
  partyId: string,
  options?: { includeResolved?: boolean },
): Promise<ContactCandidateView[]> {
  const { data } = await apiGet(buildPath(CANDIDATES, { party_id: partyId }), {
    query: { include_resolved: options?.includeResolved ? "true" : "false" },
  });
  return data;
}

/** Run the waterfall. Produces candidates only — never a contact. */
export async function findContacts(
  partyId: string,
  input?: { personName?: string; usePaidProviders?: boolean },
): Promise<WaterfallResult> {
  const { data } = await apiPost(buildPath(FIND, { party_id: partyId }), {
    person_name: input?.personName ?? null,
    use_paid_providers: input?.usePaidProviders ?? true,
  });
  return data;
}

/**
 * The human act. The two second-confirmations are NAMED, never a force flag:
 * a shared inbox is not proof of a personal mailbox, and an unverified address
 * is a bounce risk against the user's own sending domain.
 */
export async function confirmCandidate(
  partyId: string,
  candidateId: string,
  input: { acceptRoleAddress: boolean; acceptUnverified: boolean },
): Promise<ContactCandidateView> {
  const { data } = await apiPost(
    buildPath(CONFIRM, { party_id: partyId, candidate_id: candidateId }),
    {
      accept_role_address: input.acceptRoleAddress,
      accept_unverified: input.acceptUnverified,
    },
  );
  return data;
}

/** Refuse a candidate. The verdict survives every later re-discovery. */
export async function rejectCandidate(
  partyId: string,
  candidateId: string,
  reason?: string,
): Promise<ContactCandidateView> {
  const { data } = await apiPost(
    buildPath(REJECT, { party_id: partyId, candidate_id: candidateId }),
    { reason: reason ?? null },
  );
  return data;
}

/** Free syntax/MX/disposable filter, then the paid final mile if it passed. */
export async function verifyAddress(
  partyId: string,
  mediumId: string,
): Promise<FinalMileResult> {
  const { data } = await apiPost(buildPath(VERIFY, { party_id: partyId }), {
    medium_id: mediumId,
    force: false,
  });
  return data;
}

/** Is this person still publishing where we think they are? (D10 / ListIQ.) */
export async function checkJournalistActivity(
  partyId: string,
  input?: { windowDays?: number; useSearch?: boolean },
): Promise<ActivityVerdict> {
  const { data } = await apiPost(buildPath(ACTIVITY, { party_id: partyId }), {
    window_days: input?.windowDays ?? 30,
    use_search: input?.useSearch ?? true,
  });
  return data;
}

/** The stored beat profile. Never re-derives, never spends. */
export async function fetchJournalistBeat(
  partyId: string,
): Promise<BeatProfile | null> {
  const { data } = await apiGet(buildPath(BEAT, { party_id: partyId }));
  return data ?? null;
}

/** Work out what they cover, from pages we already crawled. */
export async function deriveJournalistBeat(
  partyId: string,
  campaignContext?: string,
): Promise<BeatProfile> {
  const { data } = await apiPost(buildPath(BEAT, { party_id: partyId }), {
    campaign_context: campaignContext?.trim() ? campaignContext.trim() : null,
  });
  return data;
}
