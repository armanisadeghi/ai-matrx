/**
 * The chat rewrite writer retries ONLY the SQLSTATEs Postgres raises after
 * rolling the statement back for a momentary cause (57014 statement timeout —
 * the GIN pending-list merge on chat.message, 2026-09-30), and never a
 * refusal or an unknown-outcome error.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
jest.mock("@/lib/supabase/hasBrowserSession", () => ({
  hasBrowserSession: () => Promise.resolve(true),
}));

import { cxMessageContentRewriter } from "../materializeMessageArtifacts";

const TIMEOUT = {
  code: "57014",
  message: "canceling statement due to statement timeout",
};

describe("cxMessageContentRewriter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    rpc.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("retries a statement timeout and succeeds on the next attempt", async () => {
    rpc
      .mockResolvedValueOnce({ error: TIMEOUT })
      .mockResolvedValueOnce({ error: null });

    const done = cxMessageContentRewriter("11111111-1111-4111-8111-111111111111")([]);
    await jest.runAllTimersAsync();

    await expect(done).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts and reports the timeout", async () => {
    rpc.mockResolvedValue({ error: TIMEOUT });

    const done = cxMessageContentRewriter("22222222-2222-4222-8222-222222222222")([]);
    await jest.runAllTimersAsync();

    await expect(done).resolves.toEqual({ ok: false, error: TIMEOUT.message });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("never retries a refusal or an error without a SQLSTATE", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "42501", message: "not_owner" } });
    const refused = cxMessageContentRewriter("33333333-3333-4333-8333-333333333333")([]);
    await jest.runAllTimersAsync();
    await expect(refused).resolves.toEqual({ ok: false, error: "not_owner" });

    rpc.mockResolvedValueOnce({ error: { message: "TypeError: Failed to fetch" } });
    const network = cxMessageContentRewriter("44444444-4444-4444-8444-444444444444")([]);
    await jest.runAllTimersAsync();
    await expect(network).resolves.toEqual({
      ok: false,
      error: "TypeError: Failed to fetch",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
