// app/(core)/schedules/[id]/edit/page.tsx

"use client";

import { use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useTaskDetail } from "@/features/scheduling/hooks/useTaskDetail";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditSchedulePage({ params }: Props) {
  const { id } = use(params);
  const { task, status, error } = useTaskDetail(id);

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href={`/schedules/${id}`}
              variant="transparent"
              ariaLabel="Back to schedule"
            />
            <h1 className="ml-2 text-sm font-medium text-foreground truncate">
              {task?.title ?? "Edit schedule"}
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-6 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="max-w-3xl mx-auto">
          {status === "loading" || status === "idle" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading schedule…
            </div>
          ) : status === "not-found" ? (
            <Alert>
              <AlertTitle>Schedule not found</AlertTitle>
              <AlertDescription>
                <Link href="/schedules" className="underline">
                  Back to schedules
                </Link>
              </AlertDescription>
            </Alert>
          ) : status === "error" || !task ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t load schedule</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <ScheduleForm task={task} />
          )}
        </div>
      </div>
    </>
  );
}
