import { deliveredViaLabel, expiredByMember, recipientDeliveryFor, type DeliveryRecipient } from "../delivery";
import type { SessionMemberRow } from "../service";

const row = (over: Partial<SessionMemberRow>): SessionMemberRow => ({
  id: "row-1", conversation_id: "room", member_kind: "coding_session", member_id: "cs-1",
  offered_through: null, offered_at: null, delivered_through: null, delivered_at: null, delivered_via: null,
  lookup_failures: 0, expired_count: 0, last_failure_reason: null, last_failure_at: null, muted: false,
  created_at: "2026-10-10T00:00:00Z", ...over,
});
const ids = ["m1", "m2", "m3"];
const order = new Map(ids.map((id, i) => [id, i]));
const msg = (id: string, metadata: Record<string, unknown> = {}) => ({ id, metadata });
const recipient = (member: SessionMemberRow, remote = false): DeliveryRecipient => ({
  member, label: "Fix auth", actorIds: ["coding_session:cs-1"], remote,
});
const none = new Map<string, Set<string>>();

describe("recipientDeliveryFor: cursors are positions in the room", () => {
  it("sent → offered → delivered as the member's cursors move past the message", () => {
    const sent = row({});
    expect(recipientDeliveryFor(msg("m2"), order, [recipient(sent)], none)?.[0]?.state).toBe("sent");
    const offered = row({ offered_through: "m3", offered_at: "2026-10-10T18:48:00Z" });
    expect(recipientDeliveryFor(msg("m2"), order, [recipient(offered)], none)?.[0]).toMatchObject({
      state: "offered", at: "2026-10-10T18:48:00Z",
    });
    const delivered = row({
      offered_through: "m3", delivered_through: "m3", delivered_at: "2026-10-10T18:49:00Z", delivered_via: "claude_hook",
    });
    expect(recipientDeliveryFor(msg("m3"), order, [recipient(delivered)], none)?.[0]).toMatchObject({
      state: "delivered", via: "hook", at: "2026-10-10T18:49:00Z",
    });
  });

  it("an older delivered message never claims the cursor's route and time", () => {
    const delivered = row({ delivered_through: "m3", offered_through: "m3", delivered_at: "x", delivered_via: "claude_wake" });
    expect(recipientDeliveryFor(msg("m1"), order, [recipient(delivered)], none)?.[0]).toMatchObject({
      state: "delivered", via: null, at: null,
    });
  });

  it("a message after the cursor is not delivered, and its own messages are never mail for it", () => {
    const delivered = row({ delivered_through: "m1", offered_through: "m1" });
    expect(recipientDeliveryFor(msg("m3"), order, [recipient(delivered)], none)?.[0]?.state).toBe("sent");
    expect(
      recipientDeliveryFor(msg("m3", { actor_id: "coding_session:cs-1" }), order, [recipient(delivered)], none),
    ).toBeNull();
    expect(recipientDeliveryFor(msg("m3", { actor_id: "system:agent_messaging" }), order, [recipient(delivered)], none)).toBeNull();
  });

  it("an expired message reads expired from the service's notice, even behind the cursor", () => {
    const moved = row({ delivered_through: "m3", offered_through: "m3", delivered_via: "expired" });
    const expired = expiredByMember([msg("n", { notice_for: "cs-1", expired_message_ids: ["m2", "m3"] })]);
    expect(recipientDeliveryFor(msg("m2"), order, [recipient(moved)], expired)?.[0]?.state).toBe("expired");
    expect(recipientDeliveryFor(msg("m1"), order, [recipient(moved)], expired)?.[0]?.state).toBe("delivered");
  });

  it("host wake names Matrx 2 or the cloud courier", () => {
    expect(deliveredViaLabel("host_wake", false)).toBe("Matrx 2");
    expect(deliveredViaLabel("host_wake", true)).toBe("cloud");
    expect(deliveredViaLabel("own", false)).toBeNull();
  });
});
