// features/hr/entry-points/OrgHrPeopleSection.tsx
//
// D1 / SPEC-UI-IA §6 row 93 — the **People** section of org settings.
//
// 🚨 IT CONFIGURES NOTHING ITSELF — WITH ONE NAMED EXCEPTION. Every HR setting
// lives at `/hr/settings/*`; a second place to change one is a second source of
// truth for this employer's rules, and the two would disagree within a week.
//
// The exception is SWITCHING THE MODULE ON, and it is not an HR setting: it is
// the act that precedes HR existing at all (SPEC-ACCESS §1.1's bootstrap, the
// single named place where org standing confers HR standing). This card used to
// hand that job to `#modules`, and the G2 verifier measured what that anchor
// actually reached: a card with **zero links and zero buttons**, because
// `public.hr_org_summary` had never shipped and nothing anywhere wrote
// `settings->hr->module_enabled`. `/hr`'s "Turn on HR" pointed here, and here
// pointed nowhere — a circular dead end against the no-dead-ends law. The button
// below does the thing.
//
// 🚨 MODULE OFF → the owner/admin gets ONE enable door and nothing else; anyone
// else gets nothing at all. Absent, not disabled (SPEC-UI-IA §6).
//
// Org owner/admin only — the caller gates on that, and the door's own server
// side gates again.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { enableHrModule } from "@/features/hr/service";
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
    return <EnableHrRow organizationId={organizationId} orgSlugOrId={orgSlugOrId} />;
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

/**
 * The one control this section owns.
 *
 * On success it goes straight to `/hr`, because switching the module on is never the thing
 * somebody actually wanted — setting the employer up is, and `/hr` is where the activation wizard
 * lives. Leaving them on an org-settings card to find their own way there is how the previous
 * version became a dead end.
 */
function EnableHrRow({
  organizationId,
  orgSlugOrId,
}: {
  organizationId: string;
  orgSlugOrId: string;
}) {
  const router = useRouter();
  const [enabling, setEnabling] = useState(false);

  async function turnOn() {
    setEnabling(true);
    const result = await enableHrModule({ organizationId, enabled: true });

    // A refusal is DATA — `supabase.rpc()` does not throw when the server says no. Render the
    // server's own sentence; it names what was missing far better than a generic failure.
    if (!result.ok) {
      setEnabling(false);
      toast.error(
        result.kind === "denied"
          ? (result.detail ?? "You cannot switch HR on for this organization.")
          : result.message,
      );
      return;
    }
    router.push(hrHref(orgSlugOrId));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-muted-foreground">
        HR is not switched on for this organization. Turning it on gives you an
        employee record for each person, a directory, time and leave.
      </p>
      <Button
        size="sm"
        className="min-h-11 sm:min-h-9"
        onClick={turnOn}
        disabled={enabling}
      >
        {enabling ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            Turning HR on
          </>
        ) : (
          <>
            Turn HR on
            <ChevronRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
