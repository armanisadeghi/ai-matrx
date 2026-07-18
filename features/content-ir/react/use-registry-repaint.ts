"use client";

/**
 * Late-arrival repaint for the streaming render path.
 *
 * `applyIrKindRoute` is a pure, synchronous read of two module-singleton
 * registries (kindRegistry + componentRegistry). When a schema or component
 * row lands AFTER a block rendered — a cold fetch losing the race with the
 * region end, the warm list resolving mid-conversation — nothing in React
 * state changes, so the block would stay stuck on its pre-arrival rendering
 * (raw JSON / generic) forever.
 *
 * This hook is the cheapest correct seam: one `useSyncExternalStore`
 * subscription per consumer to BOTH registries' monotonic versions. Any
 * definition upsert or resolver db-tier change bumps a version, the consumer
 * re-renders, and the route re-runs against the frozen envelope + the now
 * warm registries. Registry changes are rare (a handful per session), so the
 * cost is a no-op listener call almost always.
 */

import { useSyncExternalStore } from "react";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";

function subscribe(onStoreChange: () => void): () => void {
  const unsubKinds = kindRegistry.subscribeVersion(onStoreChange);
  const unsubComponents = componentRegistry.subscribe(onStoreChange);
  return () => {
    unsubKinds();
    unsubComponents();
  };
}

function getSnapshot(): number {
  // Both counters are monotonic, so the sum is monotonic — a change in either
  // registry produces a new snapshot value.
  return kindRegistry.getVersion() + componentRegistry.getVersion();
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Subscribes the caller to content-ir registry changes and returns the
 * combined version. Call it (and ignore the value if you like) anywhere a
 * render depends on `applyIrKindRoute` / `resolveComponent` answers that may
 * arrive late.
 */
export function useContentIrRegistryVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
