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
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
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
import type {
  PlanDraft,
  PlanInput,
  PlanWithDays,
  StudyPlanBlockRow,
  StudyPlanDayRow,
} from "../types";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  useSurfaceWriteHandlers,
  type SurfaceWriteHandlerEntry,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  collectionWriteHandlers,
  readCollectionList,
  refuseRepeats,
} from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";

const MS_PER_DAY = 86_400_000;
const SURFACE_NAME = "matrx-user/education-planner";

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
  if (
    absence.daysSinceLastSession != null &&
    absence.daysSinceLastSession >= 1
  ) {
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
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [blockEditor, setBlockEditor] = useState<{
    day: StudyPlanDayRow;
    block: StudyPlanBlockRow | null;
    label: string;
    minutes: string;
    method: string;
    rationale: string;
    ordering: number;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
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
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(loadTimer);
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

  // DESTRUCTIVE: `regeneratePlan` DELETES every day and every block on the plan
  // before writing the new schedule, so the blocks the user has already ticked
  // off go with them. Say that before the click, not after.
  const handleReplan = async () => {
    if (!plan) return;
    const ok = await confirm({
      title: "Re-plan around your latest performance?",
      description:
        "Every day and every study block in your current plan is deleted and replaced by a newly generated schedule. The progress tracked on those blocks — everything you have marked done or skipped — is deleted with them and cannot be restored. Your cards, sessions, and review history are untouched; only the schedule is rewritten.",
      confirmLabel: "Delete and re-plan",
      variant: "destructive",
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: "Build a recovery plan?",
      description:
        "Every day and every study block in your current plan is deleted and replaced by a gentler catch-up schedule. The progress tracked on those blocks — everything you have marked done or skipped — is deleted with them and cannot be restored. Your cards, sessions, and review history are untouched; only the schedule is rewritten.",
      confirmLabel: "Delete and rebuild",
      variant: "destructive",
    });
    if (!ok) return;
    setGenerating(true);
    try {
      const summary =
        liveSummary ??
        (await collectPlanSummary(
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

  const handleSaveTitle = async () => {
    if (!plan) return;
    const title = titleDraft.trim();
    if (!title) {
      toast.error("Give your plan a title.");
      return;
    }
    setSavingEdit(true);
    const res = await planService.updatePlanTitle(
      plan.plan.id,
      plan.plan.version,
      title,
    );
    setSavingEdit(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setPlan((current) => (current ? { ...current, plan: res.data! } : current));
    setTitleEditorOpen(false);
  };

  const openAddBlock = (day: StudyPlanDayRow, ordering: number) => {
    setBlockEditor({
      day,
      block: null,
      label: "",
      minutes: "20",
      method: "",
      rationale: "",
      ordering,
    });
  };
  const openEditBlock = (block: StudyPlanBlockRow) => {
    const day = plan?.days.find((entry) => entry.day.id === block.day_id)?.day;
    if (!day) {
      toast.error("This block no longer has a plan day.");
      return;
    }
    setBlockEditor({
      day,
      block,
      label: block.label,
      minutes: String(block.estimated_minutes),
      method: block.method ?? "",
      rationale: block.rationale ?? "",
      ordering: block.ordering,
    });
  };
  const handleSaveBlock = async () => {
    if (!plan || !blockEditor) return;
    const label = blockEditor.label.trim();
    const minutes = Number(blockEditor.minutes);
    if (!label) {
      toast.error("Give this study block a label.");
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) {
      toast.error("Minutes must be between 1 and 480.");
      return;
    }
    setSavingEdit(true);
    const res = blockEditor.block
      ? await planService.updateBlock(blockEditor.block.id, blockEditor.block.version, {
          label,
          estimatedMinutes: minutes,
          method: blockEditor.method.trim() || null,
          rationale: blockEditor.rationale.trim() || null,
        })
      : await planService.createBlock({
          planId: plan.plan.id,
          dayId: blockEditor.day.id,
          dayDate: blockEditor.day.day_date,
          label,
          targetKind: "review",
          estimatedMinutes: minutes,
          method: blockEditor.method.trim() || null,
          rationale: blockEditor.rationale.trim() || null,
          ordering: blockEditor.ordering,
        });
    setSavingEdit(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    await load();
    setBlockEditor(null);
  };
  const handleDeleteBlock = async (block: StudyPlanBlockRow) => {
    const ok = await confirm({
      title: "Remove this study block?",
      description: `Remove “${block.label}” from this plan. Its schedule entry will be hidden, while the record remains recoverable.`,
      confirmLabel: "Remove block",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await planService.deleteBlock(block.id, block.version);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    await load();
  };

  // Agent writes use these same service methods as the compact human editors.
  // Parse against the live plan again after approval, so a stale agent snapshot
  // cannot edit a block that was re-planned or removed in the meantime.
  const activeBlocks = new Map(
    plan?.days
      .flatMap((entry) => entry.blocks)
      .map((block) => [block.id, block]) ?? [],
  );
  const activeDays = new Map(
    plan?.days.map((entry) => [entry.day.id, entry.day]) ?? [],
  );
  const readRecord = (
    target: string,
    value: unknown,
    keys: readonly string[],
  ) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${target} entries must be objects.`);
    const record = value as Record<string, unknown>;
    const unknown = Object.keys(record).filter((key) => !keys.includes(key));
    if (unknown.length)
      throw new Error(`${target} does not accept ${unknown.join(", ")}.`);
    return record;
  };
  const requiredText = (
    target: string,
    record: Record<string, unknown>,
    key: string,
  ) => {
    const value = record[key];
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${target}.${key} is required plain text.`);
    return value.trim();
  };
  const optionalText = (
    target: string,
    record: Record<string, unknown>,
    key: string,
  ) => {
    if (!(key in record)) return undefined;
    const value = record[key];
    if (value === null) return null;
    if (typeof value !== "string")
      throw new Error(`${target}.${key} must be plain text or null.`);
    return value.trim() || null;
  };
  const minutes = (target: string, value: unknown) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 1 ||
      value > 480
    )
      throw new Error(
        `${target}.estimated_minutes must be a number from 1 to 480.`,
      );
    return value;
  };
  const expectedVersion = (
    target: string,
    record: Record<string, unknown>,
  ) => {
    const value = record.expected_version;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
      throw new Error(`${target}.expected_version must be a positive integer.`);
    return value;
  };
  const recheckLatestAgentVersions = async (
    target:
      | "update_study_plans"
      | "update_study_plan_blocks"
      | "delete_study_plan_blocks",
    value: unknown,
  ) => {
    if (!plan) throw new Error("Wait for the active study plan to load.");
    const latest = await planService.getPlan(plan.plan.id);
    if (latest.error) throw new Error(latest.error);
    if (!latest.data)
      throw new Error("This study plan is no longer available. Refresh the page.");

    const plural =
      target === "update_study_plans" ? "study_plans" : "study_plan_blocks";
    const rows = readCollectionList(target, plural, value);
    if (target === "update_study_plans") {
      for (const raw of rows) {
        const record = readRecord(target, raw, ["id", "expected_version", "title"]);
        const id = requiredText(target, record, "id");
        if (id !== latest.data.plan.id)
          throw new Error("Choose the id from active_plan.");
        if (expectedVersion(target, record) !== latest.data.plan.version)
          throw new Error(
            "This study plan changed after the agent prepared the update. Refresh the plan and try again.",
          );
      }
      return;
    }

    const currentBlocks = new Map(
      latest.data.days
        .flatMap((entry) => entry.blocks)
        .map((block) => [block.id, block]),
    );
    for (const raw of rows) {
      const record = readRecord(
        target,
        raw,
        target === "update_study_plan_blocks"
          ? ["id", "expected_version", "label", "estimated_minutes", "method", "rationale"]
          : ["id", "expected_version"],
      );
      const id = requiredText(target, record, "id");
      const block = currentBlocks.get(id);
      if (!block)
        throw new Error("Choose ids from the current plan_agenda.");
      if (expectedVersion(target, record) !== block.version)
        throw new Error(
          "This study block changed after the agent prepared the update. Refresh the plan and try again.",
        );
    }
  };
  const recheckBeforeApproval = (
    target:
      | "update_study_plans"
      | "update_study_plan_blocks"
      | "delete_study_plan_blocks",
    entry: SurfaceWriteHandlerEntry,
  ): SurfaceWriteHandlerEntry => ({
    validate: async (value) => {
      await recheckLatestAgentVersions(target, value);
      await entry.validate?.(value);
    },
    apply: entry.apply,
  });
  const planWriteHandlers = collectionWriteHandlers(
    {
      plural: "study_plans",
      singular: "study plan",
      update: {
        parse: (value) => {
          if (!plan) throw new Error("Wait for the active study plan to load.");
          const rows = readCollectionList(
            "update_study_plans",
            "study_plans",
            value,
          );
          return rows.map((raw) => {
            const record = readRecord("update_study_plans", raw, [
              "id",
              "expected_version",
              "title",
            ]);
            const id = requiredText("update_study_plans", record, "id");
            if (id !== plan.plan.id)
              throw new Error("Choose the id from active_plan.");
            const version = expectedVersion("update_study_plans", record);
            if (version !== plan.plan.version)
              throw new Error(
                "expected_version must match the current active_plan version.",
              );
            return {
              id,
              expectedVersion: version,
              title: requiredText("update_study_plans", record, "title"),
            };
          });
        },
        run: async (item) => {
          const result = await planService.updatePlanTitle(
            item.id,
            item.expectedVersion,
            item.title,
          );
          if (result.error || !result.data)
            throw new Error(result.error ?? "Could not update the plan.");
          await load();
          return { id: result.data.id, name: result.data.title };
        },
        nameOf: (item) => item.title,
        changedOf: () => ["title"],
      },
    },
    refuseSurfaceWrite,
  );
  const blockWriteHandlers = collectionWriteHandlers(
    {
      plural: "study_plan_blocks",
      singular: "study block",
      create: {
        parse: (value) => {
          if (!plan) throw new Error("Wait for the active study plan to load.");
          const rows = readCollectionList(
            "create_study_plan_blocks",
            "study_plan_blocks",
            value,
          );
          return rows.map((raw) => {
            const record = readRecord("create_study_plan_blocks", raw, [
              "day_id",
              "day_date",
              "label",
              "estimated_minutes",
              "method",
              "rationale",
            ]);
            const dayId = requiredText(
              "create_study_plan_blocks",
              record,
              "day_id",
            );
            const day = activeDays.get(dayId);
            const date = requiredText(
              "create_study_plan_blocks",
              record,
              "day_date",
            );
            if (!day || day.day_date !== date)
              throw new Error(
                "day_id and day_date must name a current plan day.",
              );
            return {
              day,
              dayId,
              dayDate: date,
              label: requiredText("create_study_plan_blocks", record, "label"),
              estimatedMinutes: minutes(
                "create_study_plan_blocks",
                record.estimated_minutes,
              ),
              method: optionalText(
                "create_study_plan_blocks",
                record,
                "method",
              ),
              rationale: optionalText(
                "create_study_plan_blocks",
                record,
                "rationale",
              ),
            };
          });
        },
        run: async (item) => {
          const result = await planService.createBlock({
            planId: plan!.plan.id,
            dayId: item.dayId,
            dayDate: item.dayDate,
            label: item.label,
            estimatedMinutes: item.estimatedMinutes,
            method: item.method,
            rationale: item.rationale,
            ordering:
              plan!.days.find((entry) => entry.day.id === item.dayId)?.blocks
                .length ?? 0,
            targetKind: "review",
          });
          if (result.error || !result.data)
            throw new Error(result.error ?? "Could not add the study block.");
          await load();
          return { id: result.data.id, name: result.data.label };
        },
        nameOf: (item) => item.label,
      },
      update: {
        parse: (value) =>
          readCollectionList(
            "update_study_plan_blocks",
            "study_plan_blocks",
            value,
          ).map((raw) => {
            const record = readRecord("update_study_plan_blocks", raw, [
              "id",
              "expected_version",
              "label",
              "estimated_minutes",
              "method",
              "rationale",
            ]);
            const id = requiredText("update_study_plan_blocks", record, "id");
            const block = activeBlocks.get(id);
            if (!block)
              throw new Error("Choose an id from the current plan_agenda.");
            const version = expectedVersion("update_study_plan_blocks", record);
            if (version !== block.version)
              throw new Error(
                "expected_version must match the current block version in plan_agenda.",
              );
            const patch = {
              ...("label" in record
                ? {
                    label: requiredText(
                      "update_study_plan_blocks",
                      record,
                      "label",
                    ),
                  }
                : {}),
              ...("estimated_minutes" in record
                ? {
                    estimatedMinutes: minutes(
                      "update_study_plan_blocks",
                      record.estimated_minutes,
                    ),
                  }
                : {}),
              ...("method" in record
                ? {
                    method: optionalText(
                      "update_study_plan_blocks",
                      record,
                      "method",
                    ),
                  }
                : {}),
              ...("rationale" in record
                ? {
                    rationale: optionalText(
                      "update_study_plan_blocks",
                      record,
                      "rationale",
                    ),
                  }
                : {}),
            };
            if (!Object.keys(patch).length)
              throw new Error("Include at least one field to change.");
            return { id, expectedVersion: version, patch, name: id };
          }),
        run: async (item) => {
          const result = await planService.updateBlock(
            item.id,
            item.expectedVersion,
            item.patch,
          );
          if (result.error || !result.data)
            throw new Error(
              result.error ?? "Could not update the study block.",
            );
          await load();
          return { id: result.data.id, name: result.data.label };
        },
        nameOf: (item) => item.name,
      },
      delete: {
        parse: (value) => {
          const rows = readCollectionList(
            "delete_study_plan_blocks",
            "study_plan_blocks",
            value,
          );
          const plans = rows.map((raw) => {
            const record = readRecord("delete_study_plan_blocks", raw, [
              "id",
              "expected_version",
            ]);
            const id = requiredText("delete_study_plan_blocks", record, "id");
            const block = activeBlocks.get(id);
            if (!block)
              throw new Error("Choose ids from the current plan_agenda.");
            const version = expectedVersion("delete_study_plan_blocks", record);
            if (version !== block.version)
              throw new Error(
                "expected_version must match the current block version in plan_agenda.",
              );
            return { id, expectedVersion: version, name: id };
          });
          refuseRepeats(
            "delete_study_plan_blocks",
            plans.map((item) => item.id),
            "block id",
          );
          return plans;
        },
        run: async (item) => {
          const result = await planService.deleteBlock(
            item.id,
            item.expectedVersion,
          );
          if (result.error || !result.data)
            throw new Error(
              result.error ?? "Could not remove the study block.",
            );
          await load();
          return item;
        },
        nameOf: (item) => item.name,
      },
    },
    refuseSurfaceWrite,
  );
  useSurfaceWriteHandlers(SURFACE_NAME, {
    ...planWriteHandlers,
    ...blockWriteHandlers,
    update_study_plans: recheckBeforeApproval(
      "update_study_plans",
      planWriteHandlers.update_study_plans,
    ),
    update_study_plan_blocks: recheckBeforeApproval(
      "update_study_plan_blocks",
      blockWriteHandlers.update_study_plan_blocks,
    ),
    delete_study_plan_blocks: recheckBeforeApproval(
      "delete_study_plan_blocks",
      blockWriteHandlers.delete_study_plan_blocks,
    ),
  });

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
        <p className="text-sm text-foreground">
          Couldn&apos;t load your plan <ErrorAlchemyMenu />
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {error} <ErrorAlchemyMenu error={error} />
        </p>
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
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                title="Edit plan title"
                onClick={() => {
                  setTitleDraft(plan.plan.title);
                  setTitleEditorOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {plan.plan.generated_by === "ai" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  <AGENT_ICON className="h-3 w-3" />
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
            {/* The stale-plan banner below already offers "Re-plan now" for this
                same action — showing this one too would be two doors for one
                job, so it hides while that banner is up. */}
            {!(!absence && stale) && (
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
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setForceForm(true)}
            >
              <AGENT_ICON className="h-3.5 w-3.5" />
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
                {absenceMessage(absence)} No guilt, no wall of overdue cards —
                we&apos;ll rebuild the rest of your plan with a lighter first
                day and put the highest-value work first.
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
        onAddBlock={openAddBlock}
        onEditBlock={openEditBlock}
        onDeleteBlock={(block) => void handleDeleteBlock(block)}
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
      <Dialog open={titleEditorOpen} onOpenChange={setTitleEditorOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit plan title</DialogTitle>
            <DialogDescription>
              Choose a clear name for this study plan.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTitleEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={savingEdit}
              onClick={() => void handleSaveTitle()}
            >
              Save title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={blockEditor !== null}
        onOpenChange={(open) => !open && setBlockEditor(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {blockEditor?.block ? "Edit study block" : "Add study block"}
            </DialogTitle>
            <DialogDescription>
              Set the work and its time. Completion status remains your own
              study record.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              What will you study?
              <Input
                value={blockEditor?.label ?? ""}
                onChange={(event) =>
                  setBlockEditor((current) =>
                    current
                      ? { ...current, label: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Minutes
              <Input
                type="number"
                min={1}
                max={480}
                value={blockEditor?.minutes ?? ""}
                onChange={(event) =>
                  setBlockEditor((current) =>
                    current
                      ? { ...current, minutes: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Method (optional)
              <Input
                value={blockEditor?.method ?? ""}
                onChange={(event) =>
                  setBlockEditor((current) =>
                    current
                      ? { ...current, method: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Why this matters (optional)
              <Input
                value={blockEditor?.rationale ?? ""}
                onChange={(event) =>
                  setBlockEditor((current) =>
                    current
                      ? { ...current, rationale: event.target.value }
                      : current,
                  )
                }
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockEditor(null)}>
              Cancel
            </Button>
            <Button
              disabled={savingEdit}
              onClick={() => void handleSaveBlock()}
            >
              {blockEditor?.block ? "Save block" : "Add block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
