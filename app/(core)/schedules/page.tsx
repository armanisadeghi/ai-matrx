// app/(core)/schedules/page.tsx

"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  PlusTapButton,
  RefreshCwTapButton,
} from "@ai-matrx/tap-target/buttons";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import { useScheduledTasks } from "@/features/scheduling/hooks/useScheduledTasks";
import { ScheduleList } from "@/features/scheduling/components/list/ScheduleList";
import {
  buildScheduleListPayload,
  scheduleCsvRows,
  scheduleListHuman,
} from "@/features/scheduling/lib/copy";

export default function SchedulesPage() {
  const { refetch, tasks, status, error } = useScheduledTasks();

  return (
    <>
      <RouteHeader
        left={
          <div className="ml-2 flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-medium text-foreground">
              Schedules
            </h1>
            {tasks.length > 0 ? (
              <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
                {tasks.length} schedule{tasks.length === 1 ? "" : "s"}
                {" · "}
                {tasks.filter((t) => t.enabled).length} enabled
              </span>
            ) : null}
          </div>
        }
        right={
          <>
            {/* View copy + export live in the page's own header row rather
                than a second near-empty toolbar above the list. Copy/export
                always cover ALL schedules, never a visible slice. */}
            {tasks.length > 0 ? (
              <>
                <CopyButtons
                  size="icon"
                  unified
                  label="All schedules"
                  human={() => scheduleListHuman(tasks)}
                  json={() => tasks}
                  agent={() => buildScheduleListPayload(tasks, status, error)}
                  export={{
                    items: [
                      jsonExportItem(() => tasks),
                      csvExportItem(
                        () => scheduleCsvRows(tasks),
                        "CSV (all schedules)",
                      ),
                    ],
                  }}
                />
              </>
            ) : null}
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
