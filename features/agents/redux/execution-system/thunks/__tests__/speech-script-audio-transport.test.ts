/**
 * REGRESSION GUARD: a speech-script turn renders ONE audio player and nothing
 * else from the audio transport.
 *
 * WHAT WAS SEEN (2026-09-26, localhost run page, admin@admin.com, agent
 * "Podcast Intro: Two Hosts (ElevenLabs v3)"). The audio played and the script
 * showed — and above them sat two "Unknown Data Event" cards,
 * `audio_stream_chunk` (with raw base64) and `audio_stream_end`. Both are live
 * transport: the persisted audio arrives as its own `media_block`. The stream
 * processor had no case for them, so they fell to `unknown_data_event`.
 *
 * The fixture is the REAL NDJSON stream from that run (chunk base64 trimmed).
 * The second case removes the `media_block` line: the end event must then BE
 * the audio block, so a deploy without media blocks never loses its audio.
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
import { processStream } from "../process-stream";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (!globals.TextEncoder) globals.TextEncoder = NodeTextEncoder;
if (!globals.TextDecoder) globals.TextDecoder = NodeTextDecoder;

const REQ = "req_speech_script_audio";

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

function blocksOf(state: RootState) {
  const req = state.activeRequests.byRequestId[REQ];
  return (req?.renderBlockOrder ?? []).map((id) => req!.renderBlocks[id]!);
}

const LINES = loadLines("speech-script-elevenlabs-dialogue.ndjson");

describe("speech-script audio transport", () => {
  for (const burst of [false, true]) {
    it(`renders one audio block and no unknown data event (${burst ? "burst" : "event per read"})`, async () => {
      const blocks = blocksOf(await run(LINES, burst));
      expect(blocks.filter((b) => b.type === "unknown_data_event")).toEqual([]);
      const audio = blocks.filter((b) => b.type === "audio_output");
      expect(audio).toHaveLength(1);
      expect((audio[0]!.data as { fileId?: string }).fileId).toBe(
        "d69c6183-0724-42c7-a0a3-1e8234b70737",
      );
    });
  }

  it("an end event with no media block becomes the audio block itself", async () => {
    const withoutMedia = LINES.filter((l) => !l.includes('"type":"media_block"'));
    const blocks = blocksOf(await run(withoutMedia, false));
    expect(blocks.filter((b) => b.type === "unknown_data_event")).toEqual([]);
    const audio = blocks.filter((b) => b.type === "audio_output");
    expect(audio).toHaveLength(1);
    expect((audio[0]!.data as { fileId?: string }).fileId).toBe(
      "d69c6183-0724-42c7-a0a3-1e8234b70737",
    );
  });
});
