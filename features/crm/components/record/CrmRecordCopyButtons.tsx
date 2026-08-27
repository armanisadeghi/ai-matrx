"use client";

import {
  CopyButtons,
  type CopyButtonsProps,
} from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";

interface Props extends Omit<CopyButtonsProps, "size"> {
  revealFrom?: "section" | "item";
}

/**
 * The record page's quiet composition of the canonical copy pair. Touch keeps
 * it visible; pointer layouts reveal it from the section or item hover group.
 */
export function CrmRecordCopyButtons({
  revealFrom = "section",
  className,
  ...props
}: Props) {
  return (
    <CopyButtons
      {...props}
      size="xs"
      className={cn(
        "shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100",
        revealFrom === "section"
          ? "sm:group-hover/section:opacity-100"
          : "sm:group-hover/item:opacity-100",
        className,
      )}
    />
  );
}
