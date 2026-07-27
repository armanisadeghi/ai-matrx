// features/scheduling/components/detail/ScheduleDetail.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, PlayCircle, Power, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import {
  deleteScheduledTask,
  runTaskNowThunk,
  toggleTaskEnabled,
} from "../../redux/tasks/thunks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createSchedulesScope } from "@/features/surfaces/manifests/schedules.manifest";
import { useTaskDetail } from "../../hooks/useTaskDetail";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { useTaskRuns } from "../../hooks/useTaskRuns";
import {
  buildOpenScheduleValues,
  buildScheduleRosterValues,
  buildScheduleRunValues,
} from "../../lib/schedules-scope";
import { SpecCard } from "./SpecCard";
import { TriggerCard } from "./TriggerCard";
import { RunHistoryCard } from "./RunHistoryCard";

interface Props {
  taskId: string;
}

/**
 * Surface emitter for `matrx-user/schedules` on the detail route. Emits the
 * roster plus the open schedule, its target action and its run history; the
 * scope is assembled at trigger time from live Redux state. `useTaskRuns`
 * here is the same hook `RunHistoryCard` uses (it no-ops when the runs are
 * already loaded), so no extra fetch is introduced.
 */
export function ScheduleDetail({ taskId }: Props) {
  const { task } = useTaskDetail(taskId);
  const { tasks, status, error } = useScheduledTasks();
  const {
    runs,
    status: runsStatus,
    error: runsError,
  } = useTaskRuns(taskId);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/schedules"
      getScope={() =>
        createSchedulesScope({
          ...buildScheduleRosterValues(tasks, status, error),
          ...(task ? buildOpenScheduleValues(task) : {}),
          ...buildScheduleRunValues(runs, runsStatus, runsError),
        })
      }
    >
      <ScheduleDetailBody taskId={taskId} />
    </SurfaceRuntimeProvider>
  );
}

function ScheduleDetailBody({ taskId }: Props) {
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
        actions={[
          {
            label: "Run now",
            icon: PlayCircle,
            onPress: () => void handleRunNow(),
            primary: true,
            disabled: running,
          },
          {
            label: task.enabled ? "Pause" : "Enable",
            icon: Power,
            onPress: () => {
              dispatch(toggleTaskEnabled(task.id, !task.enabled)).catch(
                (err) => {
                  toast.error(err instanceof Error ? err.message : "Failed");
                },
              );
            },
          },
          {
            label: "Delete",
            icon: Trash2,
            onPress: () => void handleDelete(),
            destructive: true,
          },
        ]}
      />
      <div className="space-y-4">
        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SpecCard task={task} />
          <TriggerCard task={task} />
        </div>
        <RunHistoryCard taskId={task.id} />
      </div>
    </>
  );
}
