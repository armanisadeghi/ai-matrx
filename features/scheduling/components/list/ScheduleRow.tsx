// features/scheduling/components/list/ScheduleRow.tsx

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Edit,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  deleteScheduledTask,
  runTaskNowThunk,
  toggleTaskEnabled,
} from "../../redux/tasks/thunks";
import { humanizeRelative } from "../../utils/triggerHumanize";
import type { AgendaTask } from "../../types";
import { TriggerChip } from "./TriggerChip";
import { SurfacesChips } from "./SurfacesChips";

interface Props {
  task: AgendaTask;
}

export function ScheduleRow({ task }: Props) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  const trigger = task.triggers[0];

  const handleToggle = (enabled: boolean) => {
    dispatch(toggleTaskEnabled(task.id, enabled)).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle schedule",
      );
    });
  };

  const handleRunNow = async () => {
    if (running) return;
    setRunning(true);
    try {
      await dispatch(runTaskNowThunk(task.id));
      toast.success("Queued a run", {
        description: "An executor surface will pick it up.",
      });
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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete schedule",
      );
    }
  };

  const navigate = () => {
    startTransition(() => router.push(`/schedules/${task.id}`));
  };

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_auto] gap-3 items-center",
        "border border-border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors",
      )}
    >
      <Link
        href={`/schedules/${task.id}`}
        className="min-w-0 flex flex-col gap-1.5"
        onClick={(e) => {
          // Use useTransition for the navigation so we get loading feedback.
          e.preventDefault();
          navigate();
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "font-semibold truncate",
              !task.enabled && "text-muted-foreground",
            )}
          >
            {task.title}
          </span>
          {isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TriggerChip trigger={trigger} />
          <SurfacesChips surfaces={task.surfaces} />
          <span className="ml-1">Next: {humanizeRelative(task.nextDueAt)}</span>
          <span>· Last: {humanizeRelative(task.lastRunAt)}</span>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <Switch
          checked={task.enabled}
          onCheckedChange={handleToggle}
          aria-label={task.enabled ? "Pause schedule" : "Resume schedule"}
          disabled={isPending}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Schedule actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleRunNow} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Run now
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/schedules/${task.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggle(!task.enabled)}>
              {task.enabled ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
