"use client";

// One person's goals as a table in alignment order (a goal under the goal it supports), with status,
// progress, due date, and — where the door says this viewer may edit — add, edit, progress and archive.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Pencil, Plus, Target, TrendingUp } from "lucide-react";
import { Badge, Button, EmptyState } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";

import { GoalEditorDialog, GoalProgressDialog } from "./GoalDialogs";
import { GOAL_STATUS_LABEL, GOAL_STATUS_TONE, alignmentRows, progressLabel, type Goal } from "./goals";
import { archiveGoal, listGoals } from "./service";
import { formatDay } from "./status";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface Row extends Goal {
  depth: number;
  supports: string | null;
}

export function GoalsView({
  employmentId,
  title,
  alignable,
  reloadKey = 0,
  onLoaded,
}: {
  employmentId: string;
  title: string;
  /** Extra goals (the team's) a goal here may be aligned under, besides this person's own. */
  alignable?: Goal[];
  reloadKey?: number;
  onLoaded?: (goals: Goal[]) => void;
}) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ goal: Goal | null } | null>(null);
  const [progressFor, setProgressFor] = useState<Goal | null>(null);
  const [archiving, setArchiving] = useState<Goal | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    void listGoals(employmentId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setGoals(r.data.goals);
        setCanEdit(r.data.canEdit);
        setError(null);
        onLoaded?.(r.data.goals);
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
    // onLoaded is a notification, not an input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentId, tick, reloadKey]);

  const rows: Row[] = useMemo(() => {
    const all = goals ?? [];
    const title = new Map([...(alignable ?? []), ...all].map((g) => [g.goalId, g.title]));
    return alignmentRows(all).map(({ goal, depth }) => ({ ...goal, depth, supports: goal.parentGoalId ? title.get(goal.parentGoalId) ?? null : null }));
  }, [goals, alignable]);
  const pool = useMemo(() => {
    const seen = new Set<string>();
    return [...(goals ?? []), ...(alignable ?? [])].filter((g) => (seen.has(g.goalId) ? false : (seen.add(g.goalId), true)));
  }, [goals, alignable]);

  const columns: MatrxColumnDef<Row>[] = [
    {
      id: "title",
      header: "Goal",
      accessorFn: (g) => g.title,
      filter: "text",
      width: 340,
      frozen: true,
      cell: (g) => (
        <span style={{ paddingLeft: g.depth * 16 }} className="inline-block">
          {g.title}
        </span>
      ),
    },
    { id: "supports", header: "Supports", accessorFn: (g) => g.supports ?? "", filter: "text", width: 220 },
    { id: "status", header: "Status", accessorFn: (g) => GOAL_STATUS_LABEL[g.status], filter: "text", width: 120, cell: (g) => <Badge tone={GOAL_STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge> },
    { id: "progress", header: "Progress", accessorFn: (g) => g.progress, filter: "number", width: 220, cell: (g) => progressLabel(g) },
    { id: "due", header: "Due", accessorFn: (g) => g.dueOn, filter: "date", width: 130, cell: (g) => formatDay(g.dueOn) },
    ...(canEdit
      ? [
          {
            id: "actions",
            header: "",
            accessorFn: () => "",
            filter: false as const,
            width: 150,
            cell: (g: Row) => (
              <div className="flex gap-1">
                <Button icon={<TrendingUp />} variant="quiet" aria-label={`Update progress on ${g.title}`} onClick={() => setProgressFor(g)} />
                <Button icon={<Pencil />} variant="quiet" aria-label={`Edit ${g.title}`} onClick={() => setEditing({ goal: g })} />
                <Button icon={<Archive />} variant="quiet" aria-label={`Archive ${g.title}`} onClick={() => setArchiving(g)} />
              </div>
            ),
          } satisfies MatrxColumnDef<Row>,
        ]
      : []),
  ];
  const copy: MatrxDataTableCopyConfig<Row> = {
    label: "goal",
    listLabel: "goals (this view)",
    location: "Performance, goals",
    rowKind: "hr-goal",
    listKind: "hr-goal-list",
    rowDescription: "One goal: title, what it supports, status, progress and due date.",
    listDescription: "The goals of one person, in alignment order, as currently shown.",
    humanRow: (g) => [`Goal: ${g.title}`, `Status: ${GOAL_STATUS_LABEL[g.status]}`, `Progress: ${progressLabel(g)}`, `Due: ${formatDay(g.dueOn)}`].join("\n"),
  };

  return (
    <section aria-label={title} className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        <ErrorAlchemyMenu error={error} /></p>
      ) : null}
      {goals && goals.length > 0 ? (
        <MatrxDataTable<Row>
          tableId="hr/performance/goals"
          data={rows}
          columns={columns}
          getRowId={(g) => g.goalId}
          pageSize={0}
          density="condensed"
          viewTabs={false}
          toolbar={{ title, searchPlaceholder: "Search goals", ...(canEdit ? { add: { onAdd: () => setEditing({ goal: null }) } } : {}) }}
          detail={{ enabled: false }}
          copy={copy}
          emptyState={{ title: "No goals yet" }}
        />
      ) : goals ? (
        <EmptyState
          icon={<Target />}
          title="No goals yet"
          action={
            canEdit ? (
              <Button icon={<Plus />} variant="primary" onClick={() => setEditing({ goal: null })}>
                Add a goal
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {editing ? <GoalEditorDialog open onOpenChange={(o) => !o && setEditing(null)} employmentId={employmentId} goal={editing.goal} alignable={pool} onSaved={reload} /> : null}
      <GoalProgressDialog goal={progressFor} onOpenChange={(o) => !o && setProgressFor(null)} onSaved={reload} />
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving?.title ?? "this goal"}?`}
        description={`It leaves the list and future reviews. ${archiving?.childCount ? `${archiving.childCount} goals that support it stay, and become top-level goals.` : "Nothing else changes."}`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={async () => {
          if (!archiving) return;
          const r = await archiveGoal(archiving.goalId);
          setArchiving(null);
          if (!r.ok) toast.error(r.message);
          else {
            toast.success("Goal archived");
            reload();
          }
        }}
      />
    </section>
  );
}
