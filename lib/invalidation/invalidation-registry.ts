/**
 * invalidation-registry — HOST WIRING over @ai-matrx/kit/invalidation.
 *
 * The registry mechanics (name-keyed callbacks, no-op unregistered fires,
 * never-throw dispatch, globalThis-slot state) live in the package. This
 * module keeps exactly what is host-shaped: the KEY CONSTANTS producer and
 * consumer chunks agree on without importing each other, and the narrow
 * `InvalidationKey` typing over the package's string-keyed API.
 *
 * WHY THE INVERSION EXISTS (D115, THE FRAGMENTATION LAW): the ubiquitous
 * stream path must reach heavy chunk clusters with ZERO import edge — a
 * single `await import()` here once added +14 GB peak build RSS and
 * OOM-killed 12 straight Vercel builds. The heavy cluster registers at its
 * own module init; the ubiquitous module fires by NAME. This file therefore
 * imports NOTHING app-shaped, and must never grow an app import.
 */
import {
  fireInvalidation as fireInvalidationByName,
  registerInvalidationCallback as registerInvalidationCallbackByName,
  type InvalidationCallback,
} from "@ai-matrx/kit/invalidation";

/** Registered keys — add a constant here when a new consumer cluster joins. */
export const INVALIDATION_KEYS = {
  /** Tool-viz DB renderer cache (`tool_ui` compiles). Detail: `{ toolName?: string }` — absent = invalidate all. */
  dbToolRenderers: "tool-viz:db-renderers",
  /** Content-IR kind-component resolver + compile caches. Detail unused (full refresh; per-kind repaint is granular downstream). */
  kindComponents: "content-ir:kind-components",
  /** Content-IR kind DEFINITION registry (schemas + latched misses). Detail unused (full warm refresh; per-kind repaint is granular downstream). */
  kindDefinitions: "content-ir:kind-definitions",
} as const;

export type InvalidationKey =
  (typeof INVALIDATION_KEYS)[keyof typeof INVALIDATION_KEYS];

export function registerInvalidationCallback(
  name: InvalidationKey,
  callback: InvalidationCallback,
): () => void {
  return registerInvalidationCallbackByName(name, callback);
}

export function fireInvalidation(
  name: InvalidationKey,
  detail?: unknown,
): boolean {
  return fireInvalidationByName(name, detail);
}
