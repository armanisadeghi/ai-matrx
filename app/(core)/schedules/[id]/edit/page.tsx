// app/(core)/schedules/[id]/edit/page.tsx

"use client";

import { use } from "react";
import Link from "next/link";
import { Eye, Loader2, Pencil, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { useTaskDetail } from "@/features/scheduling/hooks/useTaskDetail";
import { useScheduledTasks } from "@/features/scheduling/hooks/useScheduledTasks";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditSchedulePage({ params }: Props) {
  const { id } = use(params);
  const { task, status, error } = useTaskDetail(id);
  const { tasks } = useScheduledTasks();

  return (
    <>
      <EntityModeHeader
        backHref={`/schedules/${id}`}
        entityLabel={task?.title ?? "Edit schedule"}
        entityOptions={tasks.map((t) => ({
          label: t.title,
          href: `/schedules/${t.id}/edit`,
          active: t.id === id,
        }))}
        modes={[
          { name: "View", href: `/schedules/${id}`, icon: Eye },
          { name: "Edit", href: `/schedules/${id}/edit`, icon: Pencil },
          { name: "New", href: "/schedules/new", icon: Plus },
        ]}
      />
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-6 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="max-w-5xl mx-auto">
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
