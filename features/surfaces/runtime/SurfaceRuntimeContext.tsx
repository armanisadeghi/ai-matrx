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

import { useEffect, useRef, type ReactNode } from "react";
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

type RegistryEntry = { id: number; value: SurfaceRuntimeValue };

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

/** Imperative read — latest registered runtime, or null. */
export function getSurfaceRuntime(): SurfaceRuntimeValue | null {
  return stack.length > 0 ? stack[stack.length - 1]!.value : null;
}

function getServerSnapshot(): SurfaceRuntimeValue | null {
  return null;
}

/**
 * Register a live runtime. Returns an unregister that only clears this entry
 * (safe under nested providers / remounts).
 */
export function registerSurfaceRuntime(value: SurfaceRuntimeValue): () => void {
  const id = ++nextId;
  stack = [...stack, { id, value }];
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
 * Page-tree registration. Renders children unchanged; side-effect only.
 * `getScope` is held in a ref so identity churn does not thrash the registry.
 */
export function SurfaceRuntimeProvider({
  children,
  surfaceName,
  surfaceLabel,
  getScope,
  isEditable,
}: SurfaceRuntimeValue & { children: ReactNode }) {
  const getScopeRef = useRef(getScope);
  getScopeRef.current = getScope;

  useEffect(() => {
    return registerSurfaceRuntime({
      surfaceName,
      surfaceLabel,
      isEditable,
      getScope: () => getScopeRef.current(),
    });
  }, [surfaceName, surfaceLabel, isEditable]);

  return <>{children}</>;
}
