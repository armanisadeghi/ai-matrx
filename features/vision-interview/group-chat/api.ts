// features/vision-interview/group-chat/api.ts
//
// The two Group Chat calls (aidream `api/routers/group_chat.py`). The roster lives in
// `platform.associations` edges a client cannot write (G3), so both the read and the policy
// edit go through the server. A Vision Interview is anchored on its `interview_session`.

import { callApi } from "@/lib/api/call-api";
import type { ViewPolicy } from "./policy";

export const INTERVIEW_ANCHOR_TYPE = "interview_session";

export interface GroupChatAnchor {
  anchorType: string;
  anchorId: string;
}

export function getGroupChatCall({ anchorType, anchorId }: GroupChatAnchor) {
  return callApi({
    path: "/group-chat/{anchor_type}/{anchor_id}",
    method: "GET",
    pathParams: { anchor_type: anchorType, anchor_id: anchorId },
    // 404 = no group here (or no access): the inspector says so in place.
    expectedErrorStatuses: [404],
  });
}

export function putParticipantPolicyCall(
  { anchorType, anchorId }: GroupChatAnchor,
  participantId: string,
  policy: ViewPolicy,
  expectedPolicyVersion: number | null,
) {
  return callApi({
    path: "/group-chat/{anchor_type}/{anchor_id}/participants/{participant_id}/policy",
    method: "PUT",
    pathParams: { anchor_type: anchorType, anchor_id: anchorId, participant_id: participantId },
    body: { policy, expected_policy_version: expectedPolicyVersion },
    // 409 = changed elsewhere / names someone not in the group: the inspector reloads and says so.
    expectedErrorStatuses: [409],
  });
}
