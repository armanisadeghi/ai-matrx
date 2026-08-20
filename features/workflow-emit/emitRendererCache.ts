/**
 * emitRendererCache — module-level cache for DB-driven workflow emit renderers.
 *
 * Cloned from `tool-call-visualization/db-renderer/toolRendererCache.ts`. Three
 * coordinated stores keyed by `component_ref` (a `tool_ui.tool_name`):
 *   - positive:  ref -> compiled React component (ready to render)
 *   - negative:  Set of refs known to have NO custom renderer (fast fallback)
 *   - inflight:  ref -> in-flight fetch+compile promise (dedup concurrent
 *                callers so the same ref is fetched/compiled exactly once)
 *
 * Session-scoped (lives in the tab). A page refresh clears it; refetch +
 * synchronous compile is fast, so there's no TTL machinery — a ref either has
 * a renderer for this session or it doesn't. There is no separate metadata
 * store (unlike the tool cache): an emit renderer carries no collapsed-row
 * shell label, so the body component is the only thing cached.
 */
import type React from "react";

import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";

import { compileEmitRenderer } from "./compileEmitRenderer";
import { fetchEmitRendererRow } from "./fetchEmitRendererRow";
import type { EmitRendererProps } from "./types";

type EmitComponent = React.ComponentType<EmitRendererProps>;

const positive = new Map<string, EmitComponent>();
const negative = new Set<string>();
const inflight = new Map<string, Promise<EmitComponent | null>>();

/** Returns the cached compiled component for a ref, or null if not cached. */
export function getCachedEmitRenderer(componentRef: string): EmitComponent | null {
  return positive.get(componentRef) ?? null;
}

/** Cache a freshly compiled component and clear any negative mark. */
export function setCachedEmitRenderer(
  componentRef: string,
  component: EmitComponent,
): void {
  positive.set(componentRef, component);
  negative.delete(componentRef);
}

/** True when we already know this ref has no custom renderer. */
export function isKnownNoEmitRenderer(componentRef: string): boolean {
  return negative.has(componentRef);
}

/** Record that a ref has no custom renderer (or failed to compile). */
export function markNoEmitRenderer(componentRef: string): void {
  negative.add(componentRef);
}

/**
 * Fetch + compile a node's emit renderer exactly once across concurrent
 * callers.
 *
 * Resolves to the compiled component on success, or `null` when the ref has no
 * row / no code / fails to compile. On a null resolution the ref is
 * negative-cached so future renders skip straight to the fallback. On success
 * the component is positive-cached. The in-flight promise is shared so two
 * simultaneous emissions for the same ref don't double-fetch.
 */
export function loadEmitRenderer(
  componentRef: string,
): Promise<EmitComponent | null> {
  const cached = positive.get(componentRef);
  if (cached) return Promise.resolve(cached);
  if (negative.has(componentRef)) return Promise.resolve(null);

  const existing = inflight.get(componentRef);
  if (existing) return existing;

  const promise = (async (): Promise<EmitComponent | null> => {
    try {
      const row = await fetchEmitRendererRow(componentRef);
      if (!row) {
        markNoEmitRenderer(componentRef);
        return null;
      }

      const { Component, error } = compileEmitRenderer(
        row.inline_code,
        row.allowed_imports,
      );

      if (!Component || error) {
        if (error) {
          console.error(
            `[emitRendererCache] compile failed for "${componentRef}":`,
            error,
          );
        }
        markNoEmitRenderer(componentRef);
        return null;
      }

      setCachedEmitRenderer(componentRef, Component);
      return Component;
    } catch (err) {
      console.error(
        `[emitRendererCache] load failed for "${componentRef}":`,
        err,
      );
      markNoEmitRenderer(componentRef);
      return null;
    } finally {
      inflight.delete(componentRef);
    }
  })();

  inflight.set(componentRef, promise);
  return promise;
}

/**
 * Fire-and-forget prefetch. Warms the cache when a `component_ref` becomes
 * known (e.g. the moment a run's graph references one) so the renderer is
 * ready before the node emits.
 */
export function prefetchEmitRenderer(componentRef: string): void {
  if (!componentRef) return;
  if (positive.has(componentRef) || negative.has(componentRef)) return;
  void loadEmitRenderer(componentRef);
}

// ─── Invalidation + repaint (D115 — the sibling gap, closed) ─────────────────
//
// An emit renderer is a `tool_ui` row exactly like a tool renderer; the only
// difference is its `surface_name`. So when an agent edits a `tool_ui` row,
// `toolStateEffects` fires the SAME name it always fired
// (`INVALIDATION_KEYS.dbToolRenderers`, detail `{ toolName? }`) and BOTH
// caches drop it — no new key, no new producer, no import edge into this
// cluster (the D115 inversion: this module registers itself at chunk init,
// and this chunk is loaded wherever an emission can render).
//
// A `tool_name` is unique per row, so a name that belongs to a tool surface
// simply isn't in this cache and the drop is a no-op; the reverse holds for
// the tool cache. The `component_id`-only edits (`toolcomp_update_code`)
// invalidate ALL here too, for the same reason they do there.

let globalBump = 0;
const perRefBump = new Map<string, number>();
const versionListeners = new Set<() => void>();

/** Monotonic version for a ref's renderer — bumps on every invalidation. */
export function getEmitRendererVersion(componentRef: string): number {
  return globalBump + (perRefBump.get(componentRef) ?? 0);
}

/** Subscribe to version bumps (any ref). Returns the unsubscribe. */
export function subscribeEmitRendererVersions(listener: () => void): () => void {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
}

function notifyVersionListeners(): void {
  for (const listener of versionListeners) listener();
}

/** Drop a ref from every cache (e.g. after an agent/admin edits its code) and
 *  bump its version so mounted emissions re-resolve immediately. */
export function invalidateEmitRenderer(componentRef: string): void {
  positive.delete(componentRef);
  negative.delete(componentRef);
  inflight.delete(componentRef);
  perRefBump.set(componentRef, (perRefBump.get(componentRef) ?? 0) + 1);
  notifyVersionListeners();
}

/**
 * Drop EVERY cached emit renderer and bump every version. The fallback for
 * edits whose target row can't be named (a `component_id`-only result).
 */
export function invalidateAllEmitRenderers(): void {
  positive.clear();
  negative.clear();
  inflight.clear();
  globalBump += 1;
  notifyVersionListeners();
}

registerInvalidationCallback(INVALIDATION_KEYS.dbToolRenderers, (detail) => {
  const componentRef =
    detail !== null &&
    typeof detail === "object" &&
    "toolName" in detail &&
    typeof (detail as { toolName?: unknown }).toolName === "string"
      ? (detail as { toolName: string }).toolName
      : null;
  if (componentRef) invalidateEmitRenderer(componentRef);
  else invalidateAllEmitRenderers();
});
