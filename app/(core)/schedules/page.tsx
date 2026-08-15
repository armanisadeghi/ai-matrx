// app/(core)/schedules/page.tsx

"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  PlusTapButton,
  RefreshCwTapButton,
} from "@/components/icons/tap-buttons";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
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
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            Schedules
          </h1>
        }
        center={
          tasks.length > 0 ? (
            <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
              {tasks.length} schedule{tasks.length === 1 ? "" : "s"}
              {" · "}
              {tasks.filter((t) => t.enabled).length} enabled
            </span>
          ) : undefined
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
                  label="All schedules"
                  human={() => scheduleListHuman(tasks)}
                  json={() => tasks}
                  agent={() => buildScheduleListPayload(tasks, status, error)}
                />
                <ExportMenu
                  label="Schedules"
                  items={[
                    jsonExportItem(() => tasks),
                    csvExportItem(
                      () => scheduleCsvRows(tasks),
                      "CSV (all schedules)",
                    ),
                  ]}
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
