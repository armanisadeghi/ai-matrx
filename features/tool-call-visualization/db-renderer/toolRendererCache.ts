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

import type { ToolRendererProps } from "../types";
import { fetchToolRendererRow } from "./fetchToolRendererRow";
import { compileToolRenderer } from "./compileToolRenderer";

type ToolComponent = React.ComponentType<ToolRendererProps>;

const positive = new Map<string, ToolComponent>();
const negative = new Set<string>();
const inflight = new Map<string, Promise<ToolComponent | null>>();

/** Returns the cached compiled component for a tool, or null if not cached. */
export function getCachedToolRenderer(toolName: string): ToolComponent | null {
  return positive.get(toolName) ?? null;
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
}
