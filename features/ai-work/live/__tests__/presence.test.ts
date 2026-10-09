import { agentRoomKind, deliveryLag, effectivePresence, type MemberCursor } from "../presence";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const ENDED = 30 * 60_000;
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("effectivePresence (mirrors the server's effective_presence)", () => {
  it("busy and idle pass through while seen inside the window", () => {
    expect(effectivePresence("busy", at(5_000), NOW, ENDED)).toBe("busy");
    expect(effectivePresence("idle", at(5_000), NOW, ENDED)).toBe("idle");
  });
  it("a legacy 'active' row reads as idle, never busy", () => {
    expect(effectivePresence("active", at(5_000), NOW, ENDED)).toBe("idle");
  });
  it("silence past the window, ended, archived or never seen is ended", () => {
    expect(effectivePresence("busy", at(ENDED + 1_000), NOW, ENDED)).toBe("ended");
    expect(effectivePresence("ended", at(1_000), NOW, ENDED)).toBe("ended");
    expect(effectivePresence("archived", at(1_000), NOW, ENDED)).toBe("ended");
    expect(effectivePresence("busy", null, NOW, ENDED)).toBe("ended");
  });
});

const member = (over: Partial<MemberCursor>): MemberCursor => ({
  offered_through: null, offered_at: null, delivered_through: null, delivered_at: null,
  lookup_failures: 0, expired_count: 0, last_failure_reason: null, last_failure_at: null, muted: false, ...over,
});

describe("deliveryLag", () => {
  it("an offer the next hook has not confirmed is a lag only after the grace", () => {
    expect(deliveryLag(member({ offered_through: "m2", delivered_through: "m1", offered_at: at(10_000) }), NOW).state).toBe("clear");
    expect(deliveryLag(member({ offered_through: "m2", delivered_through: "m1", offered_at: at(120_000) }), NOW).state).toBe("offered");
  });
  it("a confirmed offer is clear", () => {
    expect(deliveryLag(member({ offered_through: "m2", delivered_through: "m2", offered_at: at(999_000) }), NOW).state).toBe("clear");
  });
  it("an unrecovered failure shows, before an offer lag", () => {
    expect(deliveryLag(member({ lookup_failures: 2, last_failure_at: at(5_000), offered_through: "m2", offered_at: at(999_000) }), NOW).state).toBe("failing");
    expect(deliveryLag(member({ expired_count: 1, last_failure_at: at(5_000) }), NOW).state).toBe("failing");
  });
  it("a delivery after the last failure clears the marker (counters are lifetime)", () => {
    expect(deliveryLag(member({ lookup_failures: 13, last_failure_at: at(60_000), delivered_at: at(5_000) }), NOW).state).toBe("clear");
  });
});

describe("agentRoomKind", () => {
  it("accepts the agent kinds and nothing else", () => {
    expect(agentRoomKind({ kind: "agent_room" })).toBe("agent_room");
    expect(agentRoomKind({ kind: "agent_review" })).toBe("agent_review");
    expect(agentRoomKind({ kind: "group" })).toBeNull();
    expect(agentRoomKind(null)).toBeNull();
  });
});
