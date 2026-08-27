// features/hr/entry-points/OrgHrPeopleSection.tsx
//
// D1 / SPEC-UI-IA §6 row 93 — the **People** section of org settings.
//
// 🚨 IT CONFIGURES NOTHING ITSELF. The module toggle lives in
// `OrgModuleSettings` (the existing per-org module-toggle pattern) and every HR
// setting lives at `/hr/settings/*`. This section is a summary and a set of
// DOORS. A second place to change an HR setting is a second source of truth for
// what this employer's rules are, and the two would disagree within a week.
//
// 🚨 MODULE OFF → the owner/admin gets ONE enable door and nothing else; anyone
// else gets nothing at all. Absent, not disabled (SPEC-UI-IA §6).
//
// Org owner/admin only — the caller gates on that, and the door's own server
// side gates again.

"use client";

import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hrHref, hrPeopleHref, hrSettingsHref } from "@/features/hr/routes";

import { useHrOrgSummary } from "./useHrOrgSummary";

/** The settings destinations worth surfacing from org settings. Doors, not controls. */
const SETTINGS_DOORS = [
  { section: "employer" as const, label: "Employer profile" },
  { section: "structure" as const, label: "Departments, locations, job titles" },
  { section: "access" as const, label: "Who can see what" },
  { section: "workflows" as const, label: "Approvals" },
  { section: "retention" as const, label: "Records retention" },
];

export function OrgHrPeopleSection({
  organizationId,
  orgSlugOrId,
  canManage,
}: {
  organizationId: string;
  orgSlugOrId: string;
  /** Org owner/admin. Everyone else gets nothing from this section. */
  canManage: boolean;
}) {
  const { summary, isLoading, absent } = useHrOrgSummary(organizationId);

  if (!canManage) return null;
  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-md bg-muted/40" />;
  }
  // No answer at all → nothing. Not "HR is unavailable", which would be a
  // sentence about something this viewer may have no business knowing.
  if (absent || !summary) return null;

  if (!summary.module_enabled) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          HR is not switched on for this organization. Turning it on gives you
          an employee record for each person, a directory, time and leave.
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          {/* The toggle itself lives in Module settings — this is its door. */}
          <a href="#modules">
            Turn HR on
            <ChevronRight className="ml-1 h-4 w-4" />
          </a>
        </Button>
      </div>
    );
  }

  if (!summary.is_activated) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          HR is on, but nobody has set this employer up yet. The setup asks for
          the legal entity, the first location, and who runs HR here.
        </p>
        <Button asChild size="sm" className="min-h-11 sm:min-h-9">
          <Link href={hrHref(orgSlugOrId)}>
            Set HR up
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          label="People"
          value={summary.headcount}
          href={hrPeopleHref({ org: orgSlugOrId })}
        />
        {/* `prehire` spells are excluded from headcount everywhere — so they
            get their own tile rather than quietly inflating the first one. */}
        {summary.prehire_count > 0 ? (
          <SummaryTile
            label="Starting soon"
            value={summary.prehire_count}
            href={hrPeopleHref({ org: orgSlugOrId, status: ["prehire"] })}
          />
        ) : null}
        {summary.pending_approvals > 0 ? (
          <SummaryTile
            label="Waiting on a decision"
            value={summary.pending_approvals}
            href={`/hr/tasks?org=${encodeURIComponent(orgSlugOrId)}`}
          />
        ) : null}
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {SETTINGS_DOORS.map((door) => (
          <li key={door.section}>
            <Link
              href={hrSettingsHref(door.section, { org: orgSlugOrId })}
              className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-muted"
            >
              <span className="min-w-0 truncate">{door.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
        <Link href={hrHref(orgSlugOrId)}>
          <Users className="mr-1.5 h-4 w-4" />
          Open HR
        </Link>
      </Button>
    </div>
  );
}

/** A count is a door (LAW 1) — every number here opens the list behind it. */
function SummaryTile({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 flex-col rounded-md border border-border bg-card px-3 py-2 hover:bg-muted"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </Link>
  );
}
