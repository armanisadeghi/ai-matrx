/**
 * features/files/components/surfaces/single-file/SingleFileActions.tsx
 *
 * The file's OWN controls from the single-file page's top bar — its name (with
 * the full right-click menu and lineage chip) and its action buttons (Copy
 * share link, Download, Open in new tab, More actions). Extracted so the page
 * header (`SingleFileTopBar`) and a Board tile (the name in the tile header via
 * `FileTileTitle`, the buttons in `SingleFileWorkspace layout="tile"`) render
 * the same controls; route navigation (back, breadcrumb,
 * Show files) stays in the page header only.
 */

"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { FileIcon } from "@ai-matrx/media/react";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { FileLineageChip } from "../FileLineageChip";

/** Icon + name + lineage, inside the file's canonical right-click menu. */
export function SingleFileNameLabel({
  fileId,
  showIcon = true,
  className,
}: {
  fileId: string;
  /** Off where the host already draws an icon beside the name (a Board tile header). */
  showIcon?: boolean;
  className?: string;
}) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  return (
    <FileRightClickMenu fileId={fileId}>
      <div className={cn("flex min-w-0 items-center gap-2 px-1", className)}>
        {file && showIcon ? (
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
  );
}

/** Copy share link · Download · (Open in new tab) · More actions. */
export function SingleFileActionButtons({
  fileId,
  showOpenInNewTab = false,
  className,
}: {
  fileId: string;
  showOpenInNewTab?: boolean;
  className?: string;
}) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const actions = useFileActions(fileId);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await actions.download();
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyLink = async () => {
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
  };

  return (
    <div className={cn("flex items-center", className)}>
      <TapTargetButtonTransparent
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
      <TapTargetButtonTransparent
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
      {showOpenInNewTab ? (
        <TapTargetButtonTransparent
          icon={<ExternalLink className="h-4 w-4" />}
          ariaLabel="Open in new tab"
          href={`/files/f/${fileId}`}
          target="_blank"
        />
      ) : null}
      <Tooltip>
        <FileContextMenu fileId={fileId}>
          <TooltipTrigger asChild>
            <span>
              <TapTargetButtonTransparent
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
  );
}
