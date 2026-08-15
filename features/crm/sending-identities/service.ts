// features/crm/sending-identities/service.ts
//
// Contract-bound client for aidream's `/sending-identities/*` surface.
//
// WHY THIS ONE CRM SUB-FEATURE TALKS TO PYTHON INSTEAD OF SUPABASE:
// the rest of `features/crm/` reads and writes `crm.*` straight from the
// browser, which is correct for plain CRUD. A sending identity is not plain
// CRUD — every meaningful operation is server-side work the browser physically
// cannot do: resolving DNS to prove domain ownership, reading SPF/DKIM/DMARC,
// operating an OAuth mailbox credential that must never reach a client, and
// running the gate that decides whether anything may be sent at all. There is
// still ONE canonical path per operation; it just lives in Python.
//
// Deliberately absent: any "send" call. Sending goes through the server's own
// gate (`send_through_identity`), never an endpoint a client can aim.

import { apiDelete, apiGet, apiPatch, apiPost, buildPath } from "@/lib/api/typed-client";
import type {
  CheckReport,
  ConnectableMailbox,
  SendingEventRecord,
  SendingIdentityDetail,
  SendingIdentityView,
  SendingPolicyView,
} from "./types";

const IDENTITY_PATH = "/sending-identities/{identity_id}";

export async function listSendingIdentities(
  organizationId?: string,
): Promise<SendingIdentityView[]> {
  const { data } = await apiGet("/sending-identities", {
    query: organizationId ? { organization_id: organizationId } : undefined,
  });
  return data;
}

export async function getSendingIdentity(id: string): Promise<SendingIdentityDetail> {
  const { data } = await apiGet(buildPath(IDENTITY_PATH, { identity_id: id }));
  return data;
}

/**
 * Mailboxes the user could connect — INCLUDING the ones they cannot, each with
 * its reason. A mailbox that silently vanishes from a picker is a dead end.
 */
export async function listConnectableMailboxes(
  organizationId?: string,
): Promise<ConnectableMailbox[]> {
  const { data } = await apiGet("/sending-identities/connectable", {
    query: organizationId ? { organization_id: organizationId } : undefined,
  });
  return data;
}

export async function createSendingIdentity(body: {
  connection_id: string;
  from_address: string;
  from_name?: string | null;
  display_name?: string | null;
  organization_id?: string | null;
}): Promise<SendingIdentityDetail> {
  const { data } = await apiPost("/sending-identities", {
    provider: "google_workspace",
    ...body,
  });
  return data;
}

export async function updateSendingIdentity(
  id: string,
  patch: Record<string, unknown>,
): Promise<SendingIdentityDetail> {
  const { data } = await apiPatch(buildPath(IDENTITY_PATH, { identity_id: id }), patch);
  return data;
}

/** Resolve the DNS TXT challenge. The only path to a verified domain. */
export async function checkDomain(id: string): Promise<CheckReport> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/check-domain", { identity_id: id }),
    {},
  );
  return data;
}

/** Measure SPF, DKIM and DMARC against live DNS. */
export async function checkAuthentication(id: string): Promise<CheckReport> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/check-authentication", { identity_id: id }),
    {},
  );
  return data;
}

export async function startWarmup(id: string): Promise<SendingIdentityDetail> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/start-warmup", { identity_id: id }),
    {},
  );
  return data;
}

export async function pauseSendingIdentity(
  id: string,
  reason: string,
): Promise<SendingIdentityDetail> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/pause", { identity_id: id }),
    { reason },
  );
  return data;
}

/**
 * Lift a pause. The system never calls this — when the breaker pauses an
 * identity, a person has to look at the health and decide.
 */
export async function resumeSendingIdentity(id: string): Promise<SendingIdentityDetail> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/resume", { identity_id: id }),
    {},
  );
  return data;
}

export async function refreshIdentityHealth(id: string): Promise<SendingIdentityDetail> {
  const { data } = await apiPost(
    buildPath("/sending-identities/{identity_id}/refresh-health", { identity_id: id }),
    {},
  );
  return data;
}

export async function listSendingEvents(
  id: string,
  limit = 100,
): Promise<SendingEventRecord[]> {
  const { data } = await apiGet(
    buildPath("/sending-identities/{identity_id}/events", { identity_id: id }),
    { query: { limit } },
  );
  return data;
}

export async function removeSendingIdentity(id: string): Promise<void> {
  await apiDelete(buildPath(IDENTITY_PATH, { identity_id: id }));
}

export async function getSendingPolicy(
  organizationId?: string,
): Promise<SendingPolicyView> {
  const { data } = await apiGet("/sending-identities/policy", {
    query: organizationId ? { organization_id: organizationId } : undefined,
  });
  return data;
}

/** The per-org kill switch. Takes effect at the server's gate immediately. */
export async function setSendingPolicy(
  outreachEnabled: boolean,
  reason?: string,
  organizationId?: string,
): Promise<SendingPolicyView> {
  const { data } = await apiPost("/sending-identities/policy", {
    outreach_enabled: outreachEnabled,
    reason: reason ?? null,
    organization_id: organizationId ?? null,
  });
  return data;
}
