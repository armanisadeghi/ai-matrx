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

/**
 * One write handler per declared `SurfaceWriteTarget.name`. A handler applies
 * the value into the page (draft state, canonical service write, or UI state
 * per the target's declared `mode`) and may throw — the writeback runtime
 * (`surface-writeback.ts`) wraps every call in a safe envelope.
 */
export type SurfaceWriteHandlers = Record<
  string,
  (value: unknown) => void | Promise<void>
>;

export interface SurfaceRuntimeValue {
  /**
   * Canonical `ui_surface.name` this page is emitting. Display labels are
   * NEVER passed here — THE NAMING LAW: chrome derives the one canonical
   * label via `getSurfaceDisplayLabel(surfaceName)` (manifest-owned).
   */
  surfaceName: string;
  /**
   * Build the live ApplicationScope / SurfaceScopePayload at Run time.
   * Called only when the user hits ▶ — never on mount.
   */
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>;
  /** Pass-through for editable surfaces (default contracts). */
  isEditable?: boolean;
  /**
   * Live write handlers for this surface's declared `writeTargets` (the
   * read/write manifest v1). Called only through `applySurfaceWrite` in
   * `surface-writeback.ts` — never invoked directly by chrome or components.
   */
  getWriteHandlers?: () => SurfaceWriteHandlers;
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
 * All registered runtimes, DEEPEST first (ties broken by registration
 * recency). The writeback runtime walks this to find the innermost surface
 * that handles a given write target — e.g. the open node panel wins over the
 * workspace behind it, but a workspace-level target still resolves while a
 * panel is open.
 */
export function getSurfaceRuntimeStack(): readonly SurfaceRuntimeValue[] {
  return [...stack]
    .sort((a, b) => b.depth - a.depth || b.id - a.id)
    .map((entry) => entry.value);
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

// ---------------------------------------------------------------------------
// Composable write handlers — a DEEP CHILD can service its surface's targets.
// ---------------------------------------------------------------------------

/**
 * The provider's `getWriteHandlers` prop assumes ONE component owns both the
 * surface and every write target on it. Real surfaces do not work that way: a
 * window owns the surface and publishes its scope, while a tab several levels
 * down owns the state a target writes. Threading that state up just to satisfy
 * the prop is the kind of plumbing that gets skipped, and a declared target
 * with no handler fails loudly at apply time.
 *
 * So handlers are additionally registered by NAME against a surface, from
 * anywhere in the tree. `applySurfaceWrite` consults both sources; a
 * registered handler wins over the provider's (the deeper, more specific
 * owner registered it).
 */
const extraHandlers = new Map<
  string,
  Array<{ id: number; handlers: SurfaceWriteHandlers }>
>();

/** Handlers registered by descendants for `surfaceName`, most recent first. */
export function getRegisteredWriteHandlers(
  surfaceName: string,
): SurfaceWriteHandlers {
  const entries = extraHandlers.get(surfaceName);
  if (!entries || entries.length === 0) return {};
  const merged: SurfaceWriteHandlers = {};
  // Later registrations win: iterate oldest→newest and overwrite.
  for (const entry of entries) Object.assign(merged, entry.handlers);
  return merged;
}

/**
 * Register write handlers for the surface this component sits inside.
 *
 * ```ts
 * useSurfaceWriteHandlers("matrx-user/keyword-intelligence", {
 *   keyword_selection: (value) => toggleKeyword(value),
 * });
 * ```
 *
 * The handlers object is held in a ref, so an inline literal is fine — it does
 * not thrash the registry. Handlers may throw; the writeback runtime wraps
 * every call in a safe, loud envelope.
 */
export function useSurfaceWriteHandlers(
  surfaceName: string | null,
  handlers: SurfaceWriteHandlers,
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!surfaceName) return;
    const id = ++nextId;
    // Indirect through the ref so the registered functions always call the
    // LATEST closure (fresh page state), never the one from mount.
    const proxied: SurfaceWriteHandlers = {};
    for (const key of Object.keys(handlersRef.current)) {
      proxied[key] = (value: unknown) => handlersRef.current[key]?.(value);
    }
    const list = extraHandlers.get(surfaceName) ?? [];
    extraHandlers.set(surfaceName, [...list, { id, handlers: proxied }]);
    emit();
    return () => {
      const current = extraHandlers.get(surfaceName) ?? [];
      const next = current.filter((entry) => entry.id !== id);
      if (next.length === 0) extraHandlers.delete(surfaceName);
      else extraHandlers.set(surfaceName, next);
      emit();
    };
    // The KEY SET is the registration identity — a stable set of target names
    // registers once for the component's life, while values stay fresh via the
    // ref above.
  }, [surfaceName, Object.keys(handlers).sort().join("|")]);
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
  getScope,
  isEditable,
  getWriteHandlers,
}: SurfaceRuntimeValue & { children: ReactNode }) {
  const depth = useContext(SurfaceRuntimeDepthContext) + 1;
  const getScopeRef = useRef(getScope);
  const getWriteHandlersRef = useRef(getWriteHandlers);
  useEffect(() => {
    getScopeRef.current = getScope;
    getWriteHandlersRef.current = getWriteHandlers;
  });

  useEffect(() => {
    return registerSurfaceRuntime(
      {
        surfaceName,
        isEditable,
        getScope: () => getScopeRef.current(),
        getWriteHandlers: () => getWriteHandlersRef.current?.() ?? {},
      },
      depth,
    );
  }, [surfaceName, isEditable, depth]);

  return (
    <SurfaceRuntimeDepthContext.Provider value={depth}>
      {children}
    </SurfaceRuntimeDepthContext.Provider>
  );
}
