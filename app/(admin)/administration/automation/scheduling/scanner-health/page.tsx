// app/(authenticated)/(admin-auth)/administration/automation/scheduling/scanner-health/page.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { getStatus } from "@/features/scheduling/service/schedulerClient";
import type { ScannerStatusResponse } from "@/features/scheduling/service/schedulerApi.types";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import { AttentionItemRow } from "@/features/admin/attention/AttentionItemRow";
import { partitionItems } from "@/features/admin/attention/build-notice";
import { NOTE_MUTE } from "@/features/admin/attention/item-mute";
import {
  SCHEDULE_ALARMS_QUERY_KEY,
  useScheduleAlarmSource,
} from "@/features/admin/attention/sources/useScheduleAlarmSource";
import type {
  AttentionAction,
  AttentionItem,
} from "@/features/admin/attention/types";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { useNow } from "@/hooks/useNow";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  definedOnly,
  useAdminSchedulingScopeSlice,
} from "@/features/scheduling/lib/admin-scheduling-scope";
import {
  OrganizationContextNotice,
  OrganizationRequiredNotice,
} from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";

export default function ScannerHealthPage() {
  const { organizationId, canLoad, organizationRequired, organizationState } =
    useOrganizationRequired();
  const [status, setStatus] = useState<ScannerStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestGeneration = useRef(0);
  /**
   * THE ALARM NOBODY READS (2026-08-24). A running scanner is not a healthy
   * schedule: on 2026-08-23 the scanner was fine and an APPROVED nightly was
   * repeat-guard-suspended, recorded perfectly, and read by no one for a day.
   * These rows are the schedules that need a human — the SAME source and the
   * SAME row the global attention dock renders (features/admin/attention), so
   * this page can never drift from the card that points at it. This page is
   * the review: it also lists the MUTED rows with their note, and un-mutes.
   */
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const schedules = useScheduleAlarmSource(Boolean(isSuperAdmin));
  const queryClient = useQueryClient();
  const now = useNow();
  const { live: liveAlarms, muted: mutedAlarms } = partitionItems(
    schedules.items,
    {},
    now,
  );
  const [noteFor, setNoteFor] = useState<AttentionItem | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const alarmError =
    schedules.status === "failed" ? (schedules.error ?? "unknown error") : null;

  const onAction = async (item: AttentionItem, action: AttentionAction) => {
    if (action.confirm) {
      const ok = await confirm({
        title: action.confirm.title,
        description: action.confirm.description,
        confirmLabel: action.confirm.confirmLabel,
        variant: action.confirm.variant ?? "default",
      });
      if (!ok) return;
    }
    try {
      await action.run();
      toast.success(`${action.label}: done for "${item.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const onMute = async (
    item: AttentionItem,
    ms: number,
    note: string | null = null,
  ) => {
    try {
      await item.mute.apply(Date.now() + ms, note);
      toast.success(
        `"${item.title}" is muted for every super-admin — it comes back on its own.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const onUnmute = async (item: AttentionItem) => {
    if (!item.mute.clear) return;
    try {
      await item.mute.clear();
      toast.success(`"${item.title}" is back on the attention dock.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

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

  const load = useCallback(async () => {
    // Button clicks and interval callbacks share this defense-in-depth gate.
    // A disabled button is presentation; the transport boundary must also
    // refuse to run before Redux has admitted an organization.
    if (!canLoad || !organizationId) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    // The scanner status and the schedule alarms are DIFFERENT facts: the
    // scanner can be perfectly healthy while an approved schedule is off. One
    // failing must never hide the other, so they settle independently — the
    // alarms through their own query, refreshed alongside every status poll.
    void queryClient.invalidateQueries({ queryKey: SCHEDULE_ALARMS_QUERY_KEY });
    try {
      // Pass the admitted id explicitly. React and the transport can observe
      // different store instances during app bootstrap; re-reading a singleton
      // here recreated the exact org-less request this page already gated.
      const nextStatus = await getStatus(organizationId);
      if (generation === requestGeneration.current) setStatus(nextStatus);
    } catch (err) {
      if (generation === requestGeneration.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [canLoad, organizationId, queryClient]);

  // Live status poll — but only while this admin tab is actually visible and
  // Redux has admitted an organization. The transport fails closed before the
  // wire without that context, so a cold boot must wait; an organization
  // arrival or switch re-enters this effect and refreshes immediately.
  // The old version polled the (agent-saturated) Python backend's
  // /scheduler/status every 10s forever, including on a backgrounded or
  // forgotten tab. Gate on document visibility: poll at 10s while watched,
  // stop entirely when hidden, and do one immediate refresh on re-focus so
  // the page is current the instant the admin looks back. (No Realtime path
  // exists — the scanner status is ephemeral aidream runtime state, not a
  // DB row — so a visibility-bounded poll is the right primitive here.)
  useEffect(() => {
    // Invalidate every request started under the previous organization (and
    // again on unmount). A late response must never repaint the new scope.
    const effectGeneration = ++requestGeneration.current;
    if (!canLoad) {
      return () => {
        if (requestGeneration.current === effectGeneration) {
          requestGeneration.current += 1;
        }
      };
    }
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
      requestGeneration.current += 1;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canLoad, organizationId, load]);

  // A settled no-organization state is not a scanner outage. Keep the
  // terminal picker-backed remedy honest instead of rendering the transport's
  // developer-facing refusal as "Scanner unreachable".
  // And a read that FAILED is not a settled no-organization state either
  // (R37): say we could not check, with Retry — never "select an organization"
  // about memberships nobody managed to read.
  if (organizationState === "unavailable") {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
        <OrganizationContextNotice state="unavailable" what="Scanner health" />
      </div>
    );
  }
  if (organizationRequired) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
        <OrganizationRequiredNotice what="Scanner health" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-blue-500" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={!canLoad || loading}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Schedules that need a human. First on the page, because a green
          scanner told nobody that an approved nightly had switched itself off.
          The same rows, the same row component and the same actions as the
          global attention dock — plus the muted ones, which the dock hides. */}
      {liveAlarms.length > 0 ? (
        <div
          className="rounded-lg border border-border bg-card px-3"
          data-surface-value="schedule_alarms"
        >
          <ul className="divide-y divide-border/60">
            {liveAlarms.map((item) => (
              <AttentionItemRow
                key={item.key}
                item={item}
                onAction={onAction}
                onMute={onMute}
                onMuteWithNote={setNoteFor}
                onUnmute={onUnmute}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {schedules.status === "ok" && liveAlarms.length === 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-surface-value="schedule_alarms_clear"
        >
          No schedule needs attention — nothing suspended, overdue, or failing
          {mutedAlarms.length > 0 ? ` (${mutedAlarms.length} muted below)` : ""}
          .
        </p>
      ) : null}
      {mutedAlarms.length > 0 ? (
        <div className="space-y-1" data-surface-value="schedule_alarms_muted">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Muted — quiet on purpose, for a while
          </h2>
          <div className="rounded-lg border border-border bg-card px-3">
            <ul className="divide-y divide-border/60">
              {mutedAlarms.map((item) => (
                <AttentionItemRow
                  key={item.key}
                  item={item}
                  muted
                  onAction={onAction}
                  onMute={onMute}
                  onMuteWithNote={setNoteFor}
                  onUnmute={onUnmute}
                />
              ))}
            </ul>
          </div>
        </div>
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
      <TextInputDialog
        open={noteFor !== null}
        onOpenChange={(open) => {
          if (!open) setNoteFor(null);
        }}
        title={
          noteFor ? `Mute "${noteFor.title}" for ${NOTE_MUTE.label}` : "Mute"
        }
        description="Say why it is fine for this to stay off — every super-admin will read it beside the schedule, and the mute ends on its own."
        placeholder="e.g. The commerce module is not built yet; nothing to sync until eBay approves us."
        multiline
        rows={3}
        confirmLabel={`Mute for ${NOTE_MUTE.label}`}
        busy={noteBusy}
        onConfirm={async (value) => {
          if (!noteFor) return;
          setNoteBusy(true);
          try {
            await onMute(noteFor, NOTE_MUTE.ms, value.trim());
            setNoteFor(null);
          } finally {
            setNoteBusy(false);
          }
        }}
      />

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
              The Python backend may be down, or the scanner is not enabled (set{" "}
              <code>AIDREAM_SCHEDULER=1</code> on the host).
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
              tone={status.last_tick_expired_sweeps > 0 ? "warning" : "default"}
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
