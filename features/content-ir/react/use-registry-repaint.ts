"use client";

/**
 * Late-arrival repaint for the streaming render path — GRANULAR.
 *
 * `applyIrKindRoute` is a pure, synchronous read of two module-singleton
 * registries (kindRegistry + componentRegistry). When a schema or component
 * row lands AFTER a block rendered — a cold fetch losing the race with the
 * region end, the warm list resolving mid-conversation — nothing in React
 * state changes, so the block would stay stuck on its pre-arrival rendering
 * (raw JSON / generic) forever.
 *
 * Granularity contract: each consumer subscribes to ONE kind's version
 * (per-kind counters in both registries, plus a rare wholesale epoch for
 * `replaceDbRows`). A cold/warm arrival for kind X re-renders only mounted
 * blocks of kind X — never every block in every conversation.
 *
 * 🚨 WHAT YOU MAY DO WITH THE NUMBER THIS RETURNS (DD-215c). React Compiler is
 * ON (`next.config.js` reactCompiler: true — this comment said the opposite
 * until 2026-09-14, and the whole defect grew out of that one wrong word).
 * The compiler re-infers memoization from DATA FLOW, so the version must be a
 * real input to the registry read it guards:
 *
 *   ✅  const block = routeBlockAtRegistryVersion(rawBlock, version);
 *   ✅  readAtVersionForKey(cache, kind, version, () => resolveComponent(kind, …))
 *   ❌  useMemo(() => { void version; return read(x); }, [x, version])
 *
 * The ❌ form is correct WITHOUT the compiler and silently wrong with it: the
 * subscription still fires and the component still re-renders, but the emitted
 * cache is keyed on `x` alone, so the read never re-runs. On production that
 * handed readers the platform's bundled component in place of their
 * organization's authored one for the life of a mount, with nothing on screen
 * and nothing in any queue to say so. Jest does not run the compiler, so tests
 * of the ❌ form pass. The rule and the primitive: `./registry-versioned.ts`.
 * Guard: `pnpm check:registry-repaint`.
 */

import { useCallback, useSyncExternalStore } from "react";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";

const noopSubscribe = () => () => {};
const zero = () => 0;

/**
 * Subscribes the caller to registry changes FOR ONE KIND and returns that
 * kind's combined version. Pass null for blocks with no envelope kind —
 * they never repaint from registries (nothing to learn about them).
 */
export function useContentIrKindVersion(kind: string | null): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!kind) return noopSubscribe();
      const unsubKinds = kindRegistry.subscribeKind(kind, onStoreChange);
      const unsubComponents = componentRegistry.subscribeKind(
        kind,
        onStoreChange,
      );
      return () => {
        unsubKinds();
        unsubComponents();
      };
    },
    [kind],
  );

  const getSnapshot = useCallback(
    () =>
      kind
        ? // Both counters are monotonic, so the sum is monotonic — a change
          // in either registry produces a new snapshot value for this kind.
          kindRegistry.getKindVersion(kind) +
          componentRegistry.getKindVersion(kind)
        : 0,
    [kind],
  );

  return useSyncExternalStore(subscribe, getSnapshot, zero);
}
