"use client";

/**
 * Canonical file thumbnail with two deliberately separate actions:
 *
 * - the thumbnail opens the platform File Preview WindowPanel;
 * - the 44px control selects/unselects the file for the host feature.
 *
 * The entire tile participates in the universal file context menu. File ID is
 * the identity; Redux fills any missing render metadata before the thumbnail
 * decides whether a public CDN URL or authenticated bytes are appropriate.
 */

import { useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { FILE_RENDER_FIELDS } from "@/features/files/redux/file-hydration";
import { MediaThumbnail } from "@ai-matrx/media/react";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import type { FileIdentityHint } from "@/features/files/types";

export interface SelectableFileThumbnailProps {
  fileId: string;
  fileHint?: FileIdentityHint;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void | Promise<void>;
  alt?: string;
  selectLabel?: string;
  clearLabel?: string;
  selectedIcon?: ReactNode;
  unselectedIcon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function SelectableFileThumbnail({
  fileId,
  fileHint,
  selected,
  onSelectedChange,
  alt,
  selectLabel = "Select file",
  clearLabel = "Clear selection",
  selectedIcon = <Check className="h-5 w-5" />,
  unselectedIcon = <Check className="h-5 w-5" />,
  disabled = false,
  className,
}: SelectableFileThumbnailProps) {
  useEnsureCloudFile(fileId, {
    fields: FILE_RENDER_FIELDS,
    hint: fileHint,
  });
  const file = useAppSelector((state) => selectFileById(state, fileId));
  const [selecting, setSelecting] = useState(false);
  const fileName = fileHint?.fileName ?? file?.fileName ?? "File";
  const thumbnailFile = file ?? {
    id: fileId,
    fileName,
    mimeType: fileHint?.mimeType ?? null,
    fileSize: fileHint?.fileSize ?? null,
    metadata: {},
    publicUrl: fileHint?.publicUrl ?? null,
    cdnUrl: fileHint?.cdnUrl ?? null,
    thumbnailUrl: null,
    visibility: fileHint?.visibility ?? ("personal" as const),
  };

  const handleSelection = async () => {
    if (disabled || selecting) return;
    setSelecting(true);
    try {
      await onSelectedChange(!selected);
    } finally {
      setSelecting(false);
    }
  };

  return (
    <FileRightClickMenu fileId={fileId} disabled={disabled}>
      <div
        className={cn(
          "relative h-24 w-24 shrink-0 rounded-lg",
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => openFilePreview(fileId)}
          disabled={disabled}
          aria-label={`Preview ${alt ?? fileName}`}
          className={cn(
            "block h-full w-full overflow-hidden rounded-lg bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <MediaThumbnail
            mediaRef={{
              file_id: thumbnailFile.id,
              mime_type: thumbnailFile.mimeType ?? undefined,
            }}
            fileName={thumbnailFile.fileName}
            mimeType={thumbnailFile.mimeType}
            iconSize={40}
            className="h-full w-full"
            rounded="rounded-lg"
          />
        </button>

        <Button
          type="button"
          size="icon"
          variant={selected ? "default" : "secondary"}
          disabled={disabled || selecting}
          aria-label={selected ? clearLabel : selectLabel}
          aria-pressed={selected}
          title={selected ? clearLabel : selectLabel}
          onClick={() => void handleSelection()}
          className={cn(
            "absolute -bottom-2 -right-2 h-11 w-11 rounded-full shadow-md",
            "border-2 border-background",
          )}
        >
          {selecting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : selected ? (
            selectedIcon
          ) : (
            unselectedIcon
          )}
        </Button>
      </div>
    </FileRightClickMenu>
  );
}
