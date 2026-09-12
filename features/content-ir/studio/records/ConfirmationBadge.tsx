"use client";

// features/content-ir/studio/records/ConfirmationBadge.tsx
//
// The standing of ONE record, said in the title cell.
//
// `unconfirmed` is the important half: a machine wrote the row and no person
// has stood behind it yet. It is never hidden, never softened into a neutral
// grey dot, and never left off the default list — a register whose unverified
// rows look like verified ones is worse than no register.
//
// Archive is a SEPARATE axis, so an archived row wears BOTH marks.

import { BadgeCheck, Archive, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordConfirmation } from "./types";

interface Props {
  confirmation: RecordConfirmation;
  archivedAt: string | null;
  className?: string;
}

const CHIP =
  "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

// INLINE, deliberately: a data-table cell forces `white-space: normal` and
// `overflow-wrap: anywhere` onto every descendant, so a class cannot stop this
// chip breaking "UNCONFIRMED" across three lines and setting the row height.
// An inline style is the only declaration that outranks it.
const NO_WRAP = { whiteSpace: "nowrap" } as const;

export function ConfirmationBadge({ confirmation, archivedAt, className }: Props) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {confirmation === "confirmed" ? (
        <span
          style={NO_WRAP}
          className={cn(CHIP, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}
          title="A person has stood behind this record."
        >
          <BadgeCheck className="h-3 w-3" />
          Confirmed
        </span>
      ) : (
        <span
          style={NO_WRAP}
          className={cn(CHIP, "bg-amber-500/15 text-amber-700 dark:text-amber-400")}
          title="Nobody has stood behind this record yet. Confirm it, or edit a value — editing confirms it."
        >
          <CircleDashed className="h-3 w-3" />
          Unconfirmed
        </span>
      )}
      {archivedAt ? (
        <span
          style={NO_WRAP}
          className={cn(CHIP, "bg-muted text-muted-foreground")}
          title={`Archived ${new Date(archivedAt).toLocaleString()}`}
        >
          <Archive className="h-3 w-3" />
          Archived
        </span>
      ) : null}
    </span>
  );
}
