"use client";

/**
 * TabDiffView — replaces Monaco for any tab that has pending AI patches.
 *
 * The whole "review surface" concept lives inside the file's own tab
 * (mirrors Cursor exactly): when the agent emits SEARCH/REPLACE blocks
 * that match this tab, the tab swaps from `<MonacoEditor>` to this
 * component until the user has accepted or rejected every edit. Once
 * the patch list is empty for this tab, `<EditorArea>` swaps back to
 * the normal editor automatically — no separate tab, no extra layers.
 *
 * Layout:
 *   ┌─ Slim toolbar (file-level) ────────────────────────────────────┐
 *   │ [‹ Prev file] [Next file ›] · N edits · +A -D       [Reject][Accept]
 *   ├─ Monaco DiffEditor (inline, theme-aware, both sides read-only) ┤
 *   │   original = tab.content                                       │
 *   │   modified = tab.content with all pending patches applied      │
 *   │                                                                │
 *   │   Each hunk gets its own inline [Accept] [Reject] strip,       │
 *   │   rendered into a Monaco *view zone* placed above the hunk's   │
 *   │   first modified line. View zones reserve real vertical space  │
 *   │   so the buttons never overlap diff decorations or fight       │
 *   │   z-indexes — the failure mode that made the original content- │
 *   │   widget version render as faint, unclickable ghosts. Per-hunk │
 *   │   actions go through the same acceptPatch / rejectPatch path   │
 *   │   the toolbar uses.                                            │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Apply pipeline: identical to before. Accept dispatches `applyCodeEdits`
 * → `updateTabContent`; the existing dirty + save pipeline carries the
 * change to whatever filesystem owns the tab (cloud / library / sandbox
 * / mock). Reject just marks the patch rejected; the buffer is untouched.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Rocket, X } from "lucide-react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { LegacyDiffChip } from "@/components/diff/LegacyDiffChip";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { applyCodeEdits } from "@/features/code-editor/agent-code-editor/utils/applyCodeEdits";
import { generateUnifiedDiff } from "@/features/code-editor/agent-code-editor/utils/generateDiff";
import { useMonacoTheme } from "./useMonacoTheme";
import { setActiveTab, updateTabContent } from "../redux/tabsSlice";
import {
  markPatchApplied,
  markPatchRejected,
  selectPendingPatchesForTab,
  selectTabIdsWithPendingChanges,
  type PendingPatch,
} from "../redux/codePatchesSlice";
import {
  recordPatchAcceptedThunk,
  recordPatchRejectedThunk,
} from "../redux/codeEditHistoryThunks";
import { tabToFileIdentity } from "../utils/fileIdentity";
import type { EditorFile } from "../types";

interface TabDiffViewProps {
  tab: EditorFile;
}

interface PatchAnchor {
  patchId: string;
  domNode: HTMLDivElement;
}

export const TabDiffView: React.FC<TabDiffViewProps> = ({ tab }) => {
  const dispatch = useAppDispatch();
  const isDark = useMonacoTheme();

  // Memoize the factory selector per tabId — see redux-selector-rules
  // Rule 7. Reuses the same memoized selector instance across renders.
  const selectPending = useMemo(
    () => selectPendingPatchesForTab(tab.id),
    [tab.id],
  );
  const patches = useAppSelector(selectPending);

  // Compute the proposed content (current buffer + every pending patch
  // applied in order) and per-patch dry-run results in a single pass.
  // Rerun only when the buffer or the patch list changes — applyCodeEdits
  // is pure, so the memo is exhaustive.
  const { proposedContent, perPatchOk, additions, deletions } = useMemo(() => {
    let working = tab.content;
    const ok: Record<string, boolean> = {};
    for (const patch of patches) {
      const applied = applyCodeEdits(working, [
        { id: patch.patchId, search: patch.search, replace: patch.replace },
      ]);
      if (applied.success && applied.code) {
        working = applied.code;
        ok[patch.patchId] = true;
      } else {
        ok[patch.patchId] = false;
      }
    }
    const stats = generateUnifiedDiff(tab.content, working);
    return {
      proposedContent: working,
      perPatchOk: ok,
      additions: stats.additions,
      deletions: stats.deletions,
    };
  }, [tab.content, patches]);

  // ── Per-tab navigation: prev / next file with pending changes ─────────
  const tabIdsWithPending = useAppSelector(selectTabIdsWithPendingChanges);
  const navIndex = tabIdsWithPending.indexOf(tab.id);
  const prevTabId = navIndex > 0 ? tabIdsWithPending[navIndex - 1] : null;
  const nextTabId =
    navIndex >= 0 && navIndex < tabIdsWithPending.length - 1
      ? tabIdsWithPending[navIndex + 1]
      : null;
  const navPosition =
    navIndex >= 0 ? `${navIndex + 1} of ${tabIdsWithPending.length}` : "1 of 1";
  const goPrev = useCallback(() => {
    if (prevTabId) dispatch(setActiveTab(prevTabId));
  }, [dispatch, prevTabId]);
  const goNext = useCallback(() => {
    if (nextTabId) dispatch(setActiveTab(nextTabId));
  }, [dispatch, nextTabId]);

  // File identity for history persistence. `tabToFileIdentity` returns
  // null for synthetic tabs (untitled scratch, missing path) — we skip
  // history recording in that case but still let the user accept the
  // patch, since the buffer-level apply is harmless without an anchor.
  const fileIdentity = useMemo(() => tabToFileIdentity(tab), [tab]);

  // ── Apply / reject actions ────────────────────────────────────────────
  // Each action records into `codeEditHistorySlice` so we can offer
  // undo, message-scoped revert, and the triple-view inspector. The
  // history thunk handles the rare race where `requestId` exists but
  // the assistant `cx_message.id` hasn't been server-reserved yet.
  const acceptPatch = useCallback(
    (patch: PendingPatch) => {
      const before = tab.content;
      const result = applyCodeEdits(before, [
        { id: patch.patchId, search: patch.search, replace: patch.replace },
      ]);
      if (!result.success || !result.code) {
        const reason = result.errors[0] ?? "apply failed";
        dispatch(
          markPatchRejected({
            tabId: tab.id,
            patchId: patch.patchId,
            reason,
          }),
        );
        if (fileIdentity) {
          dispatch(
            recordPatchRejectedThunk({
              requestId: patch.sourceRequestId,
              fileIdentity,
              beforeContent: before,
              afterContent: before,
              patchId: patch.patchId,
              blockIndex: patch.blockIndex,
              search: patch.search,
              replace: patch.replace,
              reason,
            }),
          );
        }
        return;
      }
      const after = result.code;
      dispatch(updateTabContent({ id: tab.id, content: after, source: "ai" }));
      dispatch(markPatchApplied({ tabId: tab.id, patchId: patch.patchId }));
      if (fileIdentity) {
        dispatch(
          recordPatchAcceptedThunk({
            requestId: patch.sourceRequestId,
            fileIdentity,
            beforeContent: before,
            afterContent: after,
            patchId: patch.patchId,
            blockIndex: patch.blockIndex,
            search: patch.search,
            replace: patch.replace,
          }),
        );
      }
    },
    [dispatch, tab.id, tab.content, fileIdentity],
  );

  const rejectPatch = useCallback(
    (patch: PendingPatch) => {
      const reason = "user rejected";
      dispatch(
        markPatchRejected({
          tabId: tab.id,
          patchId: patch.patchId,
          reason,
        }),
      );
      if (fileIdentity) {
        dispatch(
          recordPatchRejectedThunk({
            requestId: patch.sourceRequestId,
            fileIdentity,
            beforeContent: tab.content,
            afterContent: tab.content,
            patchId: patch.patchId,
            blockIndex: patch.blockIndex,
            search: patch.search,
            replace: patch.replace,
            reason,
          }),
        );
      }
    },
    [dispatch, tab.id, tab.content, fileIdentity],
  );

  const acceptAll = useCallback(() => {
    let working = tab.content;
    const applied: Array<{
      before: string;
      after: string;
      patch: PendingPatch;
    }> = [];
    const rejectedWithReason: Array<{ patch: PendingPatch; reason: string }> =
      [];
    for (const patch of patches) {
      const before = working;
      const result = applyCodeEdits(working, [
        { id: patch.patchId, search: patch.search, replace: patch.replace },
      ]);
      if (result.success && result.code) {
        working = result.code;
        applied.push({ before, after: result.code, patch });
      } else {
        rejectedWithReason.push({
          patch,
          reason: result.errors[0] ?? "apply failed",
        });
      }
    }
    if (working !== tab.content) {
      dispatch(
        updateTabContent({ id: tab.id, content: working, source: "ai" }),
      );
    }
    for (const entry of applied) {
      dispatch(
        markPatchApplied({ tabId: tab.id, patchId: entry.patch.patchId }),
      );
      if (fileIdentity) {
        dispatch(
          recordPatchAcceptedThunk({
            requestId: entry.patch.sourceRequestId,
            fileIdentity,
            beforeContent: entry.before,
            afterContent: entry.after,
            patchId: entry.patch.patchId,
            blockIndex: entry.patch.blockIndex,
            search: entry.patch.search,
            replace: entry.patch.replace,
          }),
        );
      }
    }
    for (const { patch, reason } of rejectedWithReason) {
      dispatch(
        markPatchRejected({ tabId: tab.id, patchId: patch.patchId, reason }),
      );
      if (fileIdentity) {
        dispatch(
          recordPatchRejectedThunk({
            requestId: patch.sourceRequestId,
            fileIdentity,
            beforeContent: working,
            afterContent: working,
            patchId: patch.patchId,
            blockIndex: patch.blockIndex,
            search: patch.search,
            replace: patch.replace,
            reason,
          }),
        );
      }
    }
  }, [dispatch, patches, tab.id, tab.content, fileIdentity]);

  const rejectAll = useCallback(() => {
    const reason = "user rejected (file)";
    for (const patch of patches) {
      dispatch(
        markPatchRejected({ tabId: tab.id, patchId: patch.patchId, reason }),
      );
      if (fileIdentity) {
        dispatch(
          recordPatchRejectedThunk({
            requestId: patch.sourceRequestId,
            fileIdentity,
            beforeContent: tab.content,
            afterContent: tab.content,
            patchId: patch.patchId,
            blockIndex: patch.blockIndex,
            search: patch.search,
            replace: patch.replace,
            reason,
          }),
        );
      }
    }
  }, [dispatch, patches, tab.id, tab.content, fileIdentity]);

  // ── Monaco wiring for per-hunk inline action widgets ──────────────────
  //
  // We use Monaco *view zones* — not content widgets — to host the
  // per-hunk Accept / Reject buttons. View zones reserve real vertical
  // space above (or below) a line in the modified pane, so:
  //
  //   1. The buttons sit in their own clean strip, never overlapping the
  //      diff's red / green decoration overlays (the failure mode that
  //      made content widgets render as faint, unclickable ghosts in the
  //      inline diff view).
  //   2. They naturally receive clicks — no z-index battle with
  //      decoration layers.
  //   3. Layout is stable: view zones participate in scroll / minimap
  //      math, so the buttons stay anchored to their hunk on scroll.
  //
  // Each anchor's `domNode` is an empty <div> that Monaco mounts into
  // the strip; React renders the actual button bar into it via
  // `createPortal` further down.
  const [diffEditor, setDiffEditor] =
    useState<MonacoEditorNS.IStandaloneDiffEditor | null>(null);
  const [anchors, setAnchors] = useState<PatchAnchor[]>([]);

  // Refs to current callbacks so the React-portal buttons always call
  // the latest version without us tearing down view zones on every
  // render.
  const acceptPatchRef = useRef(acceptPatch);
  const rejectPatchRef = useRef(rejectPatch);
  acceptPatchRef.current = acceptPatch;
  rejectPatchRef.current = rejectPatch;

  const handleDiffMount: DiffOnMount = useCallback((editor) => {
    editor.getOriginalEditor().updateOptions({ readOnly: true });
    editor.getModifiedEditor().updateOptions({ readOnly: true });
    setDiffEditor(editor);
  }, []);

  // Whenever the diff editor finishes computing (or our patch list
  // changes after an accept), recompute which patch corresponds to
  // which Monaco hunk and rebuild the view zones. We assume a 1:1
  // mapping between SEARCH/REPLACE blocks and Monaco hunks, sorted by
  // original-side line position — which holds for the SEARCH/REPLACE
  // format the agent emits because each block is a contiguous edit.
  useEffect(() => {
    if (!diffEditor) return undefined;
    const modifiedEditor = diffEditor.getModifiedEditor();
    const ownedZoneIds: string[] = [];

    const compute = () => {
      const changes = diffEditor.getLineChanges() ?? [];

      // Map each pending patch to its original-side line position so
      // we can zip patches against Monaco's hunk list in document order.
      const positions: Array<{
        patch: PendingPatch;
        originalStart: number;
      }> = [];
      for (const patch of patches) {
        const idx = tab.content.indexOf(patch.search);
        if (idx === -1) continue;
        const startLine = tab.content.substring(0, idx).split("\n").length;
        positions.push({ patch, originalStart: startLine });
      }
      positions.sort((a, b) => a.originalStart - b.originalStart);

      const nextAnchors: PatchAnchor[] = [];
      const n = Math.min(positions.length, changes.length);

      // Single batched view-zone mutation — removes the previous run's
      // zones AND adds the new ones in one accessor call. Monaco re-
      // layouts only once, no flicker.
      modifiedEditor.changeViewZones((accessor) => {
        for (const id of ownedZoneIds) accessor.removeZone(id);
        ownedZoneIds.length = 0;

        for (let i = 0; i < n; i++) {
          const change = changes[i];
          const patch = positions[i].patch;
          const modifiedLine = Math.max(
            1,
            change.modifiedStartLineNumber || change.modifiedEndLineNumber || 1,
          );

          const domNode = document.createElement("div");
          domNode.className = "tab-diff-zone";
          // Make the strip blend with the diff editor while clearly
          // separating it from the surrounding code rows.
          domNode.style.display = "flex";
          domNode.style.alignItems = "center";
          domNode.style.justifyContent = "flex-end";
          domNode.style.padding = "0 12px";
          domNode.style.pointerEvents = "auto";
          // Monaco renders `.view-overlays` (which paints the red/green
          // diff line decorations) AFTER `.view-zones` in DOM order, and
          // both are `position: absolute` with `z-index: auto` inside
          // `.lines-content`. That puts the decoration strips on top of
          // our view zone, swallowing every click and the hover cursor.
          // Because `.view-zones` is itself unstacked, an explicit z-index
          // on this child promotes into the grandparent's stacking context
          // and lifts our action bar above the decoration overlays.
          domNode.style.zIndex = "10";

          const zoneId = accessor.addZone({
            // `afterLineNumber: 0` puts the zone at the very top of the
            // editor; for any other line we want the strip to appear
            // *above* that line, so we anchor after `line - 1`.
            afterLineNumber: Math.max(0, modifiedLine - 1),
            heightInLines: 1,
            domNode,
            suppressMouseDown: false,
          });
          ownedZoneIds.push(zoneId);
          nextAnchors.push({ patchId: patch.patchId, domNode });
        }
      });

      setAnchors(nextAnchors);
    };

    compute();
    const sub = diffEditor.onDidUpdateDiff(compute);

    return () => {
      sub.dispose();
      // Remove any zones we still own when patches / tab change. Monaco
      // tolerates calls on a disposed editor, but guarding is cheap.
      try {
        modifiedEditor.changeViewZones((accessor) => {
          for (const id of ownedZoneIds) accessor.removeZone(id);
        });
      } catch {
        // editor already disposed — nothing to clean up
      }
    };
  }, [diffEditor, patches, tab.content]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Slim toolbar ───────────────────────────────────────────── */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-2 py-1 text-[12px]",
          "border-blue-200 bg-blue-50/60",
          "dark:border-blue-900/60 dark:bg-blue-950/30",
        )}
      >
        {/* Prev / next file with pending changes */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goPrev}
            disabled={!prevTabId}
            title={
              prevTabId
                ? "Previous file with pending changes"
                : "No previous file"
            }
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded",
              prevTabId
                ? "text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                : "cursor-not-allowed text-neutral-400 dark:text-neutral-600",
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextTabId}
            title={
              nextTabId ? "Next file with pending changes" : "No next file"
            }
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded",
              nextTabId
                ? "text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                : "cursor-not-allowed text-neutral-400 dark:text-neutral-600",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="font-mono text-[10px] text-blue-700/70 dark:text-blue-300/70">
          {navPosition}
        </span>

        <span className="mx-1 h-3 w-px bg-blue-200 dark:bg-blue-900/60" />

        <Rocket className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-blue-900 dark:text-blue-200">
          {patches.length} {patches.length === 1 ? "edit" : "edits"}
        </span>
        <span className="font-mono text-[11px]">
          {additions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{additions}
            </span>
          )}
          {additions > 0 && deletions > 0 && (
            <span className="text-neutral-400 dark:text-neutral-600"> </span>
          )}
          {deletions > 0 && (
            <span className="text-red-600 dark:text-red-400">-{deletions}</span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <LegacyDiffChip
            label="Monaco per-hunk"
            reason="Coupled to the code-editor patch store (pending agent edits), so it stays on Monaco rather than the canonical DiffReview"
          />
          <button
            type="button"
            onClick={rejectAll}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <X className="h-3 w-3" />
            Reject all
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
          >
            <Check className="h-3 w-3" />
            Accept all
          </button>
        </div>
      </div>

      {/* ── Monaco DiffEditor — same engine VSCode uses ─────────────── */}
      <div className="relative min-h-0 flex-1">
        <DiffEditor
          key={tab.id}
          height="100%"
          language={tab.language}
          theme={isDark ? "vs-dark" : "vs"}
          original={tab.content}
          modified={proposedContent}
          onMount={handleDiffMount}
          options={{
            renderSideBySide: false,
            readOnly: true,
            originalEditable: false,
            renderValidationDecorations: "off",
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            renderWhitespace: "selection",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            diffWordWrap: "off",
            guides: { indentation: true },
          }}
        />
      </div>

      {/* ── Per-hunk inline action portals ──────────────────────────── */}
      {anchors.map((anchor) => {
        const patch = patches.find((p) => p.patchId === anchor.patchId);
        if (!patch) return null;
        const ok = perPatchOk[anchor.patchId] !== false;
        return createPortal(
          <InlineHunkActions
            ok={ok}
            onAccept={() => acceptPatchRef.current(patch)}
            onReject={() => rejectPatchRef.current(patch)}
          />,
          anchor.domNode,
          anchor.patchId,
        );
      })}
    </div>
  );
};

interface InlineHunkActionsProps {
  ok: boolean;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * Action bar rendered into the view-zone strip above each diff hunk.
 * Mirrors Cursor's pattern: blue Accept, dark Reject, inline with the
 * diff. Lives inside a real Monaco view zone (not a content overlay)
 * so clicks aren't swallowed by the diff decoration layer.
 */
const InlineHunkActions: React.FC<InlineHunkActionsProps> = ({
  ok,
  onAccept,
  onReject,
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-px overflow-hidden rounded text-[11px] font-medium shadow-sm",
        "ring-1 ring-black/15 dark:ring-white/15",
      )}
      style={{ pointerEvents: "auto" }}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (ok) onAccept();
        }}
        disabled={!ok}
        title={
          ok
            ? "Accept this edit"
            : "Cannot apply — earlier edits drifted the surrounding code"
        }
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5",
          ok
            ? "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
            : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500",
        )}
      >
        <Check className="h-3 w-3" />
        Accept
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        title="Reject this edit"
        className="inline-flex cursor-pointer items-center gap-1 bg-neutral-700 px-2 py-0.5 text-white hover:bg-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700"
      >
        <X className="h-3 w-3" />
        Reject
      </button>
    </div>
  );
};
