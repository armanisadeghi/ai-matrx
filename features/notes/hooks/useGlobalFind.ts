"use client";

// useGlobalFind — Computes global ("search in all notes") results from the
// current find query + options + path filters. Returns a single memoized
// `GlobalSearchResults` object that the FindReplaceBar's results panel
// renders. Designed so the per-file find hook (`useFindReplace`) stays
// completely unaware that global search exists — the two paths share the
// same query/options state via Redux but compute their match lists in
// parallel.

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllNotesList, selectFindReplaceState } from "../redux/selectors";
import { ensureNoteBodiesLoaded } from "../redux/thunks";
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

export interface GlobalFindResult extends GlobalSearchResults {
  /** Note bodies are still being read — the results are not an answer yet. */
  bodiesLoading: boolean;
  /** The body read failed: "No results" would be a claim about unread notes. */
  bodyLoadError: unknown;
  /** Re-run the body read. */
  retryBodies: () => void;
}

export function useGlobalFind(instanceId: string): GlobalFindResult {
  const findReplace = useAppSelector(selectFindReplaceState(instanceId));
  const allNotes = useAppSelector(selectAllNotesList);
  const dispatch = useAppDispatch();

  // Find-across-notes needs every BODY, and list rows carry only a preview
  // (audit N-24). Load the missing bodies once a global query is active; the
  // memo below recomputes as they land. Records already full cost nothing.
  const globalActive = Boolean(findReplace?.query) && findReplace?.scope === "global";
  const missingIds = globalActive
    ? allNotes.filter((n) => n._fetchStatus !== "full").map((n) => n.id).join("\n")
    : "";
  // The body read's outcome (RC-B12): a failed read is said, never searched
  // over as if the previews were the whole note.
  const [bodyAttempt, setBodyAttempt] = useState(0);
  const [bodyOutcome, setBodyOutcome] = useState<{ key: string; error: unknown } | null>(null);
  const bodyKey = `${bodyAttempt}\n${missingIds}`;
  useEffect(() => {
    if (!missingIds) return undefined;
    let superseded = false;
    dispatch(ensureNoteBodiesLoaded(missingIds.split("\n")))
      .unwrap()
      .then(
        () => {
          if (!superseded) setBodyOutcome({ key: bodyKey, error: null });
        },
        (err: unknown) => {
          if (!superseded) setBodyOutcome({ key: bodyKey, error: err ?? new Error("The notes could not be read") });
        },
      );
    return () => {
      superseded = true;
    };
  }, [dispatch, missingIds, bodyKey]);
  const settled = Boolean(missingIds) && bodyOutcome?.key === bodyKey;
  const bodyLoadError = settled ? bodyOutcome?.error ?? null : null;
  const bodiesLoading = Boolean(missingIds) && !settled;
  const retryBodies = () => setBodyAttempt((n) => n + 1);

  const results = useMemo(() => {
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

  return { ...results, bodiesLoading, bodyLoadError, retryBodies };
}
