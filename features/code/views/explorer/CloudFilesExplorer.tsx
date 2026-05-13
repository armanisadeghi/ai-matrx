"use client";

/**
 * features/code/views/explorer/CloudFilesExplorer.tsx
 *
 * Renders the user's actual cloud files (`cld_files` / `cld_folders`) inside
 * the code workspace Explorer side panel — same data and same FileTree
 * component used by `/files` and the floating CloudFiles window.
 *
 * Why this exists:
 *   • The "Library" activity already shows saved code snippets (`code_files`).
 *     The Explorer should show the user's *real* files (images, PDFs,
 *     videos, audio, datasets, …) so previews and uploads stay one click
 *     away no matter which sandbox / agent the user is in.
 *   • By reusing `features/files/.../FileTree` we get virtualization,
 *     keyboard nav, drag-and-drop moves, and consistent UX for free.
 *   • Selecting a file (single-click or Enter) opens it as a regular
 *     editor tab via `useOpenCloudFile`. The tab uses the
 *     `cloud-file-preview` kind, which renders the canonical
 *     `<FilePreview>` (image/video/pdf/markdown/code) inside the
 *     editor area — same UX as opening sandbox files. This matches the
 *     sandbox FileTree's single-click-to-open behaviour so users don't
 *     have to learn two different interaction models.
 *
 * Cloud-files realtime is mounted globally in `app/Providers.tsx`, so this
 * component just reads from the live Redux tree — no per-mount provider
 * needed (Phase 0 of the file-handling consolidation).
 */

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  FileTree,
  setActiveFileId,
  setActiveFolderId,
  selectTreeStatus,
} from "@/features/files";
import { useOpenCloudFile } from "../../hooks/useOpenCloudFile";

interface CloudFilesExplorerProps {
  className?: string;
}

export function CloudFilesExplorer({ className }: CloudFilesExplorerProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.userAuth?.id ?? null);
  const openCloudFile = useOpenCloudFile();

  // Single-click on a file → open as an editor tab AND mark it
  // selected. This mirrors the sandbox FileTree where a click opens
  // the file. Activation (double-click / Enter) is the same action,
  // so the second handler just routes back through `openCloudFile`,
  // which short-circuits when the tab already exists.
  const handleSelectFile = useCallback(
    (fileId: string) => {
      dispatch(setActiveFileId(fileId));
      openCloudFile(fileId);
    },
    [dispatch, openCloudFile],
  );

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      dispatch(setActiveFolderId(folderId));
      dispatch(setActiveFileId(null));
    },
    [dispatch],
  );

  const handleActivateFile = useCallback(
    (fileId: string) => {
      openCloudFile(fileId);
    },
    [openCloudFile],
  );

  // Folder activation is already handled by the tree's expand/collapse —
  // we still set the active folder so any consumer that cares (e.g.,
  // breadcrumbs) stays in sync.
  const handleActivateFolder = useCallback(
    (folderId: string) => {
      dispatch(setActiveFolderId(folderId));
    },
    [dispatch],
  );

  if (!userId) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3 text-[11px] text-neutral-500">
        Sign in to see your cloud files.
      </div>
    );
  }

  return (
    <CloudFilesExplorerBody
      className={className}
      onSelectFile={handleSelectFile}
      onSelectFolder={handleSelectFolder}
      onActivateFile={handleActivateFile}
      onActivateFolder={handleActivateFolder}
    />
  );
}

interface CloudFilesExplorerBodyProps {
  className?: string;
  onSelectFile: (fileId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onActivateFile: (fileId: string) => void;
  onActivateFolder: (folderId: string) => void;
}

function CloudFilesExplorerBody({
  className,
  onSelectFile,
  onSelectFolder,
  onActivateFile,
  onActivateFolder,
}: CloudFilesExplorerBodyProps) {
  const treeStatus = useAppSelector(selectTreeStatus);

  // First-load skeleton — avoids a "No cloud files yet" flash before
  // the initial RPC resolves. Subsequent fetches keep the previous tree
  // visible (no flash).
  if (treeStatus === "idle" || treeStatus === "loading") {
    return (
      <div className="flex flex-col gap-1.5 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/60"
            style={{ width: `${50 + ((i * 13) % 40)}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <FileTree
      className={className}
      onSelectFile={onSelectFile}
      onSelectFolder={onSelectFolder}
      onActivateFile={onActivateFile}
      onActivateFolder={onActivateFolder}
      emptyState={
        <div className="px-3 text-center text-[11px] leading-relaxed">
          <div className="font-medium text-neutral-700 dark:text-neutral-300">
            No cloud files yet
          </div>
          <div className="mt-1 text-neutral-500">
            Upload files from the Cloud Files page or any chat input to see them
            here.
          </div>
        </div>
      }
    />
  );
}
