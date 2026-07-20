"use client";

// features/education/study/components/StudyPlanner.tsx
//
// Phase 6 (Flashcards Competitive Parity Push) — the real planner, replacing
// the `/education/planner` EduToolComingSoon placeholder. CRUD on
// `education.study_goal` (schema existed, unused until this phase) via
// `studyService`. V1 heuristic ranking only, per the plan: soonest
// target_date (already the DB order) re-ranked client-side by struggle
// count — no auto-replanning algorithm.
//
// Targeting rides in `study_goal.metadata` (itemType/topic) rather than new
// columns — see `StudyGoalMetadata` in ../types. Progress-per-goal reuses
// `item_mastery` + the flashcards topic join the same way StudyTrends does,
// dynamically imported so this stays mode-agnostic infrastructure.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Target,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Archive,
  CalendarClock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import { displayMasteryPct } from "../utils/masteryFsrs";
import type {
  StudyGoalRow,
  ItemMasteryRow,
  GoalStatus,
  NewGoalInput,
} from "../types";

const MS_PER_DAY = 86_400_000;

interface GoalStat {
  matched: number;
  avgMasteryPct: number | null;
  struggling: number;
}

function daysUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate).getTime();
  return Math.ceil((target - Date.now()) / MS_PER_DAY);
}

function dueLabel(
  targetDate: string | null,
): { text: string; overdue: boolean } | null {
  const days = daysUntil(targetDate);
  if (days === null) return null;
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  return { text: `${days}d left`, overdue: false };
}

/** V1 heuristic: earlier target dates and higher struggle counts rank first. */
function priorityScore(goal: StudyGoalRow, stat: GoalStat | undefined): number {
  const days = daysUntil(goal.target_date);
  const urgency = days === null ? 0 : Math.max(0, 60 - days);
  return urgency + (stat?.struggling ?? 0) * 5;
}

async function resolveGoalStats(
  goals: StudyGoalRow[],
  mastery: ItemMasteryRow[],
): Promise<Record<string, GoalStat>> {
  const now = new Date();
  const withTopic = goals.filter((g) => {
    const meta = g.metadata as { itemType?: string; topic?: string } | null;
    return meta?.itemType === "fc_card" && meta.topic;
  });
  let topicsById: Record<string, string | null> = {};
  if (withTopic.length > 0 && mastery.length > 0) {
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getTopicsForCardIds(
      mastery.map((m) => m.item_id),
    );
    topicsById = res.data ?? {};
  }

  const stats: Record<string, GoalStat> = {};
  for (const goal of goals) {
    const meta = goal.metadata as { itemType?: string; topic?: string } | null;
    const relevant =
      meta?.itemType && meta.topic
        ? mastery.filter((m) => topicsById[m.item_id]?.trim() === meta.topic)
        : meta?.itemType
          ? mastery
          : [];
    if (relevant.length === 0) {
      stats[goal.id] = { matched: 0, avgMasteryPct: null, struggling: 0 };
      continue;
    }
    let sum = 0;
    let struggling = 0;
    for (const m of relevant) {
      const pct = displayMasteryPct(m, now) ?? 0;
      sum += pct;
      if (m.struggle_flag || pct < 0.4) struggling += 1;
    }
    stats[goal.id] = {
      matched: relevant.length,
      avgMasteryPct: Math.round((sum / relevant.length) * 100),
      struggling,
    };
  }
  return stats;
}

interface GoalFormState {
  title: string;
  targetDate: string;
  topic: string;
}

const EMPTY_FORM: GoalFormState = { title: "", targetDate: "", topic: "" };

export function StudyPlanner({
  backHref,
  embedded = false,
}: {
  backHref?: string;
  /** When embedded in the PlannerWorkspace, drop the standalone page chrome
   *  (bg-textured wrapper, back button, outer padding) — the host supplies it. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [goals, setGoals] = useState<StudyGoalRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, GoalStat>>({});
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<StudyGoalRow | null>(null);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StudyGoalRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const [goalsRes, masteryRes] = await Promise.all([
      studyService.listGoals({ status: "active" }),
      studyService.listMastery("fc_card"),
    ]);
    if (goalsRes.error) {
      setError(goalsRes.error);
      setGoals(null);
      return;
    }
    const nextGoals = goalsRes.data ?? [];
    setGoals(nextGoals);
    setStats(await resolveGoalStats(nextGoals, masteryRes.data ?? []));
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (goal: StudyGoalRow) => {
    const meta = goal.metadata as { topic?: string } | null;
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      targetDate: goal.target_date ? goal.target_date.slice(0, 10) : "",
      topic: meta?.topic ?? "",
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) return;
    setSaving(true);
    const targetDate = form.targetDate
      ? new Date(form.targetDate).toISOString()
      : null;
    const topic = form.topic.trim();
    if (editingGoal) {
      const res = await studyService.updateGoal(editingGoal.id, {
        title,
        target_date: targetDate,
        metadata: topic
          ? { itemType: "fc_card", topic }
          : { itemType: "fc_card" },
      });
      setSaving(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Goal updated");
    } else {
      const input: NewGoalInput = {
        title,
        targetDate,
        metadata: topic
          ? { itemType: "fc_card", topic }
          : { itemType: "fc_card" },
      };
      const res = await studyService.createGoal(input);
      setSaving(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Goal created");
    }
    setEditorOpen(false);
    void load();
  };

  const handleSetStatus = async (goal: StudyGoalRow, status: GoalStatus) => {
    const res = await studyService.updateGoal(goal.id, { status });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      status === "achieved" ? "Goal marked achieved" : "Goal archived",
    );
    void load();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await studyService.deleteGoal(pendingDelete.id);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Goal deleted");
    setPendingDelete(null);
    void load();
  };

  const ranked = (goals ?? [])
    .slice()
    .sort(
      (a, b) => priorityScore(b, stats[b.id]) - priorityScore(a, stats[a.id]),
    );

  const formBody = (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Goal
        </label>
        <Input
          autoFocus
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Master Spanish verb conjugation"
          className="text-base sm:text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Target date (optional)
        </label>
        <Input
          type="date"
          value={form.targetDate}
          onChange={(e) =>
            setForm((f) => ({ ...f, targetDate: e.target.value }))
          }
          className="text-base sm:text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Topic (optional — matches a flashcard topic to track progress)
        </label>
        <Input
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
          placeholder="e.g. Spanish verbs"
          className="text-base sm:text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className={cn(!embedded && "min-h-full w-full bg-textured")}>
      <div
        className={cn(
          !embedded && "mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8",
        )}
      >
        {!embedded && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 h-8 px-2 text-xs text-muted-foreground"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        )}

        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              {embedded ? "Your goals" : "Study planner"}
            </h1>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        </div>

        {goals === null ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Couldn&apos;t load your goals
            </p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : ranked.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Target className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No goals yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Set a target date and an optional topic — the planner ranks your
              goals by urgency and how much you&apos;re struggling with that
              material.
            </p>
            <Button size="sm" className="mt-2 gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create your first goal
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ranked.map((goal) => {
              const stat = stats[goal.id];
              const due = dueLabel(goal.target_date);
              const meta = goal.metadata as { topic?: string } | null;
              return (
                <div
                  key={goal.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {goal.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {due && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              due.overdue && "text-destructive",
                            )}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            {due.text}
                          </span>
                        )}
                        {meta?.topic && <span>Topic: {meta.topic}</span>}
                        {stat && stat.struggling > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {stat.struggling} struggling
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(goal)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 dark:text-green-400"
                        onClick={() => handleSetStatus(goal, "achieved")}
                        title="Mark achieved"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleSetStatus(goal, "archived")}
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPendingDelete(goal)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {stat && stat.avgMasteryPct !== null && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            stat.avgMasteryPct >= 80
                              ? "bg-green-500"
                              : stat.avgMasteryPct >= 40
                                ? "bg-amber-500"
                                : "bg-red-500",
                          )}
                          style={{
                            width: `${Math.max(4, stat.avgMasteryPct)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {stat.avgMasteryPct}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isMobile ? (
        <Drawer open={editorOpen} onOpenChange={setEditorOpen}>
          <DrawerContent className="pb-safe">
            <DrawerHeader>
              <DrawerTitle>
                {editingGoal ? "Edit goal" : "New goal"}
              </DrawerTitle>
              <DrawerDescription>
                Track progress toward something specific.
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4">{formBody}</div>
            <DrawerFooter className="flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditorOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {editingGoal ? "Edit goal" : "New goal"}
              </DialogTitle>
              <DialogDescription>
                Track progress toward something specific.
              </DialogDescription>
            </DialogHeader>
            {formBody}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditorOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="gap-1.5"
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete goal"
        description={
          <>
            Permanently delete &ldquo;{pendingDelete?.title}&rdquo;. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
