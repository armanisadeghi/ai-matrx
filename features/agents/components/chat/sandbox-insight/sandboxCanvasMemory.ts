/**
 * sandboxCanvasMemory — the sandbox pane's slice of the shared canvas reveal
 * memory (`features/canvas/revealMemory.ts`).
 *
 * The sandbox discovered the rule ("a pane the user put away stays away, across
 * reloads, while remaining one click away in the switcher") and every later
 * auto-revealing pane needs the identical two bits — so the implementation
 * lives once, in the canvas feature, and this file is only the namespace.
 *
 * Scope: per conversation AND per box (the canvas source id), because binding a
 * different box to the same chat is a new thing to reveal, not the thing the
 * user put away.
 */

import {
  createCanvasRevealMemory,
  type CanvasRevealMemory,
} from "@/features/canvas/revealMemory";

export type SandboxCanvasMemory = CanvasRevealMemory;

const store = createCanvasRevealMemory("matrx.sandboxCanvas.");

export function readSandboxCanvasMemory(
  sourceId: string | null,
): SandboxCanvasMemory {
  return store.read(sourceId);
}

export function writeSandboxCanvasMemory(
  sourceId: string | null,
  patch: Partial<SandboxCanvasMemory>,
): void {
  store.write(sourceId, patch);
}

/** Keep the store bounded — one key per conversation×box adds up over months. */
export function pruneSandboxCanvasMemory(storage: Storage): void {
  store.prune(storage);
}
