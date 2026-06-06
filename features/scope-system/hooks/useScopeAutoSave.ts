"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { toast } from "sonner";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Auto-save a single field on a scope. `commit(value)` fires on blur and is
 * a no-op when the value hasn't changed since the last commit.
 *
 * The hook manages its own baseline ref internally — callers MUST NOT receive
 * a setter back, because that setter would be a fresh closure on every render
 * and would re-trigger any consumer effect that depends on it (which would
 * silently wipe a user's mid-edit value).
 */
export function useScopeAutoSave(
  scopeId: string,
  contextItemId: string,
  valueType: ContextValueType,
  initialValue: string,
) {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<Status>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastCommittedRef = useRef<string>(initialValue);

  // Sync the baseline when the underlying value actually changes (e.g. a
  // refetch lands a different value). Effect only depends on the primitive
  // initialValue, so it does not re-run on unrelated renders.
  useEffect(() => {
    lastCommittedRef.current = initialValue;
  }, [initialValue]);

  async function commit(raw: string) {
    const next = raw.trim();
    if (next === lastCommittedRef.current.trim()) return;
    setStatus("saving");
    const payload: Parameters<typeof setScopeContextValue>[0] = {
      scope_id: scopeId,
      context_item_id: contextItemId,
    };
    if (valueType === "number") {
      const n = Number(next);
      if (next === "" || Number.isNaN(n)) {
        payload.value_text = next || null;
      } else {
        payload.value_number = n;
      }
    } else if (valueType === "boolean") {
      const lower = next.toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") {
        payload.value_boolean = true;
      } else if (lower === "false" || lower === "no" || lower === "0") {
        payload.value_boolean = false;
      } else if (next === "") {
        payload.value_text = null;
      } else {
        payload.value_text = next;
      }
    } else if (valueType === "date") {
      payload.value_date = next || null;
    } else if (valueType === "document") {
      payload.value_document_url = next || null;
    } else if (valueType === "object" || valueType === "array") {
      try {
        payload.value_json = next ? JSON.parse(next) : null;
      } catch {
        payload.value_text = next || null;
      }
    } else {
      payload.value_text = next || null;
    }

    try {
      await dispatch(setScopeContextValue(payload)).unwrap();
      lastCommittedRef.current = next;
      setLastSavedAt(Date.now());
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return { commit, status, lastSavedAt };
}
