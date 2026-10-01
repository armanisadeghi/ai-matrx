/**
 * REGRESSION GUARD: the server's `context_receipt` is STATE, never content.
 *
 * WHAT WAS SEEN (2026-09-30, aimatrx.com /notes, conversation 2281e2c0…):
 * the server began streaming a `context_receipt` data event — its account of
 * every context value the turn sent (common-docs
 * systems/scopes-context/context-delivery/RULES.md §5). The stream processor
 * had no case for it, so every reply printed an "Unknown Data Event" card.
 *
 * The receipt must land in `instanceContext.receiptByConversationId` (the
 * composer's context table and the expected-vs-actual check read it there)
 * and must produce no render block. The stream is the real speech-script
 * fixture with one receipt line spliced in after the conversation id.
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
import messagesReducer from "../../messages/messages.slice";
import instanceContextReducer from "../../instance-context/instance-context.slice";
import { processStream } from "../process-stream";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

const REQ = "req_context_receipt";

const RECEIPT = {
  type: "context_receipt",
  version: 1,
  surface: "matrx-user/notes",
  cap: 50000,
  model_reads_context: true,
  rules_error: null,
  rows: [
    {
      key: "note_bundle",
      label: "Note and workspace",
      surface_key: "matrx-user/notes",
      origin: "client",
      chars: 9966,
      include: true,
      max_inline_chars: 12000,
      delivery: "inline",
      decided_by: { include: "default", max_inline_chars: "page" },
      user_rule: null,
      clamped: false,
      client_sent_excluded: false,
      blocked_by: null,
    },
  ],
};

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

function linesWithReceipt(): { lines: string[]; conversationId: string } {
  const base = readFileSync(
    join(__dirname, "fixtures", "speech-script-elevenlabs-dialogue.ndjson"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const idIndex = base.findIndex((l) => l.includes('"conversation_id"'));
  const conversationId = JSON.parse(base[idIndex]!).data
    .conversation_id as string;
  const receiptLine = JSON.stringify({ event: "data", data: RECEIPT });
  return {
    lines: [...base.slice(0, idIndex + 1), receiptLine, ...base.slice(idIndex + 1)],
    conversationId,
  };
}

async function run() {
  const { lines, conversationId } = linesWithReceipt();
  let active = activeRequestsReducer(
    undefined,
    createRequest({ requestId: REQ, conversationId }),
  );
  let messages = messagesReducer(undefined, { type: "test/init" });
  let instanceContext = instanceContextReducer(undefined, { type: "test/init" });
  const getState = () =>
    ({
      activeRequests: active,
      messages,
      instanceContext,
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
    instanceContext = instanceContextReducer(instanceContext, action as never);
    return action;
  };
  await processStream({
    requestId: REQ,
    conversationId,
    response: response(lines.map((line) => line + "\n")),
    submitAt: 0,
    conversationIdAt: null,
    dispatch: dispatch as never,
    getState,
    abortController: new AbortController(),
  });
  return { state: getState(), conversationId };
}

describe("context_receipt stream event", () => {
  it("is stored as the conversation's receipt", async () => {
    const { state, conversationId } = await run();
    const entry = state.instanceContext.receiptByConversationId[conversationId];
    expect(entry?.requestId).toBe(REQ);
    expect(entry?.receipt.rows?.[0]?.key).toBe("note_bundle");
    expect(entry?.receipt.rows?.[0]?.delivery).toBe("inline");
  });

  it("renders no block — never an Unknown Data Event", async () => {
    const { state } = await run();
    const req = state.activeRequests.byRequestId[REQ];
    const blocks = (req?.renderBlockOrder ?? []).map((id) => req!.renderBlocks[id]!);
    expect(blocks.filter((b) => b.type === "unknown_data_event")).toEqual([]);
    expect(
      blocks.filter(
        (b) => (b.data as Record<string, unknown> | undefined)?._dataType === "context_receipt",
      ),
    ).toEqual([]);
  });
});
