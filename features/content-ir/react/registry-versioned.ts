/**
 * THE REGISTRY-VERSIONED READ — the primitive that survives the React Compiler.
 *
 * 🚨 THE DEFECT THIS CLOSES (DD-215c, observed on production 2026-09-14).
 *
 * Kind rendering reads MODULE SINGLETONS during render (`componentRegistry`,
 * `kindRegistry`). Nothing in React state changes when a row lands, so every
 * such reader pairs its read with `useContentIrKindVersion(kind)`, which
 * subscribes to that kind's counter and returns it. The counter was then used
 * as a memo INVALIDATION KEY in the only way a number can be used when the
 * computation does not need it:
 *
 *     const block = useMemo(() => {
 *       void kindRouteVersion;            // registry-arrival invalidation key
 *       return applyIrKindRoute(rawBlock);
 *     }, [rawBlock, kindRouteVersion]);
 *
 * That idiom is correct without the React Compiler and WRONG with it — and
 * `next.config.js` sets `reactCompiler: true`. The compiler re-infers
 * memoization from data flow: `void kindRouteVersion;` produces nothing, so the
 * version is not an input, and the emitted cache is keyed on the block alone:
 *
 *     if ($[13] !== rawBlock) { t6 = applyIrKindRoute(rawBlock); $[13] = rawBlock; ... }
 *
 * The subscription still fires and the component still re-renders — the route
 * simply comes back out of the cache, so a block that mounted before its
 * organization's component row landed keeps the platform's bundled component
 * for the life of the mount. Jest does not run the compiler, so every test of
 * that code passes on source semantics production does not have. Three lanes
 * shipped fixes proven that way and production disproved each one.
 *
 * THE RULE, therefore: a registry read that must follow a registry version
 * takes that version AS AN ARGUMENT, through this module. The version is a real
 * input to a real cache key here, so no compiler pass can decide it is dead —
 * and if the compiler memoizes the call site too, it memoizes on the same two
 * values and the answer is identical. Guard: `pnpm check:registry-repaint`.
 */

interface VersionedEntry<T> {
  version: number;
  value: T;
}

/**
 * Read `compute()` for an OBJECT subject, re-running it whenever the registry
 * version moves. One entry per subject; the WeakMap lets the subject (a block,
 * a node) be collected with its answer.
 */
export function readAtVersionFor<K extends object, T>(
  cache: WeakMap<K, VersionedEntry<T>>,
  subject: K,
  version: number,
  compute: () => T,
): T {
  const hit = cache.get(subject);
  if (hit !== undefined && hit.version === version) return hit.value;
  const value = compute();
  cache.set(subject, { version, value });
  return value;
}

/**
 * Read `compute()` for a STRING subject (a kind slug), re-running it whenever
 * the registry version moves. One entry per key — the map is bounded by the
 * number of distinct kinds a tab renders, never by version churn.
 */
export function readAtVersionForKey<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  version: number,
  compute: () => T,
): T {
  const hit = cache.get(key);
  if (hit !== undefined && hit.version === version) return hit.value;
  const value = compute();
  cache.set(key, { version, value });
  return value;
}
