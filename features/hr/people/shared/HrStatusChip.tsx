"use client";

// features/hr/people/shared/HrStatusChip.tsx
//
// The status chip, and the ONE place the directory's `row_basis` becomes words.
//
// 🚨 THE STATUS IS DERIVED FROM THE EMPLOYMENT SPELLS, ON BOTH SURFACES. The
// directory row's `directory_status` and the profile header's `header.status`
// are now two calls to the SAME server-side resolution as of the same date, so
// the list and the record cannot disagree about whether somebody works here.
//
// 🚨 WHAT THIS COMMENT USED TO SAY WAS FALSE, AND THE FALSE SENTENCE IS WHY THE
// BUG SURVIVED. It described `directory_status` as "a trigger-maintained
// convenience column that may be up to one day stale". No such trigger has ever
// existed: the column was `DEFAULT 'active'`, and the only writer in the entire
// database was `public.hr_employee_create`, so separation, rehire and leave
// never moved it. Live, across every organization, ZERO rows read 'terminated'
// while three people had been offboarded — one of them through this product —
// and this chip captioned all three "Active" while the headcount counted them.
// A code comment asserting a mechanism that does not exist is not documentation;
// it is the thing that stops the next reader from checking. (D4, 2026-08-29;
// the column is gone — migration `hr_l1_60`.)
//
// 🚨 AND `pending` IS NOT IN THESE MAPS ANY MORE — IT IS THE REASON D4A WAS
// INVISIBLE FOR A DAY. `pending` is a value of the RAW `hr.employment.status`
// enum, not of the derived vocabulary, and mapping it to "Not started yet" gave
// a raw leak a caption that looked *plausible*: seven future hires whose hire
// dates had arrived rendered as people who had not started, and nothing on the
// screen suggested a bug. Every producer of a status in the database now goes
// through `hr.employee_directory_status` — `hr_directory_list`, `hr_org_summary`,
// `hr_duplicate_scan`, `hr.employee_by_party`, `hr.member_employee_links` and,
// since `hr_l1_63`, `hr_employee_profile` — so the only four values that can
// arrive are the four below. A fifth means the server regressed, and this
// component now SAYS SO instead of dressing it up. (D4A/D4B, `hr_l1_63`.)

import { Badge } from "@/components/ui/badge";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { HR_DIRECTORY_STATUSES } from "../../constants";

const LABELS: Record<string, string> = {
  prehire: "Not started yet",
  active: "Active",
  on_leave: "On leave",
  terminated: "Former",
};

/** Semantic tokens only. `prehire` and `on_leave` are FACTS, never warnings. */
const TONES: Record<string, string> = {
  prehire: "border-border bg-muted/60 text-muted-foreground",
  active: "border-transparent bg-success/15 text-success",
  on_leave: "border-border bg-muted/60 text-muted-foreground",
  terminated: "border-border bg-muted/60 text-muted-foreground",
};

/** Counted, not just logged — so a regression is a number somebody can read. */
let offVocabularyRenders = 0;
const screamedFor = new Set<string>();

export function HrStatusChip({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;

  const known = (HR_DIRECTORY_STATUSES as readonly string[]).includes(status);
  if (!known) {
    offVocabularyRenders += 1;
    if (!screamedFor.has(status)) {
      screamedFor.add(status);
      // eslint-disable-next-line no-console
      console.error(
        `[HrStatusChip] OFF-VOCABULARY STATUS "${status}" (render #${offVocabularyRenders}). ` +
          `The doors may only emit ${HR_DIRECTORY_STATUSES.join(" | ")}. A raw ` +
          `hr.employment.status enum value reaching this chip is the D4A/D4B defect ` +
          `returning — see migration hr_l1_63.`,
      );
    }
  }

  const label = known ? LABELS[status] : status.replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 px-1.5 py-0 text-[0.6875rem] font-normal",
        known
          ? TONES[status]
          : "border-destructive bg-destructive/10 text-destructive",
        className,
      )}
      title={known ? undefined : `Unrecognised status "${status}" — server bug (hr_l1_63).`}
    >
      {!known && (
        <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
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

/**
 * A value that may be EITHER a calendar date (`2026-08-17`) or a timestamp
 * (`2026-08-17T14:03:00Z`) → `17 Aug 2026`.
 *
 * 🚨 `new Date("2026-08-17")` IS PARSED AS **UTC MIDNIGHT**, and `toLocaleDateString`
 * then renders it in the viewer's zone — so everywhere west of UTC it printed the
 * PREVIOUS DAY. Seven copies of a local `formatDay` helper across this lane had that
 * bug; the CRM party panel was caught showing "Started Aug 16, 2026" for an employee
 * the door reports as hired on `2026-08-17`, while the profile header two clicks
 * away said Aug 17. A hire date is not cosmetic — it is the date service is computed
 * from.
 *
 * A calendar date has no zone, so it must be parsed at LOCAL midnight. A timestamp
 * does have one and must NOT be, or it would be shifted a second time. This branches
 * on the shape rather than forcing either reading, which is why it is safe to point
 * every call site at it regardless of what that site is formatting.
 */
export function formatHrDay(value: string | null | undefined): string {
  if (!value) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const parsed = new Date(dateOnly ? `${value.trim()}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
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
