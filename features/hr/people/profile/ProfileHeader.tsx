"use client";

// features/hr/people/profile/ProfileHeader.tsx
//
// The header, on every tab (SPEC-EMPLOYEES §2.3.0).
//
// 🚨 THE STATUS COMES FROM `header.status`, WHICH THE SERVER RESOLVED THROUGH
// `hr.employment_as_of(employee_id, today)` — NEVER from `directory_status`.
// `directory_status` is a trigger-maintained convenience column that can be up
// to a day stale for a future-dated change that just landed; it is sanctioned
// for the LIST and nowhere else. Wiring the header to it is the single easiest
// way to make this page quietly lie about whether somebody works here.
//
// 🚨 AT MOST ONE PENDING CHIP (§6.2). Not one per change. `PendingChip` takes
// the count and is a door to the pending panel.
//
// 🚨 THE LEGAL NAME IS ABSENT, NOT BLANK, for a viewer without `identity.read` —
// the server simply does not send `header.legal_name` to them, and
// `<SensitiveField>` cannot render a key that is not there.

import Link from "next/link";
import { IdCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { SensitiveField } from "../../shared/SensitiveField";
import { PendingChip } from "../../shared/PendingChangesPanel";
import {
  hrEmployeeHref,
  hrOrgMemberHref,
  hrOrgChartHref,
  hrPartyHref,
  hrPeopleHref,
  hrStructureFocusHref,
  type HrOrgRef,
} from "../../routes";
import type { HrProfileHeader as HrProfileHeaderData } from "../../types";
import { HrCountDoor, HrPersonDoor, HrStructureDoor } from "../doors/HrPersonDoor";
import { HrStatusChip, formatFullDate } from "../shared/HrStatusChip";
import { HrWorkerClassChip } from "../shared/HrWorkerClassChip";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function ProfileHeader({
  header,
  org,
  organizationId,
  spellCount,
  className,
}: {
  header: HrProfileHeaderData;
  org: HrOrgRef;
  organizationId: string;
  /** More than one spell → say so here; the Job tab shows both. */
  spellCount?: number;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start gap-4 border-b border-border px-3 py-3 sm:px-4",
        className,
      )}
    >
      <div
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-base font-medium text-muted-foreground"
      >
        {initials(header.display_name)}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 truncate text-lg font-semibold text-foreground">
            {header.display_name}
          </h1>
          {/* Resolved as-of TODAY by the server. Never `directory_status`. */}
          <HrStatusChip status={header.status} />
          <HrWorkerClassChip workerClass={header.worker_class} />
          {header.pronouns ? (
            <span className="text-xs text-muted-foreground">
              {header.pronouns}
            </span>
          ) : null}
        </div>

        {/* Absent for a viewer without identity.read — the key is not sent. */}
        <SensitiveField
          source={header}
          name="legal_name"
          label="Legal name"
          className="max-w-xs"
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {header.job_title ? (
            <HrStructureDoor
              id={header.job_title_id}
              label={header.job_title}
              href={hrStructureFocusHref(header.job_title_id ?? "", org)}
            />
          ) : null}
          {header.department ? (
            <HrStructureDoor
              id={header.department_id}
              label={header.department}
              href={hrStructureFocusHref(header.department_id ?? "", org)}
            />
          ) : null}
          {header.location ? (
            <HrStructureDoor
              id={header.location_id}
              label={header.location}
              href={hrStructureFocusHref(header.location_id ?? "", org)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {header.manager_employee_id && header.manager_name ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              Reports to
              <HrPersonDoor
                person={{
                  employeeId: header.manager_employee_id,
                  displayName: header.manager_name,
                }}
                org={org}
                tab="job"
                showControls={false}
              />
            </span>
          ) : null}

          {/* A COUNT IS A DOOR — it opens the directory filtered to them. */}
          <HrCountDoor
            count={header.direct_report_count}
            href={hrPeopleHref({ org, managerEmployeeId: header.employee_id })}
            singular="direct report"
            plural="direct reports"
          />

          <Link
            href={hrOrgChartHref({ org, focus: header.employee_id })}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            Show on the org chart
          </Link>

          {spellCount && spellCount > 1 ? (
            <Link
              href={hrEmployeeHref(header.employee_id, "job", { org })}
              className="inline-flex"
            >
              <Badge variant="outline" className="text-[0.6875rem] font-normal">
                {spellCount} employment spells
              </Badge>
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
          {header.employee_number ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <IdCard className="h-3.5 w-3.5" aria-hidden />
              {header.employee_number}
            </span>
          ) : null}
          {header.hire_date ? (
            <span className="text-xs text-muted-foreground">
              Started {formatFullDate(header.hire_date)}
            </span>
          ) : null}
          {/* §4.5 — the CRM party opens, with a Peek so the profile is not lost. */}
          {header.party_id ? (
            <Link
              href={hrPartyHref(header.party_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              CRM record
            </Link>
          ) : null}
          {/* An employee is NOT required to have a login. No login, no door. */}
          {header.login_user_id ? (
            <Link
              href={hrOrgMemberHref(organizationId, header.login_user_id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Platform account
            </Link>
          ) : null}
        </div>
      </div>

      {/* ONE chip, and it is a door. */}
      {header.employment_id ? (
        <PendingChip
          count={header.pending_change_count}
          href={hrEmployeeHref(header.employee_id, "job", { org })}
          className="shrink-0"
        />
      ) : null}
    </header>
  );
}
