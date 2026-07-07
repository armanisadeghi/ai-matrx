"use client";

/**
 * EditHistorySection — collapsible "Edit History" timeline mounted in
 * the Explorer alongside `<PendingChangesSection>`. Lists every
 * assistant message that has touched a file in the active
 * conversation, newest-first, with a per-message file count and the
 * sum of accepted edits. Clicking a row scrolls the chat to that
 * message; clicking a file inside an expanded row opens its
 * triple-view tab.
 *
 * Hides itself when there are no history rows so it stays out of the
 * way during a clean session.
 */

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, History, RefreshCw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useStore } from "react-redux";
import { cn } from "@/lib/utils";
import type { AppStore } from "@/lib/redux/store";
import {
  selectSnapshotsForConversation,
  selectMessageIdsWithEditsInConversation,
  selectHydrationStatus,
} from "../../redux/codeEditHistorySlice";
import { loadCodeEditHistoryThunk } from "../../redux/codeEditHistoryHydration";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { codeWorkspaceSurfaceKey } from "../../chat/begin-fresh-code-chat";
import { openTab, setActiveTab } from "../../redux/tabsSlice";
import {
  buildHistoryTripleTabId,
  HISTORY_TRIPLE_TAB_PREFIX,
} from "../../editor/historyTripleTab";
import { fileIdentityKey } from "../../utils/fileIdentity";
import { languageFromFilename } from "../../styles/file-icon";
import { FileIcon } from "../../styles/file-icon";

export const EditHistorySection: React.FC = () => {
  const dispatch = useAppDispatch();
  const store = useStore() as AppStore;
  const [open, setOpen] = useState(true);
  const [expandedMessages, setExpandedMessages] = useState<
    Record<string, boolean>
  >({});

  // Pick the conversation to surface. Priority order:
  //   1. URL `?conversationId=...` (deep links to a specific chat).
  //   2. Focused conversation for the current `agentId` surface.
  //   3. The most-recently-touched conversation that has snapshots —
  //      degrades gracefully when neither URL nor focus is set.
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get("conversationId");
  const agentId = searchParams.get("agentId");
  const focusedConversationId = useAppSelector(
    agentId
      ? selectFocusedConversation(codeWorkspaceSurfaceKey(agentId))
      : () => null,
  );
  const fallbackConversationId = useAppSelector((s) => {
    const byConv = s.codeEditHistory?.byConversation ?? {};
    let best: { id: string; t: number } | null = null;
    for (const id in byConv) {
      const list = byConv[id];
      if (!list || list.length === 0) continue;
      const last = list[list.length - 1];
      const t = Date.parse(last?.appliedAt ?? "") || 0;
      if (!best || t > best.t) best = { id, t };
    }
    return best?.id ?? null;
  });
  const conversationId =
    urlConversationId ?? focusedConversationId ?? fallbackConversationId;

  const selectSnapshots = useMemo(
    () => selectSnapshotsForConversation(conversationId),
    [conversationId],
  );
  const snapshots = useAppSelector(selectSnapshots);

  const selectMessageIds = useMemo(
    () => selectMessageIdsWithEditsInConversation(conversationId),
    [conversationId],
  );
  const messageIds = useAppSelector(selectMessageIds);

  const hydrationStatus = useAppSelector((state) =>
    conversationId
      ? selectHydrationStatus(conversationId)(state)
      : ("idle" as const),
  );

  if (!conversationId || messageIds.length === 0) return null;

  // Build per-message rollup once per render. Cheap because messages
  // and files are small, and React-Redux dedupes the source arrays.
  const messageRollups = messageIds
    .slice()
    .reverse()
    .map((messageId) => {
      const files = snapshots.filter((s) => s.messageId === messageId);
      let applied = 0;
      let rejected = 0;
      for (const f of files) {
        for (const e of f.edits) {
          if (e.status === "applied") applied++;
          else if (e.status === "rejected") rejected++;
        }
      }
      const newest = files.reduce<string>((acc, s) => {
        return s.appliedAt > acc ? s.appliedAt : acc;
      }, files[0]?.appliedAt ?? "");
      const allReverted =
        files.length > 0 && files.every((f) => f.status === "reverted");
      return { messageId, files, applied, rejected, newest, allReverted };
    });

  const totalFiles = snapshots.length;
  const totalApplied = messageRollups.reduce((acc, r) => acc + r.applied, 0);

  const handleScrollToMessage = (messageId: string) => {
    if (typeof document === "undefined") return;
    const el = document.querySelector(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-400");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-blue-400");
      }, 1500);
    }
  };

  const handleOpenTriple = (
    messageId: string,
    snap: (typeof snapshots)[number],
  ) => {
    const fileKey = fileIdentityKey({
      adapter: snap.fileAdapter,
      path: snap.filePath,
    });
    const tabId = buildHistoryTripleTabId(messageId, fileKey);
    const state = store.getState();
    if (!state.codeTabs?.byId?.[tabId]) {
      dispatch(
        openTab({
          id: tabId,
          path: `${HISTORY_TRIPLE_TAB_PREFIX}/${snap.filePath}`,
          name: snap.filePath.split("/").pop() ?? snap.filePath,
          language: languageFromFilename(snap.filePath),
          content: "",
          pristineContent: "",
          kind: "history-triple",
          historyMessageId: messageId,
          historyFileIdentityKey: fileKey,
        }),
      );
    }
    dispatch(setActiveTab(tabId));
  };

  const reload = () => {
    if (!conversationId) return;
    dispatch(loadCodeEditHistoryThunk(conversationId, { force: true }));
  };

  return (
    <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] uppercase tracking-wide text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <History className="h-3 w-3" />
        <span className="font-medium">Edit History</span>
        <span className="ml-auto rounded bg-neutral-200 px-1.5 py-[1px] text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {messageRollups.length} msg · {totalFiles} file
          {totalFiles === 1 ? "" : "s"} · {totalApplied} edit
          {totalApplied === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reload();
          }}
          title="Reload edit history"
          className="ml-1 rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          <RefreshCw
            className={cn(
              "h-3 w-3",
              hydrationStatus === "loading" && "animate-spin",
            )}
          />
        </button>
      </button>

      {open && (
        <ul className="flex flex-col py-0.5">
          {messageRollups.map((row) => {
            const isExpanded = expandedMessages[row.messageId] ?? false;
            return (
              <li key={row.messageId}>
                <div
                  className={cn(
                    "flex w-full items-center gap-1 px-2 py-[3px] text-[12px]",
                    row.allReverted &&
                      "italic text-neutral-500 dark:text-neutral-500",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMessages((prev) => ({
                        ...prev,
                        [row.messageId]: !isExpanded,
                      }))
                    }
                    className="flex h-4 w-4 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScrollToMessage(row.messageId)}
                    title={`Scroll to message ${row.messageId.slice(0, 8)}`}
                    className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-neutral-800 hover:text-blue-700 dark:text-neutral-200 dark:hover:text-blue-300"
                  >
                    <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
                      {row.messageId.slice(0, 8)}
                    </span>
                    <span className="truncate">
                      {row.files.length} file{row.files.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <span className="ml-1 shrink-0 font-mono text-[10px]">
                    {row.applied > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✓{row.applied}
                      </span>
                    )}
                    {row.applied > 0 && row.rejected > 0 && " "}
                    {row.rejected > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        ✗{row.rejected}
                      </span>
                    )}
                  </span>
                </div>
                {isExpanded && (
                  <ul className="flex flex-col py-0.5 pl-7">
                    {row.files.map((snap) => {
                      const name =
                        snap.filePath.split("/").pop() ?? snap.filePath;
                      return (
                        <li key={`${snap.fileAdapter}:${snap.filePath}`}>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenTriple(row.messageId, snap)
                            }
                            title={`Open triple view for ${name}`}
                            className={cn(
                              "flex w-full items-center gap-1.5 px-1.5 py-[2px] text-left text-[11px]",
                              "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
                              snap.status === "reverted" && "opacity-60",
                            )}
                          >
                            <FileIcon name={name} size={12} />
                            <span className="truncate font-mono">{name}</span>
                            <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-500 dark:text-neutral-500">
                              {snap.filePath}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
