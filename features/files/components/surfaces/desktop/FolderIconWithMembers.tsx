/**
 * features/files/components/surfaces/dropbox/FolderIconWithMembers.tsx
 *
 * Dropbox-style folder icon with a small overlay badge indicating it's shared.
 * Uses the same icon mapping as the rest of the app but upscaled for the
 * table / grid views.
 */

"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "@ai-matrx/media/react";

export interface FolderIconWithMembersProps {
  isShared: boolean;
  open?: boolean;
  size?: number;
  className?: string;
}

export function FolderIconWithMembers({
  isShared,
  open,
  size = 20,
  className,
}: FolderIconWithMembersProps) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <FileIcon
        isFolder
        open={open}
        size={size}
        colorClass={
          isShared
            ? "text-indigo-500 dark:text-indigo-400"
            : "text-amber-400 dark:text-amber-600"
        }
      />
      {isShared ? (
        <span
          className="absolute -bottom-0.5 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-background ring-1 ring-border"
          aria-hidden="true"
        >
          <Users className="h-2 w-2 text-muted-foreground" />
        </span>
      ) : null}
    </span>
  );
}
