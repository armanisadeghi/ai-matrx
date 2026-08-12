"use client";

/**
 * The test bench's exemplar-draft snapshot, published upward for the surface
 * scope.
 *
 * `AgentSlotsConsole` mounts the `matrx-admin/agent-slots` runtime and builds
 * the scope at Run time, but the exemplar composer (label + variables JSON +
 * user message) and the slot's stored exemplars live in `SlotTestBench`, a
 * grandchild that only mounts once a slot is open in the workbench. The
 * `slot_exemplar_draft` WRITE target needs a read twin — an agent has to be
 * able to see what is already staged, and what exemplars the slot already has,
 * before it proposes another one.
 *
 * Rather than lift the bench's whole editor state into the console (the bench
 * deliberately seeds local state from props and remounts per slot), the bench
 * publishes a snapshot here and the console reads it inside `getScope()`. Same
 * shape as the module-level slot-cache bus this feature already uses
 * (`onSlotCacheInvalidated`), and read-only from the console's side.
 *
 * Registration is id-guarded: `SlotDetail` can be rendered twice (the table's
 * side panel and its WindowPanel Edit tab), so a bench unmounting only clears
 * the snapshot if it is still the one that published it.
 */

import type { JsonObject } from "@/types/json";

/** One stored exemplar, as the surface exposes it. */
export interface SlotExemplarSnapshot {
  id: string;
  label: string;
  variables: JsonObject | null;
  user_input: string | null;
}

/** What the bench publishes for `slot_exemplar_draft` + its siblings. */
export interface SlotBenchSnapshot {
  /** The slot the bench is mounted for — the console cross-checks selection. */
  slotId: string;
  /** Whether the "+ Exemplar" composer is expanded (its inputs on screen). */
  open: boolean;
  label: string;
  /** The variables textarea VERBATIM — a JSON string, not an object. */
  variables: string;
  user_input: string;
  exemplars: SlotExemplarSnapshot[];
}

let nextId = 0;
let published: { id: number; snapshot: SlotBenchSnapshot } | null = null;

/** A registration id for one mounted bench. */
export function nextSlotBenchId(): number {
  return ++nextId;
}

export function publishSlotBenchSnapshot(
  id: number,
  snapshot: SlotBenchSnapshot,
): void {
  published = { id, snapshot };
}

/** Clears ONLY if `id` still owns the published snapshot. */
export function clearSlotBenchSnapshot(id: number): void {
  if (published?.id === id) published = null;
}

/** The live bench snapshot, or null when no bench is mounted. */
export function readSlotBenchSnapshot(): SlotBenchSnapshot | null {
  return published?.snapshot ?? null;
}

/**
 * Which bench registration currently owns the snapshot, or null when none is
 * mounted.
 *
 * The writeback seam resolves every staged handler closure BEFORE the user
 * confirms the first dialog, so a bench that has since unmounted (the admin —
 * or an earlier write in the same batch — opened a different slot) still holds
 * a live-looking handler pointing at its own setters. A bench compares this
 * against its own id before staging, so a write can never land in a composer
 * that is no longer on screen.
 */
export function readSlotBenchOwner(): number | null {
  return published?.id ?? null;
}
