"use client";

/**
 * useApplyAIPatchesToActiveTab
 *
 * Watches the agent stream for `conversationId` and stages every
 * fully-closed SEARCH/REPLACE block in the in-flight assistant text
 * against whichever open editor tab it cleanly matches — in real time,
 * not just at end-of-stream.
 *
 * Streaming contract:
 *   - `parseCodeEdits` is regex-based and only emits blocks once their
 *     closing delimiter has arrived, so partial blocks are ignored
 *     automatically.
 *   - `stagePatches` is idempotent by `${requestId}:${tabId}:${blockIndex}`,
 *     so it's safe to dispatch on every render-block update during
 *     streaming. Already-staged patches are not re-pushed, and
 *     accepted / rejected patches are never resurrected.
 *
 * Per-tab matching, not per-file path:
 *   The agent does not always quote the file path in a structured way.
 *   The SEARCH text is, however, required to be unique inside the file —
 *   so we can locate the target tab by trying to apply each block to
 *   each open tab's buffer and accepting only unambiguous matches.
 *   This also handles the realistic case where the agent edits multiple
 *   open files in one turn.
 *
 * UX contract:
 *   This hook only stages — it does NOT mutate tab content. Tabs that
 *   own a pending patch automatically swap from `<MonacoEditor>` to
 *   `<TabDiffView>` (Cursor-style: the file's own tab becomes the diff).
 *   Acceptance flows through the existing `updateTabContent` → save
 *   pipeline so cloud, library, sandbox, and mock filesystems all work
 *   without a special case.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccumulatedText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectLatestRequestId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useRetainRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { parseCodeEdits } from "@/features/code-editor/agent-code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/agent-code-editor/utils/applyCodeEdits";
import { selectCodeTabs, type CodeTabsState } from "../redux/tabsSlice";
import { stagePatches } from "../redux/codePatchesSlice";
import { isPreviewTab } from "../types";

interface UseApplyAIPatchesToActiveTabOptions {
  /** Conversation whose stream we observe. Pass `null` to disable. */
  conversationId: string | null | undefined;
}

interface BlockMatch {
  tabId: string;
  blockIndex: number;
  search: string;
  replace: string;
}

/**
 * Try to apply `edits` against every open tab. A tab "matches" when the
 * `applyCodeEdits` run succeeds against its buffer with at least one
 * applied edit and zero errors. We stage matched blocks per-tab.
 *
 * If a single block lands cleanly in two tabs, we conservatively skip
 * staging that block — ambiguity should never overwrite the wrong file.
 *
 * Note for streaming: we test every block on every call. Already-staged
 * patches whose SEARCH no longer matches (because the user accepted an
 * earlier patch and the buffer changed) are simply skipped here — they
 * remain in the slice with their existing status. Newly-arrived blocks
 * pick up their match cleanly.
 */
function locateBlocksAcrossTabs(
  tabs: CodeTabsState,
  edits: { id: string; search: string; replace: string }[],
): BlockMatch[] {
  const results: BlockMatch[] = [];
  edits.forEach((edit, blockIndex) => {
    const winners: string[] = [];
    for (const tabId of Object.keys(tabs.byId)) {
      const tab = tabs.byId[tabId];
      if (isPreviewTab(tab.kind)) continue;
      const result = applyCodeEdits(tab.content, [edit]);
      if (result.success && result.appliedEdits === 1) {
        winners.push(tabId);
      }
    }
    if (winners.length === 1) {
      results.push({
        tabId: winners[0],
        blockIndex,
        search: edit.search,
        replace: edit.replace,
      });
    }
  });
  return results;
}

export function useApplyAIPatchesToActiveTab({
  conversationId,
}: UseApplyAIPatchesToActiveTabOptions): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const safeConversationId = conversationId ?? "__none__";
  const requestId = useAppSelector(selectLatestRequestId(safeConversationId));
  const streamingText = useAppSelector(
    requestId ? selectAccumulatedText(requestId) : () => "",
  );

  // Renders live stream output straight from the request row (no
  // `MarkdownStream requestId=`), so retention is this viewer's own job —
  // an owner reap mid-stream would otherwise blank it permanently.
  // Doctrine: features/agents/docs/LIVE_RUN_RETENTION.md.
  useRetainRequestForViewer(requestId, "useApplyAIPatchesToActiveTab");

  useEffect(() => {
    if (!conversationId || !requestId) return;
    if (!streamingText) return;
    // Cheap pre-flight: skip the parser unless at least one block has
    // both an opening and a closing delimiter in the buffer.
    if (!streamingText.includes("SEARCH:")) return;
    if (!streamingText.includes(">>>")) return;

    const parsed = parseCodeEdits(streamingText);
    if (!parsed.success || parsed.edits.length === 0) return;

    // Read tabs at parse time (not via subscription) so the matcher
    // sees the freshest buffers — the user may have accepted earlier
    // patches in this same turn, and we want the next batch to match
    // against the post-accept content.
    const state = store.getState() as { codeTabs: CodeTabsState };
    const tabs = selectCodeTabs(state);

    const matches = locateBlocksAcrossTabs(tabs, parsed.edits);
    if (matches.length === 0) return;

    // Group matches by tabId so we make one dispatch per tab. The slice
    // dedupes by patchId, so re-dispatching the same block-index is a
    // free no-op — but we still want to minimize action volume during
    // streaming, hence the per-tab grouping.
    const byTab = new Map<
      string,
      Array<{ search: string; replace: string; blockIndex: number }>
    >();
    for (const match of matches) {
      const list = byTab.get(match.tabId) ?? [];
      list.push({
        search: match.search,
        replace: match.replace,
        blockIndex: match.blockIndex,
      });
      byTab.set(match.tabId, list);
    }

    for (const [tabId, patches] of byTab.entries()) {
      dispatch(
        stagePatches({
          tabId,
          conversationId,
          requestId,
          patches,
        }),
      );
    }
  }, [conversationId, requestId, streamingText, dispatch, store]);
}
