/** Provider-neutral lifecycle evidence for one call recording. */

export type CallRecordingLifecycleStatus =
  | "in_progress"
  | "completed"
  | "absent"
  | "failed";

export type CallRecordingTrack = "inbound" | "outbound" | "both";

export interface CallRecordingLifecycleEvent {
  provider: "twilio";
  providerAccountId: string;
  providerCallId: string;
  providerRecordingId: string;
  providerEventKey: string;
  status: CallRecordingLifecycleStatus;
  occurredAt: string | null;
  durationSeconds: number | null;
  channels: 1 | 2 | null;
  source: string | null;
  track: CallRecordingTrack | null;
  /** Provider evidence only. Never use this as the durable AI Matrx media identity. */
  providerMediaUrl: string | null;
}

const TERMINAL_RECORDING_STATUSES = new Set<CallRecordingLifecycleStatus>([
  "completed",
  "absent",
  "failed",
]);

/**
 * Accept a recording transition only for the same provider recording and never
 * regress or replace a terminal result. Durable persistence applies this after
 * deduplicating on providerEventKey.
 */
export function shouldApplyCallRecordingLifecycleEvent(
  current: CallRecordingLifecycleEvent | null,
  incoming: CallRecordingLifecycleEvent,
): boolean {
  if (current === null) return true;
  if (
    current.provider !== incoming.provider ||
    current.providerAccountId !== incoming.providerAccountId ||
    current.providerCallId !== incoming.providerCallId ||
    current.providerRecordingId !== incoming.providerRecordingId
  ) {
    return false;
  }
  if (current.providerEventKey === incoming.providerEventKey) return false;
  if (TERMINAL_RECORDING_STATUSES.has(current.status)) return false;
  return current.status === "in_progress" && incoming.status !== "in_progress";
}
