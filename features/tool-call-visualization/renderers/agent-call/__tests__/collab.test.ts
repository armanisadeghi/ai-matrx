/**
 * Pins the collaboration `agent_call` contract parse (aidream
 * `matrx_ai/tools/implementations/agent_call.py`). The card's entire dispatch
 * hangs on `history_mode`, and the output keys arrive on the SAME output
 * object as the ordinary agent_call result — so a plain call must never be
 * mistaken for a collaboration one, and a collaboration call must be
 * recognised from its ARGUMENTS alone while it is still running (the output
 * does not exist yet).
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getCollabCallInfo, isCollaborationAgentCall } from "../collab";

function entry(over: Partial<ToolLifecycleEntry>): ToolLifecycleEntry {
  return {
    callId: "c1",
    toolName: "agent_call",
    displayName: "agent_call",
    status: "completed",
    arguments: {},
    startedAt: "2026-08-11T00:00:00Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
    ...over,
  };
}

test("a plain agent_call is NOT a collaboration call", () => {
  expect(
    isCollaborationAgentCall(
      entry({
        arguments: { agent_id: "a1" },
        result: { agent_name: "Helper", result: "done" },
      }),
    ),
  ).toBe(false);
});

test("history_mode 'none' is NOT a collaboration call", () => {
  expect(
    isCollaborationAgentCall(
      entry({ arguments: { agent_id: "a1", history_mode: "none" } }),
    ),
  ).toBe(false);
});

test("a running call is recognised from its arguments alone", () => {
  const info = getCollabCallInfo(
    entry({
      status: "started",
      arguments: {
        agent_id: "a1",
        history_mode: "snapshot",
        history_conversation_id: "conv_src",
      },
      result: null,
    }),
  );
  expect(info).not.toBeNull();
  expect(info!.historyMode).toBe("snapshot");
  expect(info!.sourceConversationId).toBe("conv_src");
  // Not known until the output lands.
  expect(info!.childConversationId).toBeNull();
  expect(info!.messagesIncluded).toBeNull();
});

test("a completed fork call reads history, child id, and the answer", () => {
  const info = getCollabCallInfo(
    entry({
      arguments: { agent_id: "a1", history_mode: "fork" },
      result: {
        agent_name: "Reviewer",
        result: "The pricing section is the weak point.",
        history: {
          mode: "fork",
          source_conversation_id: "conv_src",
          messages_included: 12,
        },
        child_conversation_id: "conv_fork",
      },
    }),
  );
  expect(info!.historyMode).toBe("fork");
  expect(info!.sourceConversationId).toBe("conv_src");
  expect(info!.childConversationId).toBe("conv_fork");
  expect(info!.messagesIncluded).toBe(12);
  expect(info!.agentName).toBe("Reviewer");
  expect(info!.resultText).toBe("The pricing section is the weak point.");
});

test("the output is parsed even when it arrives as a JSON string", () => {
  const info = getCollabCallInfo(
    entry({
      arguments: { agent_id: "a1" },
      result: JSON.stringify({
        history: { mode: "snapshot", messages_included: 3 },
        result: "ok",
      }),
    }),
  );
  expect(info!.historyMode).toBe("snapshot");
  expect(info!.messagesIncluded).toBe(3);
});

test("remember queued and failed are both surfaced", () => {
  const queued = getCollabCallInfo(
    entry({
      arguments: { history_mode: "snapshot" },
      result: { remember: { status: "queued", injection_id: "inj_1" } },
    }),
  );
  expect(queued!.remember).toEqual({
    status: "queued",
    injectionId: "inj_1",
    error: null,
  });

  const failed = getCollabCallInfo(
    entry({
      arguments: { history_mode: "snapshot" },
      result: { remember: { status: "failed", error: "inbox unavailable" } },
    }),
  );
  expect(failed!.remember).toEqual({
    status: "failed",
    injectionId: null,
    error: "inbox unavailable",
  });
});

test("reference-mode results fall back to the stored descriptor preview", () => {
  const info = getCollabCallInfo(
    entry({
      arguments: { history_mode: "snapshot" },
      result: {
        history: { mode: "snapshot" },
        stored: { key: "review", preview: "Short summary of the review." },
      },
    }),
  );
  expect(info!.resultText).toBe("Short summary of the review.");
});

test("a non-agent_call tool is never a collaboration call", () => {
  expect(
    isCollaborationAgentCall(
      entry({ toolName: "web", arguments: { history_mode: "fork" } }),
    ),
  ).toBe(false);
});
