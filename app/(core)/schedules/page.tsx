// app/(core)/schedules/page.tsx

"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  PlusTapButton,
  RefreshCwTapButton,
} from "@/components/icons/tap-buttons";
import { useScheduledTasks } from "@/features/scheduling/hooks/useScheduledTasks";
import { ScheduleList } from "@/features/scheduling/components/list/ScheduleList";

export default function SchedulesPage() {
  const { refetch, tasks, status } = useScheduledTasks();

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            Schedules
          </h1>
        }
        center={
          tasks.length > 0 ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {tasks.length} schedule{tasks.length === 1 ? "" : "s"}
              {" · "}
              {tasks.filter((t) => t.enabled).length} enabled
            </span>
          ) : undefined
        }
        right={
          <>
            <RefreshCwTapButton
              ariaLabel="Refresh"
              onClick={() => refetch()}
              disabled={status === "loading"}
              className={status === "loading" ? "animate-spin" : undefined}
            />
            <PlusTapButton ariaLabel="New schedule" href="/schedules/new" />
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
        <ScheduleList />
      </div>
    </>
  );
}
