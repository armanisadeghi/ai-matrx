"use client";

// useSetContextValue — the note-quick-save pattern (`useQuickNoteSave`)
// applied to scope context item values instead of notes. Owns target
// selection (org/scope-type/scope/item) + append-vs-overwrite + save.
// Content transforms (strip-thinking, trim, edit override) live in the
// shared `useRefinableContent` primitive, same as notes.

import type { ContextField, ContextValue } from "@ai-matrx/records/scopes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  useRefinableContent,
  type RefinableContent,
} from "@/components/content-refine/useRefinableContent";
import { useToastManager } from "@/hooks/useToastManager";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { setContextValue } from "@/features/scopes/redux/thunks/setContextValue";
import { makeSelectScopeValues } from "@/features/scopes/redux/selectors/context-values";
import type { ScopeContextTarget } from "@/features/scopes/components/quick-assign/ScopeContextTargetPicker";
import { isTextCompatibleContextItem } from "@/features/scopes/components/quick-assign/ScopeContextTargetPicker";

export type UpdateMethod = "append" | "overwrite";

export interface UseSetContextValueArgs {
  initialContent: string;
}

export function useSetContextValue({
  initialContent: rawInitialContent,
}: UseSetContextValueArgs) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("scopes");

  const refine: RefinableContent = useRefinableContent({
    initialContent: rawInitialContent,
  });
  const { workingContent } = refine;

  const [target, setTarget] = useState<Partial<ScopeContextTarget>>({});
  const [pickedItem, setPickedItem] = useState<ContextField | null>(null);
  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("append");
  const [isSaving, setIsSaving] = useState(false);
  const [savedScopeId, setSavedScopeId] = useState<string | null>(null);

  const scopeId = target.scopeId || "";
  const contextItemId = target.contextItemId || "";

  const selectScopeValues = useMemo(() => makeSelectScopeValues(), []);
  const valuesForScope = useAppSelector((s) =>
    selectScopeValues(s, scopeId || null),
  );

  // Load the scope's current values once a scope is picked, so we know
  // whether the chosen item already has a value (append target / overwrite
  // baseline) without a per-item round trip. `ensureContextValues` no-ops
  // when the scope's values are already cached or in flight.
  useEffect(() => {
    if (scopeId) void dispatch(ensureContextValues(scopeId));
  }, [scopeId, dispatch]);

  // Keyed by context_item_id; a row exists only when the cell has a current
  // persisted value.
  const currentRow: ContextValue | undefined = contextItemId
    ? valuesForScope[contextItemId]
    : undefined;

  const currentText = typeof currentRow?.value === "string" ? currentRow.value : "";
  const hasExistingValue = currentText.length > 0;

  // Default to append whenever a value already exists; reset to append
  // (the non-destructive default) whenever the target changes.
  useEffect(() => {
    setUpdateMethod("append");
  }, [scopeId, contextItemId]);

  const setTargetAndItem = useCallback((next: ScopeContextTarget) => {
    setTarget(next);
    if (next.item) setPickedItem(next.item);
  }, []);

  const isTargetComplete =
    Boolean(target.orgId) &&
    Boolean(target.scopeTypeId) &&
    Boolean(scopeId) &&
    Boolean(contextItemId) &&
    (pickedItem ? isTextCompatibleContextItem(pickedItem) : true);

  const save = useCallback(async (): Promise<boolean> => {
    if (!workingContent.trim()) {
      toast.error("Content cannot be empty");
      return false;
    }
    if (!isTargetComplete) {
      toast.error("Pick an organization, scope, and context item first");
      return false;
    }

    const trimmedContent = workingContent.trim();
    const finalValue =
      hasExistingValue && updateMethod === "append"
        ? `${currentText}\n\n${trimmedContent}`.trim()
        : trimmedContent;

    setIsSaving(true);
    try {
      // The thunk wraps the sanctioned `set_context_value` RPC and never
      // throws — errors come back as a RecordsResult.
      const res = await dispatch(
        setContextValue({
          scope_id: scopeId,
          field_id: contextItemId,
          kind: pickedItem?.kind ?? "string",
          value: finalValue,
          source_type: "manual",
          change_summary: hasExistingValue
            ? updateMethod === "append"
              ? "Appended from a chat message"
              : "Overwritten from a chat message"
            : "Set from a chat message",
        }),
      );
      if (!res.ok) {
        console.error("useSetContextValue: save failed", res.error);
        toast.error("Failed to save context value");
        return false;
      }

      toast.success(
        hasExistingValue
          ? `Content ${updateMethod === "append" ? "appended to" : "overwrote"} ${pickedItem?.label ?? "the item"}!`
          : `Saved to ${pickedItem?.label ?? "the item"}!`,
      );
      setSavedScopeId(scopeId);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [
    dispatch,
    toast,
    workingContent,
    isTargetComplete,
    hasExistingValue,
    updateMethod,
    currentRow,
    scopeId,
    contextItemId,
    pickedItem,
  ]);

  const reset = useCallback(() => {
    refine.resetTransforms();
    setTarget({});
    setPickedItem(null);
    setUpdateMethod("append");
    setSavedScopeId(null);
    setIsSaving(false);
  }, [refine]);

  const isSaveDisabled =
    isSaving || !workingContent.trim() || !isTargetComplete;

  return {
    refine,
    ...refine,

    target,
    setTarget: setTargetAndItem,
    pickedItem,
    hasExistingValue,
    currentRow,
    updateMethod,
    setUpdateMethod,
    isTargetComplete,

    isSaving,
    isSaveDisabled,
    savedScopeId,
    save,
    reset,
  };
}
