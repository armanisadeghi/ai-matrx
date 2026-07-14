// features/scheduling/components/detail/ScheduleDetail.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import {
  LoadingTapButton,
  PlayTapButton,
  TrashTapButton,
} from "@/components/icons/tap-buttons";
import {
  deleteScheduledTask,
  runTaskNowThunk,
  toggleTaskEnabled,
} from "../../redux/tasks/thunks";
import { useTaskDetail } from "../../hooks/useTaskDetail";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { SpecCard } from "./SpecCard";
import { TriggerCard } from "./TriggerCard";
import { RunHistoryCard } from "./RunHistoryCard";

interface Props {
  taskId: string;
}

export function ScheduleDetail({ taskId }: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { task, status, error } = useTaskDetail(taskId);
  const { tasks } = useScheduledTasks();
  const [running, setRunning] = useState(false);

  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <Alert>
        <AlertTitle>Schedule not found</AlertTitle>
        <AlertDescription>
          The schedule you&apos;re looking for doesn&apos;t exist, or you
          don&apos;t have access.{" "}
          <Link href="/schedules" className="underline">
            Back to schedules
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "error" || !task) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load schedule</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await dispatch(runTaskNowThunk(task.id));
      toast.success("Queued a run");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue run");
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete schedule",
      description: `Delete "${task.title}". It will stop firing and disappear from your schedules. Past runs stay in your history. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await dispatch(deleteScheduledTask(task.id));
      toast.success("Schedule deleted");
      router.push("/schedules");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete schedule",
      );
    }
  };

  return (
    <>
      <EntityModeHeader
        backHref="/schedules"
        entityLabel={task.title}
        entityOptions={tasks.map((t) => ({
          label: t.title,
          href: `/schedules/${t.id}`,
          active: t.id === task.id,
        }))}
        modes={[
          { name: "View", href: `/schedules/${task.id}`, icon: Eye },
          { name: "Edit", href: `/schedules/${task.id}/edit`, icon: Pencil },
          { name: "New", href: "/schedules/new", icon: Plus },
        ]}
        right={
          <>
            <label className="mr-1 hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">
                {task.enabled ? "Enabled" : "Paused"}
              </span>
              <Switch
                checked={task.enabled}
                onCheckedChange={(enabled) =>
                  dispatch(toggleTaskEnabled(task.id, enabled)).catch((err) => {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  })
                }
              />
            </label>
            {running ? (
              <LoadingTapButton ariaLabel="Queuing run" disabled />
            ) : (
              <PlayTapButton
                ariaLabel="Run now"
                onClick={() => void handleRunNow()}
              />
            )}
            <TrashTapButton
              ariaLabel="Delete schedule"
              onClick={() => void handleDelete()}
            />
          </>
        }
      />
      <div className="space-y-4 max-w-5xl mx-auto">
        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        <SpecCard task={task} />
        <TriggerCard task={task} />
        <RunHistoryCard taskId={task.id} />
      </div>
    </>
  );
}
