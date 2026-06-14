"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { toast } from "sonner";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

type Status = "idle" | "saving" | "saved" | "error";

/** Stable string key for change-detection across both primitive and structured values. */
function canonical(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v).trim();
}

/**
 * Auto-save a single field on a scope. `commit(value)` fires on blur (primitive
 * inputs) or on change (custom-component inputs) and is a no-op when the value
 * hasn't changed since the last commit.
 *
 * `value` may be a string (textarea/date/number-as-text) OR a structured value
 * (MediaRef, PicklistRefEnvelope, array) emitted by a custom Smart-Input
 * component — structured values are stored verbatim in `value_json`.
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
  initialValue: unknown,
) {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<Status>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastCommittedRef = useRef<string>(canonical(initialValue));

  // Sync the baseline when the underlying value actually changes (e.g. a
  // refetch lands a different value). Effect depends only on the canonical
  // string, so it does not re-run on unrelated renders.
  const initialKey = canonical(initialValue);
  useEffect(() => {
    lastCommittedRef.current = initialKey;
  }, [initialKey]);

  async function commit(raw: unknown) {
    if (canonical(raw) === lastCommittedRef.current) return;
    setStatus("saving");
    const payload: Parameters<typeof setScopeContextValue>[0] = {
      scope_id: scopeId,
      context_item_id: contextItemId,
    };

    if (raw != null && typeof raw === "object") {
      // Structured value from a custom Smart-Input component (MediaRef,
      // PicklistRefEnvelope, multi-select array). Stored verbatim in value_json.
      payload.value_json = raw;
    } else {
      const next = String(raw ?? "").trim();
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
    }

    try {
      await dispatch(setScopeContextValue(payload)).unwrap();
      lastCommittedRef.current = canonical(raw);
      setLastSavedAt(Date.now());
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return { commit, status, lastSavedAt };
}
