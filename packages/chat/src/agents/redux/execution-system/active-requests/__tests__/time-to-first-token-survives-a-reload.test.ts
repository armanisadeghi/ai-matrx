/**
 * Time to first token survives a reload.
 *
 * Until 2026-10-02 it was measured only in the browser and every reloaded run
 * showed "—". The server now stamps it on each turn
 * (`user_request.metadata.ttft_ms`); a reloaded request carries it as
 * `timing_stats.first_token_seconds`, the same key a live completion uses,
 * and `requestTtftMs` reads it — the server's number first (the same for
 * every column and stable across reloads), the browser's only as a fallback.
 */
import reducer, {
  hydrateRequestsFromObservability,
  type HydratedRequestRow,
} from "../active-requests.slice";
import { requestTtftMs } from "../../../../components/run-controls/panels/shared";

const row = (ttftMs: number | null): HydratedRequestRow => ({
  id: "ur-1",
  status: "complete",
  iterations: 1,
  totalInputTokens: 10,
  totalOutputTokens: 5,
  totalCachedTokens: 0,
  totalTokens: 15,
  totalToolCalls: 0,
  totalCost: 0.001,
  totalDurationMs: 4200,
  apiDurationMs: 3000,
  toolDurationMs: 0,
  ttftMs,
  createdAt: "2026-10-02T00:00:00Z",
  completedAt: "2026-10-02T00:00:05Z",
});

function hydrate(ttftMs: number | null) {
  const state = reducer(
    undefined,
    hydrateRequestsFromObservability({ conversationId: "c-1", rows: [row(ttftMs)] }),
  );
  return state.byRequestId["ur-1"];
}

describe("time to first token after a reload", () => {
  it("comes back from the server's stored measurement", () => {
    expect(requestTtftMs(hydrate(1830))).toBe(1830);
  });

  it("is absent (not zero) for a turn stored before the server measured it", () => {
    expect(requestTtftMs(hydrate(null))).toBeNull();
  });

  it("prefers the server's measurement over the browser's, so it does not change on reload", () => {
    const req = hydrate(1830);
    expect(
      requestTtftMs({ ...req, clientMetrics: { ...(req.clientMetrics ?? {}), ttftMs: 2100 } } as typeof req),
    ).toBe(1830);
  });

  it("falls back to the browser's measurement for a turn the server did not time", () => {
    const req = hydrate(null);
    expect(
      requestTtftMs({ ...req, clientMetrics: { ...(req.clientMetrics ?? {}), ttftMs: 2100 } } as typeof req),
    ).toBe(2100);
  });
});
