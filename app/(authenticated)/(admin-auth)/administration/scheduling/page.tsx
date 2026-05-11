// app/(authenticated)/(admin-auth)/administration/scheduling/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  fetchHealthSummary,
  type SchedulingHealthSummary,
} from "@/lib/services/scheduling-admin-service";

export default function SchedulingAdminOverview() {
  const [health, setHealth] = useState<SchedulingHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealthSummary()
      .then(setHealth)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-blue-500" />
        <div>
          <h1 className="text-lg font-semibold leading-none">
            Scheduling administration
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-user view of the sch_* spine. RLS allows platform admins to
            read everything via the is_platform_admin() escape hatch.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat
          label="Total tasks"
          value={health?.taskCount}
          icon={ListChecks}
        />
        <Stat
          label="Enabled"
          value={health?.enabledCount}
          icon={CalendarCheck}
        />
        <Stat
          label="Due in next hour"
          value={health?.upcomingNextHour}
          icon={CalendarClock}
        />
        <Stat
          label="Runs (24h)"
          value={health?.runsLast24h}
          icon={Activity}
        />
        <Stat
          label="Failures (24h)"
          value={health?.failuresLast24h}
          icon={ShieldAlert}
          tone={health && health.failuresLast24h > 0 ? "warning" : "default"}
        />
        <Stat
          label="Orphan leases"
          value={health?.orphanLeases}
          icon={AlertTriangle}
          tone={health && health.orphanLeases > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile
          href="/administration/scheduling/tasks"
          icon={ListChecks}
          title="Tasks"
          description="Every scheduled task across the platform — filter, inspect, disable."
        />
        <Tile
          href="/administration/scheduling/runs"
          icon={Activity}
          title="Runs"
          description="Run history with status / surface / date filters."
        />
        <Tile
          href="/administration/scheduling/orphan-leases"
          icon={AlertTriangle}
          title="Orphan leases"
          description="Claims that lapsed mid-execution — should self-heal but watch for spikes."
        />
        <Tile
          href="/administration/scheduling/cron-tester"
          icon={CalendarClock}
          title="Cron tester"
          description="Validate any expression + tz; preview the next N fires."
        />
        <Tile
          href="/administration/scheduling/scanner-health"
          icon={CalendarCheck}
          title="Scanner health"
          description="aidream-backed status: last tick, queue depth, in-flight claims."
          badge="Python"
        />
        <Tile
          href="/administration/scheduling/templates"
          icon={CalendarClock}
          title="Templates"
          description="Curated starter schedules users can clone."
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
}: {
  label: string;
  value: number | undefined;
  icon: typeof Activity;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-none mt-1">
            {value === undefined ? (
              <Skeleton className="h-7 w-12 inline-block" />
            ) : (
              value
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
    <Link
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
    </Link>
  );
}
