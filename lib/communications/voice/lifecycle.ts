/** Provider-neutral call lifecycle contract. Persistence will consume this shape in P6 phase 2. */

export type CallLifecycleStatus =
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "busy"
  | "failed"
  | "no_answer"
  | "canceled";

export interface CallLifecycleEvent {
  provider: "twilio";
  providerAccountId: string;
  providerCallId: string;
  providerEventKey: string;
  sequence: number;
  status: CallLifecycleStatus;
  occurredAt: string | null;
}

const STATUS_ORDER: Record<CallLifecycleStatus, number> = {
  initiated: 0,
  ringing: 1,
  in_progress: 2,
  completed: 3,
  busy: 3,
  failed: 3,
  no_answer: 3,
  canceled: 3,
};

export function shouldApplyCallLifecycleEvent(
  current: CallLifecycleEvent | null,
  incoming: CallLifecycleEvent,
): boolean {
  if (current === null) return true;
  if (
    current.provider !== incoming.provider ||
    current.providerAccountId !== incoming.providerAccountId ||
    current.providerCallId !== incoming.providerCallId
  ) {
    return false;
  }
  if (current.providerEventKey === incoming.providerEventKey) return false;
  if (incoming.sequence <= current.sequence) return false;
  if (STATUS_ORDER[incoming.status] < STATUS_ORDER[current.status]) return false;
  if (STATUS_ORDER[current.status] === 3) return false;
  return incoming.status !== current.status;
}
