"use client";

import React, { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CompoundReferenceCopyButtonProps {
  /** Builds the canonical ```matrx``` fence at click time. */
  buildFence: () => string | null;
  toastLabel: string;
  size?: "sm" | "md";
  className?: string;
  title?: string;
  disabled?: boolean;
}

/**
 * Copy a compound / sub-dimension reference fence (table schema, transcript
 * segment, workbook sheet, …). Same UX as {@link ReferenceCopyButton}.
 */
export function CompoundReferenceCopyButton({
  buildFence,
  toastLabel,
  size = "sm",
  className,
  title,
  disabled = false,
}: CompoundReferenceCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    const fence = buildFence();
    if (!fence) {
      toast.error("Cannot copy reference — selection incomplete");
      return;
    }
    try {
      await navigator.clipboard.writeText(fence);
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
      disabled={disabled}
      title={
        title ??
        (copied ? "Copied!" : `Copy reference — ${toastLabel}`)
      }
      aria-label={copied ? "Copied!" : `Copy reference for ${toastLabel}`}
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        "transition-all duration-150",
        "text-muted-foreground hover:text-primary",
        "hover:bg-primary/10",
        copied && "text-primary",
        disabled && "opacity-40 pointer-events-none",
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
