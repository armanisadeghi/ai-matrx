"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadCodeFilesList,
  loadCodeFolders,
} from "@/features/code-files/redux/thunks";
import {
  makeSelectFilesInFolder,
  selectCodeFilesListStatus,
  selectCodeFilesListError,
  selectCodeFoldersLoaded,
  selectTopLevelFolders,
} from "@/features/code-files/redux/selectors";
import {
  type CodeFolder,
  type CodeFileRecord,
} from "@/features/code-files/redux/code-files.types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveTabId } from "../../redux/tabsSlice";
import {
  useOpenLibraryFile,
  libraryTabId,
} from "../../hooks/useOpenLibraryFile";
import {
  ACTIVE_ROW,
  HOVER_ROW,
  ROW_HEIGHT,
  TEXT_BODY,
} from "../../styles/tokens";
import { FileIcon } from "../../styles/file-icon";
import { LibraryTreeNode } from "./LibraryTreeNode";
import { listLibrarySources } from "../../library-sources/registry";
import { SourceFolderNode } from "./SourceFolderNode";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";

const selectRootFiles = makeSelectFilesInFolder(null);

/**
 * Tree view backed by the `code_files` + `code_folders` Redux slice. Shows
 * top-level folders (recursive) followed by any unfiled files at the root.
 */
export const LibraryTree: React.FC<{ refreshKey?: number }> = ({
  refreshKey = 0,
}) => {
  const dispatch = useAppDispatch();
  const listStatus = useAppSelector(selectCodeFilesListStatus);
  const foldersLoaded = useAppSelector(selectCodeFoldersLoaded);
  const listError = useAppSelector(selectCodeFilesListError);
  const topFolders = useAppSelector(selectTopLevelFolders);
  const rootFiles = useAppSelector(selectRootFiles);
  const activeTabId = useAppSelector(selectActiveTabId);
  const openFile = useOpenLibraryFile();
  const { focusedLibrarySourceId } = useCodeWorkspace();

  // Auto-load only on the `idle` transition. We deliberately do NOT
  // auto-retry on `error` here — without that guard, the slice's
  // status oscillates `error → loading → error → ...` (because each
  // failed dispatch sets `loading`, which re-runs this effect, which
  // re-dispatches), pinning the main thread and crashing the tab.
  // The error UI below renders a manual Retry button instead.
  // `refreshKey` (bumped by the panel's Refresh button) forces a
  // re-load by bypassing the effect's natural deduping.
  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    const forced = refreshKey !== lastRefreshKeyRef.current;
    lastRefreshKeyRef.current = refreshKey;
    if (listStatus === "idle" || forced) {
      dispatch(loadCodeFilesList());
    }
    if (!foldersLoaded || forced) {
      dispatch(loadCodeFolders());
    }
  }, [dispatch, listStatus, foldersLoaded, refreshKey]);

  if (
    listStatus === "loading" &&
    topFolders.length === 0 &&
    rootFiles.length === 0
  ) {
    return (
      <div className="px-3 py-1 text-[11px] text-neutral-500">Loading…</div>
    );
  }

  if (listError) {
    return (
      <div className="flex flex-col gap-1 px-3 py-2 text-[11px]">
        <span className="text-red-500">Failed to load library</span>
        <span className="text-neutral-500">{listError}</span>
        <button
          type="button"
          className="self-start rounded-sm bg-neutral-200 px-2 py-0.5 font-medium text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          onClick={() => dispatch(loadCodeFilesList())}
        >
          Retry
        </button>
      </div>
    );
  }

  const empty = topFolders.length === 0 && rootFiles.length === 0;
  const sources = listLibrarySources();

  return (
    <div
      role="tree"
      aria-label="Code library"
      className="flex-1 overflow-y-auto py-1"
    >
      {/* Root: user's own saved files (code_files table). Kept as a
          collapsible root so it sits visually alongside the source
          adapters below and can be stashed when the user isn't using it.
          Auto-collapsed when the host has focused the tree on a specific
          library source. */}
      <MyFilesRoot
        depth={0}
        empty={empty}
        topFolders={topFolders}
        rootFiles={rootFiles}
        activeTabId={activeTabId ?? null}
        openFile={openFile}
        defaultExpanded={!focusedLibrarySourceId}
      />

      {/* Adapter-backed source roots. Each one is lazy — entries are
          fetched when the user expands it, so the Library panel stays
          cheap to open. The focused source (if any) auto-loads on first
          mount; the rest stay collapsed. */}
      {sources.map((adapter) => (
        <SourceFolderNode
          key={adapter.sourceId}
          adapter={adapter}
          depth={0}
          autoLoad={adapter.sourceId === focusedLibrarySourceId}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// "My Files" root — wraps the existing code_files tree so it sits as a
// peer of the registered source folders instead of fighting for space at
// the top level.
// ---------------------------------------------------------------------------

interface MyFilesRootProps {
  depth: number;
  empty: boolean;
  topFolders: readonly CodeFolder[];
  rootFiles: readonly CodeFileRecord[];
  activeTabId: string | null;
  openFile: (codeFileId: string) => void;
  defaultExpanded?: boolean;
}

const MyFilesRoot: React.FC<MyFilesRootProps> = ({
  depth,
  empty,
  topFolders,
  rootFiles,
  activeTabId,
  openFile,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => setExpanded((e) => !e);

  return (
    <div className="select-none">
      <div
        role="treeitem"
        aria-expanded={expanded}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn(
          "flex items-center gap-1 text-[13px] cursor-pointer rounded-sm",
          ROW_HEIGHT,
          TEXT_BODY,
          HOVER_ROW,
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        title="Files you've saved or captured"
      >
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 text-neutral-500 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <FolderHeart size={14} className="shrink-0 text-emerald-500" />
        <span className="truncate">My Files</span>
      </div>

      {expanded && (
        <div role="group">
          {empty && (
            <div
              className="py-2 text-[11px] text-neutral-500"
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
            >
              <p>No saved code yet.</p>
              <p className="mt-1">
                Save code blocks from chat or HTML pages to see them here.
              </p>
            </div>
          )}

          {topFolders.map((folder) => (
            <LibraryTreeNode
              key={folder.id}
              folder={folder}
              depth={depth + 1}
              onOpenFile={openFile}
              activeTabId={activeTabId}
            />
          ))}

          {rootFiles.map((file) => {
            const tabId = libraryTabId(file.id);
            const active = activeTabId === tabId;
            return (
              <div
                key={file.id}
                role="treeitem"
                aria-selected={active}
                tabIndex={0}
                onClick={() => openFile(file.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openFile(file.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1 text-[13px] cursor-pointer rounded-sm",
                  ROW_HEIGHT,
                  TEXT_BODY,
                  HOVER_ROW,
                  active && ACTIVE_ROW,
                )}
                style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                title={file.path ?? file.name}
              >
                <span className="inline-block w-3" />
                <FileIcon name={file.name} kind="file" />
                <span className="truncate">{file.name}</span>
                {file._dirty && (
                  <span
                    className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500"
                    aria-label="Unsaved changes"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
