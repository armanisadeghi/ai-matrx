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
import { supabase } from "@/utils/supabase/client";
import type {
  AgentStudioFromChatProgressData,
  AgentStudioFromChatResultData,
  TypedStreamEvent,
} from "@ai-matrx/agents/generated/stream-events";
import { streamErrorText } from "@ai-matrx/agents/matrx";
import { adoptForeignStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { SIDE_CHAT_PARAM } from "@ai-matrx/chat/canvas/workspace/side-chat-address";

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
  /**
   * AF-D door #4 on `pipeline`: the server started an Agent Factory build; the window follows it.
   * `proofCases` = the cases the build really starts with (R55: the chat's request plus every
   * example that maps onto the agent's inputs); `says` names any example left out.
   */
  | { ok: true; buildId: string; proofCases: number | null; says: string }
  | { ok: false; says: string; failedAt: FromChatStep | null };

/**
 * The build the door started, when it did (`build_id` on the `building` progress event —
 * aidream `from_chat._start_factory_build`; the published stream type does not carry the
 * field yet, so it is read here).
 */
export function progressBuildId(d: AgentStudioFromChatProgressData): string | null {
  const id = (d as { build_id?: unknown }).build_id;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

/** The proof cases the started build really has (`proof_cases` on the `building` event, R55). */
export function progressProofCases(d: AgentStudioFromChatProgressData): number | null {
  const n = (d as { proof_cases?: unknown }).proof_cases;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function isProgress(d: unknown): d is AgentStudioFromChatProgressData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "agent_studio_from_chat_progress";
}

function isResult(d: unknown): d is AgentStudioFromChatResultData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "agent_studio_from_chat_result";
}

/** The stored run a step just finished (`run_conversation_id` on its progress event). */
export function progressRunConversationId(d: AgentStudioFromChatProgressData): string | null {
  const id = (d as { run_conversation_id?: unknown }).run_conversation_id;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

/**
 * Where one of the pipeline's stored runs opens in full — every message the model saw and
 * wrote, tool calls, cost. Inside /administration: the CX conversation page; elsewhere the chat.
 */
export function fromChatRunHref(conversationId: string): string {
  return adminDoorOpen()
    ? `/administration/chat/cx-dashboard/conversations/${conversationId}`
    : `/chat/${conversationId}`;
}

/**
 * KEEP WORKING ON IT (Arman, 2026-10-07: "the key is that we need to be able to talk to the agent
 * who is doing this work"): a new tab with the new agent open in the Agent Builder and the Agent
 * Builder's own conversation in the page's side chat. THE ONE place this hand-off address is built
 * — every "Make an agent" entry point (chat menu, admin list, admin conversation page) goes through
 * the window that calls it. The Side Chat opens the conversation named by `?side_chat=<id>`
 * (`@ai-matrx/chat` canvas/workspace `side-chat-address`, the Side Chat's URL contract).
 */
export function continueWithAgentHref(result: FromChatResult): string {
  const builder = `/agents/${result.agent_id}/build`;
  const chat = resultRuns(result).building;
  return chat ? `${builder}?${SIDE_CHAT_PARAM}=${encodeURIComponent(chat)}` : builder;
}

/**
 * The stored runs behind a made agent (`brief_conversation_id` / `builder_conversation_id` /
 * `proof_conversation_id` on the result — aidream `from_chat`; read here until the published
 * stream type carries them).
 */
export function resultRuns(result: FromChatResult): Partial<Record<FromChatStep, string>> {
  const r = result as unknown as Record<string, unknown>;
  const id = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() !== "" ? (r[k] as string) : undefined);
  return { briefing: id("brief_conversation_id"), building: id("builder_conversation_id"), proving: id("proof_conversation_id") };
}

/** Turn one chat into an agent; `onStep` hears each step as the server reaches it. */
export async function makeAgentFromChat(
  dispatch: AppDispatch,
  conversationId: string,
  onStep: (step: FromChatStep, says: string, runConversationId: string | null) => void,
  /** The person's own examples (R52): more proof cases beside the chat's own request. */
  examples: string[] = [],
  /**
   * The live stream's request id, the instant it exists: the brief writer and the first try
   * stream their tokens into it, rendered by the canonical pipeline (`LiveRunDisplay`).
   */
  onAdopted?: (requestId: string) => void,
): Promise<FromChatAnswer> {
  const given = examples.map((e) => e.trim()).filter(Boolean);
  const body = given.length > 0 ? { conversation_id: conversationId, examples: given } : { conversation_id: conversationId };
  let result: AgentStudioFromChatResultData | null = null;
  let refusal: string | null = null;
  let lastStep: FromChatStep | null = null;
  let buildId: string | null = null;
  let proofCases: number | null = null;
  let buildSays = "";

  const onStreamEvent = (event: TypedStreamEvent) => {
    if (event.event === "data") {
      const d = event.data as unknown;
      if (isProgress(d)) {
        lastStep = d.step;
        if (progressBuildId(d)) {
          buildId = progressBuildId(d);
          proofCases = progressProofCases(d);
          buildSays = d.says;
        }
        onStep(d.step, d.says, progressRunConversationId(d));
      } else if (isResult(d)) {
        result = d;
      }
    } else if (event.event === "error") {
      refusal = streamErrorText(event) ?? "Making the agent stopped.";
    }
  };

  // The pipeline's own sub-runs stream their tokens on this response: ADOPT it so they render
  // through the one stream pipeline (never a hand parse); our typed events still arrive here.
  const consumeStream = dispatch(
    adoptForeignStream({
      // The pipeline's header ids name the endpoint, not a run anyone renders elsewhere.
      preferServerIds: false,
      onAdopted: (ids) => onAdopted?.(ids.requestId),
      onEvent: onStreamEvent,
    }),
  );

  // THE ADMIN DOOR (lib/api/adminDoor.ts): inside /administration the request goes to the
  // server's /admin twin — any person's chat, the agent born in THAT person's account and the
  // chat's organization (aidream `make_agent_from_chat_as_admin`); the user route everywhere else.
  const response = adminDoorOpen()
    ? await dispatch(
        callApi({
          path: "/admin/agent-studio/from-chat",
          method: "POST",
          body,
          stream: true,
          expectedErrorStatuses: [401, 403, 404, 409, 422],
          consumeStream,
        }),
      )
    : await dispatch(
        callApi({
          path: "/agent-studio/from-chat",
          method: "POST",
          body,
          stream: true,
          expectedErrorStatuses: [401, 403, 404, 409, 422],
          consumeStream,
        }),
      );

  if (response.error) {
    return { ok: false, says: response.error.message || "Making the agent did not start.", failedAt: lastStep };
  }
  if (refusal) return { ok: false, says: refusal, failedAt: lastStep };
  const done = result as AgentStudioFromChatResultData | null;
  if (!done && buildId) return { ok: true, buildId, proofCases, says: buildSays };
  if (!done) {
    return { ok: false, says: "The run ended without the new agent. Check your agents list.", failedAt: lastStep };
  }
  return { ok: true, result: done };
}

/**
 * The newest agent already made from this chat, with its stored result — what the window shows
 * when it reopens after a reload (the server keeps the result on the agent:
 * `agent.definition.metadata.agent_studio_from_chat`). Reads only agents the viewer may see.
 */
export async function latestAgentFromChat(conversationId: string): Promise<FromChatResult | null> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("metadata, created_at")
    .eq("metadata->agent_studio_from_chat->>conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const stored = (data?.[0]?.metadata as Record<string, unknown> | undefined)?.agent_studio_from_chat;
  return isResult(stored) ? stored : null;
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
