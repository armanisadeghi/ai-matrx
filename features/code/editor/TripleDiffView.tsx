"use client";

/**
 * TripleDiffView — three-way inspector for the AI edit-history triple
 * view: Before / With updates / Modifications since.
 *
 *   • Before        = `snapshot.beforeContent`
 *   • With updates  = `snapshot.afterContent`
 *   • Modifications = the file's CURRENT content. Read fresh from
 *                     the active filesystem adapter so it reflects
 *                     any edits made since the snapshot was captured.
 *                     If the matching tab is open and dirty, we use
 *                     the in-memory buffer and surface a warning so
 *                     the user knows they're seeing unsaved bytes.
 *
 * Layout: two stacked Monaco DiffEditors —
 *
 *   ┌─ Before ↔ With updates ─────────────┐
 *   │  shows what THIS message changed     │
 *   ├─ With updates ↔ Modifications since ┤
 *   │  shows what's drifted since           │
 *   └──────────────────────────────────────┘
 *
 * This was easier than trying to coerce Monaco into a true 3-way diff
 * (which it doesn't natively support), and the stacked layout maps
 * directly to the user's mental model — "this is what it was, this is
 * what it is, this is what's happened since".
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { AlertTriangle, FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { LegacyDiffChip } from "@/components/diff/LegacyDiffChip";
import { useAppSelector } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { useMonacoTheme } from "./useMonacoTheme";
import { selectSnapshotsForMessage } from "../redux/codeEditHistorySlice";
import { selectCodeTabs } from "../redux/tabsSlice";
import { fileIdentityToTabId } from "../utils/fileIdentity";
import { parseHistoryTripleTabId } from "./historyTripleTab";
import type { EditorFile } from "../types";

interface TripleDiffViewProps {
  tab: EditorFile;
}

export const TripleDiffView: React.FC<TripleDiffViewProps> = ({ tab }) => {
  const isDark = useMonacoTheme();
  const { filesystem } = useCodeWorkspace();

  const parsed = useMemo(() => parseHistoryTripleTabId(tab.id), [tab.id]);
  const messageId = parsed?.messageId ?? tab.historyMessageId ?? null;
  const fileKey = parsed?.fileIdentityKey ?? tab.historyFileIdentityKey ?? null;

  const selectSnapshots = useMemo(
    () => (messageId ? selectSnapshotsForMessage(messageId) : () => []),
    [messageId],
  );
  const snapshots = useAppSelector(selectSnapshots);

  const snapshot = useMemo(() => {
    if (!fileKey) return null;
    for (const s of snapshots) {
      const k = `${s.fileAdapter}:${s.filePath}`;
      if (k === fileKey) return s;
    }
    return null;
  }, [snapshots, fileKey]);

  // "Modifications since" content. Three sources, in order of
  // preference:
  //   1. The matching open tab's buffer (most up-to-date — picks up
  //      uncommitted edits the user is making right now).
  //   2. A fresh `filesystem.readFile()` call on the active adapter.
  //   3. The snapshot's `afterContent` (graceful fallback when the
  //      adapter can't read the file — e.g. the file was deleted).
  const tabsById = useAppSelector((s) => selectCodeTabs(s).byId);
  const matchingTab: EditorFile | null = useMemo(() => {
    if (!snapshot) return null;
    const candidateId = fileIdentityToTabId({
      adapter: snapshot.fileAdapter,
      path: snapshot.filePath,
      libraryFileId: snapshot.libraryFileId,
    });
    return tabsById[candidateId] ?? null;
  }, [snapshot, tabsById]);

  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [diskError, setDiskError] = useState<string | null>(null);
  const lastReadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!snapshot || matchingTab) return undefined;
    // Only re-read when the snapshot or filesystem identity changes.
    const readKey = `${snapshot.fileAdapter}:${snapshot.filePath}@${filesystem.id}`;
    if (lastReadKeyRef.current === readKey) return undefined;
    lastReadKeyRef.current = readKey;

    setDiskContent(null);
    setDiskError(null);

    // Only attempt a fresh read when the snapshot's adapter is the
    // current workspace filesystem; otherwise we'd be reading the
    // wrong bytes.
    if (snapshot.fileAdapter !== filesystem.id) {
      return undefined;
    }
    let cancelled = false;
    filesystem
      .readFile(snapshot.filePath)
      .then((content) => {
        if (cancelled) return;
        setDiskContent(content);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDiskError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot, matchingTab, filesystem]);

  if (!messageId || !fileKey || !snapshot) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-50 p-6 text-sm text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
        <div className="max-w-md text-center">
          <History className="mx-auto h-8 w-8 opacity-40" />
          <p className="mt-2 font-medium">History not available</p>
          <p className="mt-1 text-[12px]">
            The snapshot for this message and file isn't loaded. Try reopening
            the conversation, or wait for the edit-history sync to complete.
          </p>
        </div>
      </div>
    );
  }

  const currentContent =
    matchingTab?.content ?? diskContent ?? snapshot.afterContent;
  const currentLabel = matchingTab
    ? matchingTab.dirty
      ? "Open tab (unsaved)"
      : "Open tab"
    : diskContent !== null
      ? "On disk"
      : "Snapshot fallback";

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-[12px]">
          <History className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-neutral-900 dark:text-neutral-100">
            History · {snapshot.filePath.split("/").pop()}
          </span>
          <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
            msg {snapshot.messageId.slice(0, 8)}
          </span>
          <LegacyDiffChip
            className="ml-auto"
            label="Monaco 3-way"
            reason="3-way inspector bound to editor snapshots + the filesystem adapter; no standalone equivalent in the canonical system yet"
          />
          {matchingTab?.dirty && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" />
              Showing unsaved tab buffer for "Modifications since"
            </span>
          )}
          {diskError && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-900 dark:bg-red-900/40 dark:text-red-200">
              <AlertTriangle className="h-3 w-3" />
              Could not read current file ({diskError})
            </span>
          )}
        </div>
      </div>

      {/* Stacked diff editors */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Before ↔ With updates */}
        <PaneHeader
          left="Before this message"
          right="With this message's updates"
          tone="emerald"
        />
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="100%"
            language={tab.language}
            theme={isDark ? "vs-dark" : "vs"}
            original={snapshot.beforeContent}
            modified={snapshot.afterContent}
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
            }}
          />
        </div>

        {/* With updates ↔ Modifications since */}
        <PaneHeader
          left="With this message's updates"
          right={`Modifications since (${currentLabel})`}
          tone="blue"
        />
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="100%"
            language={tab.language}
            theme={isDark ? "vs-dark" : "vs"}
            original={snapshot.afterContent}
            modified={currentContent}
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
            }}
          />
        </div>
      </div>
    </div>
  );
};

interface PaneHeaderProps {
  left: string;
  right: string;
  tone: "emerald" | "blue";
}

const PaneHeader: React.FC<PaneHeaderProps> = ({ left, right, tone }) => {
  const colour =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : "border-blue-200 bg-blue-50/60 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-y px-3 py-1 text-[11px]",
        colour,
      )}
    >
      <FileText className="h-3 w-3" />
      <span className="font-medium">{left}</span>
      <span className="text-neutral-400 dark:text-neutral-600">↔</span>
      <span className="font-medium">{right}</span>
    </div>
  );
};
