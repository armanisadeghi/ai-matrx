/**
 * A REQUEST THE CALLER CANCELLED IS NOT AN INCIDENT (live 2026-10-01).
 *
 * MEASURED: the Error Inspector filed "signal is aborted without reason" for
 * POST /knowledge/search — the search box aborting its own superseded request.
 * The Supabase capture already treats a caller's own abort as control flow
 * (supabaseErrorCapture `cancelledByCaller`); callApi did not.
 *
 * WHAT THIS PINS, through callApi itself:
 *   1. the caller aborts its signal → the request answers with an error, nothing is filed;
 *   2. the caller's signal aborts with a TimeoutError → that is a failure, it is filed.
 */

const captured: unknown[] = [];
jest.mock("@/lib/diagnostics/captureApiError", () => ({
  captureApiError: (error: unknown) => {
    captured.push(error);
  },
}));

import { callApi } from "../call-api";
import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setAuthReady } from "@/lib/redux/slices/userAuthSlice";
import userProfileReducer from "@/lib/redux/slices/userProfileSlice";
import type { RootState } from "@/lib/redux/store";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function state(): RootState {
  return {
    apiConfig: apiConfigReducer(undefined, { type: "test/init" }),
    appContext: { ...appContextReducer(undefined, { type: "test/init" }), organization_id: ORG },
    userAuth: userAuthReducer(userAuthReducer(undefined, { type: "test/init" }), setAuthReady(true)),
    userProfile: userProfileReducer(undefined, { type: "test/init" }),
  } as unknown as RootState;
}

/** A fetch that hangs until its signal aborts, then rejects the way browsers do. */
const hangingFetch = jest.fn(
  (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => reject(new DOMException("signal is aborted without reason", "AbortError"));
      if (signal?.aborted) fail();
      signal?.addEventListener("abort", fail);
    }),
);

function search(signal: AbortSignal) {
  return callApi({
    path: "/knowledge/search",
    method: "POST",
    body: { query: "renewal terms" },
    stream: false,
    signal,
    _testOverrides: { forceBaseUrl: "https://server.test" },
  } as unknown as Parameters<typeof callApi>[0])(jest.fn(), state, undefined);
}

describe("callApi and a cancelled request", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    captured.length = 0;
    global.fetch = hangingFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("the caller aborts its own request: answered with an error, nothing filed", async () => {
    const controller = new AbortController();
    const pending = search(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    const result = await pending;
    expect(result.error).toBeDefined();
    expect(captured).toHaveLength(0);
  });

  it("the caller's signal times out: a failure, filed", async () => {
    const controller = new AbortController();
    const pending = search(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort(new DOMException("timed out", "TimeoutError"));
    const result = await pending;
    expect(result.error).toBeDefined();
    expect(captured).toHaveLength(1);
  });
});
