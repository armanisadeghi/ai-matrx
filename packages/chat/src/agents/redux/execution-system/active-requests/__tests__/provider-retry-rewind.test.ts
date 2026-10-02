import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  appendChunk,
  appendReasoningChunk,
  closeReasoningRun,
  closeTextRun,
  createRequest,
  markReasoningStreamStart,
  markTextStreamStart,
  rewindContentToBoundary,
  upsertRenderBlock,
} from "../active-requests.slice";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";

const REQUEST_ID = "request-provider-retry";
const CONVERSATION_ID = "conversation-provider-retry";

test("provider retry discards failed attempt output without touching prior iteration", () => {
  const store = configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const dispatch = (action: unknown) => store.dispatch(action as never);
  const accumulator = new StreamBlockAccumulator(REQUEST_ID, (payload) =>
    upsertRenderBlock(payload),
  );

  dispatch(
    createRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
    }),
  );

  dispatch(markTextStreamStart({ requestId: REQUEST_ID, timestamp: 1 }));
  dispatch(
    appendChunk({
      requestId: REQUEST_ID,
      content: "PRIOR ITERATION\n",
    }),
  );
  accumulator.ingest("PRIOR ITERATION\n", dispatch);
  dispatch(closeTextRun({ requestId: REQUEST_ID, timestamp: 2 }));
  accumulator.breakTextBlock(dispatch);

  const beforeAttempt =
    store.getState().activeRequests.byRequestId[REQUEST_ID];
  const boundary = {
    blockCount: beforeAttempt.renderBlockOrder.length,
    reasoningChunkCount: beforeAttempt.reasoningChunks.length,
    timelineLength: beforeAttempt.timeline.length,
  };

  dispatch(markReasoningStreamStart({ requestId: REQUEST_ID, timestamp: 3 }));
  dispatch(
    appendReasoningChunk({
      requestId: REQUEST_ID,
      content: "FAILED REASONING",
    }),
  );
  dispatch(closeReasoningRun({ requestId: REQUEST_ID, timestamp: 4 }));
  dispatch(markTextStreamStart({ requestId: REQUEST_ID, timestamp: 5 }));
  dispatch(
    appendChunk({
      requestId: REQUEST_ID,
      content: "FAILED PARTIAL ANSWER\n",
    }),
  );
  accumulator.ingest("FAILED PARTIAL ANSWER\n", dispatch);
  dispatch(closeTextRun({ requestId: REQUEST_ID, timestamp: 6 }));

  accumulator.rewindToBlockCount(boundary.blockCount);
  dispatch(
    rewindContentToBoundary({
      requestId: REQUEST_ID,
      ...boundary,
    }),
  );

  dispatch(markTextStreamStart({ requestId: REQUEST_ID, timestamp: 7 }));
  dispatch(
    appendChunk({
      requestId: REQUEST_ID,
      content: "RECOVERED ANSWER\n",
    }),
  );
  accumulator.ingest("RECOVERED ANSWER\n", dispatch);
  dispatch(closeTextRun({ requestId: REQUEST_ID, timestamp: 8 }));
  accumulator.finalize(dispatch);

  const request = store.getState().activeRequests.byRequestId[REQUEST_ID];
  const text = request.renderBlockOrder
    .map((blockId) => request.renderBlocks[blockId]?.content ?? "")
    .join("\n");

  expect(text).toContain("PRIOR ITERATION");
  expect(text).toContain("RECOVERED ANSWER");
  expect(text).not.toContain("FAILED PARTIAL ANSWER");
  expect(request.accumulatedReasoning).toBe("");
  expect(request.timeline).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "reasoning_end" }),
    ]),
  );
});
