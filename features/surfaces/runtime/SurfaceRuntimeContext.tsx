"use client";

/**
 * features/surfaces/runtime/SurfaceRuntimeContext.tsx
 *
 * Live surface-scope registration for the universal Agents chrome.
 *
 * Why a module registry (not React Context alone): the header Agents button
 * lives in AppShell `<Header>`, while page content lives in `<main>` — they
 * are siblings. A Context provider under a route never reaches the header.
 * Pages still mount `<SurfaceRuntimeProvider>` in their tree; it registers
 * into this module store so the header panel can read it via
 * `useSurfaceRuntime()` / `getSurfaceRuntime()`.
 *
 *   <SurfaceRuntimeProvider
 *     surfaceName="matrx-user/notes"
 *     surfaceLabel="Notes"
 *     getScope={() => createNotesScope({ ...live })}
 *   >
 *     {children}
 *   </SurfaceRuntimeProvider>
 *
 * Pages without a provider still get list/bind; Run uses an empty scope.
 * Nested providers (e.g. split-pane notes) stack — the topmost wins.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

export interface SurfaceRuntimeValue {
  /** Canonical `ui_surface.name` this page is emitting. */
  surfaceName: string;
  /** Pretty label for bind/settings chrome. */
  surfaceLabel?: string;
  /**
   * Build the live ApplicationScope / SurfaceScopePayload at Run time.
   * Called only when the user hits ▶ — never on mount.
   */
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>;
  /** Pass-through for editable surfaces (default contracts). */
  isEditable?: boolean;
}

type RegistryEntry = { id: number; depth: number; value: SurfaceRuntimeValue };

let nextId = 0;
let stack: RegistryEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Imperative read — the DEEPEST registered runtime wins (registration
 * recency breaks ties). Depth, not recency, decides: React fires passive
 * effects child-first, so on any commit where a page-level provider and an
 * ancestor layout provider both (re)register, the ancestor registers LAST —
 * pure "latest wins" would let the layout's generic scope shadow the page's
 * rich one (the exact inversion of the nested-provider contract).
 */
export function getSurfaceRuntime(): SurfaceRuntimeValue | null {
  let winner: RegistryEntry | null = null;
  for (const entry of stack) {
    if (
      !winner ||
      entry.depth > winner.depth ||
      (entry.depth === winner.depth && entry.id > winner.id)
    ) {
      winner = entry;
    }
  }
  return winner?.value ?? null;
}

function getServerSnapshot(): SurfaceRuntimeValue | null {
  return null;
}

/**
 * Register a live runtime. Returns an unregister that only clears this entry
 * (safe under nested providers / remounts). `depth` is the provider's nesting
 * depth in the React tree (see `SurfaceRuntimeDepthContext`); deeper wins.
 */
export function registerSurfaceRuntime(
  value: SurfaceRuntimeValue,
  depth = 0,
): () => void {
  const id = ++nextId;
  stack = [...stack, { id, depth, value }];
  emit();
  return () => {
    stack = stack.filter((e) => e.id !== id);
    emit();
  };
}

/** Hook for the header panel (and any other chrome outside the page tree). */
export function useSurfaceRuntime(): SurfaceRuntimeValue | null {
  return useSyncExternalStore(subscribe, getSurfaceRuntime, getServerSnapshot);
}

/**
 * Nesting depth of the current provider subtree. Each SurfaceRuntimeProvider
 * publishes `ownDepth = parentDepth + 1` so nested providers always register
 * DEEPER than their ancestors — the registry resolves by depth, immune to
 * effect-firing order (child effects run before parent effects).
 */
const SurfaceRuntimeDepthContext = createContext(0);

/**
 * Page-tree registration. Renders children unchanged aside from the depth
 * context; `getScope` is held in a ref so identity churn does not thrash the
 * registry.
 */
export function SurfaceRuntimeProvider({
  children,
  surfaceName,
  surfaceLabel,
  getScope,
  isEditable,
}: SurfaceRuntimeValue & { children: ReactNode }) {
  const depth = useContext(SurfaceRuntimeDepthContext) + 1;
  const getScopeRef = useRef(getScope);
  useEffect(() => {
    getScopeRef.current = getScope;
  });

  useEffect(() => {
    return registerSurfaceRuntime(
      {
        surfaceName,
        surfaceLabel,
        isEditable,
        getScope: () => getScopeRef.current(),
      },
      depth,
    );
  }, [surfaceName, surfaceLabel, isEditable, depth]);

  return (
    <SurfaceRuntimeDepthContext.Provider value={depth}>
      {children}
    </SurfaceRuntimeDepthContext.Provider>
  );
}
