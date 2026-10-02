/**
 * REGRESSION GUARD (W-33, 2026-10-01): a reply renders ONCE when its last
 * line is still held by the block accumulator when the text run closes.
 *
 * Recorded live (conversation da7fae8e…, agent "Compass Door Dispatcher"):
 * the server streamed three chunks with no trailing newline
 *   "Door line: Cy" · " Ode | Move 7" · " | NONE"
 * then `phase: complete`. The accumulator holds an unterminated line (a pipe
 * row may still become a table), so the `phase` entry closed the text run —
 * `text_end` with the full `rawText` but a block range ending BEFORE the
 * held line. `finalize()` later emitted that line as a new block OUTSIDE the
 * range; the commit walker took the run's rawText AND the uncovered block,
 * and the message read "…| NONEDoor line: …| NONE". The database held it
 * once. A block the accumulator emits after its run closed belongs to that
 * run.
 *
 * Drives the REAL reducer + REAL StreamBlockAccumulator in process-stream's
 * dispatch order, then asserts both walkers (commit + live).
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
  appendTimeline,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import type {
  ActiveRequest,
  TimelineEntry,
} from "../../../../types/request.types";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

const REQ = "req_w33";
const CONV = "conv_w33";

function run(chunks: string[], tail: "server_status_first" | "end_only") {
  const store = configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );
  const timeline = (entry: Omit<TimelineEntry, "seq" | "timestamp">) =>
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: { ...entry, seq: 0, timestamp: 1 } as TimelineEntry,
      }),
    );

  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }));
  for (const text of chunks) {
    dispatch(appendChunk({ requestId: REQ, content: text }));
    acc.ingest(text, dispatch);
  }
  if (tail === "server_status_first") {
    // The live order: status traffic closes the run, the accumulator is
    // finalized only at stream end.
    timeline({ kind: "phase", data: { phase: "complete" } } as never);
    timeline({
      kind: "info",
      data: { code: "iteration_finalizing", user_message: "" },
    } as never);
    timeline({
      kind: "completion",
      data: { operation: "user_request", status: "success" },
    } as never);
    timeline({ kind: "end", data: { reason: "complete" } } as never);
    acc.finalize(dispatch);
    dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }));
  } else {
    acc.finalize(dispatch);
    dispatch(closeTextRun({ requestId: REQ, timestamp: 1 }));
  }
  const request = (
    store.getState() as { activeRequests: { byRequestId: Record<string, ActiveRequest> } }
  ).activeRequests.byRequestId[REQ];
  return { request, state: store.getState() as AnyState };
}

function committedText(request: ActiveRequest): string {
  return assembleMessageParts(request)
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

function liveText(state: AnyState, request: ActiveRequest): string {
  return selectUnifiedSlots(REQ)(state)
    .map((s) =>
      s.kind === "render_block"
        ? (request.renderBlocks[s.blockId]?.content ?? "")
        : "",
    )
    .join("");
}

const DOOR_LINE = ["Door line: Cy", " Ode | Move 7", " | NONE"];
const ANSWER = DOOR_LINE.join("");

test("a pipe line held at run close commits exactly once", () => {
  const { request } = run(DOOR_LINE, "server_status_first");
  expect(committedText(request)).toBe(ANSWER);
});

test("a pipe line held at run close renders exactly once live", () => {
  const { state, request } = run(DOOR_LINE, "server_status_first");
  expect(liveText(state, request)).toBe(ANSWER);
});

test("a plain unterminated sentence held at run close commits exactly once", () => {
  const chunks = ["The crew lead", " is Ana Ruiz."];
  const { request } = run(chunks, "server_status_first");
  expect(committedText(request)).toBe(chunks.join(""));
});

test("baseline: finalized before the run closes commits exactly once", () => {
  const { request } = run(DOOR_LINE, "end_only");
  expect(committedText(request)).toBe(ANSWER);
});
