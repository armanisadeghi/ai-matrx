"use client";

import React, { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildBookmarkReferenceFence } from "@/features/matrx-envelope/bookmarkToReference";
import type { UserListBookmark } from "../types";

interface BookmarkCopyButtonProps {
  bookmark: UserListBookmark;
  /** Human-readable label for the toast */
  label: string;
  size?: "sm" | "md";
  className?: string;
}

export function BookmarkCopyButton({
  bookmark,
  label,
  size = "sm",
  className,
}: BookmarkCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(buildBookmarkReferenceFence(bookmark));
      setCopied(true);
      toast.success("Bookmark copied to clipboard", {
        description: label,
        duration: 2500,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy bookmark");
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy bookmark — ${label}`}
      aria-label={copied ? "Copied!" : `Copy bookmark for ${label}`}
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        "transition-all duration-150",
        "text-muted-foreground hover:text-primary",
        "hover:bg-primary/10",
        copied && "text-primary",
        btnSize,
        className,
      )}
    >
      {copied ? (
        <BookmarkCheck className={cn(iconSize, "fill-primary")} />
      ) : (
        <Bookmark className={iconSize} />
      )}
    </button>
  );
}
