/**
 * features/files/components/surfaces/dropbox/NavSidebar.tsx
 *
 * Secondary sidebar — the "Home" column in the Dropbox shell. Contains:
 *   - Primary sections (Home, Recents, Photos, Shared, File requests, Deleted files)
 *   - Quick access (Starred placeholder + "Drag important items here" hint)
 *   - Folder list in either flat (default) or tree mode, toggled via
 *     `SidebarModeToggle`.
 *
 * Renders inside a resizable panel so users can drag to widen.
 */

"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";
import { selectAllFoldersMap } from "@/features/files/redux/selectors";
import { encodeFolderPathSegments } from "@/features/files/utils/url-state";
import { FileTree } from "@/features/files/components/core/FileTree/FileTree";
import { NavSidebarFlatFolders } from "./NavSidebarFlatFolders";
import { SidebarModeToggle, useSidebarMode } from "./SidebarModeToggle";
import { StorageQuotaChip } from "./StorageQuotaChip";
import { PRIMARY_SECTIONS } from "./section";
import type { CloudFilesSection } from "./section";

export interface NavSidebarProps {
  section: CloudFilesSection;
}

export function NavSidebar({ section }: NavSidebarProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { mode } = useSidebarMode();
  const foldersById = useAppSelector(selectAllFoldersMap);

  // Sections that filter the file list independently of activeFolderId
  // (Starred/Recents/Shared/Trash/Photos/Requests). When the user picks a
  // folder in the tree while on one of these, the file list still shows the
  // section's filtered set — so the picked folder appears empty. Detect that
  // case and navigate back to the root section so the folder selection
  // actually drives the page.
  const FILTERED_SECTIONS: CloudFilesSection[] = [
    "starred",
    "recents",
    "shared",
    "trash",
    "photos",
    "requests",
    "activity",
  ];
  const isFilteredSection = FILTERED_SECTIONS.includes(section);

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      dispatch(setActiveFolderId(folderId));
      dispatch(setActiveFileId(null));
      // Always navigate to the canonical /files/<path> URL when a folder
      // is picked from the sidebar. Two reasons:
      //   1. Filtered sections (Recents/Photos/…) wouldn't render the
      //      picked folder anyway — sending the user to the "all" surface
      //      makes the click do something visible.
      //   2. Even on the "all" section we want the URL to reflect the new
      //      folder so reload + sharing work.
      // Virtual folders (Notes adapter, etc.) don't have a stable folder
      // path that the catch-all route can resolve, so they keep the
      // existing behaviour: Redux-only update + bare /files for filtered
      // sections.
      const folder = foldersById[folderId];
      if (folder?.source.kind === "real") {
        const segments = encodeFolderPathSegments(folder.folderPath);
        router.push(segments ? `/files/${segments}` : "/files");
        return;
      }
      if (isFilteredSection) router.push("/files");
    },
    [dispatch, foldersById, isFilteredSection, router],
  );

  const handleSelectFile = useCallback(
    (fileId: string) => {
      dispatch(setActiveFileId(fileId));
      if (isFilteredSection) router.push("/files");
    },
    [dispatch, isFilteredSection, router],
  );

  return (
    <aside
      aria-label="Cloud files secondary"
      className="flex h-full flex-col overflow-hidden bg-muted/30"
    >
      <div className="flex items-center justify-between px-3 pb-2 pt-3 shrink-0">
        <h2 className="text-base font-semibold tracking-tight">Home</h2>
        <SidebarModeToggle />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Primary sections */}
        <nav aria-label="Cloud files sections" className="px-2">
          <ul className="flex flex-col gap-0.5">
            {PRIMARY_SECTIONS.map((item) => {
              const active = section === item.key;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground/80 hover:bg-accent/60",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-3 border-t pt-3 px-2">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick access
            </span>
            <button
              type="button"
              aria-label="Add to Quick access"
              title="Coming soon"
              disabled
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <QuickAccessGroup
            label="Starred"
            href="/files/starred"
            active={section === "starred"}
          >
            <Star className="h-3.5 w-3.5" aria-hidden="true" />
          </QuickAccessGroup>

          <p className="mt-2 px-2 text-[11px] text-muted-foreground">
            Drag important items here.
          </p>
        </div>

        {/* Folders section */}
        <div className="mt-3 border-t pt-3 px-2 pb-4">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Folders
            </span>
          </div>
          {mode === "flat" ? (
            <NavSidebarFlatFolders />
          ) : (
            <div className="h-[50dvh] min-h-[320px]">
              <FileTree
                onSelectFile={handleSelectFile}
                onSelectFolder={handleSelectFolder}
                onActivateFolder={handleSelectFolder}
                onActivateFile={handleSelectFile}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Storage usage chip — pinned at the bottom of the sidebar like
          Dropbox / Drive. Renders nothing when unauthenticated or before
          first fetch, so layout is stable. */}
      <div className="shrink-0 border-t px-2.5 py-2">
        <StorageQuotaChip />
      </div>
    </aside>
  );
}

interface QuickAccessGroupProps {
  label: string;
  href: string;
  active?: boolean;
  children: React.ReactNode;
}

function QuickAccessGroup({
  label,
  href,
  active,
  children,
}: QuickAccessGroupProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-foreground/80 hover:bg-accent/60",
      )}
    >
      <ChevronDown
        className={cn(
          "h-3 w-3",
          active ? "text-primary" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      {children}
      <span className="truncate">{label}</span>
    </Link>
  );
}
