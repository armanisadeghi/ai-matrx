"use client";

// features/education/study/planner/components/PlannerWorkspace.tsx
//
// The /education/planner surface. Two views behind one shell: the AI day-by-day
// PLAN (default) and the GOALS list (the existing StudyPlanner, embedded). The
// AI plan is the headline; goals are the exam targets that seed it.
//
// This is also the surface EMITTER for `matrx-user/education-planner`. It owns
// the goal list (so goals stay readable and writable from BOTH tabs, not just
// the one that renders them) and registers the three goal write targets; the
// plan slice and the generation form publish themselves into
// `../plannerSnapshot.ts`, which `buildEducationPlannerScope` reads
// synchronously — the Surface Context window samples getScope every 400ms, so
// it must never fetch.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { StudyPlanner } from "../../components/StudyPlanner";
import { studyService } from "../../service/studyService";
import type { StudyGoalRow } from "../../types";
import { buildEducationPlannerScope } from "../educationPlannerScope";
import { resolveGoalStats, type GoalStat } from "../goalStats";
import {
  createStudyGoal,
  setStudyGoalStatus,
  updateStudyGoal,
} from "../goalWrites";
import { StudyPlanView } from "./StudyPlanView";

const SURFACE_NAME = "matrx-user/education-planner";

type Tab = "plan" | "goals";

/**
 * Agent-supplied values arrive through the inline-tool layer, which parses a
 * JSON-looking argument BEFORE the handler sees it — so an object target
 * receives a real object. Anything else is the agent's error to hear about,
 * spelled out rather than coerced.
 */
function asWriteObject(
  target: string,
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `${target} expects an object with keys ${allowed.join(", ")}; received ${
        Array.isArray(value) ? "an array" : JSON.stringify(value)
      }.`,
    );
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((k) => !allowed.includes(k));
  if (unknownKeys.length > 0)
    throw new Error(
      `${target} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${allowed.join(", ")}.`,
    );
  return record;
}

/** A required, non-empty plain-text string field inside a write object. */
function requiredString(
  target: string,
  record: Record<string, unknown>,
  key: string,
): string {
  const raw = record[key];
  if (typeof raw !== "string" || !raw.trim())
    throw new Error(
      `${target} requires a non-empty ${key} — plain text, not JSON and not a JSON-encoded string, no code fence.`,
    );
  return raw;
}

/** An optional string-or-null field; `undefined` means "leave it alone". */
function optionalNullableString(
  target: string,
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) return undefined;
  const raw = record[key];
  if (raw === null) return null;
  if (typeof raw !== "string")
    throw new Error(
      `${target}.${key} must be a plain text string or null — not JSON and not a JSON-encoded string; received ${JSON.stringify(raw)}.`,
    );
  return raw;
}

export function PlannerWorkspace({ backHref }: { backHref?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plan");

  // The goal list lives here, not in StudyPlanner, so the surface can emit
  // study_goals (and service a goal write) from either tab.
  const [goals, setGoals] = useState<StudyGoalRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, GoalStat>>({});
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const loadGoals = async () => {
    setGoalsError(null);
    const [goalsRes, masteryRes] = await Promise.all([
      studyService.listGoals({ status: "active" }),
      studyService.listMastery("fc_card"),
    ]);
    if (goalsRes.error) {
      setGoalsError(goalsRes.error);
      setGoals(null);
      return;
    }
    const nextGoals = goalsRes.data ?? [];
    setGoals(nextGoals);
    setStats(await resolveGoalStats(nextGoals, masteryRes.data ?? []));
  };

  useEffect(() => {
    void loadGoals();
  }, []);

  // Read at Run time from live render state + the module snapshot store. Kept
  // synchronous on purpose (see the file header).
  const getScope = () =>
    buildEducationPlannerScope({ activeTab: tab, goals, stats, goalsError });

  /**
   * Write half. Every handler calls the SAME `goalWrites` helpers the editor
   * dialog calls — never a parallel path — and throws on a bad shape so the
   * writeback seam hands the agent a real error instead of a silent no-op.
   * After a write we show the Goals tab and reload, so the learner SEES what
   * landed rather than being told it did.
   */
  const revealGoals = async () => {
    setTab("goals");
    await loadGoals();
  };

  const getWriteHandlers = () => ({
    create_goal: async (value: unknown) => {
      const record = asWriteObject("create_goal", value, [
        "title",
        "target_date",
        "topic",
      ]);
      await createStudyGoal({
        title: requiredString("create_goal", record, "title"),
        targetDate: optionalNullableString("create_goal", record, "target_date"),
        topic: optionalNullableString("create_goal", record, "topic"),
      });
      await revealGoals();
    },
    update_goal: async (value: unknown) => {
      const record = asWriteObject("update_goal", value, [
        "goal_id",
        "title",
        "target_date",
        "topic",
      ]);
      const goalId = requiredString("update_goal", record, "goal_id");
      await updateStudyGoal(goalId, {
        ...("title" in record
          ? { title: requiredString("update_goal", record, "title") }
          : {}),
        ...("target_date" in record
          ? {
              targetDate: optionalNullableString(
                "update_goal",
                record,
                "target_date",
              ),
            }
          : {}),
        ...("topic" in record
          ? { topic: optionalNullableString("update_goal", record, "topic") }
          : {}),
      });
      await revealGoals();
    },
    goal_status: async (value: unknown) => {
      const record = asWriteObject("goal_status", value, [
        "goal_id",
        "status",
      ]);
      const goalId = requiredString("goal_status", record, "goal_id");
      // Validated inside setStudyGoalStatus against GOAL_STATUSES — the one
      // runtime vocabulary constant, read at call time.
      await setStudyGoalStatus(goalId, record.status as never);
      await revealGoals();
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <div className="min-h-full w-full bg-textured">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 h-8 px-2 text-xs text-muted-foreground"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-0.5">
            <TabButton
              active={tab === "plan"}
              onClick={() => setTab("plan")}
              icon={CalendarClock}
              label="Plan"
            />
            <TabButton
              active={tab === "goals"}
              onClick={() => setTab("goals")}
              icon={Target}
              label="Goals"
            />
          </div>

          {tab === "plan" ? (
            <StudyPlanView />
          ) : (
            <StudyPlanner
              embedded
              goals={goals}
              stats={stats}
              error={goalsError}
              onReload={loadGoals}
            />
          )}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Target;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
