/**
 * features/files/components/core/FileIcon/FileIcon.tsx
 *
 * Renders a lucide icon for any file or folder. Wraps the icon-map utility so
 * callers don't reimplement the category/color logic at every call site.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  getFilePreviewProfile,
  getFolderTypeDetails,
} from "@/features/files/utils/icon-map";

export interface FileIconProps {
  /** Either the filename (for files) or omitted for folders. */
  fileName?: string;
  /** Server MIME — when set, resolves audio/webm vs video/webm correctly. */
  mimeType?: string | null;
  /** If true, renders a folder icon. `open` picks FolderOpen vs Folder. */
  isFolder?: boolean;
  open?: boolean;
  /** Override the mapped color (useful for selected states). */
  colorClass?: string;
  className?: string;
  size?: number;
}

export function FileIcon({
  fileName,
  mimeType = null,
  isFolder,
  open,
  colorClass,
  className,
  size = 16,
}: FileIconProps) {
  const details = isFolder
    ? getFolderTypeDetails(open)
    : getFilePreviewProfile(fileName ?? "", mimeType, null).details;
  const Icon = details.icon;
  const style: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
  };
  return (
    <Icon
      style={style}
      className={cn("shrink-0", colorClass ?? details.color, className)}
      aria-hidden="true"
    />
  );
}
