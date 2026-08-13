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
  HeartHandshake,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { planService } from "../../service/planService";
import { studyService } from "../../service/studyService";
import { collectPlanSummary } from "../collectSummary";
import { buildPlan, type PlanSummary } from "../buildPlan";
import {
  detectAbsence,
  buildRecoveryDraft,
  type AbsenceInfo,
} from "../recovery";
import { computePlanStaleness, type PlanStaleness } from "../staleness";
import { usePlannerAgent } from "../usePlannerAgent";
import { publishPlannerPlanSnapshot } from "../plannerSnapshot";
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

/** A warm, non-shaming one-liner describing the detected absence. */
function absenceMessage(absence: AbsenceInfo): string {
  const parts: string[] = [];
  if (absence.daysSinceLastSession != null && absence.daysSinceLastSession >= 1) {
    parts.push(
      `It's been ${absence.daysSinceLastSession} day${absence.daysSinceLastSession === 1 ? "" : "s"} since your last study session`,
    );
  }
  if (absence.overdueBlocks > 0) {
    const lead = parts.length > 0 ? " and a few" : "A few";
    parts.push(
      `${lead} planned session${absence.overdueBlocks === 1 ? "" : "s"} slipped by`,
    );
  }
  return parts.length > 0 ? `${parts.join("")}.` : "";
}

export function StudyPlanView({ seedTitle }: { seedTitle?: string }) {
  const [plan, setPlan] = useState<PlanWithDays | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [forceForm, setForceForm] = useState(false);
  const [absence, setAbsence] = useState<AbsenceInfo | null>(null);
  const [stale, setStale] = useState<PlanStaleness | null>(null);
  const [liveSummary, setLiveSummary] = useState<PlanSummary | null>(null);
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const planner = usePlannerAgent();

  // Publish this view's slice for the `matrx-user/education-planner` emitter
  // (PlannerWorkspace). It reads the store synchronously inside getScope, so
  // nothing here may fetch on its behalf. Cleared on unmount so the Goals tab
  // never emits a stale plan as if it were on screen.
  useEffect(() => {
    publishPlannerPlanSnapshot({ plan, error, lastSessionAt });
  });
  useEffect(() => () => publishPlannerPlanSnapshot(null), []);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await planService.getActivePlan();
    if (res.error) {
      setError(res.error);
      setPlan(null);
      setAbsence(null);
      setStale(null);
      setLiveSummary(null);
      setLastSessionAt(null);
      setLoading(false);
      return;
    }
    const p = res.data;
    setPlan(p);
    if (p) {
      // Read the live study snapshot + last-session time so we can detect a
      // return-after-absence (recovery) or a materially-stale plan (adaptive
      // re-plan trigger) — both off REAL performance data, not a guess.
      const itemType =
        (p.plan.config as { itemType?: string } | null)?.itemType ?? "fc_card";
      const [summary, sessionsRes] = await Promise.all([
        collectPlanSummary(itemType),
        studyService.listSessions({ limit: 1 }),
      ]);
      const lastAtIso = sessionsRes.data?.[0]?.created_at ?? null;
      const lastAt = lastAtIso ? new Date(lastAtIso) : null;
      setLastSessionAt(lastAtIso);
      const now = new Date();
      const abs = detectAbsence(p, lastAt, now);
      setLiveSummary(summary);
      setAbsence(abs);
      // Absence takes priority over the staleness prompt (it's the stronger,
      // more supportive affordance — never stack both).
      setStale(abs ? null : computePlanStaleness(p.plan, summary, lastAt));
    } else {
      setAbsence(null);
      setStale(null);
      setLiveSummary(null);
      setLastSessionAt(null);
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

  /**
   * Recovery-after-absence: rebuild the remaining plan gently (deterministic —
   * no agent), triaging the overdue backlog instead of guilt-walling the user.
   */
  const handleRecovery = async () => {
    if (!plan) return;
    setGenerating(true);
    try {
      const summary = liveSummary ?? (await collectPlanSummary(
        (plan.plan.config as { itemType?: string } | null)?.itemType ??
          "fc_card",
      ));
      const draft = buildRecoveryDraft(plan, summary, new Date());
      const res = await planService.regeneratePlan(plan.plan.id, draft);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Welcome back — here's your recovery plan");
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

      {absence && (
        <section className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                Welcome back — let&apos;s pick up where you left off
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {absenceMessage(absence)} No guilt, no wall of overdue cards — we&apos;ll
                rebuild the rest of your plan with a lighter first day and put the
                highest-value work first.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={generating}
                  onClick={handleRecovery}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HeartHandshake className="h-3.5 w-3.5" />
                  )}
                  Build my recovery plan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  disabled={generating}
                  onClick={() => setAbsence(null)}
                >
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!absence && stale && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                Your plan is out of date
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {stale.reason}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={generating}
                  onClick={handleReplan}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Re-plan now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  disabled={generating}
                  onClick={() => setStale(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

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
