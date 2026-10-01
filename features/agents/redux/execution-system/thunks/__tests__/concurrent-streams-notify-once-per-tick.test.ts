/**
 * N CONCURRENT STREAMS WAKE THE STORE'S SUBSCRIBERS ABOUT ONCE PER TICK —
 * AND EVERY TOKEN STILL LANDS.
 *
 * The /board canvas mounts 10–15 full pages; several can be chats streaming
 * at once. Every store notification re-runs every mounted `useAppSelector`
 * in every page, so the stream processor's notification rate IS the board's
 * selector cost. Before the shared flush clock, each stream flushed on its own
 * 30 ms timer with 2–3 untagged dispatches, plus one `recordTransportSeq`
 * dispatch per WIRE EVENT — N streams × every token = that many full selector
 * sweeps. Now all streams flush on one tick and the hot-path actions are
 * auto-batched, so subscribers are notified about once per tick for all of
 * them (stream-flush-scheduler.ts).
 *
 * Real store (`configureStore` with its default `autoBatchEnhancer`), real
 * `processStream`, real timers: the wire delivers one event per read with a
 * 1 ms gap, the way a fast provider does.
 */
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import { deriveAnswerText } from "../../active-requests/active-requests.selectors";
import { processStream } from "../process-stream";
import { STREAM_FLUSH_INTERVAL_MS } from "../stream-flush-scheduler";
import type { RootState } from "@/lib/redux/store";

const globals = globalThis as {
  TextEncoder?: typeof NodeTextEncoder;
  TextDecoder?: typeof NodeTextDecoder;
};
if (typeof globals.TextEncoder !== "function") {
  globals.TextEncoder = NodeTextEncoder;
}
if (typeof globals.TextDecoder !== "function") {
  globals.TextDecoder = NodeTextDecoder;
}

const STREAMS = 6;
const CHUNKS_PER_STREAM = 150;
const encoder = new TextEncoder();

const requestIdOf = (s: number) => `00000000-0000-4000-8000-00000000000${s}`;
const conversationIdOf = (s: number) =>
  `11111111-1111-4111-8111-11111111111${s}`;

/** Plain prose with paragraph breaks — the answer text is the exact join. */
function chunkText(stream: number, index: number): string {
  const word = `stream${stream} word${index}`;
  if (index === CHUNKS_PER_STREAM - 1) return `${word}.`;
  return index % 25 === 24 ? `${word}.\n\n` : `${word} `;
}

function expectedAnswer(stream: number): string {
  let text = "";
  for (let i = 0; i < CHUNKS_PER_STREAM; i++) text += chunkText(stream, i);
  return text;
}

function eventsFor(stream: number) {
  const events: Array<Record<string, unknown>> = [];
  let seq = 0;
  for (let i = 0; i < CHUNKS_PER_STREAM; i++) {
    events.push({
      event: "chunk",
      stream_seq: ++seq,
      data: { text: chunkText(stream, i) },
    });
  }
  events.push({ event: "end", stream_seq: ++seq, data: {} });
  return events;
}

/** One NDJSON line per read, 1 ms apart — a fast provider's cadence. */
function pacedResponse(events: Array<Record<string, unknown>>): Response {
  const lines = events.map((e) => encoder.encode(`${JSON.stringify(e)}\n`));
  const reader = {
    read(): Promise<{ value?: Uint8Array; done: boolean }> {
      const value = lines.shift();
      return new Promise((resolve) =>
        setTimeout(
          () => resolve(value ? { value, done: false } : { done: true }),
          1,
        ),
      );
    },
    releaseLock() {},
  };
  return {
    body: { getReader: () => reader },
    headers: new Headers(),
  } as unknown as Response;
}

/** Flips at the first stream's `end` — the streaming phase is over and the
 * per-stream commit (status, message rows, input clears) begins. */
const phase = { streaming: true };

function makeHarnessStore(streams: number[]) {
  let preloaded = activeRequestsReducer(undefined, { type: "@@init" });
  for (const s of streams) {
    preloaded = activeRequestsReducer(
      preloaded,
      createRequest({
        requestId: requestIdOf(s),
        conversationId: conversationIdOf(s),
      }),
    );
  }
  const conversations = {
    byConversationId: Object.fromEntries(
      streams.map((s) => [
        conversationIdOf(s),
        { status: "running", agentId: null },
      ]),
    ),
  };
  const fixed =
    <T,>(value: T) =>
    (state: T = value) =>
      state;
  return configureStore({
    reducer: {
      activeRequests: activeRequestsReducer,
      conversations: fixed(conversations),
      instanceUserInput: fixed({ byConversationId: {} }),
      instanceUIState: fixed({ byConversationId: {} }),
      instanceResources: fixed({ byConversationId: {} }),
      instanceVariableValues: fixed({ byConversationId: {} }),
      messages: fixed({ byConversationId: {} }),
      observability: fixed({ toolCalls: {}, userRequests: {}, requests: {} }),
      agentDefinition: fixed({ agents: {} }),
    },
    preloadedState: { activeRequests: preloaded },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }).concat(() => (next) => (action) => {
        const raw = action as {
          type?: string;
          payload?: { event?: { eventType?: string } };
        };
        if (
          raw.type === "activeRequests/appendRawEvent" &&
          raw.payload?.event?.eventType === "end"
        ) {
          phase.streaming = false;
        }
        return next(action);
      }),
  });
}

async function runStreams(streams: number[]) {
  const store = makeHarnessStore(streams);
  let notifications = 0;
  let streamingNotifications = 0;
  phase.streaming = true;
  store.subscribe(() => {
    notifications += 1;
    if (phase.streaming) streamingNotifications += 1;
  });
  const startedAt = performance.now();
  await Promise.all(
    streams.map((s) =>
      processStream({
        requestId: requestIdOf(s),
        conversationId: conversationIdOf(s),
        response: pacedResponse(eventsFor(s)),
        submitAt: 0,
        conversationIdAt: null,
        dispatch: store.dispatch as never,
        getState: store.getState as unknown as () => RootState,
        abortController: new AbortController(),
      }),
    ),
  );
  const elapsedMs = performance.now() - startedAt;
  const state = store.getState() as unknown as RootState;
  const answers = streams.map((s) => {
    const request = state.activeRequests.byRequestId[requestIdOf(s)];
    if (!request) throw new Error(`request ${s} vanished`);
    return deriveAnswerText(request);
  });
  return { notifications, streamingNotifications, elapsedMs, answers, state };
}

const ALL = Array.from({ length: STREAMS }, (_, i) => i + 1);

test(`${STREAMS} concurrent streams notify subscribers about once per tick, and every token lands`, async () => {
  const { notifications, streamingNotifications, elapsedMs, answers, state } =
    await runStreams(ALL);

  const wireEvents = STREAMS * (CHUNKS_PER_STREAM + 1);
  const ticks = Math.ceil(elapsedMs / STREAM_FLUSH_INTERVAL_MS);
  // WHILE STREAMING: one notification per shared tick, plus the one
  // structural `markTextStreamStart` per stream (untagged on purpose — a run
  // opening shows at once), plus one frame of scheduling slack.
  const streamingBudget = ticks + STREAMS + 2;
  // AFTER `end`, each stream's commit (status, message rows, input clears)
  // is a fixed ~16 untagged actions per stream — once per turn, not per token.
  const commitPerStream = 20;
  const totalBudget = streamingBudget + STREAMS * commitPerStream;
  // The measured numbers ARE the proof — printed for the record.
  process.stdout.write(
    `[notify-once-per-tick] streams=${STREAMS} wireEvents=${wireEvents} elapsed=${Math.round(elapsedMs)}ms ticks=${ticks} streamingNotifications=${streamingNotifications} (budget ${streamingBudget}) totalNotifications=${notifications} (budget ${totalBudget})\n`,
  );
  expect(streamingNotifications).toBeLessThanOrEqual(streamingBudget);
  expect(notifications).toBeLessThanOrEqual(totalBudget);

  // Byte-identical content: every token of every stream, in order.
  ALL.forEach((s, i) => {
    expect(answers[i]).toBe(expectedAnswer(s));
    const request = state.activeRequests.byRequestId[requestIdOf(s)];
    expect(request?.chunkCount).toBeGreaterThan(0);
    // The folded transport cursor still reaches the store.
    expect(request?.lastTransportSeq).toBe(CHUNKS_PER_STREAM + 1);
  });
}, 30_000);

test("a stream run alone produces the same bytes as the same stream run beside others", async () => {
  const solo = await runStreams([3]);
  const crowd = await runStreams(ALL);
  expect(solo.answers[0]).toBe(crowd.answers[2]);
  expect(solo.answers[0]).toBe(expectedAnswer(3));
}, 30_000);
