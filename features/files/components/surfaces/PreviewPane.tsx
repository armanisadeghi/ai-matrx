/**
 * features/files/components/surfaces/PreviewPane.tsx
 *
 * Side-panel preview for a single file. Lives to the RIGHT of the file list
 * inside PageShell — never replaces the list, so the user always has a way
 * back. Header bar exposes copy-link, download, a maximize / restore toggle
 * (drives full-page width in-place, no re-mount), an "Open as page" route
 * jump, an "Open in new tab" external link, and a Close (X) — or a Back
 * arrow when we're already sitting on the dedicated `/files/f/{id}` route.
 *
 * The 7-tab strip + body region is shared with the dedicated full-page
 * viewer (`SingleFileShell`) via `<FileTabsBody/>` — keeps the two
 * surfaces from drifting in tab semantics or deep-link behavior.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Expand,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectFileById } from "@/features/files/redux/selectors";
import { setActiveFileId } from "@/features/files/redux/slice";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { MoreHorizontal } from "lucide-react";
import { FileLineageChip } from "./FileLineageChip";
import { FileTabsBody } from "./FileTabsBody";

export interface PreviewPaneProps {
  fileId: string;
  /**
   * Called when the user clicks the close (X) button. Defaults to dispatching
   * `setActiveFileId(null)`. Override only if you have a specific surface
   * that needs to e.g. also navigate back.
   */
  onClose?: () => void;
  /**
   * When set, renders a maximize / restore toggle in the action bar. Driven
   * by the parent (PageShell) so the parent owns the layout state and the
   * underlying `setLayout` call against `react-resizable-panels`. Floating-
   * window surfaces (e.g. FilePreviewWindow) leave both unset to hide the
   * button entirely — they aren't constrained by a side-by-side layout.
   */
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  className?: string;
}

export function PreviewPane({
  fileId,
  onClose,
  isMaximized,
  onToggleMaximize,
  className,
}: PreviewPaneProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const actions = useFileActions(fileId);

  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    // Always clear the active selection so the panel unmounts.
    dispatch(setActiveFileId(null));
    // If we're on a `/files/f/{fileId}` URL, the route hydrates
    // `initialFileId` on every mount — clearing state alone isn't enough,
    // because reload or any soft navigation back here would re-open the
    // panel. Pop the user back to `/files` so the URL also resets.
    if (pathname?.startsWith("/files/f/")) {
      router.push("/files");
    }
  }, [dispatch, onClose, pathname, router]);

  // The dedicated single-file route. Used by:
  //   1. "Open as page" → router.push (same tab, route transition)
  //   2. "Open in new tab" → <a target="_blank"> (real browser new tab)
  //   3. The Close button's back-to-files branch (when we're already there)
  const fileRouteHref = `/files/f/${fileId}`;
  const isOnFileRoute = pathname?.startsWith("/files/f/") ?? false;

  const handleOpenAsPage = useCallback(() => {
    router.push(fileRouteHref);
  }, [fileRouteHref, router]);

  // Esc closes the preview — matches Dropbox / Drive muscle memory and is the
  // last-line escape hatch if the user can't see the close button for any
  // reason (covered by an error UI, off-screen, etc.).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't steal Esc from open inputs / context menus / dialogs.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (t?.isContentEditable) return;
      handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

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
        // Reset the icon back to a clipboard after a short tick.
        window.setTimeout(() => setCopied(false), 1600);
      }
    } finally {
      setCopying(false);
    }
  }, [actions, copying]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-card",
        className,
      )}
      role="complementary"
      aria-label="File preview"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-2 shrink-0">
        {/* Leftmost: Close (when on /files or any list route) OR Back (when on
         * /files/f/{id} — i.e. already on the dedicated file route). Both paths
         * call the same `handleClose`, which already routes back to /files
         * when it detects the dedicated route. We only swap the icon + label
         * so the affordance is honest. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleClose}
              aria-label={isOnFileRoute ? "Back to files" : "Close preview"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {isOnFileRoute ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {isOnFileRoute ? "Back to files" : "Close preview (Esc)"}
          </TooltipContent>
        </Tooltip>

        {/* Right-click anywhere on the filename / icon area opens the
         * full file context menu — same items as the 3-dot dropdown to
         * the right. Wrapping in <FileRightClickMenu> doesn't intercept
         * left-click, so single-click still selects text inside the
         * label as before. */}
        <FileRightClickMenu fileId={fileId}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {file ? (
              <FileIcon
                fileName={file.fileName}
                size={16}
                className="shrink-0"
              />
            ) : null}
            <p
              className="truncate text-sm font-medium"
              title={file?.fileName ?? ""}
            >
              {file?.fileName ?? "Loading…"}
            </p>
            {/*
             * Lineage chips — silent when the file has no parent and no
             * processed_documents row. When present, they let the user
             * jump to the binary-parent file or open the RAG viewer
             * without leaving this surface. Skipped for virtual files.
             */}
            {file?.source.kind === "real" ? (
              <FileLineageChip fileId={fileId} className="shrink-0" />
            ) : null}
          </div>
        </FileRightClickMenu>

        {/* Action buttons — right side, with a small right margin so they
         * stay clear of the user's avatar. */}
        <div className="flex items-center gap-0.5 shrink-0 mr-12">
          <PreviewIconButton
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
          </PreviewIconButton>
          <PreviewIconButton
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
          </PreviewIconButton>
          {/* In-place maximize / restore. Drives `setLayout` against the
           * react-resizable-panels group in PageShell so the preview takes
           * 100% of the page width without any z-index gymnastics and
           * WITHOUT re-mounting — long-running work in the body (RAG
           * classification, PDF analysis, fetched blobs) keeps going.
           * Only rendered when the parent owns a togglable layout. */}
          {onToggleMaximize ? (
            <PreviewIconButton
              onClick={onToggleMaximize}
              disabled={!file}
              title={isMaximized ? "Restore width" : "Expand to full width"}
              ariaLabel={
                isMaximized ? "Restore preview width" : "Maximize preview width"
              }
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </PreviewIconButton>
          ) : null}
          {/* Open as page — route navigation to /files/f/{id}. Hidden when
           * we're already sitting on that route (would just churn the
           * router and re-hydrate the same shell). */}
          {!isOnFileRoute ? (
            <PreviewIconButton
              onClick={handleOpenAsPage}
              disabled={!file}
              title="Open as page"
              ariaLabel="Open as a dedicated page"
            >
              <Expand className="h-3.5 w-3.5" />
            </PreviewIconButton>
          ) : null}
          {/* Open in a real new browser tab. Renders as an anchor so
           * cmd/ctrl-click, middle-click, "Copy link" etc. all behave
           * naturally — wrapping a button in target="_blank" cannot do
           * that. */}
          <PreviewIconButton
            href={fileRouteHref}
            target="_blank"
            rel="noopener noreferrer"
            disabled={!file}
            title="Open in new tab"
            ariaLabel="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </PreviewIconButton>
          {/* All other file actions (Rename, Visibility, Show details,
           * Show versions, Duplicate, Delete, …) live in the full menu
           * here. Same items the user gets from a right-click anywhere
           * else in the app — single source via useFileMenuActions.
           *
           * Tooltip wraps the menu so the tooltip and the dropdown share
           * the same button trigger (Tooltip > FileContextMenu >
           * TooltipTrigger asChild > button). Both Slot wrappers compose
           * via cloneElement — confirmed pattern from features/notes. */}
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

      {/* Tab strip + always-mounted bodies — shared with SingleFileShell so
       * the two surfaces never drift on tab semantics. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <FileTabsBody fileId={fileId} density="compact" />
      </div>
    </div>
  );
}

// ─── Local sub-component ─────────────────────────────────────────────────

interface PreviewIconButtonBaseProps {
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  tone?: "default" | "muted";
}

type PreviewIconButtonProps =
  | (PreviewIconButtonBaseProps & {
      onClick: () => void;
      href?: never;
      target?: never;
      rel?: never;
    })
  | (PreviewIconButtonBaseProps & {
      href: string;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      onClick?: () => void;
    });

function PreviewIconButton(props: PreviewIconButtonProps) {
  const { children, title, ariaLabel, disabled, tone = "default" } = props;
  const className = cn(
    "flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    tone === "muted"
      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
      : "text-foreground hover:bg-accent",
  );

  // Render as an anchor when an href is provided so middle-click, cmd-click,
  // and "Copy link" all work the way a real link does — wrapping a <button>
  // in target="_blank" cannot replicate that behaviour. We mirror the
  // disabled visual with aria-disabled + pointer-events-none on the link
  // since <a> has no native disabled state.
  const trigger =
    "href" in props && props.href ? (
      <a
        href={disabled ? undefined : props.href}
        target={props.target}
        rel={
          props.rel ??
          (props.target === "_blank" ? "noopener noreferrer" : undefined)
        }
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onClick={props.onClick}
        className={cn(className, disabled && "pointer-events-none")}
      >
        {children}
      </a>
    ) : (
      <button
        type="button"
        onClick={props.onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
