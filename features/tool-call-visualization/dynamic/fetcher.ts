/**
 * Client-side fetcher for dynamic tool UI components.
 *
 * Fetches component code from the database, compiles it, caches it,
 * and handles the full lifecycle including error reporting.
 */

import { supabase } from "@/utils/supabase/client";
import { compileToolUiComponent } from "./compiler";
import {
  getCachedRenderer,
  setCachedRenderer,
  isKnownNoDynamic,
  setNoDynamic,
  getInflight,
  setInflight,
  invalidateCachedRenderer,
} from "./cache";
import { reportCompilationError, reportFetchError } from "./incident-reporter";
import type { ToolUiComponentRow, CompiledToolRenderer } from "./types";

// ---------------------------------------------------------------------------
// Fetch from Supabase
// ---------------------------------------------------------------------------

async function fetchComponentRow(
  toolName: string,
): Promise<ToolUiComponentRow | null> {
  const { data, error } = await supabase
    .from("tool_ui")
    .select("*")
    .eq("tool_name", toolName)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ToolUiComponentRow;
}

// ---------------------------------------------------------------------------
// Fetch + compile + cache
// ---------------------------------------------------------------------------

/**
 * Fetch, compile, and cache a dynamic tool renderer.
 *
 * Returns the compiled renderer or null if:
 * - No dynamic component exists for this tool
 * - Compilation fails (falls back to GenericRenderer)
 *
 * This function deduplicates in-flight requests — multiple simultaneous
 * calls for the same tool will share a single fetch/compile cycle.
 */
export async function fetchAndCompileRenderer(
  toolName: string,
): Promise<CompiledToolRenderer | null> {
  // 1. Check cache first
  const cached = getCachedRenderer(toolName);
  if (cached) return cached;

  // 2. Check negative cache (known to have no dynamic component)
  if (isKnownNoDynamic(toolName)) return null;

  // 3. Deduplicate in-flight requests
  const existing = getInflight(toolName);
  if (existing) return existing;

  // 4. Create the fetch promise
  const fetchPromise = (async (): Promise<CompiledToolRenderer | null> => {
    try {
      const row = await fetchComponentRow(toolName);

      if (!row) {
        setNoDynamic(toolName);
        return null;
      }

      // Compile (async — lazy-loads @babel/standalone on first use to
      // keep the ~5.7 MB module out of the SSR bundle).
      const compiled = await compileToolUiComponent(row);
      setCachedRenderer(compiled);
      return compiled;
    } catch (err) {
      // Determine if it's a fetch error or compilation error
      const isNetworkError =
        err instanceof Error &&
        (err.message.includes("fetch") ||
          err.message.includes("network") ||
          err.message.includes("PGRST"));

      if (isNetworkError) {
        reportFetchError(toolName, err);
      } else {
        reportCompilationError(toolName, "inline", err);
      }

      console.error(
        `[DynamicToolRenderer] Failed to fetch/compile ${toolName}:`,
        err,
      );
      return null;
    }
  })();

  setInflight(toolName, fetchPromise);
  return fetchPromise;
}

/**
 * Prefetch a dynamic renderer for a tool.
 * Called proactively when a tool_update event is received with mcp_input.
 * Non-blocking — does not throw.
 */
export function prefetchRenderer(toolName: string): void {
  // Skip if already cached or known negative
  if (getCachedRenderer(toolName)) return;
  if (isKnownNoDynamic(toolName)) return;
  if (getInflight(toolName)) return;

  // Fire and forget
  fetchAndCompileRenderer(toolName).catch(() => {
    // Already handled inside fetchAndCompileRenderer
  });
}

/**
 * Force re-fetch and recompile a tool's renderer (e.g. after admin edit).
 */
export async function refreshRenderer(
  toolName: string,
): Promise<CompiledToolRenderer | null> {
  invalidateCachedRenderer(toolName);
  return fetchAndCompileRenderer(toolName);
}
