"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  Copy as CopyIcon,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";
import {
  makeSelectChildFolders,
  makeSelectFilesInFolder,
} from "@/features/code-files/redux/selectors";
import {
  type CodeFileRecord,
  type CodeFolder,
} from "@/features/code-files/redux/code-files.types";
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
  parentPath: string;
  onOpenFile: (codeFileId: string) => void;
  activeTabId: string | null;
  onCreateFile: (folderId: string | null, label: string) => void;
  actions: LibraryTreeActions;
}

export type LibraryActionTarget =
  | { kind: "file"; item: CodeFileRecord; path: string }
  | { kind: "folder"; item: CodeFolder; path: string };

export interface LibraryTreeActions {
  onCreateFolder: (parentFolderId: string | null, label: string) => void;
  onRename: (target: LibraryActionTarget) => void;
  onDelete: (target: LibraryActionTarget) => void;
  onProperties: (target: LibraryActionTarget) => void;
  onCopyPath: (path: string) => void;
  onRefresh: () => void;
}

interface PersistedLibraryFileRowProps {
  file: CodeFileRecord;
  depth: number;
  parentPath: string;
  activeTabId: string | null;
  onOpenFile: (codeFileId: string) => void;
  actions: LibraryTreeActions;
}

/** One canonical row/menu for persisted files, whether root-level or nested. */
export const PersistedLibraryFileRow: React.FC<
  PersistedLibraryFileRowProps
> = ({ file, depth, parentPath, activeTabId, onOpenFile, actions }) => {
  const tabId = libraryTabId(file.id);
  const active = activeTabId === tabId;
  const path = file.path ?? `${parentPath}/${file.name}`;
  const target: LibraryActionTarget = { kind: "file", item: file, path };
  const fileMenuSections: ContextMenuExtraSection[] = [
    {
      id: "library-file-actions",
      anchor: "after-clipboard",
      items: [
        {
          kind: "item",
          id: "library-file-open",
          label: "Open",
          onSelect: () => onOpenFile(file.id),
        },
        {
          kind: "item",
          id: "library-file-properties",
          label: "Properties…",
          icon: Info,
          onSelect: () => actions.onProperties(target),
        },
        { kind: "separator", id: "library-file-sep-1" },
        {
          kind: "item",
          id: "library-file-rename",
          label: "Rename",
          icon: Pencil,
          disabled: file.is_readonly,
          onSelect: () => actions.onRename(target),
        },
        {
          kind: "item",
          id: "library-file-delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          disabled: file.is_readonly,
          onSelect: () => actions.onDelete(target),
        },
        { kind: "separator", id: "library-file-sep-2" },
        {
          kind: "item",
          id: "library-file-copy-path",
          label: "Copy path",
          icon: CopyIcon,
          onSelect: () => actions.onCopyPath(path),
        },
        {
          kind: "item",
          id: "library-file-refresh",
          label: "Refresh",
          icon: RefreshCw,
          onSelect: actions.onRefresh,
        },
      ],
    },
  ];

  return (
    <NonEditableContextMenu
      sourceFeature="code-editor"
      contextData={{ content: path }}
      contentSource={{ type: "raw" }}
      entity={{ type: "code_file", id: file.id, title: file.name }}
      extraSections={fileMenuSections}
      enableFloatingIcon={false}
    >
      <div
        role="treeitem"
        aria-selected={active}
        tabIndex={0}
        onClick={() => onOpenFile(file.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenFile(file.id);
          }
        }}
        className={cn(
          "flex items-center gap-1 text-[13px] cursor-pointer rounded-sm",
          ROW_HEIGHT,
          "max-lg:h-11",
          TEXT_BODY,
          HOVER_ROW,
          active && ACTIVE_ROW,
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={path}
      >
        <span className="inline-block w-3" />
        <FileIcon name={file.name} kind="file" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        {file._dirty && (
          <span
            className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500"
            aria-label="Unsaved changes"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 w-11 shrink-0 rounded-sm p-0 lg:hidden"
          aria-label={`Actions for ${file.name}`}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            openContextMenuForElement(event.currentTarget.parentElement);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </NonEditableContextMenu>
  );
};

/**
 * Recursive tree node for a `code_folders` row. Renders the folder header and,
 * when expanded, its nested subfolders and files (unfiled files are handled
 * separately at the root level).
 */
export const LibraryTreeNode: React.FC<LibraryTreeNodeProps> = ({
  folder,
  depth,
  parentPath,
  onOpenFile,
  activeTabId,
  onCreateFile,
  actions,
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
  const path = `${parentPath}/${folder.name}`;
  const target: LibraryActionTarget = { kind: "folder", item: folder, path };

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
        {
          kind: "item",
          id: "library-folder-new-folder",
          label: "New folder",
          icon: FolderPlus,
          onSelect: () => actions.onCreateFolder(folder.id, folder.name),
        },
        {
          kind: "item",
          id: "library-folder-properties",
          label: "Properties…",
          icon: Info,
          onSelect: () => actions.onProperties(target),
        },
        { kind: "separator", id: "library-folder-sep-1" },
        {
          kind: "item",
          id: "library-folder-rename",
          label: "Rename",
          icon: Pencil,
          onSelect: () => actions.onRename(target),
        },
        {
          kind: "item",
          id: "library-folder-delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: () => actions.onDelete(target),
        },
        { kind: "separator", id: "library-folder-sep-2" },
        {
          kind: "item",
          id: "library-folder-copy-path",
          label: "Copy path",
          icon: CopyIcon,
          onSelect: () => actions.onCopyPath(path),
        },
        {
          kind: "item",
          id: "library-folder-refresh",
          label: "Refresh",
          icon: RefreshCw,
          onSelect: actions.onRefresh,
        },
      ],
    },
  ];

  return (
    <div className="select-none">
      <NonEditableContextMenu
        sourceFeature="code-editor"
        contextData={{ content: folder.description ?? folder.name }}
        contentSource={{ type: "raw" }}
        entity={{
          type: "code_folder",
          id: folder.id,
          title: folder.name,
        }}
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
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
          className={cn(
            "flex items-center gap-1 text-[13px] cursor-pointer rounded-sm",
            ROW_HEIGHT,
            "max-lg:h-11",
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
          <EntityRef
            token="code_folder"
            id={folder.id}
            name={folder.name}
            showIcon={false}
            fill
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 shrink-0 rounded-sm p-0 lg:hidden"
            aria-label={`Actions for ${folder.name}`}
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              openContextMenuForElement(event.currentTarget.parentElement);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </NonEditableContextMenu>

      {expanded && (
        <div role="group">
          {childFolders.map((child) => (
            <LibraryTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              parentPath={path}
              onOpenFile={onOpenFile}
              activeTabId={activeTabId}
              onCreateFile={onCreateFile}
              actions={actions}
            />
          ))}
          {files.map((file) => (
            <PersistedLibraryFileRow
              key={file.id}
              file={file}
              depth={depth + 1}
              parentPath={path}
              activeTabId={activeTabId}
              onOpenFile={onOpenFile}
              actions={actions}
            />
          ))}
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
