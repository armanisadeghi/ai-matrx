/**
 * toolRendererCache — module-level cache for DB-driven tool renderers.
 *
 * Three coordinated stores keyed by toolName:
 *   - positive:  toolName -> compiled React component (ready to render)
 *   - negative:  Set of toolNames known to have NO DB renderer (fast fallback)
 *   - inflight:  toolName -> in-flight fetch+compile promise (dedup concurrent
 *                callers so the same tool is fetched/compiled exactly once)
 *
 * Session-scoped (lives in the tab). A page refresh clears it; refetch +
 * synchronous compile is fast, so there's no TTL machinery — a tool either has
 * a renderer for this session or it doesn't.
 */
import type React from "react";

import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";
import type { ToolRendererProps } from "../types";
import { fetchToolRendererRow } from "./fetchToolRendererRow";
import { compileToolRenderer } from "./compileToolRenderer";

type ToolComponent = React.ComponentType<ToolRendererProps>;

/** Compiled `header_subtitle_code`: `(entry, events) => string` (best-effort). */
export type ToolSubtitleFn = (entry: unknown, events?: unknown) => unknown;

/** Author-declared shell metadata from the `tool_ui` row (label, result noun, subtitle). */
export interface ToolRendererMeta {
  displayName: string | null;
  resultsLabel: string | null;
  /** Compiled subtitle fn for the collapsed line, or null if none / failed. */
  subtitle: ToolSubtitleFn | null;
  /** Collapse behavior: "stay-open" when the row marks the result as the point. */
  displayMode: "auto" | "stay-open" | "never-open" | null;
}

const positive = new Map<string, ToolComponent>();
const negative = new Set<string>();
const inflight = new Map<string, Promise<ToolComponent | null>>();
// Row metadata is cached independently of the compiled component: it's set the
// moment the row is fetched (BEFORE compile), so the collapsed label improves
// even if the renderer code fails to compile and we fall back to generic.
const metaStore = new Map<string, ToolRendererMeta>();

/** Returns the cached compiled component for a tool, or null if not cached. */
export function getCachedToolRenderer(toolName: string): ToolComponent | null {
  return positive.get(toolName) ?? null;
}

/**
 * Author-declared metadata for a tool's DB renderer (display_name, results_label),
 * or null if no row has been fetched yet. Synchronous — reads the cache only;
 * `useDbToolMeta` drives the fetch + re-render for live label resolution.
 */
export function getCachedToolMeta(toolName: string): ToolRendererMeta | null {
  return metaStore.get(toolName) ?? null;
}

/** Cache a freshly compiled component and clear any negative mark. */
export function setCachedToolRenderer(
  toolName: string,
  component: ToolComponent,
): void {
  positive.set(toolName, component);
  negative.delete(toolName);
}

/** True when we already know this tool has no DB renderer. */
export function isKnownNoToolRenderer(toolName: string): boolean {
  return negative.has(toolName);
}

/** Record that a tool has no DB renderer (or failed to compile). */
export function markNoToolRenderer(toolName: string): void {
  negative.add(toolName);
}

/**
 * Fetch + compile a tool's DB renderer exactly once across concurrent callers.
 *
 * Resolves to the compiled component on success, or `null` when the tool has no
 * row / no code / fails to compile. On a null resolution the tool is
 * negative-cached so future renders skip straight to the fallback. On success
 * the component is positive-cached. The in-flight promise is shared so two
 * simultaneous cards for the same tool don't double-fetch.
 */
export function loadToolRenderer(
  toolName: string,
): Promise<ToolComponent | null> {
  const cached = positive.get(toolName);
  if (cached) return Promise.resolve(cached);
  if (negative.has(toolName)) return Promise.resolve(null);

  const existing = inflight.get(toolName);
  if (existing) return existing;

  // Snapshot the tool's invalidation version at load start. If the row is
  // edited (invalidated) while this fetch is in flight, the fetched data may
  // be PRE-edit — writing it to the caches would resurrect the stale renderer
  // with nothing left to heal it (tool_ui compiles are not updated_at-keyed).
  // On a mid-flight version bump: discard this result and load fresh.
  const startVersion = getToolRendererVersion(toolName);
  const invalidatedMidFlight = () =>
    getToolRendererVersion(toolName) !== startVersion;

  // Assigned right after the async body is created; the finally below reads it
  // to release only OUR in-flight slot (invalidation may have already cleared
  // it and a newer load may own it by the time this settles).
  let self: Promise<ToolComponent | null> | null = null;

  const promise = (async (): Promise<ToolComponent | null> => {
    try {
      const row = await fetchToolRendererRow(toolName);
      // Everything below this await is synchronous, so one check covers all
      // cache writes on this path.
      if (invalidatedMidFlight()) return loadToolRenderer(toolName);
      if (!row) {
        markNoToolRenderer(toolName);
        return null;
      }

      // Cache the author's label metadata immediately — independent of whether
      // the renderer code compiles — so the collapsed line reads "Weather"
      // (not "Travel Get Weather") even if the body falls back to generic.
      // The optional subtitle is its own tiny compile: a `(entry, events) =>
      // string` fn that enriches the collapsed line; a bad subtitle never
      // breaks the row (the body + label stand on their own).
      let subtitle: ToolSubtitleFn | null = null;
      if (row.header_subtitle_code) {
        try {
          const { Component: subFn } = compileSlotComponent({
            code: row.header_subtitle_code,
            allowedImports: [],
          });
          if (typeof subFn === "function") {
            subtitle = subFn as unknown as ToolSubtitleFn;
          }
        } catch {
          // ignore — subtitle is optional, never fatal
        }
      }
      metaStore.set(toolName, {
        displayName: row.display_name,
        resultsLabel: row.results_label,
        subtitle,
        // A DB renderer marks "the result IS the point" via keep_expanded_on_stream
        // → the shell keeps it expanded when done (see getToolDisplayMode).
        displayMode: row.keep_expanded_on_stream ? "stay-open" : null,
      });

      const { Component, error } = compileToolRenderer(
        row.inline_code,
        row.allowed_imports,
      );

      if (!Component || error) {
        if (error) {
          console.error(
            `[toolRendererCache] compile failed for "${toolName}":`,
            error,
          );
        }
        markNoToolRenderer(toolName);
        return null;
      }

      setCachedToolRenderer(toolName, Component);
      return Component;
    } catch (err) {
      console.error(
        `[toolRendererCache] load failed for "${toolName}":`,
        err,
      );
      // Same mid-flight guard: don't negative-cache a tool off a fetch that
      // raced an invalidation — retry against the fresh row instead.
      if (invalidatedMidFlight()) return loadToolRenderer(toolName);
      markNoToolRenderer(toolName);
      return null;
    } finally {
      if (self !== null && inflight.get(toolName) === self) {
        inflight.delete(toolName);
      }
    }
  })();

  self = promise;
  inflight.set(toolName, promise);
  return promise;
}

/**
 * Fire-and-forget prefetch. Warms the cache when a tool name becomes known
 * (e.g. on shell mount) so the renderer is ready before the card expands.
 */
export function prefetchToolRenderer(toolName: string): void {
  if (!toolName) return;
  if (positive.has(toolName) || negative.has(toolName)) return;
  void loadToolRenderer(toolName);
}

// ─── Invalidation + repaint (D115) ───────────────────────────────────────────
//
// Mounted consumers (`DbToolRendererImpl`, `useDbToolMeta`) subscribe to a
// monotonic per-tool version via `useToolRendererVersion`. Invalidation drops
// the caches AND bumps the version, so an already-rendered card re-resolves —
// the in-session repaint after an agent edits a `tool_ui` row.

let globalBump = 0;
const perToolBump = new Map<string, number>();
const versionListeners = new Set<() => void>();

/** Monotonic version for a tool's renderer — bumps on every invalidation. */
export function getToolRendererVersion(toolName: string): number {
  return globalBump + (perToolBump.get(toolName) ?? 0);
}

/** Subscribe to version bumps (any tool). Returns the unsubscribe. */
export function subscribeToolRendererVersions(listener: () => void): () => void {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
}

function notifyVersionListeners(): void {
  for (const listener of versionListeners) listener();
}

/** Drop a tool from every cache (e.g. after an agent/admin edits its code)
 *  and bump its version so mounted cards re-resolve immediately. */
export function invalidateToolRenderer(toolName: string): void {
  positive.delete(toolName);
  negative.delete(toolName);
  inflight.delete(toolName);
  metaStore.delete(toolName);
  perToolBump.set(toolName, (perToolBump.get(toolName) ?? 0) + 1);
  notifyVersionListeners();
}

/**
 * Drop EVERY cached renderer + meta and bump every version. The fallback for
 * edits whose target tool can't be named (e.g. `toolcomp_update_code` returns
 * only a `component_id`). Cheap: warm re-fetches are per-tool, on view.
 */
export function invalidateAllToolRenderers(): void {
  positive.clear();
  negative.clear();
  inflight.clear();
  metaStore.clear();
  globalBump += 1;
  notifyVersionListeners();
}

// The D115 inversion: this module registers itself at chunk init (this chunk
// is loaded wherever a tool card can render), and the ubiquitous
// `toolStateEffects` fires by NAME — zero import edge into this cluster.
registerInvalidationCallback(INVALIDATION_KEYS.dbToolRenderers, (detail) => {
  const toolName =
    detail !== null &&
    typeof detail === "object" &&
    "toolName" in detail &&
    typeof (detail as { toolName?: unknown }).toolName === "string"
      ? (detail as { toolName: string }).toolName
      : null;
  if (toolName) invalidateToolRenderer(toolName);
  else invalidateAllToolRenderers();
});
