"use client";

// features/hr/people/shared/HrStatusChip.tsx
//
// The status chip, and the ONE place the directory's `row_basis` becomes words.
//
// 🚨 TWO DIFFERENT FACTS, TWO DIFFERENT SOURCES — never interchange them:
//
//   • THE PROFILE HEADER's status comes from `profile.header.status`, which the
//     server resolved through `hr.employment_as_of(employee_id, today)`. That is
//     the calculation-grade answer.
//   • THE DIRECTORY ROW's status is `directory_status`, a trigger-maintained
//     convenience column that may be up to one day stale for a future-dated
//     change that just landed (SPEC-EMPLOYEES §5.1). It is sanctioned for the
//     LIST and nowhere else.
//
// This component renders whichever string it is handed. It is the CALLER's job
// to hand it the right one, and the profile header is wired to `header.status`
// precisely so a stale list value can never reach it.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  prehire: "Not started yet",
  pending: "Not started yet",
  active: "Active",
  on_leave: "On leave",
  terminated: "Former",
};

/** Semantic tokens only. `prehire` and `on_leave` are FACTS, never warnings. */
const TONES: Record<string, string> = {
  prehire: "border-border bg-muted/60 text-muted-foreground",
  pending: "border-border bg-muted/60 text-muted-foreground",
  active: "border-transparent bg-success/15 text-success",
  on_leave: "border-border bg-muted/60 text-muted-foreground",
  terminated: "border-border bg-muted/60 text-muted-foreground",
};

export function HrStatusChip({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const label = LABELS[status] ?? status.replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-[0.6875rem] font-normal",
        TONES[status] ?? "border-border text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

/**
 * 🚨 `row_basis` IS NOT DECORATION. A future-dated hire's job title, department,
 * location and manager come from their INCOMING assignment, not a current one.
 * Rendering those columns unqualified claims the person already holds the job.
 *
 * `current`              → nothing to say.
 * `upcoming`             → "Starts 9 Sep" beside the job columns.
 * `no_primary_assignment`→ they have a spell but no job on it. Say so.
 * `no_spell`             → in the directory with no employment at all. Say so.
 */
export function HrRowBasisNote({
  rowBasis,
  hireDate,
  className,
}: {
  rowBasis: string | null | undefined;
  hireDate?: string | null;
  className?: string;
}) {
  if (!rowBasis || rowBasis === "current") return null;

  const text =
    rowBasis === "upcoming"
      ? hireDate
        ? `Starts ${formatShortDate(hireDate)}`
        : "Starts on a future date"
      : rowBasis === "no_primary_assignment"
        ? "No job assigned yet"
        : rowBasis === "no_spell"
          ? "No employment record"
          : null;

  if (!text) return null;

  return (
    <span
      className={cn("text-[0.6875rem] text-muted-foreground", className)}
      title={
        rowBasis === "upcoming"
          ? "These job details come from their incoming assignment, not a current one."
          : undefined
      }
    >
      {text}
    </span>
  );
}

/** `2026-09-09` → `9 Sep`. Dates are ISO on the wire; humans get words. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** `2026-09-09` → `9 Sep 2026`. Used where the year is load-bearing. */
export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A timestamp (system time) → `25 Aug 2026`. Never a bare ISO string in the UI. */
export function formatRecordedAt(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
