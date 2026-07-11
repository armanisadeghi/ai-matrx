"use client";

// useSetContextValue — the note-quick-save pattern (`useQuickNoteSave`)
// applied to scope context item values instead of notes. Owns target
// selection (org/scope-type/scope/item) + append-vs-overwrite + save.
// Content transforms (strip-thinking, trim, edit override) live in the
// shared `useRefinableContent` primitive, same as notes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  useRefinableContent,
  type RefinableContent,
} from "@/components/content-refine/useRefinableContent";
import { useToastManager } from "@/hooks/useToastManager";
import {
  getScopeContext,
  setScopeContextValue,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import type { ScopeContextTarget } from "@/features/scopes/components/quick-assign/ScopeContextTargetPicker";
import { isTextCompatibleContextItem } from "@/features/scopes/components/quick-assign/ScopeContextTargetPicker";
import type { ContextItem } from "@/features/scope-system/redux/contextItemsSlice";

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
  const [pickedItem, setPickedItem] = useState<ContextItem | null>(null);
  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("append");
  const [isSaving, setIsSaving] = useState(false);
  const [savedScopeId, setSavedScopeId] = useState<string | null>(null);

  const scopeId = target.scopeId || "";
  const contextItemId = target.contextItemId || "";

  const rowsForScope = useAppSelector((s) =>
    scopeId ? selectValuesByScope(s, scopeId) : undefined,
  );

  // Load the scope's current values once a scope is picked, so we know
  // whether the chosen item already has a value (append target / overwrite
  // baseline) without a per-item round trip.
  useEffect(() => {
    if (scopeId && !rowsForScope) {
      dispatch(getScopeContext({ scope_id: scopeId }));
    }
  }, [scopeId, rowsForScope, dispatch]);

  const currentRow: ScopeContextRow | undefined = useMemo(
    () => rowsForScope?.find((r) => r.item_id === contextItemId),
    [rowsForScope, contextItemId],
  );

  const hasExistingValue = Boolean(
    currentRow?.has_value && currentRow.value_text,
  );

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
        ? `${currentRow?.value_text ?? ""}\n\n${trimmedContent}`.trim()
        : trimmedContent;

    setIsSaving(true);
    try {
      await dispatch(
        setScopeContextValue({
          scope_id: scopeId,
          context_item_id: contextItemId,
          value_text: finalValue,
          change_summary: hasExistingValue
            ? updateMethod === "append"
              ? "Appended from a chat message"
              : "Overwritten from a chat message"
            : "Set from a chat message",
        }),
      ).unwrap();

      toast.success(
        hasExistingValue
          ? `Content ${updateMethod === "append" ? "appended to" : "overwrote"} ${pickedItem?.display_name ?? "the item"}!`
          : `Saved to ${pickedItem?.display_name ?? "the item"}!`,
      );
      setSavedScopeId(scopeId);
      return true;
    } catch (err) {
      console.error("useSetContextValue: save failed", err);
      toast.error("Failed to save context value");
      return false;
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
