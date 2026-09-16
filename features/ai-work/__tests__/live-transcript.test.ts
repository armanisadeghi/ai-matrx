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

  /**
   * XT-FIX-5 / FE3 — offering a conversation to another tool is not delivery.
   *
   * An unclaimed handoff offer is `status = "active"` and was stamped
   * `last_seen_at = created_at`, so a plain freshness check made a conversation
   * read as "Delivering" the moment it was offered — a present-tense claim
   * about a provider session that does not exist — and started the live poll
   * for it. Both live shapes of the offer row are covered: the stamped one
   * already in production, and the `null` one the server half writes.
   */
  it("an unclaimed handoff offer is never a live delivery", () => {
    const fresh = new Date(NOW - 1_000).toISOString();
    const offer = binding({
      provider_session_id: "matrx-handoff:9aaeda718b8a62c9a617aaa678312188",
      last_seen_at: fresh,
    });
    expect(liveSessionState([offer], NOW)).toEqual({
      live: false,
      lastSeenAt: null,
    });
    // The same row with the nullable shape: still not live, still no stamp.
    expect(
      liveSessionState(
        [binding({ ...offer, last_seen_at: null as unknown as string })],
        NOW,
      ),
    ).toEqual({ live: false, lastSeenAt: null });
    // A claimed binding beside it still decides both answers.
    const claimed = binding({
      provider_session_id: "vxt5-codexclaim-1789515658",
      last_seen_at: new Date(NOW - 2_000).toISOString(),
    });
    expect(liveSessionState([offer, claimed], NOW)).toEqual({
      live: true,
      lastSeenAt: new Date(NOW - 2_000).toISOString(),
    });
  });
});
