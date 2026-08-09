/**
 * invalidation-registry — a tiny name-keyed callback registry that lets a
 * UBIQUITOUS module (the stream processor, an effect runner) trigger cache
 * invalidation inside a HEAVY chunk cluster with ZERO import edge between them.
 *
 * WHY THIS EXISTS (D115, THE FRAGMENTATION LAW): `toolStateEffects.ts` is
 * statically reachable via `process-stream.ts` from ~every route context. Its
 * first repaint implementation reached the content-ir registry cluster with an
 * `await import()` — one line that added +14 GB peak build RSS / +50% compile
 * time and OOM-killed 12 straight Vercel builds (v0.4.199-210, reverted
 * v0.4.212). The sanctioned shape is the INVERSION implemented here: the heavy
 * cluster registers a callback at its own module init (it is always
 * initialized wherever its output can render — if the chunk never loaded,
 * nothing stale is mounted), and the ubiquitous module fires the callback by
 * NAME. The only shared code is this file, which imports nothing.
 *
 * RULES:
 *  - This module must NEVER grow an import. It is in every chunk that touches
 *    it; any dependency it gains is multiplied across all of them.
 *  - Firing an unregistered name is a NO-OP by design, not an error — the
 *    consumer chunk simply isn't loaded in this tab, so there is nothing
 *    stale to invalidate.
 *  - Callbacks never break the caller: each runs in its own try/catch and
 *    screams to the console on failure.
 *  - Key constants live HERE so producer and consumer agree on the name
 *    without importing each other.
 */

/** Registered keys — add a constant here when a new consumer cluster joins. */
export const INVALIDATION_KEYS = {
  /** Tool-viz DB renderer cache (`tool_ui` compiles). Detail: `{ toolName?: string }` — absent = invalidate all. */
  dbToolRenderers: "tool-viz:db-renderers",
  /** Content-IR kind-component resolver + compile caches. Detail unused (full refresh; per-kind repaint is granular downstream). */
  kindComponents: "content-ir:kind-components",
} as const;

export type InvalidationKey =
  (typeof INVALIDATION_KEYS)[keyof typeof INVALIDATION_KEYS];

type InvalidationCallback = (detail?: unknown) => void;

const callbacks = new Map<string, Set<InvalidationCallback>>();

/**
 * Register a callback for a name. Idempotent-friendly: returns the
 * unsubscribe. Module-scope registration in the consumer chunk is the
 * intended pattern (register once per chunk load, never unsubscribe).
 */
export function registerInvalidationCallback(
  name: InvalidationKey,
  callback: InvalidationCallback,
): () => void {
  let set = callbacks.get(name);
  if (!set) {
    set = new Set();
    callbacks.set(name, set);
  }
  set.add(callback);
  return () => {
    set.delete(callback);
  };
}

/**
 * Fire every callback registered under `name`. Returns true when at least one
 * callback ran. Never throws — a failing callback screams and the rest run.
 */
export function fireInvalidation(name: InvalidationKey, detail?: unknown): boolean {
  const set = callbacks.get(name);
  if (!set || set.size === 0) return false;
  for (const callback of set) {
    try {
      callback(detail);
    } catch (error) {
      console.error(
        `[invalidation-registry] callback for "${name}" threw`,
        error,
      );
    }
  }
  return true;
}
