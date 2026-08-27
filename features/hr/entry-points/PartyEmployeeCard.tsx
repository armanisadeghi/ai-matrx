// features/hr/entry-points/PartyEmployeeCard.tsx
//
// D4 / SPEC-UI-IA §6 — the **Employee** card on `/crm/[partyId]`.
//
// "A CRM record and an employee record must never look like two unrelated
//  search results for the same person."
//
// `hr.employee` is 1:1 with `crm.party` (SPEC-EMPLOYEES §1.1), so a party in an
// org that runs HR may BE an employee. This card is that fact, made visible and
// crossable — status, title, manager, start date, and a door to the profile.
//
// 🚨 IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. No employee record, HR
// off for this org, no HR standing, or the door not live → absent. Not a card
// that says "no employee record". A CRM user with no HR role should not learn
// from a CRM page who is and is not on staff.
//
// 🚨 DIRECTORY-TIER FIELDS ONLY. Everything on this card is the same tier the
// employee directory publishes to every org member. Nothing confidential
// reaches a CRM surface, ever — that is a separate, audited read on a
// different page.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, IdCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { hrEmployeeHref } from "@/features/hr/routes";
import { fetchHrEmployeeByParty } from "@/features/hr/service";

type PartyEmployee = {
  employee_id: string | null;
  display_name: string | null;
  directory_status: string | null;
  job_title: string | null;
  department: string | null;
  manager_employee_id: string | null;
  manager_name: string | null;
  hire_date: string | null;
};

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const STATUS_LABELS: Record<string, string> = {
  prehire: "Starting soon",
  active: "Active",
  on_leave: "On leave",
  terminated: "No longer here",
};

export function PartyEmployeeCard({
  partyId,
  orgId,
  orgSlugOrId,
}: {
  partyId: string;
  orgId: string;
  orgSlugOrId?: string | null;
}) {
  const [row, setRow] = useState<PartyEmployee | null>(null);

  useEffect(() => {
    if (!partyId || !orgId) return;
    let cancelled = false;

    (async () => {
      // The party's own door — NOT a directory search for the uuid, which
      // would match nothing and render "not an employee" for somebody who is.
      const result = await fetchHrEmployeeByParty({
        organizationId: orgId,
        partyId,
      });
      if (cancelled) return;
      // A refusal, a module that is off, a door that is not live, or a party
      // who genuinely is not an employee — all resolve to NOTHING.
      setRow(result.ok && result.data.employee_id ? result.data : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [partyId, orgId]);

  if (!row?.employee_id) return null;

  const org = orgSlugOrId ?? orgId;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
          Employee
        </h3>
        {row.directory_status ? (
          <Badge variant="outline" className="text-xs">
            {STATUS_LABELS[row.directory_status] ?? row.directory_status}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        {row.job_title ? (
          <div>
            <dt className="text-xs text-muted-foreground">Title</dt>
            <dd className="text-foreground">{row.job_title}</dd>
          </div>
        ) : null}
        {row.department ? (
          <div>
            <dt className="text-xs text-muted-foreground">Department</dt>
            <dd className="text-foreground">{row.department}</dd>
          </div>
        ) : null}
        {/* `manager_name` is null when `hr.employees.directory_shows_manager`
            is off — the FIELD is absent, not blank. */}
        {row.manager_name ? (
          <div>
            <dt className="text-xs text-muted-foreground">Manager</dt>
            <dd className="text-foreground">
              {row.manager_employee_id ? (
                <Link
                  href={hrEmployeeHref(row.manager_employee_id, "job", { org })}
                  className="underline-offset-2 hover:underline"
                >
                  {row.manager_name}
                </Link>
              ) : (
                row.manager_name
              )}
            </dd>
          </div>
        ) : null}
        {/* Likewise `hire_date` when `directory_shows_hire_date` is off. */}
        {row.hire_date ? (
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="text-foreground">{formatDay(row.hire_date)}</dd>
          </div>
        ) : null}
      </dl>

      <Link
        href={hrEmployeeHref(row.employee_id, null, { org })}
        className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted sm:min-h-9"
      >
        <span>Open the employee record</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  );
}
