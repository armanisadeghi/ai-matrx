/**
 * lib/scheduler-client/realtime.ts
 *
 * The scheduler's live feed: a PRIVATE per-user Supabase Database Broadcast
 * topic. The payload is produced server-side by `realtime.broadcast_changes()`
 * from a Postgres trigger on the `sch_*` tables, and the topic is authorized
 * against `realtime.messages` RLS — which is what makes a fixed, guessable
 * topic name safe: the server refuses a join by anyone not entitled to it.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel (`private: true`, since 0.7.0
 * — the release this adoption produced). What was here was a hand-rolled
 * `client.channel(topic, {config:{private:true}})` plus its own
 * `realtime.setAuth()` dance, a WeakMap-of-Map handler registry keyed by client
 * and user, manual teardown, and NO catch-up read at all.
 *
 * Two things that fixes:
 *
 *  1. **The catch-up.** Realtime has no replay, so a schedule that fired, was
 *     rescheduled, or errored while the tab slept simply never reached this
 *     client — and the schedules list went on looking healthy. `onBackfill`
 *     hands every listener a `resync` signal on reconnect, tab wake, network
 *     restore and queue overflow.
 *  2. **The registry.** The package's room registry already keeps one
 *     underlying channel per topic, ref-counted, which is exactly what the
 *     WeakMap was doing by hand — including the part its own comment worried
 *     about ("Database Broadcast topics cannot carry a random suffix, so this
 *     registry also avoids supabase-js channel-name collisions"). The topic
 *     goes on the wire verbatim because for broadcast THE TOPIC IS THE ROOM.
 *
 * THE PAYLOAD IS A FOREIGN WIRE. `broadcast_changes()` puts its own shape on
 * the channel (`{schema, table, new, old}`), so this is `wire: {mode:"raw"}` —
 * the package must not try to read a Matrx envelope off a payload Postgres
 * wrote. Echo suppression is not applicable and says so: these events originate
 * in the database, never from this client, so there is no echo to suppress.
 */

import {
  defineChannelNamespace,
  onRealtimeManagerChange,
  type ChannelHandle,
} from "@ai-matrx/realtime";

export type SchedulerBroadcastEvent = "INSERT" | "UPDATE" | "DELETE";

export interface SchedulerBroadcastPayload<Row = Record<string, unknown>> {
  schema: string;
  table: string;
  new: Row | null;
  old: Row | null;
}

/**
 * The topic is the PEER's contract — it is written by
 * `realtime.broadcast_changes()` in a Postgres trigger, and renaming it here
 * would put this client in a room of one while the database kept publishing
 * where it always did.
 */
const schedulerChannel = defineChannelNamespace({
  namespace: "scheduler-user",
  parts: ["userId"],
  description: "sch_* row changes for one user (private Database Broadcast)",
  foreignTopic: "scheduler:user",
});

export function schedulerBroadcastTopic(userId: string): string {
  return schedulerChannel.topic({ userId });
}

/**
 * `resync` is not a row change: it is the package's backfill door telling every
 * listener that the socket was away and whatever it missed is gone. Handlers
 * re-read rather than trying to reconstruct events they never saw.
 */
export type SchedulerSignal = SchedulerBroadcastEvent | "resync";

type Handler = (
  event: SchedulerSignal,
  payload: SchedulerBroadcastPayload | null,
) => void;

interface Entry {
  handlers: Set<Handler>;
  handle: ChannelHandle | null;
  stop: () => void;
}

const entries = new Map<string, Entry>();

const ROW_EVENTS: readonly SchedulerBroadcastEvent[] = [
  "INSERT",
  "UPDATE",
  "DELETE",
];

/**
 * Subscribe to this user's scheduler feed. Returns an unsubscribe function.
 * The channel is opened for the first listener and closed when the last one
 * leaves; every listener on one user shares it.
 */
export function subscribeSchedulerBroadcast(
  userId: string,
  handler: Handler,
): () => void {
  let entry = entries.get(userId);

  if (!entry) {
    const created: Entry = {
      handlers: new Set<Handler>(),
      handle: null,
      stop: () => {},
    };
    const fanOut = (
      event: SchedulerSignal,
      payload: SchedulerBroadcastPayload | null,
    ): void => {
      for (const listener of Array.from(created.handlers)) {
        listener(event, payload);
      }
    };

    created.stop = onRealtimeManagerChange((manager) => {
      if (created.handle) {
        created.handle.close();
        created.handle = null;
      }
      if (!manager) return;
      created.handle = manager.open({
        topic: schedulerChannel.topic({ userId }),
        // RLS-authorized topic: the package attaches the access token to the
        // socket before joining, which is the step whose absence makes a
        // private channel receive nothing while looking healthy.
        private: true,
        // Postgres wrote this payload, not us — never read a Matrx envelope
        // off it. Nothing this client sends goes on this channel, so there is
        // no echo to suppress and no `isOwnMessage` to supply.
        wire: { mode: "raw", acceptEchoFromSelf: true },
        broadcast: ROW_EVENTS.map((event) => ({
          event,
          onMessage: ({ data }) => {
            fanOut(event, data as SchedulerBroadcastPayload);
          },
        })),
        // `broadcast_changes` gives no id to dedup on, so key off the row the
        // event carries. A redelivered change is one event, not two.
        eventKey: (_source, payload) => {
          const frame = payload as SchedulerBroadcastPayload | undefined;
          const row = frame?.new ?? frame?.old;
          const id = (row as { id?: unknown } | null | undefined)?.id;
          const updatedAt = (row as { updated_at?: unknown } | null | undefined)
            ?.updated_at;
          return id === undefined
            ? undefined
            : `${frame?.table ?? "?"}:${String(id)}:${String(updatedAt ?? "")}`;
        },
        // THE CATCH-UP the hand-rolled channel never had.
        onBackfill: () => {
          fanOut("resync", null);
        },
      });
    });

    entries.set(userId, created);
    entry = created;
  }

  entry.handlers.add(handler);

  return () => {
    const current = entries.get(userId);
    if (!current) return;
    current.handlers.delete(handler);
    if (current.handlers.size === 0) {
      current.stop();
      current.handle?.close();
      entries.delete(userId);
    }
  };
}
