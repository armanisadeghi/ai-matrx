// features/action-requests/self-service.ts — THE SIGNED-IN DOORS.
//
// `service.ts` is the LINK's half: three token doors reached only from the
// server lane, because a bearer capability in a URL is the whole identity there.
// This file is the other half — the person answering from inside the app, with
// their own session. aidream's authenticated pair takes no token at all:
//
//   GET  /action-requests/pending              what this person is being asked
//   POST /action-requests/{request_id}/complete  the answer, as themselves
//
// The person is read from their own validated Supabase token by aidream, never
// from a body, and a request id that is not theirs answers exactly like one that
// does not exist. Both calls go through the canonical Python client, which
// attaches that token.

import { apiGet, buildPath } from "@/lib/api/typed-client";
import { requestRaw } from "@/lib/python-client";

import type { ActionRequestRender } from "@/features/action-requests/service";
import type {
  ActionRequestAnswer,
  ActionRequestTransportResult,
} from "@/features/action-requests/components/ActionRequestAnswerForm";

/** One open ask, as the pending list carries it. NEVER a token. */
export interface PendingActionRequest {
  request_id: string;
  kind: string;
  render: ActionRequestRender;
  organization_id: string;
  conversation_id: string | null;
  link_expires_at: string | null;
  link_live: boolean;
  answer_by: string | null;
  created_at: string;
}

/** What this person is being asked for right now, soonest deadline first. */
export async function fetchPendingActionRequests(): Promise<PendingActionRequest[]> {
  const { data } = await apiGet("/action-requests/pending");
  const requests = (data as { requests?: unknown } | null)?.requests;
  return Array.isArray(requests) ? (requests as PendingActionRequest[]) : [];
}

/**
 * Answer one ask as the signed-in person. Returns the door's status and body
 * as-is so `useActionRequestAnswer` reads it exactly as it reads the link
 * page's door — a 409 refusal is an expected outcome, not an incident.
 *
 * `organizationId` is the ask's OWN organization, from the pending row: the
 * answer belongs to the organization the agent asked in, never whichever one
 * happens to be selected in this tab.
 */
export async function completeActionRequestAsSelf(
  requestId: string,
  organizationId: string,
  answer: ActionRequestAnswer,
): Promise<ActionRequestTransportResult> {
  const response = await requestRaw(
    buildPath("/action-requests/{request_id}/complete", { request_id: requestId }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    },
    {
      organizationId,
      allowHttpError: true,
      expectedErrorStatuses: [400, 409],
    },
  );
  const body = (await response.json().catch(() => null)) as ActionRequestTransportResult["body"];
  return { status: response.status, body };
}
