"use client";

/**
 * useAgentAutoSave
 *
 * Debounced localStorage backup for a specific agent.
 * Caller must provide agentId — there is no global "active agent" fallback.
 *
 * On mount: reads any unsaved-changes backup from localStorage. Once the saved
 *   agent has fully loaded, every backed-up field that differs from what is
 *   saved is re-applied as an UNSAVED edit (dirty, undoable, announced) — never
 *   merged in as if it were the saved value. Merging it clean showed values the
 *   database never held beside "No unsaved changes", disabled Save, and then
 *   deleted the backup; a backup applied before the fetch was overwritten.
 * While dirty: writes a snapshot every DEBOUNCE_MS milliseconds.
 * On clean (after save or discard — the restore toast offers Discard): removes
 *   the localStorage entry.
 */

import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@ai-matrx/chat/store/hooks";
import isEqual from "lodash/isEqual";
import {
  selectAgentById,
  selectAgentFetchStatus,
  selectAgentIsReadOnly,
  selectAgentAccessResolved,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  resetAllAgentFields, setAgentField,
} from "@/features/agents/redux/agent-builder.slice";
import { readField } from "@ai-matrx/agents/field-flags";
import type { AgentDefinition } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { toast } from "@ai-matrx/chat/host/notify";

const STORAGE_PREFIX = "agent-autosave:";
const DEBOUNCE_MS = 2_000;

export function useAgentAutoSave(agentId: string) {
  const dispatch = useAppDispatch();
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const accessResolved = useAppSelector((state) =>
    selectAgentAccessResolved(state, agentId),
  );
  const isReadOnly = useAppSelector((state) =>
    selectAgentIsReadOnly(state, agentId),
  );
  const fetchStatus = useAppSelector((state) =>
    selectAgentFetchStatus(state, agentId),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Backed-up fields waiting for the saved record to load (null = none).
  const pendingRecoveryRef = useRef<Record<string, unknown> | null>(null);
  // Set once recovered edits were re-applied, so the clean-state effect of the
  // same commit (which still sees the pre-dispatch record) keeps the backup.
  const restoredRef = useRef(false);
  const skipPersistence = accessResolved && isReadOnly;

  // Read the backup on mount — before the clean-state effect below can clear it.
  useEffect(() => {
    pendingRecoveryRef.current = null;
    restoredRef.current = false;
    const storageKey = `${STORAGE_PREFIX}${agentId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (saved?._dirty) {
          // `_dirty` is this hook's own bookkeeping key, not an agent field.
          const { _dirty: _unused, ...fields } = saved;
          pendingRecoveryRef.current = fields;
        }
      }
    } catch {
      // Ignore parse errors / SSR
    }
  }, [agentId]);

  // Re-apply the backup as unsaved edits once the saved agent has loaded.
  useEffect(() => {
    const fields = pendingRecoveryRef.current;
    if (!fields || !record || fetchStatus !== "full") return;
    pendingRecoveryRef.current = null;
    const restored: string[] = [];
    for (const [field, value] of Object.entries(fields)) {
      const key = field as keyof AgentDefinition;
      if (isEqual(readField(record, key), value)) continue;
      dispatch(
        setAgentField({
          id: agentId,
          field: key,
          value: value as AgentDefinition[keyof AgentDefinition],
        }),
      );
      restored.push(field);
    }
    if (restored.length > 0) {
      restoredRef.current = true;
      toast.info(
        `Restored unsaved changes to ${record.name || "this agent"} from this browser (${restored.join(", ")}). Save to keep them, or discard them.`,
        {
          id: `agent-autosave-restored:${agentId}`,
          duration: 20_000,
          action: {
            label: "Discard",
            // Back to the saved agent; the clean-state effect drops the backup.
            onClick: () => dispatch(resetAllAgentFields({ id: agentId })),
          },
        },
      );
    }
  }, [agentId, record, fetchStatus, dispatch]);

  // Debounced backup when dirty (skip for view-only shared agents)
  useEffect(() => {
    // The re-applied edits have now reached the record (it is dirty), so the
    // one-commit guard for the clean-state effect is no longer needed.
    if (record?._dirty) restoredRef.current = false;
    if (skipPersistence || !record?._dirty) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const storageKey = `${STORAGE_PREFIX}${agentId}`;
      try {
        const snapshot: Record<string, unknown> = { _dirty: true };
        if (record._dirtyFields) {
          const fields = new Set(
            Object.keys(record._dirtyFields) as (keyof AgentDefinition)[],
          );
          // The class pin (settings.offering_id) belongs to exactly one model:
          // back up the model and the settings together, so a restore never
          // pairs the saved model with another model's class (refused by the
          // database with P0002) or the reverse.
          if (fields.has("modelId") || fields.has("settings")) {
            fields.add("modelId");
            fields.add("settings");
          }
          for (const field of fields) {
            snapshot[field] = readField(record, field);
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
  }, [agentId, record, skipPersistence]);

  // Clear on successful save (clean state) — never while a backup is still
  // waiting to be re-applied, or in the commit that just re-applied it.
  useEffect(() => {
    if (record?._dirty !== false) return;
    if (pendingRecoveryRef.current || restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    const storageKey = `${STORAGE_PREFIX}${agentId}`;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [agentId, record?._dirty]);
}
