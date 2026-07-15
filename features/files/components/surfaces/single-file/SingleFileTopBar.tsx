/**
 * features/files/components/surfaces/single-file/SingleFileTopBar.tsx
 *
 * Route header for the dedicated `/files/f/{fileId}` shell — injected into
 * the shell's glass header center zone via `RouteHeader`, not rendered as an
 * in-body bar. Three regions:
 *
 *   left   — Back to /files, then folder breadcrumb (with last segment
 *            being the file's parent folder, not the file itself)
 *   center — File icon + filename (with lineage chip for real files) —
 *            the bounded `1fr` cell so long names truncate instead of
 *            pushing the actions off-screen.
 *   right  — Show files (sheet drawer), Download, Copy link, More menu,
 *            Open in new tab
 *
 * Desktop-only: `SingleFileShell` renders `MobileStack` on mobile instead,
 * so this component never needs a phone-width fallback.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FolderTree,
  Home,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfSurfaceSwitcher } from "@/features/pdf/components/PdfSurfaceSwitcher";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectFileById,
  selectAllFoldersMap,
} from "@/features/files/redux/selectors";
import { getFolderAncestors } from "@/features/files/redux/tree-utils";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { FileLineageChip } from "../FileLineageChip";
import { encodeFolderPathSegments } from "@/features/files/utils/url-state";
import { NavSidebar } from "../desktop/NavSidebar";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";

export interface SingleFileTopBarProps {
  fileId: string;
  className?: string;
}

export function SingleFileTopBar({ fileId, className }: SingleFileTopBarProps) {
  const router = useRouter();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const foldersById = useAppSelector(selectAllFoldersMap);
  const actions = useFileActions(fileId);

  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Breadcrumb segments — Home → ancestors → (no leaf, the file name lives
  // in the center region). Clicking any segment navigates to that folder
  // route, which closes the single-file experience and drops the user on
  // the standard list view.
  const ancestors = useMemo(() => {
    if (!file || file.source.kind !== "real" || !file.parentFolderId) {
      return [] as ReturnType<typeof getFolderAncestors>;
    }
    return getFolderAncestors(foldersById, file.parentFolderId);
  }, [file, foldersById]);

  // Build hrefs from `folderPath` (already slash-joined by the DB) rather
  // than rebuilding from `folderName` segments, since folder names can
  // contain slashes/encoded characters that the path field already handles
  // correctly. encodeFolderPathSegments wraps each segment in
  // encodeURIComponent + rejoins.
  const ancestorHrefs = useMemo(() => {
    return ancestors.map((folder) => {
      const encoded = encodeFolderPathSegments(folder.folderPath);
      return encoded.length > 0 ? `/files/all/${encoded}` : "/files/all";
    });
  }, [ancestors]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await actions.download();
    } finally {
      setDownloading(false);
    }
  }, [actions, downloading]);

  const handleCopyLink = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const url = await actions.copyShareUrl();
      if (url) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } finally {
      setCopying(false);
    }
  }, [actions, copying]);

  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            onClick={() => router.push("/files/all")}
            ariaLabel="Back to all files"
          />
          {/* Breadcrumb — Home → ancestor folders. Truncates with "…" when long. */}
          <nav
            aria-label="Folder path"
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground px-1"
          >
            <Link
              href="/files/all"
              className="inline-flex items-center rounded p-1 hover:bg-accent hover:text-foreground"
              title="Home"
            >
              <Home className="h-3 w-3" aria-hidden="true" />
            </Link>
            {ancestors.length > 3 ? (
              <>
                <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="px-1 text-muted-foreground/60">…</span>
                {ancestors.slice(-2).map((folder, idx) => {
                  const realIdx = ancestors.length - 2 + idx;
                  return (
                    <BreadcrumbSegment
                      key={folder.id}
                      href={ancestorHrefs[realIdx]}
                      label={folder.folderName}
                    />
                  );
                })}
              </>
            ) : (
              ancestors.map((folder, idx) => (
                <BreadcrumbSegment
                  key={folder.id}
                  href={ancestorHrefs[idx]}
                  label={folder.folderName}
                />
              ))
            )}
          </nav>
        </>
      }
      center={
        /* File name + lineage — the bounded 1fr cell, so long names
         * truncate instead of pushing the actions off-screen. The
         * right-click menu wraps it so a right-click anywhere here gives
         * the full action set. */
        <FileRightClickMenu fileId={fileId}>
          <div className="flex min-w-0 items-center gap-2 px-2">
            {file ? (
              <FileIcon fileName={file.fileName} size={16} className="shrink-0" />
            ) : null}
            <span
              className="truncate text-sm font-medium text-foreground"
              title={file?.fileName ?? ""}
            >
              {file?.fileName ?? "Loading…"}
            </span>
            {file?.source.kind === "real" ? (
              <FileLineageChip fileId={fileId} className="shrink-0" />
            ) : null}
          </div>
        </FileRightClickMenu>
      }
      right={
        <div className={cn("flex items-center", className)}>
          {file?.mimeType === "application/pdf" && (
            <PdfSurfaceSwitcher
              current="file-viewer"
              fileId={fileId}
              size="sm"
              className="mr-1"
            />
          )}
          {/* Show files — opens NavSidebar in a slide-out Sheet so the user
           * can hop between files without leaving the single-file shell. */}
          <TapTargetButton
            icon={<FolderTree className="h-4 w-4" />}
            ariaLabel="Show all files"
            onClick={() => setShowFiles(true)}
          />
          <MatrxDynamicPanelHost
            open={showFiles}
            onOpenChange={setShowFiles}
            title="All files"
            expandButtonLabel="All files"
            position="left"
            defaultSize={22}
            maxSize={40}
            contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
          >
            <div className="min-h-0 flex-1 overflow-hidden">
              <NavSidebar section="all" />
            </div>
          </MatrxDynamicPanelHost>

          <TapTargetButton
            icon={
              copying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
            ariaLabel="Copy share link"
            onClick={handleCopyLink}
            disabled={!file || copying}
          />
          <TapTargetButton
            icon={
              downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )
            }
            ariaLabel="Download"
            onClick={handleDownload}
            disabled={!file || downloading}
          />
          <TapTargetButton
            icon={<ExternalLink className="h-4 w-4" />}
            ariaLabel="Open in new tab"
            href={`/files/f/${fileId}`}
            target="_blank"
          />
          <Tooltip>
            <FileContextMenu fileId={fileId}>
              <TooltipTrigger asChild>
                <span>
                  <TapTargetButton
                    icon={<MoreHorizontal className="h-4 w-4" />}
                    ariaLabel="More actions"
                    disabled={!file}
                    tooltip={false}
                  />
                </span>
              </TooltipTrigger>
            </FileContextMenu>
            <TooltipContent side="bottom" sideOffset={6}>
              More actions
            </TooltipContent>
          </Tooltip>
        </div>
      }
    />
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function BreadcrumbSegment({ href, label }: { href: string; label: string }) {
  return (
    <>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      <Link
        href={href}
        className="max-w-[120px] truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
        title={label}
      >
        {label}
      </Link>
    </>
  );
}

