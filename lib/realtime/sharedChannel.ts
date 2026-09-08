/**
 * lib/realtime/sharedChannel.ts
 *
 * ONE CHANNEL PER SUBJECT, NOT ONE PER MOUNT — the app-shaped half of realtime.
 *
 * `@ai-matrx/realtime` owns everything about a channel: unique instance topics,
 * echo suppression, dedup, the decoupled ordered handler queue, jittered
 * reconnect with a stability reset, the `onBackfill` door on every recovery
 * path, tab-sleep/network awareness, diagnostics. None of that is re-implemented
 * here and none of it ever may be — a second copy beside the package is the
 * named failure (package README § Migrating off hand-rolled channels).
 *
 * What IS host-shaped, and what this module is: several SURFACES in this app
 * mount the same hook for the same subject at once (four panels read one file's
 * analysis; the thumbnail strip and the studio shell both read one file's
 * pages). `useChannel` opens one channel per mount, so those four surfaces would
 * open four channels carrying identical bindings. The package's own ref-counting
 * (`src/core/rooms.ts`) shares by TOPIC and applies only to broadcast/presence,
 * where the topic is the room; a pure Postgres-Changes channel deliberately gets
 * a unique instance topic per connection and therefore cannot ride it.
 *
 * So the fan-in belongs to the app, and it belongs in exactly ONE place. Before
 * this module there were three hand-copied refcount maps (`useAnnotations`,
 * `usePages`, `useFileAnalysis`); the exemplar adoption named the refcount as
 * host-shaped, and this is that host shape written once.
 *
 * Semantics:
 *  - `openShared(manager, key, buildSpec)` opens the channel on the FIRST
 *    holder and returns a release function. The spec is built once, by the
 *    first holder; later holders attach to it.
 *  - The real `close()` runs when the last holder releases.
 *  - If the provider rebuilt its manager (the Supabase client or the signed-in
 *    user changed), the old manager has already disposed its channels, so the
 *    stale entry is dropped and the channel re-opened on the new manager.
 *
 * Handlers must therefore read through a shared cache / the Redux store rather
 * than closing over one mount's state — which is exactly how every consumer of
 * this module already works.
 */

"use client";

import type { RealtimeManager, ChannelSpec } from "@ai-matrx/realtime";

interface Holder {
  manager: RealtimeManager;
  count: number;
  close: () => void;
}

/**
 * Keyed by `${namespace-scoped key}`. Callers pass a key that already includes
 * the feature (the channel topic is the natural one), so two features can never
 * collide on a bare id.
 */
const holders = new Map<string, Holder>();

/**
 * Attach this caller to the shared channel for `key`, opening it if this is the
 * first holder. Returns the detach function — call it in the effect cleanup.
 */
export function openShared(
  manager: RealtimeManager,
  key: string,
  buildSpec: () => ChannelSpec,
): () => void {
  const existing = holders.get(key);
  if (existing) {
    if (existing.manager === manager) {
      existing.count += 1;
      return () => release(key);
    }
    // The provider rebuilt its manager; its channels are already disposed.
    existing.close();
    holders.delete(key);
  }
  const handle = manager.open(buildSpec());
  holders.set(key, { manager, count: 1, close: () => handle.close() });
  return () => release(key);
}

function release(key: string): void {
  const existing = holders.get(key);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) {
    existing.close();
    holders.delete(key);
  }
}

/** Test seam: how many subjects currently hold an open shared channel. */
export function sharedChannelCount(): number {
  return holders.size;
}
