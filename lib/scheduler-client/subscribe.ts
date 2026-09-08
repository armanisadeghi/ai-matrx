// lib/scheduler-client/subscribe.ts
//
// Private per-user scheduler Broadcast subscription. Durable task state is
// still fetched through table RLS; Broadcast is only the low-cost change hint.

import {
  subscribeSchedulerBroadcast,
  type SchedulerBroadcastPayload,
} from "./realtime";
import type { SchedulerSurface } from "./surfaces";
import type { SchTaskRow } from "./types";

export type TaskEventType = "INSERT" | "UPDATE" | "DELETE";

export interface TaskEvent {
  type: TaskEventType;
  /** New row for INSERT/UPDATE; old row for DELETE. */
  task: SchTaskRow;
}

export type TaskEventHandler = (event: TaskEvent) => void;

export interface SubscribeOptions {
  /** Private Broadcast authorization only permits this user's topic. */
  userId: string;
  /**
   * Surface filter applied client-side. Events whose task.surfaces[]
   * does not include this value AND does not include 'any' are dropped
   * before reaching `onTask`.
   */
  surface: SchedulerSurface | string;
  onTask: TaskEventHandler;
  /**
   * THE CATCH-UP DOOR. Realtime has no replay, so when the socket has been away
   * (reconnect, tab wake, network restore, queue overflow) the package says so
   * here and the caller re-reads. A subscriber that omits this keeps whatever
   * it believed before the gap, and the screen looks perfectly healthy.
   */
  onResync?: () => void;
}

/**
 * Subscribe to private sch_task Broadcast events for `userId`. Returns a
 * teardown function — call it from useEffect cleanup / shutdown hooks.
 *
 * The Supabase client parameter is gone: `@ai-matrx/realtime` owns the channel
 * and takes the app's one client from the provider, so a caller can no longer
 * hand this a second client (which would have meant a second socket).
 */
export function subscribeToTasks(opts: SubscribeOptions): () => void {
  const deliver = (
    eventType: TaskEventType,
    payload: SchedulerBroadcastPayload,
  ) => {
    // On DELETE, Supabase Realtime ships `payload.old` (PK-only by default,
    // or full row if REPLICA IDENTITY FULL is set) and `payload.new` as
    // an EMPTY object `{}` — not null. So nullish-coalesce against
    // `payload.new` won't fall through. Pick the right side per event.
    // INSERT and UPDATE always carry the new row in `payload.new`.
    const candidate =
      eventType === "DELETE"
        ? payload.old
        : payload.new && Object.keys(payload.new as object).length > 0
          ? payload.new
          : payload.old;
        const row = candidate as unknown as SchTaskRow | undefined;
    if (!row || typeof row !== "object") return;
    // DELETE with default REPLICA IDENTITY only carries PK columns; the
    // surface filter would always fail. Deliver the DELETE through
    // unconditionally so callers see "task gone" — they can refetch if
    // they need the surfaces[] context. INSERT/UPDATE keep the filter.
    if (eventType !== "DELETE") {
      const surfaces = Array.isArray(row.surfaces) ? row.surfaces : [];
      if (!surfaces.includes(opts.surface) && !surfaces.includes("any")) {
        return;
      }
    }
    opts.onTask({ type: eventType, task: row });
  };

  const unsubscribe = subscribeSchedulerBroadcast(
    opts.userId,
    (event, payload) => {
      if (event === "resync" || payload === null) {
        opts.onResync?.();
        return;
      }
      if (payload.schema !== "scheduler" || payload.table !== "sch_task") {
        return;
      }
      deliver(event, payload);
    },
  );
  return unsubscribe;
}
