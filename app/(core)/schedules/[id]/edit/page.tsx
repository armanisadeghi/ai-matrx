// app/(authenticated)/schedules/[id]/edit/page.tsx

"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTaskDetail } from "@/features/scheduling/hooks/useTaskDetail";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditSchedulePage({ params }: Props) {
  const { id } = use(params);
  const { task, status, error } = useTaskDetail(id);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <header className="shrink-0 border-b border-border bg-card/40 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={`/schedules/${id}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-semibold text-base leading-none truncate">
            Edit schedule
          </h1>
          {task && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {task.title}
            </p>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
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
    </div>
  );
}
