/**
 * utils/supabase/realtime.ts
 *
 * `RealtimeClient.channel(topic)` (supabase-js / @supabase/realtime-js)
 * dedupes by topic string: a second `.channel()` call with the same topic
 * returns the SAME channel object if one is still registered. In React 19
 * dev mode (double-invoked effects) or Fast Refresh, a component's cleanup
 * (`supabase.removeChannel(channel)`) is async and not awaited by React, so
 * a remount's `.channel(topic)` call can return the still-joined channel
 * from the previous mount — then `.on("postgres_changes", ...)` on it
 * throws "cannot add `postgres_changes` callbacks ... after `subscribe()`".
 *
 * Fix: give every channel instance a unique topic so remounts never
 * collide. The topic string is only a client-side connection key — it
 * does not need to be stable or meaningful to the server.
 */
let seq = 0;

export function uniqueChannelTopic(base: string): string {
  seq += 1;
  return `${base}:${seq}`;
}
