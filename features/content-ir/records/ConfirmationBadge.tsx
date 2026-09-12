"use client";

/**
 * The confirmation badge — the ONE drawing of `content_ir.kind_instance
 * .confirmation` anywhere in the app (DD-131 slice residue: this file used to
 * be two — `records/RecordConfirmationBadge.tsx` and
 * `studio/records/ConfirmationBadge.tsx` — each claiming in its own docstring
 * to be "the one drawing". They are not two designs, they are one state
 * rendered at two densities, so they are one component with a `variant`.
 *
 * `unconfirmed` is the state an agent-written record is born in, and it is
 * NOT an error or a warning: it means a person has not looked yet.
 *
 * - `variant="chrome"` — the neutral pill for running text (chat block chrome,
 *   the reverse "records this chat produced" view). Alarming a reader about
 *   the normal case in prose teaches them to ignore the badge.
 * - `variant="grid"` — the loud, uppercase chip for the dense records table,
 *   where a register whose unverified rows look like verified ones is worse
 *   than no register. This is the only variant that also renders the
 *   ARCHIVE axis (a separate, independent question — a row can be
 *   unconfirmed+archived, confirmed+archived, or any other combination), since
 *   a table cell is the one place both marks are shown side by side.
 */

import { BadgeCheck, CheckCircle2, CircleDashed, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

/** The stored `platform.confirmation` enum. */
export type RecordConfirmation = "unconfirmed" | "confirmed";

export interface ConfirmationBadgeProps {
  confirmation: RecordConfirmation;
  /** @default "chrome" */
  variant?: "chrome" | "grid";
  /** Grid variant only — the separate archive axis, rendered as a second chip. */
  archivedAt?: string | null;
  className?: string;
}

const GRID_CHIP =
  "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

// INLINE, deliberately: a data-table cell forces `white-space: normal` and
// `overflow-wrap: anywhere` onto every descendant, so a class cannot stop this
// chip breaking "UNCONFIRMED" across three lines and setting the row height.
// An inline style is the only declaration that outranks it.
const NO_WRAP = { whiteSpace: "nowrap" } as const;

export function ConfirmationBadge({
  confirmation,
  variant = "chrome",
  archivedAt = null,
  className,
}: ConfirmationBadgeProps) {
  const confirmed = confirmation === "confirmed";

  if (variant === "grid") {
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
        {confirmed ? (
          <span
            style={NO_WRAP}
            className={cn(GRID_CHIP, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}
            title="A person has stood behind this record."
          >
            <BadgeCheck className="h-3 w-3" />
            Confirmed
          </span>
        ) : (
          <span
            style={NO_WRAP}
            className={cn(GRID_CHIP, "bg-amber-500/15 text-amber-700 dark:text-amber-400")}
            title="Nobody has stood behind this record yet. Confirm it, or edit a value — editing confirms it."
          >
            <CircleDashed className="h-3 w-3" />
            Unconfirmed
          </span>
        )}
        {archivedAt ? (
          <span
            style={NO_WRAP}
            className={cn(GRID_CHIP, "bg-muted text-muted-foreground")}
            title={`Archived ${new Date(archivedAt).toLocaleString()}`}
          >
            <Archive className="h-3 w-3" />
            Archived
          </span>
        ) : null}
      </span>
    );
  }

  const Icon = confirmed ? CheckCircle2 : CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        confirmed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
      title={
        confirmed
          ? "A person has confirmed this record."
          : "Nobody has confirmed this record yet."
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {confirmed ? "Confirmed" : "Unconfirmed"}
    </span>
  );
}
