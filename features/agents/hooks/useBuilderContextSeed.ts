"use client";

/**
 * useBuilderContextSeed
 *
 * Persists agent-builder context policy values in localStorage, keyed by agentId,
 * and seeds them back into every new instance's Redux state when the builder
 * mounts or the conversation id changes (including after auto-clear split).
 *
 * Why localStorage and not user preferences?
 *   Context is engineering/test-time data — often large (code, skills,
 *   documents) and iteration-heavy. LocalStorage is instant and per-browser,
 *   which is what engineers want while tweaking prompts. If we ever need to
 *   share test values across devices, we can add a preference-backed layer
 *   on top without changing the read/write API here.
 *
 * Storage shape:
 *   key   = `agent-builder-context:${agentId}`
 *   value = { entries: Record<key, StoredEntry> }
 *
 *   StoredEntry = { value, type, label, slotMatched }
 *
 * The single source of truth during a session is Redux. LocalStorage is
 * read on mount (+ on agent/conversation change), and written on every
 * `writeBuilderContext*` call from the tab. That keeps the tab simple —
 * it just dispatches and calls the write helper.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  setContextEntries,
  clearInstanceContext,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";

// =============================================================================
// Storage format
// =============================================================================

export interface BuilderContextStoredEntry {
  value: unknown;
  type: ContextObjectType;
  label: string;
  slotMatched: boolean;
}

interface BuilderContextStored {
  entries: Record<string, BuilderContextStoredEntry>;
}

const VERSION_KEY = "v1";

function storageKey(agentId: string): string {
  return `agent-builder-context:${VERSION_KEY}:${agentId}`;
}

// =============================================================================
// Read / write helpers — usable from any component
// =============================================================================

export function readBuilderContext(
  agentId: string | null | undefined,
): Record<string, BuilderContextStoredEntry> {
  if (!agentId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(agentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BuilderContextStored;
    return parsed?.entries ?? {};
  } catch {
    return {};
  }
}

function writeAll(
  agentId: string,
  entries: Record<string, BuilderContextStoredEntry>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(agentId),
      JSON.stringify({ entries } satisfies BuilderContextStored),
    );
  } catch {
    // Quota exceeded or disabled — swallow. The Redux copy is still correct.
  }
}

/** Upsert one entry in localStorage. Safe no-op outside the browser. */
export function writeBuilderContextEntry(
  agentId: string,
  key: string,
  entry: BuilderContextStoredEntry,
): void {
  const current = readBuilderContext(agentId);
  current[key] = entry;
  writeAll(agentId, current);
}

/** Remove one entry from localStorage. */
export function deleteBuilderContextEntry(
  agentId: string,
  key: string,
): void {
  const current = readBuilderContext(agentId);
  if (!(key in current)) return;
  delete current[key];
  writeAll(agentId, current);
}

/** Wipe all stored context for an agent. */
export function clearBuilderContext(agentId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(agentId));
  } catch {
    /* ignore */
  }
}

// =============================================================================
// Hook — seeds the instance from localStorage
// =============================================================================

/**
 * Call once from the builder root (AgentBuilderRightPanel). On every
 * conversation id change (initial create, reset, auto-clear split), this
 * pushes stored entries into instanceContext so they're included in the
 * next submission even if the user never opens the Context tab.
 *
 * Safe to call when either argument is null — it no-ops.
 */
export function useBuilderContextSeed(
  conversationId: string | null | undefined,
  agentId: string | null | undefined,
): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!conversationId || !agentId) return;

    const stored = readBuilderContext(agentId);
    const keys = Object.keys(stored);
    if (keys.length === 0) return;

    dispatch(
      setContextEntries({
        conversationId,
        entries: keys.map((key) => ({
          key,
          value: stored[key].value,
          type: stored[key].type,
          label: stored[key].label,
          slotMatched: stored[key].slotMatched,
        })),
      }),
    );
  }, [conversationId, agentId, dispatch]);
}

/** Optional helper exposed for a future "Reset all" button. */
export function useClearBuilderContext() {
  const dispatch = useAppDispatch();
  return (conversationId: string, agentId: string) => {
    clearBuilderContext(agentId);
    dispatch(clearInstanceContext(conversationId));
  };
}
