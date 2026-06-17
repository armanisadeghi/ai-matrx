// features/dictionary/hooks/useDictionaryContext.ts
//
// The surface-consumption hook. A transcription/TTS surface calls this with its
// surface key; it reads the user's stored selection (surface-user-state), keeps
// the merged dictionary resolved in the store, and returns the ready-to-use
// outputs + a setter that persists the selection per surface.
//
//   const { consumption, selection, setSelection, owners } = useDictionaryContext(surfaceKey)
//
// Default selection = personal dictionary only. The compact selector window and
// the cleanup context card both drive this hook.

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceUserState } from "@/features/surfaces/user-state/useSurfaceUserState";
import { ensureOwners, ensureResolved } from "@/features/dictionary/redux/dictionarySlice";
import {
  selectDictOwnerCatalogue,
  selectDictResolvedForSurface,
} from "@/features/dictionary/redux/selectors";
import {
  DEFAULT_DICT_SELECTION,
  type DictConsumption,
  type DictEntryDraft,
  type DictSelection,
} from "@/features/dictionary/types";

const FEATURE = "dictionary";

export function useDictionaryContext(surfaceKey: string) {
  const dispatch = useAppDispatch();

  const [selection, setSelectionRaw, { ready: selectionReady }] = useSurfaceUserState<
    DictSelection & Record<string, unknown>
  >(FEATURE, surfaceKey, DEFAULT_DICT_SELECTION as DictSelection & Record<string, unknown>);

  const owners = useAppSelector(selectDictOwnerCatalogue);
  const cell = useAppSelector(selectDictResolvedForSurface(surfaceKey));

  // Load the owners catalogue once (selector UI needs it).
  useEffect(() => {
    void dispatch(ensureOwners());
  }, [dispatch]);

  // Resolve whenever the selection settles/changes.
  useEffect(() => {
    if (!selectionReady) return;
    void dispatch(ensureResolved(surfaceKey, selection as DictSelection));
  }, [dispatch, surfaceKey, selectionReady, selection]);

  const setSelection = useCallback(
    (next: DictSelection | ((prev: DictSelection) => DictSelection)) => {
      setSelectionRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev as DictSelection) : next;
        return resolved as DictSelection & Record<string, unknown>;
      });
    },
    [setSelectionRaw],
  );

  const consumption: DictConsumption | null = cell?.data ?? null;

  const customEntries = useMemo(
    () => (selection as DictSelection).customEntries ?? [],
    [selection],
  );

  const activeCount = useMemo(
    () => (consumption?.resolved.entries.length ?? 0) + customEntries.length,
    [consumption, customEntries],
  );

  // ── per-task ("situational") custom entries ──────────────────────────────
  const setCustomEntries = useCallback(
    (next: DictEntryDraft[] | ((prev: DictEntryDraft[]) => DictEntryDraft[])) => {
      setSelection((prev) => {
        const prevCustom = prev.customEntries ?? [];
        const resolved = typeof next === "function" ? next(prevCustom) : next;
        return { ...prev, customEntries: resolved };
      });
    },
    [setSelection],
  );

  const addCustomEntry = useCallback(
    (draft: DictEntryDraft) => {
      if (!draft.term?.trim()) return;
      setCustomEntries((prev) => {
        // Replace an existing per-task entry for the same term (case-insensitive).
        const key = draft.term.trim().toLowerCase();
        const rest = prev.filter((e) => e.term.trim().toLowerCase() !== key);
        return [...rest, { ...draft, term: draft.term.trim() }];
      });
    },
    [setCustomEntries],
  );

  const removeCustomEntry = useCallback(
    (term: string) => {
      const key = term.trim().toLowerCase();
      setCustomEntries((prev) => prev.filter((e) => e.term.trim().toLowerCase() !== key));
    },
    [setCustomEntries],
  );

  const clearCustomEntries = useCallback(() => setCustomEntries([]), [setCustomEntries]);

  return {
    consumption,
    activeCount,
    selection: selection as DictSelection,
    setSelection,
    owners,
    status: cell?.status ?? "idle",
    error: cell?.error ?? null,
    // Per-task custom dictionary (session-scoped, not saved to any tier).
    customEntries,
    setCustomEntries,
    addCustomEntry,
    removeCustomEntry,
    clearCustomEntries,
  };
}
