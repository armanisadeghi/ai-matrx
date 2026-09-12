// features/scheduling/components/detail/ScheduleDetail.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, PlayCircle, Power, Trash2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  deleteScheduledTask,
  fetchScheduledTask,
  runTaskNowThunk,
  setSystemTaskEnabled,
  toggleTaskEnabled,
  updateScheduledTask,
} from "../../redux/tasks/thunks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { createSchedulesScope } from "@/features/surfaces/manifests/schedules.manifest";
import { useTaskDetail } from "../../hooks/useTaskDetail";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { useTaskRuns } from "../../hooks/useTaskRuns";
import {
  buildOpenScheduleValues,
  buildScheduleRosterValues,
  buildScheduleRunValues,
} from "../../lib/schedules-scope";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  buildScheduleRecordPayload,
  runCsvRows,
  scheduleKpis,
  scheduleRecordVariants,
  scheduleSummary,
} from "../../lib/copy";
import { SpecCard } from "./SpecCard";
import { TriggerCard } from "./TriggerCard";
import { RunHistoryCard } from "./RunHistoryCard";
import { SuspensionCard, approvalSentence } from "./SuspensionCard";
import { humanizeRelative } from "../../utils/triggerHumanize";

/**
 * Where a platform system job's cadence, parameters and taxonomy are edited.
 * The user editor (`/schedules/[id]/edit`) is the AGENT schedule form; a
 * `tool` task has no agent to edit, so its Edit mode opens the console.
 */
const SYSTEM_JOBS_HREF = "/administration/automation/scheduling/system-jobs";

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
  const dispatch = useAppDispatch();
  const { task } = useTaskDetail(taskId);
  const { tasks, status, error } = useScheduledTasks();
  const { runs, status: runsStatus, error: runsError } = useTaskRuns(taskId);
  const getSchedulesScope = () =>
    createSchedulesScope({
      ...buildScheduleRosterValues(tasks, status, error),
      ...(task ? buildOpenScheduleValues(task) : {}),
      ...buildScheduleRunValues(runs, runsStatus, runsError),
    });

  // Write half of the schedules surface, ENTITY side (the editor registers the
  // `schedule_draft_*` targets instead — see ScheduleForm). This route owns no
  // draft state and has no Save bar, so a draft write would land nowhere; the
  // only two targets it wires persist immediately through the canonical
  // `updateScheduledTask` thunk (invariant 1 — never a direct `.from('sch_*')`
  // write). Both are deliberately fields that cannot change what the schedule
  // runs or when it fires; anything behavioural stays editor-only so the user
  // reviews the whole schedule before saving. Handlers validate and THROW on a
  // bad shape — the writeback seam converts throws to error envelopes the
  // agent reads. Fresh closures per call (getWriteHandlers contract).
  const getSurfaceWriteHandlers = () => ({
    schedule_title: async (value: unknown) => {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > 200
      )
        throw new Error(
          "schedule_title expects a non-empty string of at most 200 characters.",
        );
      await dispatch(
        updateScheduledTask(taskId, { taskPatch: { title: value.trim() } }),
      );
    },
    schedule_description: async (value: unknown) => {
      if (typeof value !== "string" || value.length > 2000)
        throw new Error(
          "schedule_description expects a string of at most 2000 characters.",
        );
      await dispatch(
        updateScheduledTask(taskId, {
          taskPatch: { description: value || null },
        }),
      );
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/schedules"
      getWriteHandlers={getSurfaceWriteHandlers}
      getScope={getSchedulesScope}
    >
      <NonEditableContextMenu
        sourceFeature="system"
        surfaceName="matrx-user/schedules"
        menuVersion={1}
        getApplicationScope={getSchedulesScope}
        contentSource={{ type: "raw" }}
      >
        {/* Radix `asChild` must receive a DOM element that can accept its
            context-menu handlers/ref. A function component drops those props. */}
        <div className="contents">
          <ScheduleDetailBody taskId={taskId} />
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

function ScheduleDetailBody({ taskId }: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { task, status, error } = useTaskDetail(taskId);
  const { tasks } = useScheduledTasks();
  // Same hook RunHistoryCard mounts — it no-ops when the runs are already
  // loaded, so reading them here for the record payload adds no fetch.
  const { runs, status: runsStatus, error: runsError } = useTaskRuns(taskId);
  const [running, setRunning] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const isAdmin = useAppSelector(selectIsAdmin);

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
    // Denied / deleted / never existed / signed-out all read as zero rows here.
    return (
      <AccessGate
        token="sch_task"
        id={taskId}
        onRetry={() => {
          void dispatch(fetchScheduledTask(taskId)).catch(() => {});
        }}
        fallbackHref="/schedules"
        fallbackLabel="All schedules"
      />
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

  // A platform system job (kind='tool'). Its enable/disable goes through the
  // admin seam the System jobs console uses (task + trigger together, handler
  // check, restore recorded) — the user PATCH refuses non-agent kinds. The
  // server gates that seam on admin status, so the control is shown only to
  // an admin: a button the server would refuse is a dead control.
  const isSystemTask = task.kind === "tool";
  const canFlip = !isSystemTask || isAdmin;
  const suspended = task.metadata.auto_suspended;
  const isGuardSuspended = Boolean(suspended) && !task.enabled;

  /**
   * THE ONE enable/disable control of this page. The header's Enable/Pause
   * and the suspension card's Re-enable both call this — one handler, one
   * confirm, one write path per kind.
   */
  const handleSetEnabled = async (enabled: boolean) => {
    if (enabled && isGuardSuspended) {
      // A destructive/expensive click states its consequence first: what
      // fires, when, and what happens if the cause was not fixed.
      const approval = approvalSentence(task);
      // `sch_task.next_due_at` is the MIN over ENABLED triggers, so a
      // suspended task carries null there while its (disabled) trigger still
      // remembers when it was due. Read the trigger when the task is silent —
      // otherwise the sentence about when it will run goes missing exactly on
      // the rows this dialog exists for.
      const nextDue = task.nextDueAt ?? task.triggers[0]?.nextDueAt ?? null;
      const overdue = nextDue !== null && new Date(nextDue).getTime() < Date.now();
      const failures = suspended?.consecutive_failures;
      const ok = await confirm({
        title: isSystemTask
          ? "Re-enable this system schedule?"
          : "Re-enable this schedule?",
        description: [
          isSystemTask
            ? "Turns the schedule and its trigger back on together."
            : "Turns the schedule back on.",
          overdue
            ? `It was due ${humanizeRelative(nextDue)}, so the scanner will run it on its next pass — within about a minute — not at the next scheduled time.`
            : nextDue
              ? `Its next run stays at ${humanizeRelative(nextDue)}.`
              : "",
          typeof failures === "number"
            ? `If the cause is not fixed, the repeat guard will switch it off again after ${failures} more matching failures.`
            : "If the cause is not fixed, the repeat guard will switch it off again.",
          approval
            ? `This restores the existing approval (${approval}) — it is not a new schedule and needs no new sign-off. The restore is recorded on the row.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: approval ? "Re-enable and restore approval" : "Re-enable",
        variant: "default",
      });
      if (!ok) return;
    }
    setFlipping(true);
    try {
      if (isSystemTask) {
        await dispatch(setSystemTaskEnabled(task.id, enabled));
      } else {
        await dispatch(toggleTaskEnabled(task.id, enabled));
      }
      toast.success(
        enabled
          ? isGuardSuspended
            ? "Schedule re-enabled — the guard's suspension is closed and the approval restored"
            : "Schedule enabled"
          : "Schedule paused",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to change the schedule",
      );
    } finally {
      setFlipping(false);
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
        modes={
          isSystemTask
            ? [
                { name: "View", href: `/schedules/${task.id}`, icon: Eye },
                { name: "Edit", href: SYSTEM_JOBS_HREF, icon: Pencil },
              ]
            : [
                { name: "View", href: `/schedules/${task.id}`, icon: Eye },
                { name: "Edit", href: `/schedules/${task.id}/edit`, icon: Pencil },
                { name: "New", href: "/schedules/new", icon: Plus },
              ]
        }
        actions={[
          {
            label: "Run now",
            icon: PlayCircle,
            onPress: () => void handleRunNow(),
            primary: true,
            disabled: running,
          },
          ...(canFlip
            ? [
                {
                  label: task.enabled ? "Pause" : "Enable",
                  icon: Power,
                  onPress: () => void handleSetEnabled(!task.enabled),
                  disabled: flipping,
                },
              ]
            : []),
          // A system job is retired from the System jobs console / the
          // registry that declares it, never soft-deleted from a user page.
          ...(isSystemTask
            ? []
            : [
                {
                  label: "Delete",
                  icon: Trash2,
                  onPress: () => void handleDelete(),
                  destructive: true,
                },
              ]),
        ]}
      />
      <div className="space-y-4" data-surface-value="open_schedule">
        <SuspensionCard
          task={task}
          onRestore={
            canFlip
              ? () => void handleSetEnabled(true)
              : undefined
          }
          restoring={flipping}
        />
        {/* Record-level copy. The plain click is the what-I-see payload (spec +
            trigger + run history with errors verbatim); the menu grades it into
            the two reasons this page gets copied. */}
        <div className="flex items-start justify-between gap-3">
          {task.description ? (
            <p
              className="text-sm text-muted-foreground"
              data-surface-value="schedule_description"
            >
              {task.description}
            </p>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-1">
            <CopyButtons
              size="sm"
              label={`Schedule ${task.title}`}
              human={() => scheduleSummary(task)}
              json={() => ({ schedule: task, runs })}
              agent={() =>
                buildScheduleRecordPayload({
                  task,
                  runs,
                  runsStatus,
                  runsError,
                  kpis: scheduleKpis(tasks),
                })
              }
              agentVariant={{
                id: "this-schedule",
                label: "This schedule",
                hint: "Spec, trigger and run history as rendered",
                position: "first",
              }}
              aiVariants={scheduleRecordVariants(() => ({
                task,
                runs,
                runsStatus,
                runsError,
                kpis: scheduleKpis(tasks),
              }))}
            />
            <ExportMenu
              label={`Schedule ${task.title}`}
              items={[
                jsonExportItem(() => ({ schedule: task, runs })),
                csvExportItem(() => runCsvRows(runs), "CSV (all runs)"),
              ]}
              sheetRows={() => runCsvRows(runs)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SpecCard task={task} />
          <TriggerCard task={task} />
        </div>
        <RunHistoryCard taskId={task.id} task={task} />
      </div>
    </>
  );
}
