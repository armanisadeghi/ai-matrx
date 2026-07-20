/**
 * traySnapshotMap — module-level registry mapping a window id to a captured
 * local object-URL snapshot used in the minimized tray card.
 *
 * Why module-level (not Redux):
 *
 *   - Image blobs stay out of Redux and never touch cloud/local storage.
 *   - Object URLs avoid base64 expansion and are revoked on replacement,
 *     restore, unmount, or bounded-cache eviction.
 *   - Subscribers need re-render on snapshot ready — we expose a tiny
 *     subscribe API for `useSyncExternalStore`-style consumers.
 *
 * Lifecycle:
 *   - `WindowPanel` captures via `registry.captureTraySnapshot` JUST BEFORE
 *     the minimize transition fires. Result is stored here.
 *   - `TrayChipPreview` subscribes via `subscribeTraySnapshotMap` and reads
 *     via `getTraySnapshot(id)`.
 *   - On restore (un-minimize), the snapshot is cleared so a future
 *     minimize captures fresh state.
 *   - On unregister, the snapshot is cleared.
 */

import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";

const MAX_SNAPSHOTS = 16;
const map = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** Store a local snapshot blob for a window and notify subscribers. */
export function setTraySnapshot(id: string, blob: Blob): void {
  const previous = map.get(id);
  if (previous) revokeTrackedObjectUrl(previous);
  const objectUrl = createTrackedObjectUrl(blob);
  map.delete(id);
  map.set(id, objectUrl);
  while (map.size > MAX_SNAPSHOTS) {
    const oldestId = map.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldestUrl = map.get(oldestId);
    map.delete(oldestId);
    revokeTrackedObjectUrl(oldestUrl);
  }
  notify();
}

/** Clear the snapshot for a given window id. */
export function clearTraySnapshot(id: string): void {
  const objectUrl = map.get(id);
  if (!objectUrl) return;
  map.delete(id);
  revokeTrackedObjectUrl(objectUrl);
  notify();
}

/** Read the snapshot for a given window id, or null. */
export function getTraySnapshot(id: string): string | null {
  return map.get(id) ?? null;
}

/**
 * Subscribe to map changes. Returns an unsubscribe function. Used by
 * `TrayChipPreview` to re-render when an async snapshot capture finishes.
 */
export function subscribeTraySnapshotMap(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
