// app/(authenticated)/(admin-auth)/administration/automation/scheduling/page.tsx

"use client";

import { useEffect, useState } from "react";
import {
  UntrustedCount,
  type CountRead,
} from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Loader2,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import {
  fetchHealthSummary,
  type SchedulingHealthSummary,
} from "@/lib/services/scheduling-admin-service";
import {
  definedOnly,
  useAdminSchedulingScopeSlice,
} from "@/features/scheduling/lib/admin-scheduling-scope";

export default function SchedulingAdminOverview() {
  const [health, setHealth] = useState<SchedulingHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Absent until the summary resolves — the manifest promises exactly that.
  useAdminSchedulingScopeSlice("overview", () =>
    definedOnly({
      task_total_count: health?.taskCount,
      task_enabled_count: health?.enabledCount,
      task_due_next_hour_count: health?.upcomingNextHour,
      runs_last_24h_count: health?.runsLast24h,
      failures_last_24h_count: health?.failuresLast24h,
      orphan_lease_summary_count: health?.orphanLeases,
      overview_load_error: error ?? undefined,
    }),
  );

  useEffect(() => {
    fetchHealthSummary()
      .then(setHealth)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  const healthRead: CountRead = {
    status: error ? "error" : health ? "ready" : "loading",
    error,
    hasData: health !== null,
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      {/* Cross-user view of sch_*; platform admins read all via is_platform_admin() in RLS. */}

      {error && (
        <Alert variant="destructive" data-surface-value="overview_load_error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat
          read={healthRead}
          label="Total tasks"
          value={health?.taskCount}
          icon={ListChecks}
          surfaceValue="task_total_count"
        />
        <Stat
          read={healthRead}
          label="Enabled"
          value={health?.enabledCount}
          icon={CalendarCheck}
          surfaceValue="task_enabled_count"
        />
        <Stat
          read={healthRead}
          label="Due in next hour"
          value={health?.upcomingNextHour}
          icon={CalendarClock}
          surfaceValue="task_due_next_hour_count"
        />
        <Stat
          read={healthRead}
          label="Runs (24h)"
          value={health?.runsLast24h}
          icon={Activity}
          surfaceValue="runs_last_24h_count"
        />
        <Stat
          read={healthRead}
          label="Failures (24h)"
          value={health?.failuresLast24h}
          icon={ShieldAlert}
          tone={health && health.failuresLast24h > 0 ? "warning" : "default"}
          surfaceValue="failures_last_24h_count"
        />
        <Stat
          read={healthRead}
          label="Orphan leases"
          value={health?.orphanLeases}
          icon={AlertTriangle}
          tone={health && health.orphanLeases > 0 ? "warning" : "default"}
          surfaceValue="orphan_lease_summary_count"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile
          href="/administration/automation/scheduling/tasks"
          icon={ListChecks}
          title="Tasks"
          description="Every scheduled task across the platform"
        />
        <Tile
          href="/administration/automation/scheduling/runs"
          icon={Activity}
          title="Runs"
          description="Run history by status, surface and date"
        />
        <Tile
          href="/administration/automation/scheduling/system-jobs"
          icon={CalendarCheck}
          title="System jobs"
          description="Recurring server jobs you can edit or run now"
          badge="Python"
        />
        <Tile
          href="/administration/automation/scheduling/orphan-leases"
          icon={AlertTriangle}
          title="Orphan leases"
          description="Claims that lapsed mid-run; should self-heal"
        />
        <Tile
          href="/administration/automation/scheduling/cron-tester"
          icon={CalendarClock}
          title="Cron tester"
          description="Validate an expression and preview next fires"
        />
        <Tile
          href="/administration/automation/scheduling/scanner-health"
          icon={CalendarCheck}
          title="Scanner health"
          description="Last tick, queue depth, in-flight claims"
          badge="Python"
        />
        <Tile
          href="/administration/automation/scheduling/templates"
          icon={CalendarClock}
          title="Templates"
          description="Starter schedules users can clone"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
  surfaceValue,
  read,
}: {
  label: string;
  value: number | undefined;
  /** The health read behind `value`: a failed read shows "—", never a forever-skeleton. */
  read: CountRead;
  icon: typeof Activity;
  tone?: "default" | "warning";
  surfaceValue: string;
}) {
  return (
    <Card data-surface-value={surfaceValue}>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-none mt-1">
            {value === undefined && read.status === "loading" ? (
              <Skeleton className="h-7 w-12 inline-block" />
            ) : (
              <UntrustedCount read={read} label={label} value={value ?? 0} />
            )}
          </div>
        </div>
        <div
          className={
            tone === "warning"
              ? "rounded-md p-2 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              : "rounded-md p-2 bg-muted text-muted-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: typeof Activity;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <AppLink
      href={href}
      className="rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors p-4 flex gap-3"
    >
      <div className="rounded-md p-2 bg-blue-50 dark:bg-blue-950/40 self-start">
        <Icon className="h-4 w-4 text-blue-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-medium leading-none">{title}</div>
          {badge && (
            <Badge variant="secondary" className="text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
          {description}
        </p>
      </div>
    </AppLink>
  );
}
