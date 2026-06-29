"use client";

/**
 * useAgentAutoSave
 *
 * Debounced localStorage backup for a specific agent.
 * Caller must provide agentId — there is no global "active agent" fallback.
 *
 * On mount: recovers any unsaved changes from localStorage and merges into Redux.
 * While dirty: writes a snapshot every DEBOUNCE_MS milliseconds.
 * On clean (after save): removes the localStorage entry.
 */

import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { mergePartialAgent } from "@/features/agents/redux/agent-definition/slice";

const STORAGE_PREFIX = "agent-autosave:";
const DEBOUNCE_MS = 2_000;

export function useAgentAutoSave(agentId: string) {
  const dispatch = useAppDispatch();
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recovery on mount
  useEffect(() => {
    const storageKey = `${STORAGE_PREFIX}${agentId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (saved?._dirty) {
          dispatch(
            mergePartialAgent({
              id: agentId,
              ...saved,
              _skipDirty: true,
            } as unknown as Parameters<typeof mergePartialAgent>[0]),
          );
        }
      }
    } catch {
      // Ignore parse errors / SSR
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Debounced backup when dirty
  useEffect(() => {
    if (!record?._dirty) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const storageKey = `${STORAGE_PREFIX}${agentId}`;
      try {
        const snapshot: Record<string, unknown> = { _dirty: true };
        if (record._dirtyFields) {
          for (const field of Object.keys(record._dirtyFields)) {
            snapshot[field] = (record as unknown as Record<string, unknown>)[
              field
            ];
          }
        }
        localStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch {
        // Quota exceeded or private mode — silently ignore
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [agentId, record]);

  // Clear on successful save (clean state)
  useEffect(() => {
    if (record?._dirty !== false) return;
    const storageKey = `${STORAGE_PREFIX}${agentId}`;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [agentId, record?._dirty]);
}
