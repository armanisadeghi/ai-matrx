"use client";

// features/education/study/planner/components/PlanGenerateForm.tsx
//
// The plan-generation form: exam title + date, daily minutes, rest days, and an
// optional gentle daily item cap (anti-burnout). Produces a `PlanInput` the
// parent turns into a plan (AI planner agent → heuristic fallback).
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { publishPlanSetupDraft } from "../plannerSnapshot";
import type { PlanInput, Weekday } from "../types";

const SURFACE_NAME = "matrx-user/education-planner";

/** Slider bounds — the same range a human can pick, enforced for agents too. */
const MIN_DAILY_MINUTES = 10;
const MAX_DAILY_MINUTES = 180;

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface PlanGenerateFormProps {
  generating: boolean;
  onGenerate: (input: PlanInput) => void;
  initialTitle?: string;
  initialExamDate?: string;
  initialGoalId?: string | null;
}

export function PlanGenerateForm({
  generating,
  onGenerate,
  initialTitle = "",
  initialExamDate = "",
  initialGoalId = null,
}: PlanGenerateFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [examDate, setExamDate] = useState(initialExamDate);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [restDays, setRestDays] = useState<Weekday[]>([0]);
  const [cap, setCap] = useState<string>("");

  const toggleRest = (d: Weekday) =>
    setRestDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );

  const valid = title.trim().length > 0 && examDate.length === 10;

  const capValue = cap.trim() ? Number(cap.trim()) : null;
  const dailyItemCap =
    capValue !== null && Number.isFinite(capValue) && capValue > 0
      ? capValue
      : null;

  // Read twin for the `plan_setup` write target: publish this form's live
  // values so the surface can emit `plan_setup_draft`, and clear on unmount so
  // a closed form never reads as open. (The emitter samples the store
  // synchronously — see ../plannerSnapshot.ts.)
  useEffect(() => {
    publishPlanSetupDraft({
      title,
      examDate,
      dailyMinutes,
      restDays,
      dailyItemCap,
    });
  });
  useEffect(() => () => publishPlanSetupDraft(null), []);

  // Write half: an agent stages the setup the learner just described in words.
  // Registered from HERE, not the workspace, because this component owns the
  // state — so the target is offered only while the form is genuinely on
  // screen, and never resolves into a form nobody can see. Only useState
  // setters are closed over (stable by contract); nothing fetched is read from
  // this closure, which could be resolved long before the confirm is answered.
  useSurfaceWriteHandlers(SURFACE_NAME, {
    plan_setup: (value: unknown) => {
      const allowed = [
        "title",
        "exam_date",
        "daily_minutes",
        "rest_days",
        "daily_item_cap",
      ];
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new Error(
          `plan_setup expects an object with keys ${allowed.join(", ")}; received ${
            Array.isArray(value) ? "an array" : JSON.stringify(value)
          }.`,
        );
      const record = value as Record<string, unknown>;
      const unknownKeys = Object.keys(record).filter(
        (k) => !allowed.includes(k),
      );
      if (unknownKeys.length > 0)
        throw new Error(
          `plan_setup does not accept ${unknownKeys.join(", ")}. Allowed keys: ${allowed.join(", ")}.`,
        );
      if (Object.keys(record).length === 0)
        throw new Error(
          `plan_setup needs at least one of ${allowed.join(", ")}.`,
        );

      // Validate EVERYTHING before touching a single setter, so a partly-bad
      // object stages nothing at all.
      let nextTitle: string | undefined;
      if ("title" in record) {
        if (typeof record.title !== "string" || !record.title.trim())
          throw new Error(
            "plan_setup.title must be a non-empty plain text string — what the learner is studying for, not JSON and not a JSON-encoded string, no code fence.",
          );
        nextTitle = record.title.trim();
      }

      let nextExamDate: string | undefined;
      if ("exam_date" in record) {
        if (
          typeof record.exam_date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(record.exam_date)
        )
          throw new Error(
            `plan_setup.exam_date must be a calendar date formatted YYYY-MM-DD (e.g. "2026-09-14"); received ${JSON.stringify(record.exam_date)}.`,
          );
        if (Number.isNaN(new Date(`${record.exam_date}T00:00:00Z`).getTime()))
          throw new Error(
            `plan_setup.exam_date "${record.exam_date}" is not a real calendar date.`,
          );
        if (record.exam_date < todayIso())
          throw new Error(
            `plan_setup.exam_date must be today (${todayIso()}) or later — a plan cannot be built toward a date that has passed.`,
          );
        nextExamDate = record.exam_date;
      }

      let nextMinutes: number | undefined;
      if ("daily_minutes" in record) {
        const minutes = record.daily_minutes;
        if (
          typeof minutes !== "number" ||
          !Number.isInteger(minutes) ||
          minutes < MIN_DAILY_MINUTES ||
          minutes > MAX_DAILY_MINUTES
        )
          throw new Error(
            `plan_setup.daily_minutes must be a whole number between ${MIN_DAILY_MINUTES} and ${MAX_DAILY_MINUTES}; received ${JSON.stringify(minutes)}.`,
          );
        nextMinutes = minutes;
      }

      let nextRestDays: Weekday[] | undefined;
      if ("rest_days" in record) {
        const days = record.rest_days;
        if (
          !Array.isArray(days) ||
          days.some(
            (d) => typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6,
          )
        )
          throw new Error(
            `plan_setup.rest_days must be an array of whole weekday numbers, 0 (Sunday) through 6 (Saturday) — e.g. [0, 6] for weekends; received ${JSON.stringify(days)}.`,
          );
        nextRestDays = [...new Set(days as Weekday[])].sort();
      }

      let nextCap: string | undefined;
      if ("daily_item_cap" in record) {
        const rawCap = record.daily_item_cap;
        if (rawCap === null) nextCap = "";
        else if (
          typeof rawCap !== "number" ||
          !Number.isInteger(rawCap) ||
          rawCap <= 0
        )
          throw new Error(
            `plan_setup.daily_item_cap must be a whole number greater than 0, or null for no cap; received ${JSON.stringify(rawCap)}.`,
          );
        else nextCap = String(rawCap);
      }

      if (nextTitle !== undefined) setTitle(nextTitle);
      if (nextExamDate !== undefined) setExamDate(nextExamDate);
      if (nextMinutes !== undefined) setDailyMinutes(nextMinutes);
      if (nextRestDays !== undefined) setRestDays(nextRestDays);
      if (nextCap !== undefined) setCap(nextCap);
    },
  });

  const submit = () => {
    if (!valid) return;
    onGenerate({
      title: title.trim(),
      startDate: todayIso(),
      examDate,
      dailyMinutes,
      restDays,
      dailyItemCap,
      goalId: initialGoalId,
      itemType: "fc_card",
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Generate your study plan
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="What are you studying for?">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Spanish midterm, AP Bio Unit 3"
            className="text-base sm:text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Exam / target date">
            <Input
              type="date"
              value={examDate}
              min={todayIso()}
              onChange={(e) => setExamDate(e.target.value)}
              className="text-base sm:text-sm"
            />
          </Field>
          <Field label={`Minutes per day: ${dailyMinutes}`}>
            <Slider
              min={10}
              max={180}
              step={5}
              value={[dailyMinutes]}
              onValueChange={([v]) => setDailyMinutes(v ?? dailyMinutes)}
              className="mt-2"
            />
          </Field>
        </div>

        <Field label="Rest days (kept clear — recovery protects retention)">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = restDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleRest(d.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Daily review cap (optional — smooths the load, prevents a wall)">
          <Input
            type="number"
            inputMode="numeric"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="e.g. 40 — leave blank for no cap"
            className="max-w-[220px] text-base sm:text-sm"
          />
        </Field>

        <Button
          className="mt-1 w-full gap-2 sm:w-auto"
          disabled={!valid || generating}
          onClick={submit}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
          {generating ? "Building your plan…" : "Generate plan"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
