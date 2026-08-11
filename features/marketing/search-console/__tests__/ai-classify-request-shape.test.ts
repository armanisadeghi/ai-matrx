/**
 * The AI-classify request must survive the two ceilings above it.
 *
 * aidream's `/seo/keywords/classify` is SYNCHRONOUS and runs one provider call
 * per 40 ids INSIDE the request. Two defaults conspire against that:
 * `callApi` gives up after 15s of waiting for headers, and Cloudflare severs
 * the connection at ~100s and answers with a CORS-less error page a browser can
 * only report as `TypeError: Failed to fetch` (2026-08-11 incident).
 *
 * So this pins the two things that keep a real run reachable: ONE server batch
 * per request, and an explicit header budget under the edge ceiling.
 */

const callApiMock = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
  callApi: (config: unknown) => {
    callApiMock(config);
    return async () => ({
      data: {
        eligible: 0,
        batches: 0,
        updated: 0,
        skipped_error: 0,
        missing_keyword_ids: [],
      },
    });
  },
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: async () => undefined,
}));

import {
  classifyKeywordsWithAi,
  SEO_COMPUTE_CONNECT_TIMEOUT_MS,
} from "@/features/marketing/search-console/data-classification";

/** A thunk-dispatching stub: runs the thunk the service hands it. */
const dispatch = ((thunk: unknown) =>
  typeof thunk === "function"
    ? (thunk as () => unknown)()
    : thunk) as unknown as Parameters<typeof classifyKeywordsWithAi>[0];

describe("classifyKeywordsWithAi", () => {
  it("sends one server batch (40 ids) per request, never the 200-id cap", async () => {
    callApiMock.mockClear();
    const ids = Array.from({ length: 95 }, (_, i) => `kw-${i}`);

    await classifyKeywordsWithAi(dispatch, ids);

    const bodies = callApiMock.mock.calls.map(
      ([config]) =>
        (config as { body: { keyword_ids: string[]; limit: number } }).body,
    );
    expect(bodies.map((body) => body.keyword_ids.length)).toEqual([40, 40, 15]);
    // Every id is sent exactly once — chunking must not drop or duplicate work.
    expect(bodies.flatMap((body) => body.keyword_ids)).toEqual(ids);
    // `limit` always matches the chunk, so the server never widens the batch.
    for (const body of bodies) {
      expect(body.limit).toBe(body.keyword_ids.length);
    }
  });

  it("waits out a provider-bound route instead of the 15s default", async () => {
    callApiMock.mockClear();

    await classifyKeywordsWithAi(dispatch, ["kw-1"]);

    const [config] = callApiMock.mock.calls[0] as [
      { connectTimeoutMs: number; totalTimeoutMs: number | null },
    ];
    expect(config.connectTimeoutMs).toBe(SEO_COMPUTE_CONNECT_TIMEOUT_MS);
    expect(config.totalTimeoutMs).toBeNull();
    // Under Cloudflare's ~100s cut — past that the edge, not us, decides.
    expect(SEO_COMPUTE_CONNECT_TIMEOUT_MS).toBeLessThan(100_000);
  });
});
