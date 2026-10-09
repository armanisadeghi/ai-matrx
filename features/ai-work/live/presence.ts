/**
 * Pure rules for the /work Live hub: a session's presence and a room member's
 * delivery lag. Presence mirrors the server's `effective_presence`
 * (aidream/services/agent_messaging/envelope.py) so the hub and the
 * `agent_messages` tool's `who` never disagree about a session.
 */

export type LivePresence = "busy" | "idle" | "ended";

export const AGENT_ROOM_KINDS = [
  "agent_direct",
  "agent_pair",
  "agent_room",
  "agent_review",
] as const;
export type AgentRoomKind = (typeof AGENT_ROOM_KINDS)[number];

export function agentRoomKind(metadata: unknown): AgentRoomKind | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const kind = (metadata as Record<string, unknown>).kind;
  return AGENT_ROOM_KINDS.find((k) => k === kind) ?? null;
}

export function effectivePresence(
  status: string | null,
  lastSeenAt: string | null,
  nowMs: number,
  endedAfterMs: number,
): LivePresence {
  if (status === "ended" || status === "archived" || !lastSeenAt) return "ended";
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen) || nowMs - seen > endedAfterMs) return "ended";
  return status === "busy" ? "busy" : "idle";
}

export interface MemberCursor {
  offered_through: string | null;
  offered_at: string | null;
  delivered_through: string | null;
  delivered_at: string | null;
  lookup_failures: number;
  expired_count: number;
  last_failure_reason: string | null;
  last_failure_at: string | null;
  muted: boolean;
}

export type DeliveryLag =
  | { state: "clear" }
  | { state: "offered"; sinceMs: number }
  | { state: "failing"; failures: number; expired: number; reason: string | null }
  | { state: "muted" };

/**
 * Offered-but-unconfirmed is normal for a moment (the next hook confirms it);
 * it becomes a marker after `graceMs`. Failures and expiries are lifetime
 * counters, so they mark the member only while the latest failure is newer
 * than the latest confirmed delivery.
 */
export function deliveryLag(
  member: MemberCursor,
  nowMs: number,
  graceMs = 60_000,
): DeliveryLag {
  if (member.muted) return { state: "muted" };
  const failedAt = member.last_failure_at ? Date.parse(member.last_failure_at) : NaN;
  const deliveredAt = member.delivered_at ? Date.parse(member.delivered_at) : NaN;
  const unrecovered =
    !Number.isNaN(failedAt) && (Number.isNaN(deliveredAt) || failedAt > deliveredAt);
  if (unrecovered && (member.lookup_failures > 0 || member.expired_count > 0)) {
    return {
      state: "failing",
      failures: member.lookup_failures,
      expired: member.expired_count,
      reason: member.last_failure_reason,
    };
  }
  if (
    member.offered_through &&
    member.offered_through !== member.delivered_through &&
    member.offered_at
  ) {
    const offered = Date.parse(member.offered_at);
    if (!Number.isNaN(offered) && nowMs - offered > graceMs) {
      return { state: "offered", sinceMs: nowMs - offered };
    }
  }
  return { state: "clear" };
}

/** "12s", "4m", "3h", "2d" — compact relative age for dense rows. */
export function compactAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
