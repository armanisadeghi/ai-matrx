/**
 * A SCHEDULED resume retry is not an error; the final, unrecovered one is red.
 *
 * Break this guards (2026-10-01): while the suspending stream was still
 * closing, `resumeInstance` scheduled its own bounded retry and rejected
 * "suspending stream still closing — retry N scheduled". The capture middleware
 * filed every one of those as a RED redux-rejected "dead user turn" — although
 * the next dispatch carried the turn. Drives the REAL thunk through the REAL
 * capture middleware and tier rules; only the abort registry is pinned to
 * "a stream is still registered for this conversation".
 */
import { configureStore } from "@reduxjs/toolkit";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { reduxErrorCaptureMiddleware } from "@/lib/diagnostics/reduxErrorCaptureMiddleware";

jest.mock("../abort-registry", () => ({
  ...jest.requireActual("../abort-registry"),
  hasAbortController: () => true,
}));

import { resumeInstance } from "../resume-instance.thunk";
import { RESUME_STREAM_CLOSING_MAX_RETRIES } from "../resume-claims";

const CONVERSATION = "7c1d2f4e-3a8b-4c55-9e21-6b0f8d4a2c19";
const USER_REQUEST = "b3e9a1c7-52d4-4f0e-8a6b-1d7c9e2f4a83";

function makeStore() {
  return configureStore({
    reducer: () => ({}),
    middleware: (d) =>
      d({ serializableCheck: false, immutableCheck: false }).concat(
        reduxErrorCaptureMiddleware,
      ),
  });
}

describe("resumeInstance scheduled retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearCapturedErrors();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("files nothing while a retry is scheduled, and red once the budget is spent", async () => {
    const store = makeStore();

    for (let attempt = 1; attempt <= RESUME_STREAM_CLOSING_MAX_RETRIES; attempt++) {
      const r = await store.dispatch(
        resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST }),
      );
      expect(r.payload).toBe(
        `suspending stream still closing — retry ${attempt} scheduled`,
      );
      jest.clearAllTimers(); // the scheduled re-dispatch is driven by this loop
    }
    expect(getSnapshot()).toEqual([]);

    const final = await store.dispatch(
      resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST }),
    );
    expect(final.payload).toBe("suspending stream still closing — retries exhausted");
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
