/**
 * A SCHEDULED resume retry is not an error; the final, unrecovered one is red.
 *
 * Break this guards (2026-10-01): while the suspending stream was still
 * closing, `resumeInstance` scheduled its own bounded retry and rejected
 * "suspending stream still closing — retry N scheduled". The capture middleware
 * filed every one of those as a RED redux-rejected "dead user turn" — although
 * the next dispatch carried the turn. Drives the REAL thunk through the REAL
 * capture middleware and tier rules; a real AbortController stays registered
 * for the conversation ("the suspending stream never closes").
 */
import { configureStore, type Middleware } from "@reduxjs/toolkit";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { reduxErrorCaptureMiddleware } from "@/lib/diagnostics/reduxErrorCaptureMiddleware";

import {
  registerAbortController,
  unregisterAbortController,
} from "../abort-registry";
import { resumeInstance } from "../resume-instance.thunk";
import {
  RESUME_STREAM_CLOSING_MAX_RETRIES,
  RESUME_STREAM_CLOSING_WAIT_MS,
} from "../resume-claims";

const CONVERSATION = "7c1d2f4e-3a8b-4c55-9e21-6b0f8d4a2c19";
const USER_REQUEST = "b3e9a1c7-52d4-4f0e-8a6b-1d7c9e2f4a83";

function makeStore() {
  const payloads: string[] = [];
  const recordRejections: Middleware = () => (next) => (action) => {
    const a = action as { type: string; payload?: unknown };
    if (a.type === resumeInstance.rejected.type) payloads.push(String(a.payload));
    return next(action);
  };
  const store = configureStore({
    reducer: () => ({ conversations: { byConversationId: {} } }),
    middleware: (d) =>
      d({ serializableCheck: false, immutableCheck: false })
        .concat(reduxErrorCaptureMiddleware)
        .concat(recordRejections),
  });
  return { store, payloads };
}

describe("resumeInstance scheduled retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    clearCapturedErrors();
    registerAbortController(CONVERSATION, new AbortController());
  });
  afterEach(() => {
    unregisterAbortController(CONVERSATION);
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("files nothing while a retry is scheduled, and red once the budget is spent", async () => {
    const { store, payloads } = makeStore();
    void store.dispatch(
      resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST }),
    );

    for (let attempt = 1; attempt <= RESUME_STREAM_CLOSING_MAX_RETRIES; attempt++) {
      await jest.advanceTimersByTimeAsync(0);
      expect(payloads[attempt - 1]).toBe(
        `suspending stream still closing — retry ${attempt} scheduled`,
      );
      expect(getSnapshot()).toEqual([]);
      await jest.advanceTimersByTimeAsync(RESUME_STREAM_CLOSING_WAIT_MS);
    }

    expect(payloads.at(-1)).toBe("suspending stream still closing — retries exhausted");
    const captured = getSnapshot();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      source: "redux-rejected",
      relation: "instances/resume",
      tier: "red",
      message: "suspending stream still closing — retries exhausted",
    });
  });
});
