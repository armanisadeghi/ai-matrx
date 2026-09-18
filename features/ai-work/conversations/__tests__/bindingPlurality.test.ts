/**
 * WHICH BINDING DELIVERED, AND WHOSE ARTIFACTS ARE REACHABLE.
 *
 * Both halves of XT-FIX-5's frontend defect class live here, because both were
 * the same mistake: collapsing a conversation's several `chat.coding_session`
 * rows to one without asking whether that row is a real provider session.
 *
 *   FE1 — an unclaimed offer (`provider_session_id` starting `matrx-handoff:`)
 *         has delivered NOTHING, EVER. The bridge stamped a new offer with
 *         `last_seen_at = created_at`, so a plain `max(last_seen_at)` crowned
 *         the one row that had never delivered (verifier V-XT-5 § A5).
 *   FE2 — artifacts are keyed by `metadata.cli_session_id`, so keeping ONE
 *         session id makes every other tool's artifacts structurally invisible
 *         (§ A7). An offer has no session and contributes none.
 *
 * Row shapes are the live ones: the `matrx-handoff:` digest placeholder the
 * bridge mints, and the nullable `last_seen_at` the server half of this lane
 * writes on an unclaimed offer. Every assertion has a counterpart with a
 * DIFFERENT expected answer, so a constant or an array-order rule cannot pass.
 */
import {
  artifactSessions,
  deliveredAtMs,
  deliveryHistory,
  newestDeliveryAt,
  hasBindingsButNoDelivery,
  hasDelivered,
  lastDeliveryLabel,
  mostRecentlyDelivered,
} from "../bindingPlurality";

const CLAUDE_SESSION = "9f1c6d40-2c2f-4a2f-9a4d-6f5b0c7e51aa";
const CODEX_SESSION = "vxt5-codexclaim-1789515658";
const CURSOR_OFFER = "matrx-handoff:ab85a058c665c103406737df0b03bb78";
const CODEX_OFFER = "matrx-handoff:9aaeda718b8a62c9a617aaa678312188";

function claude(lastSeenAt: string | null = "2026-09-15T23:40:47Z") {
  return {
    provider: "claude_code",
    provider_session_id: CLAUDE_SESSION,
    last_seen_at: lastSeenAt,
  };
}
function codex(lastSeenAt: string | null = "2026-09-15T23:41:25Z") {
  return {
    provider: "codex",
    provider_session_id: CODEX_SESSION,
    last_seen_at: lastSeenAt,
  };
}
/** The live shape before this lane's server fix: stamped at creation time. */
function cursorOfferStamped(lastSeenAt = "2026-09-15T23:52:06Z") {
  return {
    provider: "cursor",
    provider_session_id: CURSOR_OFFER,
    last_seen_at: lastSeenAt,
  };
}
/** The live shape after it: an offer has no delivery timestamp at all. */
function codexOfferNull() {
  return {
    provider: "codex",
    provider_session_id: CODEX_OFFER,
    last_seen_at: null,
  };
}

describe("mostRecentlyDelivered", () => {
  it("never picks an unclaimed offer, even when it is the newest row", () => {
    // The exact live ordering V-XT-5 found: cursor offer 23:52 > codex 23:41 >
    // claude 23:40. The offer has delivered nothing, so codex wins.
    const winner = mostRecentlyDelivered([
      cursorOfferStamped(),
      codex(),
      claude(),
    ]);
    expect(winner?.provider).toBe("codex");
  });

  it("picks the newest CLAIMED binding, by timestamp and not by position", () => {
    // Same three rows, claude delivering last — a different expected answer,
    // so "the second element" or "the first claimed row" cannot pass both.
    const winner = mostRecentlyDelivered([
      cursorOfferStamped(),
      codex("2026-09-15T23:41:25Z"),
      claude("2026-09-16T01:02:03Z"),
    ]);
    expect(winner?.provider).toBe("claude_code");
  });

  it("returns null when every binding is an unclaimed offer", () => {
    expect(mostRecentlyDelivered([cursorOfferStamped(), codexOfferNull()])).toBe(
      null,
    );
    expect(hasBindingsButNoDelivery([cursorOfferStamped()])).toBe(true);
    // An empty conversation is a DIFFERENT case: no bindings at all.
    expect(hasBindingsButNoDelivery([])).toBe(false);
  });

  it("tolerates a null last_seen_at without ordering or crashing on it", () => {
    expect(deliveredAtMs(codexOfferNull())).toBe(null);
    expect(deliveredAtMs(claude(null))).toBe(null);
    expect(deliveredAtMs(claude())).toBe(Date.parse("2026-09-15T23:40:47Z"));
    // A claimed row with no recorded delivery loses to one that has delivered.
    expect(mostRecentlyDelivered([claude(null), codex()])?.provider).toBe(
      "codex",
    );
    // …and when nothing has a usable stamp, nobody is crowned.
    expect(mostRecentlyDelivered([claude(null), codex(null)])).toBe(null);
    expect(mostRecentlyDelivered([claude("not-a-timestamp")])).toBe(null);
  });

  it("knows a claimed delivery from an offer", () => {
    expect(hasDelivered(claude())).toBe(true);
    expect(hasDelivered(cursorOfferStamped())).toBe(false);
  });
});

describe("lastDeliveryLabel", () => {
  it("states an offer's absence of delivery instead of its creation stamp", () => {
    const label = lastDeliveryLabel(cursorOfferStamped());
    expect(label.delivered).toBe(false);
    expect(label.text).toContain("Nothing delivered yet");
    expect(label.text).not.toContain("2026");
  });

  it("states a claimed binding's real delivery", () => {
    const label = lastDeliveryLabel(claude());
    expect(label.delivered).toBe(true);
    expect(label.text).toBe(
      new Date("2026-09-15T23:40:47Z").toLocaleString(),
    );
  });

  it("never renders an empty string for a missing delivery", () => {
    for (const binding of [codexOfferNull(), claude(null), claude("nope")]) {
      const label = lastDeliveryLabel(binding);
      expect(label.delivered).toBe(false);
      expect(label.text.length).toBeGreaterThan(20);
    }
  });
});

describe("artifactSessions", () => {
  it("returns EVERY claimed session, not just one", () => {
    const sessions = artifactSessions([
      cursorOfferStamped(),
      codex(),
      claude(),
    ]);
    expect(sessions).toEqual([
      { provider: "codex", providerSessionId: CODEX_SESSION },
      { provider: "claude_code", providerSessionId: CLAUDE_SESSION },
    ]);
  });

  it("offers no tool for an unclaimed offer or a session-less row", () => {
    expect(artifactSessions([cursorOfferStamped(), codexOfferNull()])).toEqual(
      [],
    );
    expect(
      artifactSessions([{ provider: "codex", provider_session_id: null }]),
    ).toEqual([]);
  });

  it("lists one tool once even if two rows carry the same session", () => {
    expect(artifactSessions([claude(), claude("2026-09-16T00:00:00Z")])).toEqual(
      [{ provider: "claude_code", providerSessionId: CLAUDE_SESSION }],
    );
  });
});

/**
 * XT-FIX-5 / FE3 — the capture-gap readers took the FIRST row of a
 * `last_seen_at desc` list as "the most recent delivery". Postgres orders NULLs
 * FIRST on a descending sort, so once an unclaimed offer carries
 * `last_seen_at = null` that first row is the one row that never delivered —
 * and `lastSeenAt: null` is the capture-gap verdict's loudest alarm ("nothing
 * has ever arrived") shown to an owner whose capture is running fine.
 */
describe("newestDeliveryAt / deliveryHistory", () => {
  it("reads past a leading offer to the real newest delivery", () => {
    // The order the DB now returns: null-stamped offer first, then deliveries.
    const page = [codexOfferNull(), codex(), claude()];
    expect(newestDeliveryAt(page)).toBe("2026-09-15T23:41:25Z");
    expect(deliveryHistory(page)).toEqual([
      "2026-09-15T23:41:25Z",
      "2026-09-15T23:40:47Z",
    ]);
  });

  it("does not credit a created_at-stamped offer with a delivery", () => {
    // Different expected answer from the case above: the offer's stamp is the
    // newest value in the set, and is still not a delivery.
    expect(newestDeliveryAt([cursorOfferStamped(), claude()])).toBe(
      "2026-09-15T23:40:47Z",
    );
    expect(deliveryHistory([cursorOfferStamped()])).toEqual([]);
  });

  it("says nothing has delivered only when nothing has", () => {
    expect(newestDeliveryAt([cursorOfferStamped(), codexOfferNull()])).toBe(
      null,
    );
    expect(newestDeliveryAt([])).toBe(null);
  });
});
