"use client";

// features/education/study/planner/components/StudyPlanView.tsx
//
// The AI study-plan surface. No active plan → generation form. Active plan →
// header (countdown + rationale + controls) + the agenda. Generation runs the
// planner agent and falls back LOUDLY to the deterministic builder if the agent
// fails, so a plan always materializes. Re-plan re-reads the live spine snapshot
// (so a tanked session changes the inputs) and rewrites the plan in place.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  CalendarClock,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { planService } from "../../service/planService";
import { collectPlanSummary } from "../collectSummary";
import { buildPlan } from "../buildPlan";
import { usePlannerAgent } from "../usePlannerAgent";
import { PlanAgenda } from "./PlanAgenda";
import { PlanGenerateForm } from "./PlanGenerateForm";
import type { PlanDraft, PlanInput, PlanWithDays } from "../types";

const MS_PER_DAY = 86_400_000;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / MS_PER_DAY);
}

export function StudyPlanView({ seedTitle }: { seedTitle?: string }) {
  const [plan, setPlan] = useState<PlanWithDays | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [forceForm, setForceForm] = useState(false);
  const planner = usePlannerAgent();

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await planService.getActivePlan();
    if (res.error) {
      setError(res.error);
      setPlan(null);
    } else {
      setPlan(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  /** Build a draft: AI planner first, deterministic builder on failure (loud). */
  const draftFor = async (input: PlanInput): Promise<PlanDraft> => {
    const summary = await collectPlanSummary(input.itemType ?? "fc_card");
    try {
      return await planner.generate(input, summary);
    } catch (e) {
      console.warn(
        "[planner] AI generation failed — falling back to the offline planner:",
        e,
      );
      toast.warning(
        "The AI planner was unavailable — built you a plan with the offline scheduler.",
      );
      return buildPlan(input, summary, new Date());
    }
  };

  const handleGenerate = async (input: PlanInput) => {
    setGenerating(true);
    try {
      const draft = await draftFor(input);
      const res = await planService.savePlan(draft);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Your study plan is ready");
      setForceForm(false);
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const handleReplan = async () => {
    if (!plan) return;
    setGenerating(true);
    try {
      const input: PlanInput = {
        title: plan.plan.title,
        startDate: new Date().toISOString().slice(0, 10),
        examDate: plan.plan.end_date ?? plan.plan.start_date,
        dailyMinutes: plan.plan.daily_minutes ?? 30,
        restDays: (plan.plan.rest_days ?? []) as PlanInput["restDays"],
        dailyItemCap: plan.plan.daily_item_cap ?? null,
        goalId: plan.plan.goal_id ?? null,
        itemType:
          (plan.plan.config as { itemType?: string } | null)?.itemType ??
          "fc_card",
      };
      const draft = await draftFor(input);
      const res = await planService.regeneratePlan(plan.plan.id, draft);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Plan re-planned around your latest performance");
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const handleBlockStatus = async (
    blockId: string,
    status: "pending" | "done" | "skipped",
  ) => {
    setBusyBlockId(blockId);
    const res = await planService.updateBlockStatus(blockId, status);
    setBusyBlockId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    // Optimistic local patch (avoid a full refetch for a checkbox).
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d) => ({
              ...d,
              blocks: d.blocks.map((b) =>
                b.id === blockId ? { ...b, status } : b,
              ),
            })),
          }
        : prev,
    );
  };

  const handleArchive = async () => {
    if (!plan) return;
    const res = await planService.updatePlanStatus(plan.plan.id, "archived");
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Plan archived");
    await load();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-foreground">Couldn&apos;t load your plan</p>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!plan || forceForm) {
    return (
      <div className="flex flex-col gap-4">
        {plan && forceForm && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-xs text-muted-foreground"
            onClick={() => setForceForm(false)}
          >
            ← Back to current plan
          </Button>
        )}
        <PlanGenerateForm
          generating={generating}
          onGenerate={handleGenerate}
          initialTitle={seedTitle ?? ""}
        />
      </div>
    );
  }

  const countdown = daysUntil(plan.plan.end_date);

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h2 className="truncate text-base font-semibold text-foreground">
                {plan.plan.title}
              </h2>
              {plan.plan.generated_by === "ai" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI plan
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Offline plan
                </span>
              )}
            </div>
            {countdown != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {countdown > 0
                  ? `${countdown} day${countdown === 1 ? "" : "s"} until your exam`
                  : countdown === 0
                    ? "Exam is today — you've got this"
                    : "Exam date has passed"}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={generating}
              onClick={handleReplan}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-plan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setForceForm(true)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              New
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              title="Archive plan"
              onClick={() => setConfirmNew(true)}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {plan.plan.rationale && (
          <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {plan.plan.rationale}
          </p>
        )}
      </header>

      <PlanAgenda
        plan={plan}
        onBlockStatus={handleBlockStatus}
        busyBlockId={busyBlockId}
      />

      <ConfirmDialog
        open={confirmNew}
        onOpenChange={setConfirmNew}
        title="Archive this plan"
        description="Archive your current plan. You can always generate a new one."
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={handleArchive}
      />
    </div>
  );
}
