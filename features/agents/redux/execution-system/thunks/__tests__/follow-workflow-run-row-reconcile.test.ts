/**
 * @jest-environment node
 *
 * Node, not jsdom: this guard feeds the follower a REAL `ReadableStream` SSE
 * body, and jsdom's test-local globalThis carries no ReadableStream.
 */
/**
 * FORCING-FUNCTION GUARD — wall W9, second half (2026-09-15).
 *
 * THE DEFECT CLASS: a workflow run's terminal STATUS (the `workflow.run` row)
 * and its terminal EVENT (the durable feed) are written by two different
 * places. `run_store.apply_status` flips the row to errored/failed/cancelled;
 * the scheduler separately emits `run_errored`/`run_failed`/`run_cancelled`.
 * Every path that ends a run outside that emit — a lease/recovery sweep,
 * `force-fail`, a worker killed between the two writes — leaves a DEAD ROW and
 * a SILENT FEED. A follower that believes only the feed then spins forever:
 * the Vision Interview room showed "Handing the interview to the room…
 * Working…" over a run the server had already given up on.
 *
 * This guard drives the REAL `followWorkflowRunStream` thunk over a REAL SSE
 * body that replays node lifecycle and then ends WITHOUT any terminal event,
 * with the run row already `errored`. It fails (hangs to the reconnect ceiling
 * and reports no terminal event) against the pre-fix follower, and passes once
 * the follower reconciles with the row.
 *
 * The row read is deliberately NOT mocked away: the test serves
 * `GET /runs/{id}` from the same fetch stub, so the guard proves the follower
 * actually asks the run store.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";

jest.mock("../resolve-base-url", () => ({
  resolveBackendForConversation: () => ({
    baseUrl: "https://server.test",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
  }),
}));

import {
  followWorkflowRunStream,
  reconcileEventFromRunRow,
  RUN_ROW_TERMINAL_FALLBACK_MESSAGE,
  type WorkflowRunWireEvent,
} from "../follow-workflow-run-stream";

const RUN_ID = "run_w9_reconcile";
const REQ = "req_w9";
const CONV = "conv_w9";

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

/** The replay a dead-but-silent run actually produces: lifecycle, then end. */
const REPLAY_WITHOUT_TERMINAL = [
  `id: 1\nevent: data\ndata: ${JSON.stringify({ event: "run_started", run_id: RUN_ID })}\n\n`,
  `id: 2\nevent: data\ndata: ${JSON.stringify({ event: "node_started", run_id: RUN_ID, node_id: "sounding_board" })}\n\n`,
  `id: 3\nevent: data\ndata: ${JSON.stringify({ event: "node_completed", run_id: RUN_ID, node_id: "sounding_board" })}\n\n`,
  `event: end\ndata: {}\n\n`,
];

function makeStore() {
  const store = configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  return store;
}

function install(rowResponse: { status: number; body?: unknown }) {
  const calls: string[] = [];
  const fetchStub = jest.fn(async (url: unknown) => {
    const href = String(url);
    calls.push(href);
    if (href.endsWith("/events/stream")) {
      return {
        ok: true,
        status: 200,
        body: sseBody(REPLAY_WITHOUT_TERMINAL),
      } as unknown as Response;
    }
    return {
      ok: rowResponse.status >= 200 && rowResponse.status < 300,
      status: rowResponse.status,
      json: async () => rowResponse.body,
    } as unknown as Response;
  });
  (globalThis as { fetch: unknown }).fetch = fetchStub;
  return calls;
}

async function follow(): Promise<{
  events: WorkflowRunWireEvent[];
  calls: string[];
  store: ReturnType<typeof makeStore>;
}> {
  const store = makeStore();
  const events: WorkflowRunWireEvent[] = [];
  const controller = new AbortController();
  await (
    store.dispatch as unknown as (t: unknown) => Promise<void>
  )(
    followWorkflowRunStream({
      runId: RUN_ID,
      requestId: REQ,
      conversationId: CONV,
      signal: controller.signal,
      onEvent: (e) => events.push(e),
    }) as unknown,
  );
  return { events, calls: [], store };
}

describe("a replay that omits the terminal event must still render the truth", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = realFetch;
    jest.restoreAllMocks();
  });

  test("row already errored → the follower delivers run_errored with a sentence", async () => {
    const calls = install({
      status: 200,
      body: {
        id: RUN_ID,
        status: "errored",
        error: { message: "The room's scribe pass could not finish." },
      },
    });
    const { events } = await follow();

    expect(calls.some((u) => u === `https://server.test/runs/${RUN_ID}`)).toBe(
      true,
    );
    const terminal = events.find((e) => e.event === "run_errored");
    expect(terminal).toBeDefined();
    expect(terminal?.error_message).toBe(
      "The room's scribe pass could not finish.",
    );
    expect(terminal?.payload).toMatchObject({ reconciled_from_row: true });
  }, 20_000);

  test("a terminal row with no sentence still names the remedy", async () => {
    install({ status: 200, body: { id: RUN_ID, status: "failed" } });
    const { events } = await follow();
    const terminal = events.find((e) => e.event === "run_failed");
    expect(terminal?.error_message).toBe(RUN_ROW_TERMINAL_FALLBACK_MESSAGE);
  }, 20_000);

  test("a row that is still live is never reported as terminal", async () => {
    install({ status: 200, body: { id: RUN_ID, status: "interrupted" } });
    const { events } = await follow();
    expect(
      events.filter((e) => String(e.event).startsWith("run_")).map((e) => e.event),
    ).toEqual(["run_started"]);
  }, 20_000);
});

describe("reconcileEventFromRunRow — the pure half", () => {
  test.each([
    ["completed", "run_completed"],
    ["failed", "run_failed"],
    ["errored", "run_errored"],
    ["cancelled", "run_cancelled"],
  ])("row status %s → %s", (status, event) => {
    expect(reconcileEventFromRunRow(RUN_ID, { status })?.event).toBe(event);
  });

  test.each(["pending", "running", "paused", "interrupted", "awaiting_input", ""])(
    "row status %s is not terminal",
    (status) => {
      expect(reconcileEventFromRunRow(RUN_ID, { status })).toBeNull();
    },
  );

  test("a completed run carries no failure sentence", () => {
    expect(
      reconcileEventFromRunRow(RUN_ID, { status: "completed" })?.error_message,
    ).toBeUndefined();
  });

  test("technical text is used when there is no human message", () => {
    expect(
      reconcileEventFromRunRow(RUN_ID, {
        status: "errored",
        error: { technical: "KeyError: 'session_id'" },
      })?.error_message,
    ).toBe("KeyError: 'session_id'");
  });

  test("a missing row is not a verdict", () => {
    expect(reconcileEventFromRunRow(RUN_ID, null)).toBeNull();
  });
});
