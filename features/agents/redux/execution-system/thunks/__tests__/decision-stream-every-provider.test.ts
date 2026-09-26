/**
 * REGRESSION GUARD: a decision turn ends in its Answers card for EVERY model.
 *
 * WHAT ARMAN SAW (2026-09-26, Model Battle, agent "Feedback triage"). Three
 * columns — Jev (native), Claude Sonnet 5, Gemini 3.8 Flash. Jev and Sonnet
 * showed Answers cards; the Gemini column showed the user bubble and an action
 * bar with NOTHING between them. The server had succeeded: the Gemini stream
 * carried the same `decision_answers` data event as Sonnet's, and the message
 * row holds a valid answer.
 *
 * WHY. A verbalized decision stream carries a token-less reasoning bracket
 * (`reasoning` started/stopped) and then the `decision_answers` data event.
 * The bracket gives the turn a `thinking` slot, which routes the message
 * through the unified-slot renderer — and that renderer only placed a data
 * event's block at its spot for media, value-store and content-ir events. The
 * decision block was therefore rendered only if the reasoning-end sweep
 * happened to catch it, which depended on WHEN the events landed: Sonnet's
 * slower stream had a heartbeat inside the bracket (its block got swept in);
 * Gemini's fast stream delivered bracket + answer in one burst (it did not).
 * Nothing in the code was Anthropic-specific — it was a race any fast model
 * lost.
 *
 * The fixtures are the REAL NDJSON streams captured from the localhost Model
 * Battle on 2026-09-26 (admin@admin.com). Each is delivered two ways — one
 * event per read (a slow provider) and the whole stream in one read (a fast
 * one) — because the defect lived in the difference.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import { selectUnifiedSlotRange } from "../../active-requests/active-requests.selectors";
import messagesReducer from "../../messages/messages.slice";
import { processStream } from "../process-stream";
import { DECISION_ANSWERS_BLOCK_TYPE } from "@/features/content-ir/kinds/decision-answers";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

const REQ = "req_decision_every_provider";

const FIXTURES: Array<{ family: string; file: string; model: string }> = [
  {
    family: "google",
    file: "decision-stream-gemini-3.8-flash.ndjson",
    model: "gemini-3.8-flash",
  },
  {
    family: "anthropic",
    file: "decision-stream-claude-sonnet-5.ndjson",
    model: "claude-sonnet-5",
  },
  {
    family: "openai",
    file: "decision-stream-gpt.ndjson",
    model: "",
  },
  {
    family: "xai",
    file: "decision-stream-grok.ndjson",
    model: "",
  },
  {
    family: "native (typesafe)",
    file: "decision-stream-jev-native.ndjson",
    model: "jev-1.13.0",
  },
];

function loadLines(file: string): string[] {
  return readFileSync(join(__dirname, "fixtures", file), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

function response(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          index >= chunks.length
            ? { done: true, value: undefined }
            : { done: false, value: encoder.encode(chunks[index++]) },
        releaseLock() {},
      }),
    },
    headers: new Headers(),
  } as unknown as Response;
}

async function run(lines: string[], burst: boolean) {
  const conversationId = JSON.parse(
    lines.find((l) => l.includes('"conversation_id"'))!,
  ).data.conversation_id as string;
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      conversations: {
        byConversationId: {
          [conversationId]: { status: "streaming", agentId: null },
        },
      },
      agentDefinition: { agents: {} },
      instanceUserInput: { byConversationId: {} },
      instanceUIState: { byConversationId: {} },
      instanceResources: { byConversationId: {} },
      instanceVariableValues: { byConversationId: {} },
      observability: { toolCalls: {}, userRequests: {}, requests: {} },
    }) as unknown as RootState;
  const dispatch = (action: unknown) => {
    if (typeof action === "function") return undefined;
    active = activeRequestsReducer(active, action as never);
    messages = messagesReducer(messages, action as never);
    return action;
  };
  const chunks = burst
    ? [lines.join("\n") + "\n"]
    : lines.map((line) => line + "\n");
  await processStream({
    requestId: REQ,
    conversationId,
    response: response(chunks),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: dispatch as never,
    getState,
    abortController: new AbortController(),
  });
  return getState();
}

const available = FIXTURES.filter(({ file }) => {
  try {
    loadLines(file);
    return true;
  } catch {
    return false;
  }
});

test("every provider family has a captured real stream", () => {
  expect(available.map((f) => f.family)).toEqual(
    FIXTURES.map((f) => f.family),
  );
});

describe.each(available)("$family decision stream", ({ file, model }) => {
  const lines = loadLines(file);

  it.each([
    ["one event per read (slow provider)", false],
    ["whole stream in one read (fast provider)", true],
  ])("ends in the Answers card — %s", async (_label, burst) => {
    const state = await run(lines, burst as boolean);
    const request = state.activeRequests.byRequestId[REQ];

    // The run ended cleanly: no error on the request.
    expect(request.status).not.toBe("error");
    expect(request.error ?? null).toBeNull();

    // The slot list the column renders carries the decision block.
    const slots = selectUnifiedSlotRange(REQ, 0)(state);
    const decisionSlots = slots.filter(
      (slot) =>
        slot.kind === "render_block" &&
        request.renderBlocks[slot.blockId]?.type ===
          DECISION_ANSWERS_BLOCK_TYPE,
    );
    expect(decisionSlots).toHaveLength(1);

    const slot = decisionSlots[0];
    if (slot.kind !== "render_block") throw new Error("unreachable");
    const payload = request.renderBlocks[slot.blockId]?.data?.payload as
      | { model?: string; answers?: Record<string, unknown> }
      | undefined;
    if (model) expect(payload?.model).toBe(model);
    expect(Object.keys(payload?.answers ?? {}).sort()).toEqual([
      "is_defect",
      "owning_surface",
      "urgency",
    ]);
  });
});
