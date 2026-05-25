"use client";

// useFindReplace — Connects Redux find/replace state to the editor.
// Computes matches, provides navigation + replace actions.
// Match computation is memoized; replace goes through updateNoteContent for undo.

import { useMemo, useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeFindReplace,
  setFindQuery,
  setFindReplaceText,
  toggleFindOption,
  setFindShowReplace,
  setFindShowAdvanced,
  setFindScope,
  setFindIncludePaths,
  setFindExcludePaths,
  setFindMatchResults,
  navigateFindMatch,
  updateNoteContent,
} from "../redux/slice";
import { selectFindReplaceState, selectNoteContent } from "../redux/selectors";
import {
  computeMatches,
  applyReplace,
  type FindMatch,
} from "../utils/findMatches";

export function useFindReplace(instanceId: string, noteId: string | null) {
  const dispatch = useAppDispatch();
  const findReplace = useAppSelector(selectFindReplaceState(instanceId));
  const content =
    useAppSelector(noteId ? selectNoteContent(noteId) : () => null) ?? "";

  // ── Compute matches ─────────────────────────────────────────────
  const matches: FindMatch[] = useMemo(() => {
    if (!findReplace?.query) return [];
    return computeMatches(content, findReplace.query, {
      caseSensitive: findReplace.caseSensitive,
      useRegex: findReplace.useRegex,
      wholeWord: findReplace.wholeWord,
    });
  }, [
    content,
    findReplace?.query,
    findReplace?.caseSensitive,
    findReplace?.useRegex,
    findReplace?.wholeWord,
  ]);

  // ── Sync match count to Redux ───────────────────────────────────
  //
  // We always push the active noteId along with the count so the slice can
  // consume any pending "jump to match N in note X" request (set when the
  // user clicks a row in the global search results panel). The effect also
  // runs when the pending target changes so a queued jump aimed at the
  // newly-active note is honoured immediately.
  useEffect(() => {
    if (!findReplace) return;
    const matchCountChanged = findReplace.matchCount !== matches.length;
    const pendingForThisNote =
      findReplace.pendingActiveNoteId !== null &&
      findReplace.pendingActiveNoteId === noteId;
    if (matchCountChanged || pendingForThisNote) {
      dispatch(
        setFindMatchResults({
          instanceId,
          matchCount: matches.length,
          noteId,
        }),
      );
    }
    // `findReplace` itself is intentionally omitted: every field we read is
    // already listed individually below.
  }, [
    dispatch,
    instanceId,
    noteId,
    matches.length,
    findReplace?.matchCount,
    findReplace?.pendingActiveNoteId,
  ]);

  // ── Actions ─────────────────────────────────────────────────────

  const setQuery = useCallback(
    (query: string) => dispatch(setFindQuery({ instanceId, query })),
    [dispatch, instanceId],
  );

  const setReplaceText = useCallback(
    (replaceText: string) =>
      dispatch(setFindReplaceText({ instanceId, replaceText })),
    [dispatch, instanceId],
  );

  const toggle = useCallback(
    (option: "caseSensitive" | "useRegex" | "wholeWord") =>
      dispatch(toggleFindOption({ instanceId, option })),
    [dispatch, instanceId],
  );

  const toggleReplace = useCallback(() => {
    if (findReplace)
      dispatch(
        setFindShowReplace({
          instanceId,
          showReplace: !findReplace.showReplace,
        }),
      );
  }, [dispatch, instanceId, findReplace]);

  const toggleAdvanced = useCallback(() => {
    if (findReplace)
      dispatch(
        setFindShowAdvanced({
          instanceId,
          showAdvanced: !findReplace.showAdvanced,
        }),
      );
  }, [dispatch, instanceId, findReplace]);

  const setScope = useCallback(
    (scope: "file" | "global") =>
      dispatch(setFindScope({ instanceId, scope })),
    [dispatch, instanceId],
  );

  const toggleScope = useCallback(() => {
    if (!findReplace) return;
    dispatch(
      setFindScope({
        instanceId,
        scope: findReplace.scope === "global" ? "file" : "global",
      }),
    );
  }, [dispatch, instanceId, findReplace]);

  const setIncludePaths = useCallback(
    (value: string) => dispatch(setFindIncludePaths({ instanceId, value })),
    [dispatch, instanceId],
  );

  const setExcludePaths = useCallback(
    (value: string) => dispatch(setFindExcludePaths({ instanceId, value })),
    [dispatch, instanceId],
  );

  const next = useCallback(
    () => dispatch(navigateFindMatch({ instanceId, direction: "next" })),
    [dispatch, instanceId],
  );

  const prev = useCallback(
    () => dispatch(navigateFindMatch({ instanceId, direction: "prev" })),
    [dispatch, instanceId],
  );

  const close = useCallback(
    () => dispatch(closeFindReplace({ instanceId })),
    [dispatch, instanceId],
  );

  const replaceOne = useCallback(() => {
    if (!noteId || !findReplace || matches.length === 0) return;
    const idx = findReplace.currentMatchIndex;
    if (idx < 0 || idx >= matches.length) return;
    const newContent = applyReplace(
      content,
      matches,
      findReplace.replaceText,
      idx,
    );
    dispatch(updateNoteContent({ id: noteId, content: newContent }));
  }, [dispatch, noteId, findReplace, matches, content]);

  const replaceAll = useCallback(() => {
    if (!noteId || !findReplace || matches.length === 0) return;
    const newContent = applyReplace(content, matches, findReplace.replaceText);
    dispatch(updateNoteContent({ id: noteId, content: newContent }));
  }, [dispatch, noteId, findReplace, matches, content]);

  return {
    isOpen: findReplace?.isOpen ?? false,
    query: findReplace?.query ?? "",
    replaceText: findReplace?.replaceText ?? "",
    caseSensitive: findReplace?.caseSensitive ?? false,
    useRegex: findReplace?.useRegex ?? false,
    wholeWord: findReplace?.wholeWord ?? false,
    showReplace: findReplace?.showReplace ?? false,
    showAdvanced: findReplace?.showAdvanced ?? false,
    scope: findReplace?.scope ?? "file",
    includePaths: findReplace?.includePaths ?? "",
    excludePaths: findReplace?.excludePaths ?? "",
    matchCount: matches.length,
    currentMatchIndex: findReplace?.currentMatchIndex ?? -1,
    focusRequestId: findReplace?.focusRequestId ?? 0,
    matches,
    setQuery,
    setReplaceText,
    toggle,
    toggleReplace,
    toggleAdvanced,
    setScope,
    toggleScope,
    setIncludePaths,
    setExcludePaths,
    next,
    prev,
    close,
    replaceOne,
    replaceAll,
  };
}
