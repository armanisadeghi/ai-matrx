"use client";

/**
 * MessageFilesStrip — compact file list rendered under each assistant
 * message that has AI edit history. Clicking a file row opens a
 * `"history-triple"` tab in the code workspace showing
 * Before / With updates / Modifications-Since for that one
 * (message, file) snapshot.
 *
 * Renders nothing when the message has no history rows yet — safe to
 * mount unconditionally inside the message renderer.
 */

import React, { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { History, Stars, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "../../styles/file-icon";
import { selectSnapshotsForMessage } from "../../redux/codeEditHistorySlice";
import { fileIdentityKey } from "../../utils/fileIdentity";
import { openTab, setActiveTab } from "../../redux/tabsSlice";
import { revertMessageThunk } from "../../redux/codeEditUndoRevert";
import { languageFromFilename } from "../../styles/file-icon";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  buildHistoryTripleTabId,
  HISTORY_TRIPLE_TAB_PREFIX,
} from "../../editor/historyTripleTab";

interface MessageFilesStripProps {
  conversationId: string;
  messageId: string;
}

export const MessageFilesStrip: React.FC<MessageFilesStripProps> = ({
  conversationId: _conversationId,
  messageId,
}) => {
  const dispatch = useAppDispatch();
  const selectSnapshots = useMemo(
    () => selectSnapshotsForMessage(messageId),
    [messageId],
  );
  const snapshots = useAppSelector(selectSnapshots);

  if (snapshots.length === 0) return null;

  const handleOpen = (snap: (typeof snapshots)[number]) => {
    const tabId = buildHistoryTripleTabId(
      messageId,
      fileIdentityKey({
        adapter: snap.fileAdapter,
        path: snap.filePath,
        libraryFileId: snap.libraryFileId,
      }),
    );
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
        historyFileIdentityKey: fileIdentityKey({
          adapter: snap.fileAdapter,
          path: snap.filePath,
        }),
      }),
    );
    dispatch(setActiveTab(tabId));
  };

  const handleRevertMessage = async () => {
    const result = dispatch(revertMessageThunk({ messageId }));
    if (result.requiresConfirmation) {
      const { laterMessageIds, affectedFiles } = result.requiresConfirmation;
      const messageCount = laterMessageIds.length;
      const confirmed = await confirm({
        title: "Revert this message's edits?",
        description: (
          <div className="space-y-2">
            <p>
              This will also undo accepted edits from {messageCount} later{" "}
              message{messageCount === 1 ? "" : "s"} on the same file
              {affectedFiles.length === 1 ? "" : "s"}:
            </p>
            <ul className="list-disc space-y-0.5 pl-5 font-mono text-xs">
              {affectedFiles.map((file) => (
                <li key={file} className="break-all">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        ),
        confirmLabel: "Revert",
        variant: "destructive",
      });
      if (!confirmed) return;
      const second = dispatch(
        revertMessageThunk({ messageId, confirmCascading: true }),
      );
      if (second.unreverted.length > 0) {
        toast.error(
          `Could not revert ${second.unreverted.length} file(s); they may have drifted too far.`,
        );
      } else if (second.mutated) {
        toast.success("Message edits reverted");
      }
      return;
    }
    if (result.mutated) {
      toast.success("Message edits reverted");
    }
  };

  let totalApplied = 0;
  let totalRejected = 0;
  for (const s of snapshots) {
    for (const e of s.edits) {
      if (e.status === "applied") totalApplied++;
      else if (e.status === "rejected") totalRejected++;
    }
  }

  return (
    <div className="ml-10 mt-1 mb-2 max-w-[60ch] rounded border border-blue-200/80 bg-blue-50/60 p-1.5 text-[11px] dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] uppercase tracking-wide text-blue-900/80 dark:text-blue-200/80">
        <Stars className="h-3 w-3" />
        <span className="font-semibold">
          {snapshots.length} {snapshots.length === 1 ? "file" : "files"} edited
        </span>
        <span className="text-blue-700/70 dark:text-blue-300/70">
          · {totalApplied} accepted
          {totalRejected > 0 && ` · ${totalRejected} rejected`}
        </span>
        <button
          type="button"
          onClick={handleRevertMessage}
          title="Revert this message's edits"
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-blue-800 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-900/40"
        >
          <Undo2 className="h-3 w-3" />
          Revert
        </button>
      </div>
      <ul className="flex flex-col">
        {snapshots.map((snap) => {
          const name = snap.filePath.split("/").pop() ?? snap.filePath;
          const isReverted = snap.status === "reverted";
          let applied = 0;
          let rejected = 0;
          for (const e of snap.edits) {
            if (e.status === "applied") applied++;
            else if (e.status === "rejected") rejected++;
          }
          return (
            <li key={`${snap.fileAdapter}:${snap.filePath}`}>
              <button
                type="button"
                onClick={() => handleOpen(snap)}
                title={`Open triple view: Before / With updates / Modifications since ${name}`}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left",
                  "hover:bg-blue-100/70 dark:hover:bg-blue-900/40",
                  isReverted && "opacity-60",
                )}
              >
                <FileIcon name={name} size={12} />
                <span className="truncate font-mono text-[12px]">{name}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                  {snap.filePath}
                </span>
                <History className="h-3 w-3 text-blue-600/80 dark:text-blue-400/80" />
                <span className="font-mono text-[10px]">
                  {applied > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓{applied}
                    </span>
                  )}
                  {applied > 0 && rejected > 0 && " "}
                  {rejected > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      ✗{rejected}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
