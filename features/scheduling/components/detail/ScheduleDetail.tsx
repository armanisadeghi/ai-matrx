// features/scheduling/components/detail/ScheduleDetail.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  deleteScheduledTask,
  runTaskNowThunk,
  toggleTaskEnabled,
} from "../../redux/tasks/thunks";
import { useTaskDetail } from "../../hooks/useTaskDetail";
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
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/schedules">
            <ArrowLeft className="h-4 w-4" /> Schedules
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight truncate">
            {task.title}
          </h1>
          {task.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {task.enabled ? "Enabled" : "Paused"}
            <Switch
              checked={task.enabled}
              onCheckedChange={(enabled) =>
                dispatch(toggleTaskEnabled(task.id, enabled)).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed");
                })
              }
            />
          </div>
          <Button onClick={handleRunNow} disabled={running} size="sm">
            {running ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-1.5" />
            )}
            Run now
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/schedules/${task.id}/edit`}>
              <Edit className="h-4 w-4 mr-1.5" /> Edit
            </Link>
          </Button>
          <Button
            onClick={handleDelete}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      <SpecCard task={task} />
      <TriggerCard task={task} />
      <RunHistoryCard taskId={task.id} />
    </div>
  );
}
