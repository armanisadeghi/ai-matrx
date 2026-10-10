"use client";

import { toastWriteFailure } from "@/lib/errors/toastWriteFailure";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";
import type { ContextField } from "@ai-matrx/records/scopes";
import { cellWrite } from "@/features/scopes/components/pages/scope-detail-values";

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
 * `value` may be a string (textarea/date/number-as-text), a reference cell's things
 * (`ContextReference[]`), or a structured MediaRef object emitted by a custom Smart-Input
 * component. It becomes one `ContextValueWrite` (`cellWrite`) — the cell, never columns.
 *
 * The hook manages its own baseline ref internally — callers MUST NOT receive
 * a setter back, because that setter would be a fresh closure on every render
 * and would re-trigger any consumer effect that depends on it (which would
 * silently wipe a user's mid-edit value).
 */
export function useScopeAutoSave(
  scopeId: string,
  field: Pick<ContextField, "id" | "kind">,
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
    try {
      await dispatch(setScopeContextValue(cellWrite(scopeId, field, raw))).unwrap();
      lastCommittedRef.current = canonical(raw);
      setLastSavedAt(Date.now());
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      toastWriteFailure(err, { action: "save this value", remedy: "Your text is still in the box." });
    }
  }

  return { commit, status, lastSavedAt };
}
