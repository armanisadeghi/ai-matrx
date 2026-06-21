"use client";

import React, { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  buildMultiRecordReferenceFence,
  buildGroupedRecordReferenceFences,
  type RecordReferenceGroup,
} from "@/features/matrx-envelope/recordReference";
import { Button } from "@/components/ui/button";

interface ReferencesBulkCopyButtonSingleProps {
  /** Reference `type` shared by every item (e.g. `"project"`, `"transcript"`). */
  referenceType: string;
  records: ReadonlyArray<{ id: string; label?: string }>;
  groups?: never;
}

interface ReferencesBulkCopyButtonGroupedProps {
  /** Mixed-type bulk copy — one fence per homogeneous group, joined by blank line. */
  groups: ReadonlyArray<RecordReferenceGroup>;
  referenceType?: never;
  records?: never;
}

type ReferencesBulkCopyButtonProps = (
  | ReferencesBulkCopyButtonSingleProps
  | ReferencesBulkCopyButtonGroupedProps
) & {
  /** Toast + tooltip label, e.g. "3 projects". */
  toastLabel: string;
  size?: "sm" | "md";
  className?: string;
  /** When true, render as labeled button instead of icon-only. */
  showLabel?: boolean;
  disabled?: boolean;
};

/**
 * Copy filtered search/list results as one multi-item matrx reference fence.
 * Same type only — mixed-type bulk copy needs separate fences per type (future).
 */
export function ReferencesBulkCopyButton({
  referenceType,
  records,
  groups,
  toastLabel,
  size = "sm",
  className,
  showLabel = false,
  disabled = false,
}: ReferencesBulkCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const count = groups
    ? groups.reduce((sum, g) => sum + g.records.length, 0)
    : (records?.length ?? 0);
  const isDisabled = disabled || count === 0;

  const handleCopy = async () => {
    if (isDisabled) return;
    const fence = groups
      ? buildGroupedRecordReferenceFences(groups)
      : buildMultiRecordReferenceFence(referenceType!, records!);
    if (!fence) return;
    try {
      await navigator.clipboard.writeText(fence);
      setCopied(true);
      toast.success("References copied to clipboard", {
        description: toastLabel,
        duration: 2500,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy references");
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (showLabel) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        disabled={isDisabled}
        className={className}
        title={`Copy ${count} references`}
      >
        {copied ? (
          <BookmarkCheck
            className={cn(iconSize, "mr-1.5 fill-primary text-primary")}
          />
        ) : (
          <Bookmark className={cn(iconSize, "mr-1.5")} />
        )}
        Copy references ({count})
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={isDisabled}
      title={
        isDisabled
          ? "Nothing to copy"
          : copied
            ? "Copied!"
            : `Copy ${count} references — ${toastLabel}`
      }
      aria-label={`Copy references for ${toastLabel}`}
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        "transition-all duration-150",
        "text-muted-foreground hover:text-primary hover:bg-primary/10",
        copied && "text-primary",
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
        isDisabled && "opacity-40 pointer-events-none",
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
