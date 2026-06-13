// features/dictionary/redux/selectors.ts
//
// Memoized selectors for the dictionary slice. Every derived value gets its own
// createSelector so unrelated state changes don't recompute it.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { ownerKey } from "@/features/dictionary/redux/dictionarySlice";
import type { DictLevel } from "@/features/dictionary/types";

const selectDictionary = (state: RootState) => state.dictionary;

export const selectDictOwnersCell = createSelector(
  [selectDictionary],
  (d) => d.owners,
);

export const selectDictOwnerCatalogue = createSelector(
  [selectDictOwnersCell],
  (cell) => cell.data,
);

export const selectDictEntriesByOwner = (level: DictLevel, ownerId: string) =>
  createSelector([selectDictionary], (d) => d.entriesByOwner[ownerKey(level, ownerId)] ?? null);

export const selectDictResolvedForSurface = (surfaceKey: string) =>
  createSelector([selectDictionary], (d) => d.resolvedBySurface[surfaceKey] ?? null);

/** The STT prompt string for a surface, or "" if none resolved yet. */
export const selectDictSttPromptForSurface = (surfaceKey: string) =>
  createSelector(
    [selectDictResolvedForSurface(surfaceKey)],
    (cell) => cell?.data?.sttPrompt ?? "",
  );

/** TTS substitution pairs for a surface. */
export const selectDictTtsAliasesForSurface = (surfaceKey: string) =>
  createSelector(
    [selectDictResolvedForSurface(surfaceKey)],
    (cell) => cell?.data?.ttsAliases ?? [],
  );
