"use client";

// FindReplaceBar — Inline VSCode-style find & replace bar.
// Positioned at top of editor area. Receives the textarea ref + preview
// container ref for scroll-into-view and match highlighting.
//
// Focus rules:
//   - Typing in the find input NEVER moves focus to the textarea. We don't
//     touch textarea.focus() during `setQuery` — so cursor position and
//     input composition are preserved.
//   - Navigation (next / prev / Enter / Shift+Enter) scrolls the active
//     match into view but also does NOT move focus. Scrolling is done by
//     setting textarea.scrollTop directly, computed from the mirror overlay.
//   - Only explicit close / replace flushes focus back to the textarea.
//
// Highlighting:
//   - All matches get a yellow background via <FindMatchOverlay> (mirror div).
//   - The active match gets an orange highlight.
//   - In split / preview modes the markdown preview pane uses the CSS
//     Custom Highlight API (see usePreviewFindHighlight) to paint matches
//     directly on the rendered HTML.

import React, { useRef, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  X,
  CaseSensitive,
  Regex,
  WholeWord,
  Replace,
  ReplaceAll,
  ChevronRight,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotesInstanceId } from "../context/NotesInstanceContext";
import { useFindReplace } from "../hooks/useFindReplace";
import { GlobalSearchResults } from "./GlobalSearchResults";

interface FindReplaceBarProps {
  noteId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function FindReplaceBar({ noteId, textareaRef }: FindReplaceBarProps) {
  const instanceId = useNotesInstanceId();
  const fr = useFindReplace(instanceId, noteId);
  const findInputRef = useRef<HTMLInputElement>(null);

  // ── Focus + select-all the find input ─────────────────────────────
  // Fires on mount AND every time `focusRequestId` increments (e.g. user
  // re-presses Ctrl+F while the bar is already open). Selecting the
  // existing query means the next keystroke replaces it — matching the
  // standard behavior in VS Code, Chrome's in-page find, Google Docs, etc.
  useEffect(() => {
    const input = findInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [fr.focusRequestId]);

  // ── Sync native selection with the active match ───────────────────
  // We still want the textarea's native selection to track the active
  // match so "replace" / "replace all" and user keyboard shortcuts can
  // act on it. But we deliberately DO NOT call focus() — we just update
  // the selection range while the textarea is unfocused. Browsers keep
  // the selection persisted across focus events, so a later focus()
  // restores the highlight without us needing to steal it now.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (fr.matches.length === 0 || fr.currentMatchIndex < 0) return;
    const match = fr.matches[fr.currentMatchIndex];
    if (!match) return;
    // Skip if the textarea itself is currently focused — in that case
    // the user is editing and we shouldn't yank their caret around.
    if (document.activeElement === ta) return;
    try {
      ta.setSelectionRange(match.start, match.end);
    } catch {
      // Ignore — can happen if the textarea was unmounted mid-flight.
    }
  }, [textareaRef, fr.matches, fr.currentMatchIndex]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  const handleFindKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) fr.prev();
        else fr.next();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        fr.close();
        textareaRef.current?.focus();
      }
    },
    [fr, textareaRef],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) fr.replaceAll();
        else fr.replaceOne();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        fr.close();
        textareaRef.current?.focus();
      }
    },
    [fr, textareaRef],
  );

  // After replace we want focus back in the find input so the user can
  // keep pressing Enter to step through / replace. Without this, focus
  // would shift to the button that was clicked.
  const refocusFind = useCallback(() => {
    requestAnimationFrame(() => findInputRef.current?.focus());
  }, []);

  const handleNext = useCallback(() => {
    fr.next();
    refocusFind();
  }, [fr, refocusFind]);

  const handlePrev = useCallback(() => {
    fr.prev();
    refocusFind();
  }, [fr, refocusFind]);

  const handleReplaceOne = useCallback(() => {
    fr.replaceOne();
    refocusFind();
  }, [fr, refocusFind]);

  const handleReplaceAll = useCallback(() => {
    fr.replaceAll();
    refocusFind();
  }, [fr, refocusFind]);

  if (!fr.isOpen) return null;

  const toggleBtnClass = (active: boolean) =>
    cn(
      "flex items-center justify-center w-6 h-6 rounded transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5",
      active
        ? "bg-primary/20 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );

  const actionBtnClass =
    "flex items-center justify-center w-6 h-6 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted [&_svg]:w-3.5 [&_svg]:h-3.5 disabled:opacity-30 disabled:pointer-events-none";

  const isGlobal = fr.scope === "global";

  // In global mode the inline counter still reflects ONLY the active note —
  // the cross-note totals live in the results panel header below. The "No
  // results" copy is suppressed in global mode so the user isn't confused
  // when the active note has zero hits but other notes do.
  const matchCounter =
    fr.matchCount > 0
      ? `${fr.currentMatchIndex + 1}/${fr.matchCount}`
      : fr.query && !isGlobal
        ? "No results"
        : "";

  return (
    <div className="flex flex-col gap-1 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
      {/* ── Row 1: Find ── */}
      <div className="flex items-center gap-1">
        {/* Toggle replace expand */}
        <button
          className={cn(actionBtnClass, "mr-0.5")}
          onClick={fr.toggleReplace}
          title={fr.showReplace ? "Hide replace" : "Show replace"}
        >
          <ChevronRight
            className={cn(
              "transition-transform",
              fr.showReplace && "rotate-90",
            )}
          />
        </button>

        {/* Find input */}
        <div className="flex-1 flex items-center gap-1 bg-background border border-border rounded px-2 min-w-0">
          <input
            ref={findInputRef}
            type="text"
            value={fr.query}
            onChange={(e) => fr.setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find"
            className="flex-1 bg-transparent text-sm py-1 outline-none min-w-0 placeholder:text-muted-foreground/50"
            spellCheck={false}
          />
          {/* Option toggles */}
          <button
            className={toggleBtnClass(fr.caseSensitive)}
            onClick={() => {
              fr.toggle("caseSensitive");
              refocusFind();
            }}
            title="Match Case"
          >
            <CaseSensitive />
          </button>
          <button
            className={toggleBtnClass(fr.wholeWord)}
            onClick={() => {
              fr.toggle("wholeWord");
              refocusFind();
            }}
            title="Whole Word"
          >
            <WholeWord />
          </button>
          <button
            className={toggleBtnClass(fr.useRegex)}
            onClick={() => {
              fr.toggle("useRegex");
              refocusFind();
            }}
            title="Use Regular Expression"
          >
            <Regex />
          </button>
          {/* Scope toggle — VS Code's "global / file" distinction lives on the
              search activity bar; we collapse it into a single icon inside
              the find input so a single Ctrl+F can switch to global search. */}
          <button
            className={toggleBtnClass(isGlobal)}
            onClick={() => {
              fr.toggleScope();
              refocusFind();
            }}
            title={
              isGlobal
                ? "Searching all notes — click to limit to this note"
                : "Search this note only — click to search all notes (Ctrl+Shift+F)"
            }
          >
            <Globe />
          </button>
          {/* Advanced toggle — shows / hides the include/exclude rows. */}
          <button
            className={toggleBtnClass(fr.showAdvanced)}
            onClick={() => {
              fr.toggleAdvanced();
              refocusFind();
            }}
            title={
              fr.showAdvanced
                ? "Hide advanced filters"
                : "Show advanced filters (files to include / exclude)"
            }
          >
            <SlidersHorizontal />
          </button>
        </div>

        {/* Match counter */}
        <span className="text-xs text-muted-foreground w-16 text-center shrink-0 tabular-nums">
          {matchCounter}
        </span>

        {/* Nav buttons */}
        <button
          className={actionBtnClass}
          onClick={handlePrev}
          disabled={fr.matchCount === 0}
          title="Previous Match (Shift+Enter)"
        >
          <ChevronUp />
        </button>
        <button
          className={actionBtnClass}
          onClick={handleNext}
          disabled={fr.matchCount === 0}
          title="Next Match (Enter)"
        >
          <ChevronDown />
        </button>

        {/* Close */}
        <button
          className={actionBtnClass}
          onClick={() => {
            fr.close();
            textareaRef.current?.focus();
          }}
          title="Close (Escape)"
        >
          <X />
        </button>
      </div>

      {/* ── Row 2: Replace (collapsible) ── */}
      {fr.showReplace && (
        <div className="flex items-center gap-1 pl-7">
          <div className="flex-1 flex items-center bg-background border border-border rounded px-2 min-w-0">
            <input
              type="text"
              value={fr.replaceText}
              onChange={(e) => fr.setReplaceText(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace"
              className="flex-1 bg-transparent text-sm py-1 outline-none min-w-0 placeholder:text-muted-foreground/50"
              spellCheck={false}
            />
          </div>

          {/* Replace one */}
          <button
            className={actionBtnClass}
            onClick={handleReplaceOne}
            disabled={fr.matchCount === 0}
            title="Replace (Enter)"
          >
            <Replace />
          </button>

          {/* Replace all */}
          <button
            className={actionBtnClass}
            onClick={handleReplaceAll}
            disabled={fr.matchCount === 0}
            title="Replace All (Shift+Enter)"
          >
            <ReplaceAll />
          </button>

          {/* Spacer to align with close button above */}
          <div className="w-6 shrink-0" />
        </div>
      )}

      {/* ── Advanced rows: include / exclude path filters ── */}
      {fr.showAdvanced && (
        <>
          <div className="flex items-center gap-1 pl-7">
            <label className="text-[11px] text-muted-foreground w-20 shrink-0">
              files to include
            </label>
            <div className="flex-1 flex items-center bg-background border border-border rounded px-2 min-w-0">
              <input
                type="text"
                value={fr.includePaths}
                onChange={(e) => fr.setIncludePaths(e.target.value)}
                placeholder="e.g. Work, Programming, Notes*"
                className="flex-1 bg-transparent text-xs py-1 outline-none min-w-0 placeholder:text-muted-foreground/50"
                spellCheck={false}
              />
            </div>
            <div className="w-6 shrink-0" />
          </div>
          <div className="flex items-center gap-1 pl-7">
            <label className="text-[11px] text-muted-foreground w-20 shrink-0">
              files to exclude
            </label>
            <div className="flex-1 flex items-center bg-background border border-border rounded px-2 min-w-0">
              <input
                type="text"
                value={fr.excludePaths}
                onChange={(e) => fr.setExcludePaths(e.target.value)}
                placeholder="e.g. Archive, Scratch/*"
                className="flex-1 bg-transparent text-xs py-1 outline-none min-w-0 placeholder:text-muted-foreground/50"
                spellCheck={false}
              />
            </div>
            <div className="w-6 shrink-0" />
          </div>
        </>
      )}

      {/* ── Global results panel ── */}
      {isGlobal && fr.query.length > 0 && (
        <GlobalSearchResults
          instanceId={instanceId}
          className="-mx-3 -mb-1.5 mt-1"
        />
      )}
    </div>
  );
}
