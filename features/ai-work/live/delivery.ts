/**
 * Per-message delivery for the /work Live hub: where each message in an agent
 * room stands with each session member, from `communication.dm_session_members`
 * cursors. This is the HOST's data for `@ai-matrx/messaging`'s
 * `deliveryStatusFor` seam; the package draws the tick.
 *
 * The cursors are positions in the room (`offered_through` / `delivered_through`
 * are message ids), so a message is offered or delivered when it sits at or
 * before that cursor in the room's order. `delivered_at` / `delivered_via`
 * describe the cursor's LAST move only, so they are shown on the cursor message
 * alone — an older message says "delivered" without claiming a route or time
 * the row no longer records. Expired messages come from the delivery service's
 * own notice (`metadata.notice_for` + `expired_message_ids`).
 */
import type { RecipientDelivery } from "@ai-matrx/messaging";
import type { SessionMemberRow } from "./service";

/** The words for `delivered_via`; `host_wake` is Matrx 2 or the cloud courier. */
export function deliveredViaLabel(via: string | null, remote: boolean): string | null {
  switch (via) {
    case null:
    case "own":
    case "expired":
      return null;
    case "claude_hook":
    case "codex_hook":
      return "hook";
    case "claude_wake":
      return "wake";
    case "host_wake":
      return remote ? "cloud" : "Matrx 2";
    case "agent_injection":
      return "agent turn";
    case "add_agent":
      return "briefing";
    case "read":
      return "read";
    default:
      return via.replace(/_/g, " ");
  }
}

export interface DeliveryMessage {
  readonly id: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DeliveryRecipient {
  readonly member: SessionMemberRow;
  readonly label: string;
  /** Actor ids that ARE this member (its own messages are never mail for it). */
  readonly actorIds: readonly string[];
  /** A Claude cloud session (its host wake is the cloud courier). */
  readonly remote: boolean;
}

/** Message ids the delivery service reported expired, per member id. */
export function expiredByMember(messages: readonly DeliveryMessage[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const message of messages) {
    const forId = message.metadata.notice_for;
    const ids = message.metadata.expired_message_ids;
    if (typeof forId !== "string" || !Array.isArray(ids)) continue;
    const set = out.get(forId) ?? new Set<string>();
    for (const id of ids) if (typeof id === "string") set.add(id);
    out.set(forId, set);
  }
  return out;
}

/**
 * The recipients of one message, or `null` when it has none to show (a system
 * notice, a room with no session members).
 */
export function recipientDeliveryFor(
  message: DeliveryMessage,
  order: ReadonlyMap<string, number>,
  recipients: readonly DeliveryRecipient[],
  expired: ReadonlyMap<string, ReadonlySet<string>>,
): RecipientDelivery[] | null {
  const actorId = typeof message.metadata.actor_id === "string" ? message.metadata.actor_id : null;
  if (actorId?.startsWith("system:")) return null;
  const position = order.get(message.id);
  if (position === undefined) return null;
  const reached = (cursor: string | null) => {
    if (cursor === null) return false;
    const at = order.get(cursor);
    return at !== undefined && position <= at;
  };
  const out: RecipientDelivery[] = [];
  for (const { member, label, actorIds, remote } of recipients) {
    if (actorId !== null && actorIds.includes(actorId)) continue;
    if (expired.get(member.member_id)?.has(message.id)) {
      out.push({ key: member.id, label, state: "expired" });
    } else if (reached(member.delivered_through)) {
      const isCursor = member.delivered_through === message.id;
      out.push({
        key: member.id,
        label,
        state: "delivered",
        at: isCursor ? member.delivered_at : null,
        via: isCursor ? deliveredViaLabel(member.delivered_via, remote) : null,
      });
    } else if (reached(member.offered_through)) {
      out.push({ key: member.id, label, state: "offered", at: member.offered_at });
    } else {
      out.push({ key: member.id, label, state: "sent" });
    }
  }
  return out.length > 0 ? out : null;
}
