// features/scheduling/components/list/ScheduleList.tsx

"use client";

import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createSchedulesScope } from "@/features/surfaces/manifests/schedules.manifest";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { useDuplicateSchedules } from "../../hooks/useDuplicateSchedules";
import { DuplicateScheduleBanner } from "./DuplicateScheduleBanner";
import { buildScheduleRosterValues } from "../../lib/schedules-scope";
import { scheduleKpis } from "../../lib/copy";
import { scheduleSummary } from "../../lib/copy";
import { ScheduleRow } from "./ScheduleRow";
import { useArchivedWatchTriggersState } from "../../hooks/useArchivedWatchTriggers";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * Surface emitter for `matrx-user/schedules` on the list route. The scope is
 * built at trigger time from the live Redux-backed roster (never on mount),
 * and only the roster group is emitted here — the open-schedule / run-history
 * / editor-draft values belong to the detail and form routes.
 */
export function ScheduleList() {
  const { tasks, status, error } = useScheduledTasks();
  const getSchedulesScope = () =>
    createSchedulesScope(buildScheduleRosterValues(tasks, status, error));

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/schedules"
      getScope={getSchedulesScope}
    >
      <NonEditableContextMenu
        sourceFeature="system"
        surfaceName="matrx-user/schedules"
        menuVersion={1}
        getApplicationScope={getSchedulesScope}
        contentSource={{ type: "raw" }}
        resolveContextOnOpen={(target) => {
          const row = target?.closest<HTMLElement>("[data-schedule-id]");
          const task = tasks.find(
            (item) => item.id === row?.dataset.scheduleId,
          );
          if (!task) return null;
          return {
            content: scheduleSummary(task),
            open_schedule: task,
          };
        }}
      >
        {/* Radix `asChild` must receive a DOM element that can accept its
            context-menu handlers/ref. A function component drops those props. */}
        <div className="contents">
          <ScheduleListBody />
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

function ScheduleListBody() {
  const { tasks, status, error, refetch } = useScheduledTasks();
  // Re-checked whenever the roster changes, so creating or pausing a schedule
  // updates the duplicate banner without a manual refresh.
  const {
    groups: duplicateGroups,
    error: duplicateError,
    loaded: duplicatesLoaded,
    refetch: refetchDuplicates,
  } = useDuplicateSchedules(tasks.length);
  // An automation watching an archived table can never run: said on the list and on its row
  // (lane PROOF-DEFECTS, D6).
  const { watching: watchingArchived, settled: watchSettled } = useArchivedWatchTriggersState(tasks);
  // The two side checks add a banner above the rows and a warning line inside them. Drawing the rows
  // first and growing them afterwards shoved the whole list (CLS 0.22 at 375px), so the skeleton
  // stays until both have answered — capped, so a check that never answers cannot hold the list.
  const [checksGaveUp, setChecksGaveUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setChecksGaveUp(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  const checking = tasks.length > 0 && !checksGaveUp && !(duplicatesLoaded && watchSettled);

  if (status === "loading" || status === "idle" || (status === "success" && checking)) {
    return (
      <div
        className="flex flex-col gap-2"
        data-surface-value="schedules_load_status"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Alert variant="destructive" data-surface-value="schedules_load_status">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t load schedules</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 break-words">{error ?? "Unknown error"}</span>
          <Button
            icon={<RefreshCw />}
            variant="outline"
            onClick={() => refetch()}
            className="shrink-0"
          > Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center px-4 py-16 text-center"
        data-surface-value="schedules_summary"
      >
        <div className="mb-4 rounded-full bg-muted p-4">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No scheduled tasks yet</h2>
        <p className="text-muted-foreground mb-5 max-w-md">
          Create one to have an agent run on a schedule, when a page matches, or
          as a heartbeat conversation.
        </p>
        <Button variant="primary" asChild>
          <Link href="/schedules/new" className="gap-2">
            <Plus className="h-4 w-4" /> Create schedule
          </Link>
        </Button>
      </div>
    );
  }

  const kpis = scheduleKpis(tasks);

  return (
    <div className="flex flex-col gap-2" data-surface-value="schedules_summary">
      {duplicateError && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Duplicate check unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {duplicateError} Your schedules are still available, but possible
              duplicate runs are not currently highlighted.
              <ErrorAlchemyMenu />
            </span>
            <Button
              icon={<RefreshCw />}
              variant="outline"
              onClick={() => refetchDuplicates()}
            > Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* Two schedules doing one job cost twice and look like nothing is wrong.
          Surfaced above the list because it is a property of the SET, not of
          any one row — no row can show it. */}
      <DuplicateScheduleBanner
        groups={duplicateGroups}
        onResolved={() => {
          void refetch();
          void refetchDuplicates();
        }}
      />
      {watchingArchived.size > 0 && (
        <p className="text-sm font-medium text-destructive" data-schedules-watch-archived={watchingArchived.size}>
          {watchingArchived.size === 1
            ? "1 automation watches an archived table and can never run; re-key it to the table's copy or disable it."
            : `${watchingArchived.size} automations watch an archived table and can never run; re-key each to its table's copy or disable it.`}
        </p>
      )}
      {tasks.map((task) => (
        <ScheduleRow
          key={task.id}
          task={task}
          kpis={kpis}
          watchesArchived={task.triggers.some((t) => watchingArchived.has(t.id))}
        />
      ))}
    </div>
  );
}
