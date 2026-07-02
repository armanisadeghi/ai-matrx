/**
 * features/files/components/surfaces/dropbox/NavSidebarFlatFolders.tsx
 *
 * Dropbox-style flat folder list for the nav sidebar. Renders root-level
 * folders only with a single level of shallow expand. Clicking a folder
 * navigates — the main pane uses the existing `activeFolderId` flow.
 *
 * Keeps the rendering cheap by reading normalized state directly from the
 * slice; no virtualization needed at this depth.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFoldersArray,
  selectChildrenByFolderId,
  selectActiveFolderId,
} from "@/features/files/redux/selectors";
import {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";
import { FolderIconWithMembers } from "./FolderIconWithMembers";

export function NavSidebarFlatFolders() {
  const dispatch = useAppDispatch();
  const foldersArray = useAppSelector(selectAllFoldersArray);
  const childrenByFolderId = useAppSelector(selectChildrenByFolderId);
  const activeFolderId = useAppSelector(selectActiveFolderId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const roots = useMemo(
    () =>
      foldersArray
        .filter((f) => f.parentId === null && !f.deletedAt)
        .sort((a, b) =>
          a.folderName.localeCompare(b.folderName, undefined, {
            sensitivity: "base",
          }),
        ),
    [foldersArray],
  );

  const handleSelect = useCallback(
    (folderId: string) => {
      dispatch(setActiveFolderId(folderId));
      dispatch(setActiveFileId(null));
    },
    [dispatch],
  );

  const handleToggle = useCallback((folderId: string) => {
    setExpanded((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  if (roots.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Folders will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {roots.map((folder) => {
        const children = childrenByFolderId[folder.id];
        const childFolderIds = children?.folderIds ?? [];
        const hasSubfolders = childFolderIds.length > 0;
        const isOpen = expanded[folder.id] === true;
        const isActive = activeFolderId === folder.id;
        const isShared =
          folder.visibility === "shared" || folder.visibility === "public";
        return (
          <li key={folder.id}>
            <DroppableSidebarFolder
              folderId={folder.id}
              folderName={folder.folderName}
              isShared={isShared}
              isActive={isActive}
              isOpen={isOpen}
              hasSubfolders={hasSubfolders}
              onToggle={() => handleToggle(folder.id)}
              onSelect={() => handleSelect(folder.id)}
            />
            {isOpen && hasSubfolders ? (
              <NestedFolderList
                folderIds={childFolderIds}
                activeFolderId={activeFolderId}
                onSelect={handleSelect}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface DroppableSidebarFolderProps {
  folderId: string;
  folderName: string;
  isShared: boolean;
  isActive: boolean;
  isOpen: boolean;
  hasSubfolders: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

/**
 * Sidebar folder row that doubles as a drop target. A file dragged from
 * the FileTable / FileGrid (registered with PageShell's DndContext) can be
 * dropped here to move it into this folder.
 */
function DroppableSidebarFolder({
  folderId,
  folderName,
  isShared,
  isActive,
  isOpen,
  hasSubfolders,
  onToggle,
  onSelect,
}: DroppableSidebarFolderProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `sidebar-folder-${folderId}`,
    data: { type: "folder", id: folderId },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-1 rounded px-1.5 py-1 text-sm",
        isActive
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/60",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
      )}
    >
      <button
        type="button"
        aria-label={isOpen ? "Collapse folder" : "Expand folder"}
        onClick={onToggle}
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded text-muted-foreground",
          !hasSubfolders && "invisible",
        )}
        tabIndex={hasSubfolders ? 0 : -1}
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
      >
        <FolderIconWithMembers
          isShared={isShared}
          open={isOpen || isActive}
          size={16}
        />
        <span className="truncate">{folderName}</span>
      </button>
    </div>
  );
}

interface NestedFolderListProps {
  folderIds: string[];
  activeFolderId: string | null;
  onSelect: (id: string) => void;
}

function NestedFolderList({
  folderIds,
  activeFolderId,
  onSelect,
}: NestedFolderListProps) {
  const foldersById = useAppSelector((s) => s.cloudFiles.foldersById);
  const nested = folderIds
    .map((id) => foldersById[id])
    .filter((f) => f && !f.deletedAt)
    .sort((a, b) =>
      a.folderName.localeCompare(b.folderName, undefined, {
        sensitivity: "base",
      }),
    );

  return (
    <ul className="ml-6 flex flex-col border-l border-border/60 pl-1">
      {nested.map((folder) => {
        if (!folder) return null;
        const isActive = activeFolderId === folder.id;
        const isShared =
          folder.visibility === "shared" || folder.visibility === "public";
        return (
          <li key={folder.id}>
            <DroppableNestedFolder
              folderId={folder.id}
              folderName={folder.folderName}
              isShared={isShared}
              isActive={isActive}
              onSelect={() => onSelect(folder.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface DroppableNestedFolderProps {
  folderId: string;
  folderName: string;
  isShared: boolean;
  isActive: boolean;
  onSelect: () => void;
}

function DroppableNestedFolder({
  folderId,
  folderName,
  isShared,
  isActive,
  onSelect,
}: DroppableNestedFolderProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `sidebar-nested-folder-${folderId}`,
    data: { type: "folder", id: folderId },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 truncate rounded px-1.5 py-1 text-left text-sm",
        isActive
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/60",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
      )}
    >
      <FolderIconWithMembers isShared={isShared} open={isActive} size={14} />
      <span className="truncate">{folderName}</span>
    </button>
  );
}
