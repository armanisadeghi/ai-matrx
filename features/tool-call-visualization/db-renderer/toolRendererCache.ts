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

  const promise = (async (): Promise<ToolComponent | null> => {
    try {
      const row = await fetchToolRendererRow(toolName);
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
      markNoToolRenderer(toolName);
      return null;
    } finally {
      inflight.delete(toolName);
    }
  })();

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

/** Drop a tool from every cache (e.g. after an admin edits its code). */
export function invalidateToolRenderer(toolName: string): void {
  positive.delete(toolName);
  negative.delete(toolName);
  inflight.delete(toolName);
  metaStore.delete(toolName);
}
