/**
 * DIAGNOSTIC (temporary): what does an adopted pipeline stream that emits a
 * single bare-JSON `__kind` payload look like in Redux once the stream ends?
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
import { selectUnifiedSlots, selectAllRenderBlocks } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

const REQ = "req_adopt_1";
const CONV = "conv_adopt_1";

const PAYLOAD = JSON.stringify({
  __kind: "keyword_classification_batch",
  items: [
    { keyword: "rhinoplasty financing options", intent: "commercial", score: 92 },
    { keyword: "rhinoplasty cost", intent: "commercial", score: 88 },
  ],
});

test("diagnostic: adopted kind stream state after finalize", () => {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));

  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );

  // The server's typed progress line (an `info` event with user_message).
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "info",
        seq: 0,
        timestamp: 1,
        data: { user_message: "Classifying keywords..." },
      },
    }) as unknown as never,
  );

  // Chunked payload, no trailing newline (minified JSON on one line).
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }));
  for (let i = 0; i < PAYLOAD.length; i += 40) {
    const piece = PAYLOAD.slice(i, i + 40);
    dispatch(appendChunk({ requestId: REQ, content: piece }));
    acc.ingest(piece, dispatch);
  }

  const midSlots = selectUnifiedSlots(REQ)(store.getState() as never);
  const midBlocks = selectAllRenderBlocks(REQ)(store.getState() as never);
  console.log("MID slots:", JSON.stringify(midSlots, null, 1));
  console.log(
    "MID blocks:",
    JSON.stringify(
      midBlocks?.map((b) => ({
        id: b.blockId,
        type: b.type,
        status: b.status,
        len: b.content?.length ?? null,
        ir: !!(b.metadata as Record<string, unknown> | undefined)?.__ir,
      })),
      null,
      1,
    ),
  );

  // Terminal: process-stream's end-of-loop sequence.
  acc.finalize(dispatch);
  dispatch(closeTextRun({ requestId: REQ, timestamp: 2 }));

  const endSlots = selectUnifiedSlots(REQ)(store.getState() as never);
  const endBlocks = selectAllRenderBlocks(REQ)(store.getState() as never);
  console.log("END slots:", JSON.stringify(endSlots, null, 1));
  console.log(
    "END blocks:",
    JSON.stringify(
      endBlocks?.map((b) => ({
        id: b.blockId,
        type: b.type,
        status: b.status,
        len: b.content?.length ?? null,
        ir: !!(b.metadata as Record<string, unknown> | undefined)?.__ir,
      })),
      null,
      1,
    ),
  );
  console.log(
    "END accumulated text len:",
    (store.getState() as never as { activeRequests: { byRequestId: Record<string, { accumulatedText?: string }> } })
      .activeRequests.byRequestId[REQ].accumulatedText?.length,
  );
});
