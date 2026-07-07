"use client";

// features/education/study/planner/components/PlanGenerateForm.tsx
//
// The plan-generation form: exam title + date, daily minutes, rest days, and an
// optional gentle daily item cap (anti-burnout). Produces a `PlanInput` the
// parent turns into a plan (AI planner agent → heuristic fallback).
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlanInput, Weekday } from "../types";

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

  const submit = () => {
    if (!valid) return;
    const capNum = cap.trim() ? Number(cap.trim()) : null;
    onGenerate({
      title: title.trim(),
      startDate: todayIso(),
      examDate,
      dailyMinutes,
      restDays,
      dailyItemCap: capNum && capNum > 0 ? capNum : null,
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
            <input
              type="range"
              min={10}
              max={180}
              step={5}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
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
