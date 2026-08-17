"use client";

/**
 * The test bench's exemplar-draft snapshot, published upward for the surface
 * scope.
 *
 * `MandatesConsole` mounts the `matrx-admin/mandates` runtime and builds
 * the scope at Run time, but the exemplar composer (label + variables JSON +
 * user message) and the mandate's stored exemplars live in `MandateTestBench`, a
 * grandchild that only mounts once a mandate is open in the workbench. The
 * `slot_exemplar_draft` WRITE target needs a read twin — an agent has to be
 * able to see what is already staged, and what exemplars the mandate already has,
 * before it proposes another one.
 *
 * Rather than lift the bench's whole editor state into the console (the bench
 * deliberately seeds local state from props and remounts per mandate), the bench
 * publishes a snapshot here and the console reads it inside `getScope()`. Same
 * shape as the module-level mandate-cache bus this feature already uses
 * (`onMandateCacheInvalidated`), and read-only from the console's side.
 *
 * Registration is id-guarded: `MandateDetailView` can be rendered twice (the table's
 * side panel and its WindowPanel Edit tab), so a bench unmounting only clears
 * the snapshot if it is still the one that published it.
 */

import type { JsonObject } from "@/types/json";

/** One stored exemplar, as the surface exposes it. */
export interface MandateExemplarSnapshot {
  id: string;
  label: string;
  variables: JsonObject | null;
  user_input: string | null;
}

/** What the bench publishes for `slot_exemplar_draft` + its siblings. */
export interface MandateBenchSnapshot {
  /** The mandate the bench is mounted for — the console cross-checks selection. */
  mandateId: string;
  /** Whether the "+ Exemplar" composer is expanded (its inputs on screen). */
  open: boolean;
  label: string;
  /** The variables textarea VERBATIM — a JSON string, not an object. */
  variables: string;
  user_input: string;
  exemplars: MandateExemplarSnapshot[];
}

let nextId = 0;
let published: { id: number; snapshot: MandateBenchSnapshot } | null = null;

/** A registration id for one mounted bench. */
export function nextMandateBenchId(): number {
  return ++nextId;
}

export function publishMandateBenchSnapshot(
  id: number,
  snapshot: MandateBenchSnapshot,
): void {
  published = { id, snapshot };
}

/** Clears ONLY if `id` still owns the published snapshot. */
export function clearMandateBenchSnapshot(id: number): void {
  if (published?.id === id) published = null;
}

/** The live bench snapshot, or null when no bench is mounted. */
export function readMandateBenchSnapshot(): MandateBenchSnapshot | null {
  return published?.snapshot ?? null;
}

/**
 * Which bench registration currently owns the snapshot, or null when none is
 * mounted.
 *
 * The writeback seam resolves every staged handler closure BEFORE the user
 * confirms the first dialog, so a bench that has since unmounted (the admin —
 * or an earlier write in the same batch — opened a different mandate) still holds
 * a live-looking handler pointing at its own setters. A bench compares this
 * against its own id before staging, so a write can never land in a composer
 * that is no longer on screen.
 */
export function readMandateBenchOwner(): number | null {
  return published?.id ?? null;
}
