"use client";

/**
 * THE MISSING STATE of a reference chip — said up front, never after a click.
 *
 * A chip whose record read SUCCEEDED and found nothing this reader can see
 * (`useResolvedReferenceLabel` → `status: "missing"`: deleted, or not shared
 * with them) used to render as an ordinary working "Task" chip and only said
 * "couldn't be found" once clicked (G2 review, 2026-10-02). It is now an
 * honest, non-interactive chip: dashed border, a slashed icon, "Not found".
 * Both chips — the read-only `ReferenceChip` and the authoring
 * `ReferencePickerChip` — render this, so the state reads the same everywhere.
 */

import type { ReactNode } from "react";
import { CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MissingReferenceChipProps {
  /** The name the reference carries (its hint), else the type's name. */
  label: string;
  className?: string;
  /** Trailing controls (the authoring chip's remove button). */
  children?: ReactNode;
}

export function MissingReferenceChip({
  label,
  className,
  children,
}: MissingReferenceChipProps) {
  return (
    <span
      data-reference-missing=""
      title="Not found — deleted, or not shared with you"
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-dashed border-border",
        "bg-transparent px-2 py-0.5 align-middle text-sm text-muted-foreground",
        className,
      )}
    >
      <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs">· Not found</span>
      {children}
    </span>
  );
}
