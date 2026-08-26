"use client";

// features/hr/people/directory/HrDirectoryCards.tsx
//
// The card grid — eleven faces instead of a spreadsheet of eleven people
// (Arman's Q2 ruling, which is also why the PLATFORM DEFAULT for this surface is
// `cards`). The table remains one toggle away and remains the view that can
// sort, filter and reach every action.
//
// This renders ONLY the current page's rows. It is not a second query: the same
// `hr_directory_list` call feeds both views, the same pagination sits under
// both, and the same total is stated by both. A card grid with its own fetch
// would be the second answer to one question.

import Link from "next/link";
import { Mail, Phone } from "lucide-react";

import { ItemMenu } from "@/components/official/item/ItemMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

import { hrEmployeeHref, type HrOrgRef } from "../../routes";
import type { HrDirectoryRow } from "../../types";
import { HrPersonDoor } from "../doors/HrPersonDoor";
import { HrRowBasisNote, HrStatusChip } from "../shared/HrStatusChip";
import { HrWorkerClassChip } from "../shared/HrWorkerClassChip";
import type { HrEmployeeMenuBuilder } from "./useHrEmployeeMenu";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function HrDirectoryCard({
  row,
  org,
  buildMenu,
  className,
}: {
  row: HrDirectoryRow;
  org: HrOrgRef;
  buildMenu: HrEmployeeMenuBuilder;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* The photo is a `photo_file_id`, and a signed URL is a handoff, never
            an identity — until the profile's file lane is wired here, initials
            are the honest placeholder rather than a broken <img>. */}
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
        >
          {initials(row.display_name)}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={hrEmployeeHref(row.employee_id, null, { org })}
              className="min-w-0 truncate text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {row.display_name}
            </Link>
          </div>
          {row.job_title ? (
            <div className="truncate text-xs text-muted-foreground">
              {row.job_title}
            </div>
          ) : null}
          <HrRowBasisNote rowBasis={row.row_basis} hireDate={row.hire_date} />
        </div>

        <ItemMenu
          config={() =>
            buildMenu({
              employeeId: row.employee_id,
              displayName: row.display_name,
              workEmail: row.work_email,
              employmentId: row.employment_id,
              status: row.directory_status,
            })
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 lg:h-7 lg:w-7"
            aria-label={`Actions for ${row.display_name}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </ItemMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <HrStatusChip status={row.directory_status} />
        <HrWorkerClassChip workerClass={row.worker_class} />
      </div>

      {row.department || row.location ? (
        <div className="truncate text-xs text-muted-foreground">
          {[row.department, row.location].filter(Boolean).join(" · ")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        {row.work_email ? (
          <a
            href={`mailto:${row.work_email}`}
            className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{row.work_email}</span>
          </a>
        ) : null}
        {row.work_phone ? (
          <a
            href={`tel:${row.work_phone}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Phone className="h-3 w-3 shrink-0" aria-hidden />
            {row.work_phone}
          </a>
        ) : null}
      </div>

      {row.manager_employee_id && row.manager_name ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Reports to</span>
          <HrPersonDoor
            person={{
              employeeId: row.manager_employee_id,
              displayName: row.manager_name,
            }}
            org={org}
            tab="job"
            showControls={false}
          />
        </div>
      ) : null}
    </div>
  );
}

export function HrDirectoryCardGrid({
  rows,
  org,
  buildMenu,
}: {
  rows: HrDirectoryRow[];
  org: HrOrgRef;
  buildMenu: HrEmployeeMenuBuilder;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {rows.map((row) => (
        <HrDirectoryCard
          key={row.employee_id}
          row={row}
          org={org}
          buildMenu={buildMenu}
        />
      ))}
    </div>
  );
}
