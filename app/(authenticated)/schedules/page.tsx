// app/(authenticated)/schedules/page.tsx

"use client";

import Link from "next/link";
import { Plus, RefreshCw, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduledTasks } from "@/features/scheduling/hooks/useScheduledTasks";
import { ScheduleList } from "@/features/scheduling/components/list/ScheduleList";

export default function SchedulesPage() {
  const { refetch, tasks, status } = useScheduledTasks();

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <header className="shrink-0 border-b border-border bg-card/40">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded-md p-1.5 bg-blue-50 dark:bg-blue-950/40">
              <CalendarClock className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-base sm:text-lg leading-none truncate">
                Schedules
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run agents on a schedule, when a page matches, or as a
                heartbeat.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={status === "loading"}
              aria-label="Refresh"
              className="h-8 w-8"
            >
              <RefreshCw
                className={
                  status === "loading"
                    ? "h-3.5 w-3.5 animate-spin"
                    : "h-3.5 w-3.5"
                }
              />
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/schedules/new">
                <Plus className="h-4 w-4" /> New schedule
              </Link>
            </Button>
          </div>
        </div>
        {tasks.length > 0 && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-muted-foreground">
            {tasks.length} schedule{tasks.length === 1 ? "" : "s"}
            {" · "}
            {tasks.filter((t) => t.enabled).length} enabled
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <ScheduleList />
      </div>
    </div>
  );
}
