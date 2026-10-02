"use client";

/**
 * ReferencePickerChip — THE chip for a reference item that is being AUTHORED
 * (a pending selection, with a remove affordance). The read-only twin is the
 * `ReferenceChip` inside `features/matrx-envelope/registry.tsx`, which renders
 * a fence that already exists in content.
 *
 * Extracted from `ReferenceValuePicker` (2026-07-25) so every authoring
 * surface — scope reference cells, the messaging attach button, anything next —
 * shows the same live-resolved chip instead of a fourth hand-rolled variant.
 */

import { FileText, Link2, Loader2, X } from "lucide-react";
import { cn } from "@/utils/cn";
import Link from "next/link";
import {
  coerceRefToStrings,
  referenceChipLabel,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import { useReferenceDoor } from "@/features/matrx-envelope/components/useReferenceDoor";
import { MissingReferenceChip } from "@/features/matrx-envelope/components/MissingReferenceChip";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";

export interface ReferencePickerChipProps {
  item: ReferenceItem;
  type: string;
  onRemove?: () => void;
  className?: string;
}

export function ReferencePickerChip({
  item,
  type,
  onRemove,
  className,
}: ReferencePickerChipProps) {
  const hints = item as unknown as { url?: string; label?: string };
  // Live-resolve, same as the read-only ReferenceChip — a baked-in `label` is
  // only a first-paint head start, never the source of truth. This is what a
  // backfilled cell (no label at all) or a renamed entity (stale label) needs
  // to still show the real current name here instead of a bare type name.
  const { display, status } = useResolvedReferenceLabel(item, type);
  const label =
    type === "url" && hints.url && !hints.label
      ? hints.url
      : referenceChipLabel(display);
  const Icon = type === "url" ? Link2 : type === "file" ? FileText : null;
  // The name is the door (THE DOOR LAW) — the same ladder as the read-only chip.
  const door = useReferenceDoor(type, coerceRefToStrings(item, `${type} picker chip`), label);
  const nameClass = "truncate rounded-sm hover:underline underline-offset-2";

  const removeButton = onRemove ? (
    <button
      type="button"
      onClick={onRemove}
      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={`Remove ${label}`}
    >
      <X className="h-3 w-3" />
    </button>
  ) : null;

  if (status === "missing") {
    return (
      <MissingReferenceChip label={label} className={className}>
        {removeButton}
      </MissingReferenceChip>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm text-foreground",
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      {door.primaryHref ? (
        <Link href={door.primaryHref} className={nameClass} title={door.title}>
          {label}
        </Link>
      ) : door.canOpen ? (
        <button type="button" onClick={door.activate} className={cn(nameClass, "min-w-0 text-left")} title={door.title}>
          {label}
        </button>
      ) : (
        <span className="truncate" title={display}>
          {label}
        </span>
      )}
      {door.peek}
      {status === "loading" && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      )}
      {removeButton}
    </span>
  );
}

export default ReferencePickerChip;
