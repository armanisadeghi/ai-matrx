import type { components } from "@/types/python-generated/api-types";
import { apiGet, apiPost, buildPath } from "@/lib/api/typed-client";

export type OutletContactExtraction =
  components["schemas"]["OutletContactExtraction"];
export type OutletContactCandidate =
  components["schemas"]["OutletContactCandidate"];
export type ObservedEmailCandidate =
  components["schemas"]["ObservedEmailCandidate"];
export type ConfirmedOutletContact =
  components["schemas"]["ConfirmedOutletContact"];

const CANDIDATES_PATH = "/crm/parties/{outlet_party_id}/contact-candidates";
const CONFIRM_PATH =
  "/crm/parties/{outlet_party_id}/contact-candidates/confirm";

/** Read current crawl-backed suggestions. The server guarantees this is zero-write. */
export async function fetchOutletContactCandidates(
  outletPartyId: string,
): Promise<OutletContactExtraction> {
  const { data } = await apiGet(
    buildPath(CANDIDATES_PATH, { outlet_party_id: outletPartyId }),
  );
  return data;
}

/** Confirm one server-revalidated person and only the selected observed addresses. */
export async function confirmOutletContact(
  outletPartyId: string,
  input: {
    candidateKey: string;
    emailKeys: string[];
    acceptLowConfidence: boolean;
    acceptRoleAddress: boolean;
  },
): Promise<ConfirmedOutletContact> {
  const { data } = await apiPost(
    buildPath(CONFIRM_PATH, { outlet_party_id: outletPartyId }),
    {
      candidate_key: input.candidateKey,
      email_keys: input.emailKeys,
      accept_low_confidence: input.acceptLowConfidence,
      accept_role_address: input.acceptRoleAddress,
    },
  );
  return data;
}
