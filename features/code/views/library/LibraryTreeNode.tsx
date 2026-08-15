"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FilePlus, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import {
  makeSelectChildFolders,
  makeSelectFilesInFolder,
} from "@/features/code-files/redux/selectors";
import { type CodeFolder } from "@/features/code-files/redux/code-files.types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  collapseLibraryFolder,
  selectFocusedFolderId,
  selectFolderForcedExpanded,
} from "../../redux/codeWorkspaceSlice";
import { FileIcon } from "../../styles/file-icon";
import {
  ACTIVE_ROW,
  HOVER_ROW,
  ROW_HEIGHT,
  TEXT_BODY,
} from "../../styles/tokens";
import { libraryTabId } from "../../hooks/useOpenLibraryFile";

interface LibraryTreeNodeProps {
  folder: CodeFolder;
  depth: number;
  onOpenFile: (codeFileId: string) => void;
  activeTabId: string | null;
  onCreateFile: (folderId: string | null, label: string) => void;
}

/**
 * Recursive tree node for a `code_folders` row. Renders the folder header and,
 * when expanded, its nested subfolders and files (unfiled files are handled
 * separately at the root level).
 */
export const LibraryTreeNode: React.FC<LibraryTreeNodeProps> = ({
  folder,
  depth,
  onOpenFile,
  activeTabId,
  onCreateFile,
}) => {
  const dispatch = useAppDispatch();
  const [locallyExpanded, setLocallyExpanded] = useState(depth === 0);

  // `?folder=<id>` forces this node's whole ancestor chain open and highlights
  // the target row. The forced flag wins over the node's own toggle until the
  // user collapses it by hand, which drops the flag (see `toggle` below) so
  // the chevron never feels stuck.
  const forcedExpanded = useAppSelector((state) =>
    selectFolderForcedExpanded(state, folder.id),
  );
  const focused = useAppSelector(selectFocusedFolderId) === folder.id;
  const expanded = locallyExpanded || forcedExpanded;
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focused]);

  const selectChildFolders = useMemo(
    () => makeSelectChildFolders(folder.id),
    [folder.id],
  );
  const selectFilesInFolder = useMemo(
    () => makeSelectFilesInFolder(folder.id),
    [folder.id],
  );
  const childFolders = useAppSelector(selectChildFolders);
  const files = useAppSelector(selectFilesInFolder);

  const hasChildren = childFolders.length > 0 || files.length > 0;

  const toggle = useCallback(() => {
    if (expanded) {
      setLocallyExpanded(false);
      // Drop the deep link's forced-open flag too, or the branch would refuse
      // to collapse and the chevron would look broken.
      if (forcedExpanded) dispatch(collapseLibraryFolder(folder.id));
    } else {
      setLocallyExpanded(true);
    }
  }, [expanded, forcedExpanded, dispatch, folder.id]);
  const folderMenuSections: ContextMenuExtraSection[] = [
    {
      id: "library-folder-actions",
      anchor: "after-clipboard",
      items: [
        {
          kind: "item",
          id: "library-folder-new-file",
          label: "New file",
          icon: FilePlus,
          onSelect: () => onCreateFile(folder.id, folder.name),
        },
      ],
    },
  ];

  return (
    <div className="select-none">
      <NonEditableContextMenu
        sourceFeature="code-editor"
        contextData={{ content: folder.name }}
        extraSections={folderMenuSections}
        enableFloatingIcon={false}
      >
        <div
          ref={rowRef}
          role="treeitem"
          aria-expanded={expanded}
          aria-selected={focused}
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
            focused && ACTIVE_ROW,
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
          title={folder.description ?? folder.name}
        >
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-neutral-500 transition-transform",
              expanded && "rotate-90",
              !hasChildren && "opacity-30",
            )}
          />
          {expanded ? (
            <FolderOpen size={14} className="shrink-0 text-blue-500" />
          ) : (
            <Folder size={14} className="shrink-0 text-blue-500" />
          )}
          <span className="truncate">{folder.name}</span>
        </div>
      </NonEditableContextMenu>

      {expanded && (
        <div role="group">
          {childFolders.map((child) => (
            <LibraryTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              activeTabId={activeTabId}
              onCreateFile={onCreateFile}
            />
          ))}
          {files.map((file) => {
            const tabId = libraryTabId(file.id);
            const active = activeTabId === tabId;
            return (
              <div
                key={file.id}
                role="treeitem"
                aria-selected={active}
                tabIndex={0}
                onClick={() => onOpenFile(file.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenFile(file.id);
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
          {!hasChildren && (
            <div
              className="text-[11px] text-neutral-500"
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
};
