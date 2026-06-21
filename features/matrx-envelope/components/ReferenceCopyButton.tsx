"use client";

import React, { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";

interface ReferenceCopyButtonProps {
  /** Reference `type` on the wire (e.g. `"task"`, `"note"`). */
  referenceType: string;
  id: string;
  /** Non-authoritative display hint copied into the fence. */
  label?: string;
  /** Human-readable label for the success toast. */
  toastLabel: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Copy a live Matrx record reference (```matrx``` fence) to the clipboard.
 * Mirrors {@link BookmarkCopyButton} styling — bookmark icon, same hover/copied states.
 */
export function ReferenceCopyButton({
  referenceType,
  id,
  label,
  toastLabel,
  size = "sm",
  className,
}: ReferenceCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(
        buildRecordReferenceFence({ type: referenceType, id, label }),
      );
      setCopied(true);
      toast.success("Reference copied to clipboard", {
        description: toastLabel,
        duration: 2500,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy reference");
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy reference — ${toastLabel}`}
      aria-label={copied ? "Copied!" : `Copy reference for ${toastLabel}`}
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
