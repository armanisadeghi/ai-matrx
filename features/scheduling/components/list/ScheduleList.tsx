// features/scheduling/components/list/ScheduleList.tsx

"use client";

import { CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { ScheduleRow } from "./ScheduleRow";

export function ScheduleList() {
  const { tasks, status, error, refetch } = useScheduledTasks();

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t load schedules</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error ?? "Unknown error"}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4">
        <div className="rounded-full bg-blue-50 dark:bg-blue-950/30 p-4 mb-4">
          <CalendarClock className="h-8 w-8 text-blue-500 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No scheduled tasks yet</h2>
        <p className="text-muted-foreground mb-5 max-w-md">
          Create one to have an agent run on a schedule, when a page matches,
          or as a heartbeat conversation.
        </p>
        <Button asChild>
          <Link href="/schedules/new" className="gap-2">
            <Plus className="h-4 w-4" /> Create schedule
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <ScheduleRow key={task.id} task={task} />
      ))}
    </div>
  );
}
