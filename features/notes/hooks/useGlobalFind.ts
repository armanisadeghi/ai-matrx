"use client";

// useGlobalFind — Computes global ("search in all notes") results from the
// current find query + options + path filters. Returns a single memoized
// `GlobalSearchResults` object that the FindReplaceBar's results panel
// renders. Designed so the per-file find hook (`useFindReplace`) stays
// completely unaware that global search exists — the two paths share the
// same query/options state via Redux but compute their match lists in
// parallel.

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllNotesList,
  selectFindReplaceState,
} from "../redux/selectors";
import {
  computeGlobalMatches,
  parsePathPatterns,
  type GlobalSearchResults,
} from "../utils/findMatches";

const EMPTY_RESULTS: GlobalSearchResults = {
  results: [],
  totalMatches: 0,
  matchedNotes: 0,
  searchedNotes: 0,
};

export function useGlobalFind(instanceId: string): GlobalSearchResults {
  const findReplace = useAppSelector(selectFindReplaceState(instanceId));
  const allNotes = useAppSelector(selectAllNotesList);

  return useMemo(() => {
    if (!findReplace || !findReplace.query || findReplace.scope !== "global") {
      return EMPTY_RESULTS;
    }
    const includes = parsePathPatterns(findReplace.includePaths);
    const excludes = parsePathPatterns(findReplace.excludePaths);
    const inputs = allNotes.map((n) => ({
      id: n.id,
      label: n.label || "(untitled)",
      folder: n.folder_name || "",
      content: n.content || "",
    }));
    return computeGlobalMatches(
      inputs,
      findReplace.query,
      {
        caseSensitive: findReplace.caseSensitive,
        useRegex: findReplace.useRegex,
        wholeWord: findReplace.wholeWord,
      },
      includes,
      excludes,
    );
    // Intentionally omitting `findReplace` itself: every field we read is
    // already listed individually, so including the whole object would
    // trigger a full re-scan on unrelated state changes (e.g. typing in the
    // replace box, navigating matches).
  }, [
    allNotes,
    findReplace?.query,
    findReplace?.scope,
    findReplace?.caseSensitive,
    findReplace?.useRegex,
    findReplace?.wholeWord,
    findReplace?.includePaths,
    findReplace?.excludePaths,
  ]);
}
