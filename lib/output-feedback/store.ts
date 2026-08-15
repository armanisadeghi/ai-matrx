/**
 * A tiny module-scoped store for output feedback, read through
 * `useSyncExternalStore`.
 *
 * Why not Redux: the subject is polymorphic (a chat message today, a workflow
 * deliverable tomorrow), so it belongs to no existing slice, and adding a
 * parallel slice for a two-field-per-subject cache is exactly the sprawl the
 * doctrine forbids. What it must do is keep every bar showing the SAME subject
 * in sync — one shared map does that with no slice, no selectors, no wiring.
 */

import type { OutputFeedbackRecord, OutputFeedbackSubject } from "./types";
import { subjectKey } from "./types";

type Listener = () => void;

const records = new Map<string, OutputFeedbackRecord | null>();
const listeners = new Set<Listener>();
/** Bumped on every mutation so `useSyncExternalStore` sees a new snapshot. */
let revision = 0;

function emit(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeOutputFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOutputFeedbackRevision(): number {
  return revision;
}

/** `undefined` = not loaded yet. `null` = loaded, no feedback. */
export function peekOutputFeedback(
  subject: OutputFeedbackSubject,
): OutputFeedbackRecord | null | undefined {
  return records.get(subjectKey(subject));
}

export function setOutputFeedbackRecord(
  subject: OutputFeedbackSubject,
  record: OutputFeedbackRecord | null,
): void {
  records.set(subjectKey(subject), record);
  emit();
}

/**
 * Seed the store from a batched read. `loadedSubjectIds` marks every subject
 * that was queried, so subjects with no row settle on `null` (loaded, empty)
 * instead of staying `undefined` (unknown) forever.
 */
export function hydrateOutputFeedback(
  subjectType: string,
  loadedSubjectIds: string[],
  found: OutputFeedbackRecord[],
): void {
  const byId = new Map(found.map((r) => [r.subjectId, r]));
  for (const id of loadedSubjectIds) {
    records.set(`${subjectType}:${id}`, byId.get(id) ?? null);
  }
  emit();
}

/** Test/teardown only. */
export function resetOutputFeedbackStore(): void {
  records.clear();
  emit();
}
