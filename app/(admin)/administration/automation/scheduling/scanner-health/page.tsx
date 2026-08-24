// app/(authenticated)/(admin-auth)/administration/automation/scheduling/scanner-health/page.tsx

"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Activity,
  CalendarCheck,
  CheckCircle,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getStatus } from "@/features/scheduling/service/schedulerClient";
import {
  fetchSystemScheduleAlarms,
  type SystemScheduleAlarm,
} from "@/features/scheduling/service/queries";
import type { ScannerStatusResponse } from "@/features/scheduling/service/schedulerApi.types";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  definedOnly,
  useAdminSchedulingScopeSlice,
} from "@/features/scheduling/lib/admin-scheduling-scope";

export default function ScannerHealthPage() {
  const [status, setStatus] = useState<ScannerStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /**
   * THE ALARM NOBODY READS (2026-08-24). A running scanner is not a healthy
   * schedule: on 2026-08-23 the scanner was fine and an APPROVED nightly was
   * repeat-guard-suspended, recorded perfectly, and read by no one for a day.
   * These rows are the schedules that need a human — and they are read through
   * a super-admin SECURITY DEFINER function because `sch_task` has no admin RLS
   * clause, so a system schedule is invisible to an ordinary console read.
   */
  const [alarms, setAlarms] = useState<SystemScheduleAlarm[] | null>(null);
  const [alarmError, setAlarmError] = useState<string | null>(null);

  // Everything the poll returns, plus why the poll failed if it did. The
  // scanner's OWN error and an unreachable backend are different facts, so
  // they are different values.
  useAdminSchedulingScopeSlice("scanner_health", () =>
    definedOnly({
      scanner_running: status?.running,
      scanner_started_at: status?.started_at ?? undefined,
      scanner_last_tick_at: status?.last_tick_at ?? undefined,
      scanner_last_tick_duration_ms: status?.last_tick_duration_ms ?? undefined,
      scanner_last_tick_claimed: status?.last_tick_claimed,
      scanner_last_tick_manual_claimed: status?.last_tick_manual_claimed,
      scanner_last_tick_expired_sweeps: status?.last_tick_expired_sweeps,
      scanner_total_runs_dispatched: status?.total_runs_dispatched,
      scanner_in_flight_count: status?.in_flight_count,
      scanner_consecutive_errors: status?.consecutive_errors,
      scanner_error_message: status?.error_message ?? undefined,
      scanner_unreachable_error: error ?? undefined,
    }),
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    // The scanner status and the schedule alarms are DIFFERENT facts: the
    // scanner can be perfectly healthy while an approved schedule is off. One
    // failing must never hide the other, so they settle independently.
    const [statusResult, alarmResult] = await Promise.allSettled([
      getStatus(),
      fetchSystemScheduleAlarms(),
    ]);
    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    else
      setError(
        statusResult.reason instanceof Error
          ? statusResult.reason.message
          : String(statusResult.reason),
      );
    if (alarmResult.status === "fulfilled") {
      setAlarms(alarmResult.value);
      setAlarmError(null);
    } else {
      setAlarms(null);
      setAlarmError(
        alarmResult.reason instanceof Error
          ? alarmResult.reason.message
          : String(alarmResult.reason),
      );
    }
    setLoading(false);
  };

  // Live status poll — but only while this admin tab is actually visible.
  // The old version polled the (agent-saturated) Python backend's
  // /scheduler/status every 10s forever, including on a backgrounded or
  // forgotten tab. Gate on document visibility: poll at 10s while watched,
  // stop entirely when hidden, and do one immediate refresh on re-focus so
  // the page is current the instant the admin looks back. (No Realtime path
  // exists — the scanner status is ephemeral aidream runtime state, not a
  // DB row — so a visibility-bounded poll is the right primitive here.)
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    };
    const start = () => {
      if (id) return;
      void load();
      id = setInterval(() => void load(), 10000);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-blue-500" />
          <div>
            <h1 className="text-lg font-semibold leading-none">
              Scanner health
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live status from aidream&apos;s matrx-scheduler scanner.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Schedules that need a human. First on the page, because a green
          scanner told nobody that an approved nightly had switched itself off. */}
      {alarms && alarms.length > 0 ? (
        <div className="space-y-2" data-surface-value="schedule_alarms">
          {alarms.map((alarm) => (
            <Alert
              key={alarm.task_id}
              variant={alarm.severity === "critical" ? "destructive" : "default"}
              className={cn(
                alarm.severity === "critical"
                  ? undefined
                  : "border-warning/50 bg-warning/10",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex flex-wrap items-center gap-2">
                <span>
                  {alarm.alarm === "suspended"
                    ? "Switched off by the repeat guard"
                    : alarm.alarm === "overdue"
                      ? "Enabled but overdue"
                      : "Last run failed"}
                </span>
                {/* THE DOOR LAW: a named schedule opens. `href` is explicit
                    because these are scheduled tasks, whose record route is
                    /schedules/<id> — never the workspace task route. */}
                <EntityRef
                  token="scheduled_task"
                  id={alarm.task_id}
                  name={alarm.title}
                  href={`/schedules/${alarm.task_id}`}
                />
              </AlertTitle>
              <AlertDescription>
                <div className="text-xs leading-5">{alarm.detail}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {alarm.alarm === "suspended"
                    ? "Nothing will run until a person re-enables it."
                    : alarm.next_due_at
                      ? `Due ${humanizeRelative(alarm.next_due_at)}.`
                      : "No next run is scheduled."}
                  {alarm.consecutive_failures
                    ? ` ${alarm.consecutive_failures} identical failures in a row.`
                    : ""}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}
      {alarms && alarms.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-surface-value="schedule_alarms_clear">
          No schedule needs attention — nothing suspended, overdue, or failing.
        </p>
      ) : null}
      {alarmError ? (
        <Alert variant="destructive" data-surface-value="schedule_alarms_error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Schedule alarms could not be read</AlertTitle>
          <AlertDescription className="text-xs">
            {alarmError}. A suspended or failing schedule would not be visible
            here until this read works, so treat this as unknown, not healthy.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && (
        <Alert
          variant="destructive"
          data-surface-value="scanner_unreachable_error"
        >
          <Server className="h-4 w-4" />
          <AlertTitle>Scanner unreachable</AlertTitle>
          <AlertDescription>
            <div className="mb-2">{error}</div>
            <div className="text-xs">
              The Python backend may be down, or the scanner is not enabled
              (set <code>AIDREAM_SCHEDULER=1</code> on the host).
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!status && !error ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : status ? (
        <>
          <Card data-surface-value="scanner_running">
            <CardContent className="p-4 flex items-center gap-3">
              {status.running ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {status.running ? "Scanner running" : "Scanner stopped"}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span data-surface-value="scanner_started_at">
                    Started {humanizeRelative(status.started_at)}
                  </span>{" "}
                  ·{" "}
                  <span data-surface-value="scanner_last_tick_at">
                    Last tick {humanizeRelative(status.last_tick_at)}
                  </span>
                </div>
              </div>
              <div data-surface-value="scanner_consecutive_errors">
                {status.consecutive_errors > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {status.consecutive_errors} errors
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat
              icon={Activity}
              label="Last tick"
              value={
                status.last_tick_duration_ms !== null
                  ? `${status.last_tick_duration_ms} ms`
                  : "—"
              }
              surfaceValue="scanner_last_tick_duration_ms"
            />
            <Stat
              icon={Activity}
              label="Claimed (last tick)"
              value={String(status.last_tick_claimed)}
              surfaceValue="scanner_last_tick_claimed"
            />
            <Stat
              icon={AlertTriangle}
              label="Expired (last tick)"
              value={String(status.last_tick_expired_sweeps)}
              tone={
                status.last_tick_expired_sweeps > 0 ? "warning" : "default"
              }
              surfaceValue="scanner_last_tick_expired_sweeps"
            />
            <Stat
              icon={Activity}
              label="Total dispatched"
              value={String(status.total_runs_dispatched)}
              surfaceValue="scanner_total_runs_dispatched"
            />
            <Stat
              icon={Activity}
              label="Manual claimed (last tick)"
              value={String(status.last_tick_manual_claimed)}
              surfaceValue="scanner_last_tick_manual_claimed"
            />
            <Stat
              icon={Activity}
              label="In flight"
              value={String(status.in_flight_count)}
              surfaceValue="scanner_in_flight_count"
            />
          </div>

          {status.error_message && (
            <Alert
              variant="destructive"
              data-surface-value="scanner_error_message"
            >
              <AlertTitle>Recent error</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                {status.error_message}
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
  surfaceValue,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "default" | "warning";
  surfaceValue: string;
}) {
  return (
    <Card data-surface-value={surfaceValue}>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold mt-1">{value}</div>
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
