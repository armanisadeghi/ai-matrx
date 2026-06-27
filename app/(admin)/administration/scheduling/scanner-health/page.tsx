// app/(authenticated)/(admin-auth)/administration/scheduling/scanner-health/page.tsx

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
import type { ScannerStatusResponse } from "@/features/scheduling/service/schedulerApi.types";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";

export default function ScannerHealthPage() {
  const [status, setStatus] = useState<ScannerStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStatus();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
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
          <Card>
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
                  Started {humanizeRelative(status.started_at)} · Last tick{" "}
                  {humanizeRelative(status.last_tick_at)}
                </div>
              </div>
              {status.consecutive_errors > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {status.consecutive_errors} errors
                </Badge>
              )}
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
            />
            <Stat
              icon={Activity}
              label="Claimed (last tick)"
              value={String(status.last_tick_claimed)}
            />
            <Stat
              icon={AlertTriangle}
              label="Expired (last tick)"
              value={String(status.last_tick_expired_sweeps)}
              tone={
                status.last_tick_expired_sweeps > 0 ? "warning" : "default"
              }
            />
            <Stat
              icon={Activity}
              label="Total dispatched"
              value={String(status.total_runs_dispatched)}
            />
            <Stat
              icon={Activity}
              label="Manual claimed (last tick)"
              value={String(status.last_tick_manual_claimed)}
            />
            <Stat
              icon={Activity}
              label="In flight"
              value={String(status.in_flight_count)}
            />
          </div>

          {status.error_message && (
            <Alert variant="destructive">
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
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
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
