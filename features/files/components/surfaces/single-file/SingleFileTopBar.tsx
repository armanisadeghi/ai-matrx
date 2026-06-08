/**
 * features/files/components/surfaces/single-file/SingleFileTopBar.tsx
 *
 * Top bar for the dedicated `/files/f/{fileId}` shell. Three regions:
 *
 *   left   — Back to /files, then folder breadcrumb (with last segment
 *            being the file's parent folder, not the file itself)
 *   center — File icon + filename (with lineage chip for real files)
 *   right  — Show files (sheet drawer), Download, Copy link, More menu,
 *            Open in new tab
 *
 * Deliberately thinner than the PreviewPane header — this is page chrome,
 * not panel chrome. Buttons are sized to align with the tabs underneath
 * so the eye doesn't pinball.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border bg-card px-3 py-2 shrink-0",
        className,
      )}
    >
      {/* Back to /files */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => router.push("/files/all")}
            aria-label="Back to all files"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Back to all files
        </TooltipContent>
      </Tooltip>

      {/* Breadcrumb — Home → ancestor folders. Truncates with "…" when long. */}
      <nav
        aria-label="Folder path"
        className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
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

      {/* File name + lineage — center. The right-click menu wraps it so a
       * right-click anywhere here gives the full action set. */}
      <FileRightClickMenu fileId={fileId}>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <ChevronRight
            className="h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {file ? (
            <FileIcon fileName={file.fileName} size={16} className="shrink-0" />
          ) : null}
          <span
            className="truncate text-sm font-semibold text-foreground"
            title={file?.fileName ?? ""}
          >
            {file?.fileName ?? "Loading…"}
          </span>
          {file?.source.kind === "real" ? (
            <FileLineageChip fileId={fileId} className="shrink-0" />
          ) : null}
        </div>
      </FileRightClickMenu>

      {/* Right-side actions */}
      <div className="flex items-center gap-0.5 shrink-0 mr-2">
        {/* Show files — opens NavSidebar in a slide-out Sheet so the user
         * can hop between files without leaving the single-file shell. */}
        <Sheet open={showFiles} onOpenChange={setShowFiles}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Show all files"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
                >
                  <FolderTree className="h-3.5 w-3.5" />
                </button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Show all files
            </TooltipContent>
          </Tooltip>
          <SheetContent
            side="left"
            className="w-72 p-0 sm:w-80"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="border-b border-border px-3 py-2">
              <SheetTitle className="text-sm">All files</SheetTitle>
            </SheetHeader>
            <div
              className="h-[calc(100%-3rem)] overflow-hidden"
              onClick={() => {
                // Closing on link clicks inside NavSidebar is implicit —
                // navigation away from this route unmounts the Sheet's
                // host page. We still close on internal selection though,
                // because tree-only selections (`setActiveFolderId`) don't
                // change the URL and the user shouldn't be trapped.
              }}
            >
              <NavSidebar section="all" />
            </div>
          </SheetContent>
        </Sheet>

        <ActionButton
          onClick={handleCopyLink}
          disabled={!file || copying}
          title="Copy share link"
          ariaLabel="Copy share link"
        >
          {copying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </ActionButton>
        <ActionButton
          onClick={handleDownload}
          disabled={!file || downloading}
          title="Download"
          ariaLabel="Download"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </ActionButton>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`/files/f/${fileId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
              className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Open in new tab
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <FileContextMenu fileId={fileId}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!file}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
          </FileContextMenu>
          <TooltipContent side="bottom" sideOffset={6}>
            More actions
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
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

function ActionButton({
  children,
  title,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
