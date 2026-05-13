// lib/scheduler-client/subscribe.ts
//
// Realtime subscription helper. Wraps supabase.channel(...).on('postgres_changes')
// for sch_task so callers (scanners + UIs) can react to schedule changes
// without polling.
//
// The subscription is filtered server-side by user_id. The
// `surfaces` filter has to be applied client-side because PostgREST
// realtime doesn't support array-contains in postgres_changes filters
// (https://supabase.com/docs/guides/realtime/postgres-changes#available-filters).

import type {
    RealtimeChannel,
    RealtimePostgresChangesPayload,
    SupabaseClient,
} from "@supabase/supabase-js";

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
    /** RLS filter: only sch_task rows for this user are delivered. */
    userId: string;
    /**
     * Surface filter applied client-side. Events whose task.surfaces[]
     * does not include this value AND does not include 'any' are dropped
     * before reaching `onTask`.
     */
    surface: SchedulerSurface | string;
    onTask: TaskEventHandler;
    /** Optional override for the channel name (defaults to `sch_task:${userId}`). */
    channelName?: string;
}

/**
 * Subscribe to sch_task postgres_changes for `userId`. Returns a
 * teardown function — call it from useEffect cleanup / shutdown hooks
 * to remove the channel.
 */
export function subscribeToTasks(
    supabase: SupabaseClient,
    opts: SubscribeOptions,
): () => Promise<void> {
    const channelName = opts.channelName ?? `sch_task:${opts.userId}`;

    const deliver = (
        eventType: TaskEventType,
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
        // On DELETE, Supabase Realtime ships `payload.old` (PK-only by default,
        // or full row if REPLICA IDENTITY FULL is set) and `payload.new` as
        // an EMPTY object `{}` — not null. So nullish-coalesce against
        // `payload.new` won't fall through. Pick the right side per event.
        // INSERT and UPDATE always carry the new row in `payload.new`.
        const candidate =
            eventType === "DELETE"
                ? payload.old
                : (payload.new && Object.keys(payload.new as object).length > 0
                      ? payload.new
                      : payload.old);
        const row = candidate as SchTaskRow | undefined;
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

    const channel: RealtimeChannel = supabase
        .channel(channelName)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "sch_task",
                filter: `user_id=eq.${opts.userId}`,
            },
            (payload) =>
                deliver(
                    "INSERT",
                    payload as RealtimePostgresChangesPayload<
                        Record<string, unknown>
                    >,
                ),
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "sch_task",
                filter: `user_id=eq.${opts.userId}`,
            },
            (payload) =>
                deliver(
                    "UPDATE",
                    payload as RealtimePostgresChangesPayload<
                        Record<string, unknown>
                    >,
                ),
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "sch_task",
                filter: `user_id=eq.${opts.userId}`,
            },
            (payload) =>
                deliver(
                    "DELETE",
                    payload as RealtimePostgresChangesPayload<
                        Record<string, unknown>
                    >,
                ),
        )
        .subscribe();

    return async () => {
        await supabase.removeChannel(channel);
    };
}
