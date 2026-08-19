import {
  liveSessionState,
  LIVE_SESSION_WINDOW_MS,
} from "@/features/ai-work/lib/liveTranscript";
import type { CodingSessionBinding } from "@/features/agent-connections/coding-sessions/service";

const NOW = Date.parse("2026-08-19T22:00:00.000Z");

function binding(
  overrides: Partial<CodingSessionBinding> = {},
): CodingSessionBinding {
  return {
    status: "active",
    last_seen_at: new Date(NOW - 5_000).toISOString(),
    ended_at: null,
    ...overrides,
  } as CodingSessionBinding;
}

describe("liveSessionState", () => {
  it("is live for an active binding that delivered inside the window", () => {
    expect(liveSessionState([binding()], NOW)).toEqual({
      live: true,
      lastSeenAt: new Date(NOW - 5_000).toISOString(),
    });
  });

  it("is not live once delivery ages past the window — status alone never keeps polling alive", () => {
    const stale = new Date(NOW - LIVE_SESSION_WINDOW_MS - 1_000).toISOString();
    const state = liveSessionState([binding({ last_seen_at: stale })], NOW);
    expect(state.live).toBe(false);
    expect(state.lastSeenAt).toBe(stale);
  });

  it("is not live for an ended or non-active binding, however fresh", () => {
    expect(liveSessionState([binding({ status: "ended" })], NOW).live).toBe(
      false,
    );
    expect(
      liveSessionState(
        [binding({ ended_at: new Date(NOW - 1_000).toISOString() })],
        NOW,
      ).live,
    ).toBe(false);
  });

  it("takes the newest delivery across bindings and lives if ANY one is running", () => {
    const older = new Date(NOW - 60_000).toISOString();
    const newer = new Date(NOW - 2_000).toISOString();
    const state = liveSessionState(
      [
        binding({ status: "ended", last_seen_at: older }),
        binding({ last_seen_at: newer }),
      ],
      NOW,
    );
    expect(state).toEqual({ live: true, lastSeenAt: newer });
  });

  it("reports no session rather than guessing when there are no bindings", () => {
    expect(liveSessionState([], NOW)).toEqual({ live: false, lastSeenAt: null });
  });

  it("treats an unparseable or missing timestamp as not live", () => {
    expect(
      liveSessionState([binding({ last_seen_at: "not a date" })], NOW).live,
    ).toBe(false);
  });
});
