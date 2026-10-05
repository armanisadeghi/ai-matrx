// features/agents/from-chat/service.ts — "Make an agent from this chat": THE ONE CLIENT.
//
// Two lanes behind one menu item (Arman, 2026-10-04: "we want to make sure we can clarify if we
// want it to be a masterwork or just a single agent"):
//
//   Single agent → POST /agent-studio/from-chat (stream): reading → briefing → building → proving,
//                  then the new agent beside the answer the person accepted. Server pipeline:
//                  aidream `aidream/services/agent_studio/from_chat.py`. The server keeps working if
//                  this tab goes away; the agent lands in the person's agents either way.
//   Admin        → inside /administration the same call goes to POST /admin/agent-studio/from-chat
//                  (lib/api/adminDoor.ts): any person's chat, the agent born in THAT person's account.
//   Masterwork   → a draft Rulebook named after the chat, then the existing conversation importer
//                  opened with this chat already selected (`/masterwork/{id}/import?conversation=`).

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { createDraftRulebook } from "@/features/masterwork/service";
import type {
  AgentStudioFromChatProgressData,
  AgentStudioFromChatResultData,
  TypedStreamEvent,
} from "@ai-matrx/agents/generated/stream-events";
import { streamErrorText } from "@ai-matrx/agents/matrx";

export type FromChatStep = AgentStudioFromChatProgressData["step"];
export type FromChatResult = AgentStudioFromChatResultData;

export const FROM_CHAT_STEPS: readonly { step: FromChatStep; label: string }[] = [
  { step: "reading", label: "Read the chat" },
  { step: "briefing", label: "Work out the result" },
  { step: "building", label: "Build the agent" },
  { step: "proving", label: "First try" },
];

export type FromChatAnswer =
  | { ok: true; result: FromChatResult }
  | { ok: false; says: string; failedAt: FromChatStep | null };

function isProgress(d: unknown): d is AgentStudioFromChatProgressData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "agent_studio_from_chat_progress";
}

function isResult(d: unknown): d is AgentStudioFromChatResultData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "agent_studio_from_chat_result";
}

/** Turn one chat into an agent; `onStep` hears each step as the server reaches it. */
export async function makeAgentFromChat(
  dispatch: AppDispatch,
  conversationId: string,
  onStep: (step: FromChatStep, says: string) => void,
): Promise<FromChatAnswer> {
  let result: AgentStudioFromChatResultData | null = null;
  let refusal: string | null = null;
  let lastStep: FromChatStep | null = null;

  const onStreamEvent = (event: TypedStreamEvent) => {
    if (event.event === "data") {
      const d = event.data as unknown;
      if (isProgress(d)) {
        lastStep = d.step;
        onStep(d.step, d.says);
      } else if (isResult(d)) {
        result = d;
      }
    } else if (event.event === "error") {
      refusal = streamErrorText(event) ?? "Making the agent stopped.";
    }
  };

  // THE ADMIN DOOR (lib/api/adminDoor.ts): inside /administration the request goes to the
  // server's /admin twin — any person's chat, the agent born in THAT person's account and the
  // chat's organization (aidream `make_agent_from_chat_as_admin`); the user route everywhere else.
  const response = adminDoorOpen()
    ? await dispatch(
        callApi({
          path: "/admin/agent-studio/from-chat",
          method: "POST",
          body: { conversation_id: conversationId },
          stream: true,
          expectedErrorStatuses: [401, 403, 404, 409, 422],
          onStreamEvent,
        }),
      )
    : await dispatch(
        callApi({
          path: "/agent-studio/from-chat",
          method: "POST",
          body: { conversation_id: conversationId },
          stream: true,
          expectedErrorStatuses: [401, 403, 404, 409, 422],
          onStreamEvent,
        }),
      );

  if (response.error) {
    return { ok: false, says: response.error.message || "Making the agent did not start.", failedAt: lastStep };
  }
  if (refusal) return { ok: false, says: refusal, failedAt: lastStep };
  const done = result as AgentStudioFromChatResultData | null;
  if (!done) {
    return { ok: false, says: "The run ended without the new agent. Check your agents list.", failedAt: lastStep };
  }
  return { ok: true, result: done };
}

/**
 * The Masterwork lane: a draft Rulebook named after the chat, returned as the import page URL that
 * opens with this chat selected. `clientToken` is the caller's one intent (a second press lands on
 * the same Rulebook).
 */
export async function startMasterworkFromChat(input: {
  conversationId: string;
  title: string;
  organizationId: string;
  clientToken: string;
}): Promise<string> {
  const rulebook = await createDraftRulebook({
    name: input.title.trim() || "Rulebook from a chat",
    description: "",
    source: {},
    organizationId: input.organizationId,
    clientToken: input.clientToken,
  });
  return `/masterwork/${rulebook.id}/import?conversation=${encodeURIComponent(input.conversationId)}`;
}
