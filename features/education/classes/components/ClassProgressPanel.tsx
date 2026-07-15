"use client";

// features/education/classes/components/ClassProgressPanel.tsx
//
// The OWNER's class analytics: a roster × assignment completion grid + a
// class-wide rollup, plus a per-student drill-in. Data comes from the owner-gated
// edu_class_progress_overview RPC (the owner check is the SERVER's). Every read is
// SCOPED TO THIS CLASS's assignments — the teacher never sees a student's wider
// study spine (the class-consent privacy boundary; see FEATURE.md).
//
// Reuses the shared assignment display primitives (ProgressCell / ScorePill /
// AssignmentStatusBadge / DueDateLabel) so the grid, drill, and member view all
// render completion identically. React Compiler is on: no manual memo.

import { useState } from "react";
import { BarChart3, ChevronRight, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { educationEntityRoute } from "@/features/education/data/entityRoutes";
import { useClassProgressOverview } from "../hooks/useClassProgress";
import {
  AssignmentStatusBadge,
  DueDateLabel,
  ProgressCell,
  ScorePill,
} from "./assignmentDisplay";
import type {
  AssignmentProgress,
  ClassProgressStudent,
} from "../types";

export function ClassProgressPanel({ classId }: { classId: string }) {
  const { overview, loading, error, reload } = useClassProgressOverview(classId);

  const assignments = overview?.assignments ?? [];
  const students = overview?.students ?? [];

  const { titleFor } = useEntityTitles(
    assignments.map((a) => ({ token: a.token, id: a.resourceId })),
  );

  // Class-wide rollup across every (student, assignment) cell.
  const totalCells = students.length * assignments.length;
  let completedCells = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const s of students) {
    for (const c of s.cells) {
      if (c.status === "completed") completedCells += 1;
      if (c.scorePct != null) {
        scoreSum += c.scorePct;
        scoreCount += 1;
      }
    }
  }
  const completionPct =
    totalCells > 0 ? Math.round((completedCells / totalCells) * 100) : null;
  const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Class progress
        </h2>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground"
          disabled={loading}
          onClick={() => void reload()}
          aria-label="Refresh class progress"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Assign a deck or quiz above to start tracking who has completed what.
        </p>
      ) : students.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No students on the roster yet. Once students join, their completion of
          each assignment shows up here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Rollup */}
          <div className="grid grid-cols-3 gap-3">
            <Rollup label="Students" value={`${students.length}`} icon={Users} />
            <Rollup
              label="Completion"
              value={completionPct == null ? "—" : `${completionPct}%`}
            />
            <Rollup label="Avg score" value={avgScore == null ? "—" : `${avgScore}%`} />
          </div>

          {/* Grid */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Student
                  </th>
                  {assignments.map((a) => {
                    const route = educationEntityRoute(a.token);
                    const Icon = route.Icon;
                    return (
                      <th
                        key={`${a.token}:${a.resourceId}`}
                        className="px-2 py-2 text-center align-bottom"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span
                            className="max-w-[6rem] truncate text-[11px] font-medium text-foreground"
                            title={titleFor({ token: a.token, id: a.resourceId })}
                          >
                            {titleFor({ token: a.token, id: a.resourceId })}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <StudentRow key={s.userId} student={s} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function StudentRow({ student }: { student: ClassProgressStudent }) {
  const [open, setOpen] = useState(false);
  const cellByResource = new Map<string, AssignmentProgress>();
  for (const c of student.cells) cellByResource.set(c.resourceId, c);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="sticky left-0 z-10 bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="max-w-[10rem] truncate text-foreground" title={student.email ?? student.userId}>
              {student.name || student.email || student.userId}
            </span>
          </div>
        </td>
        {student.cells.map((c) => (
          <td key={`${c.token}:${c.resourceId}`} className="px-2 py-2">
            <ProgressCell status={c.status} scorePct={c.scorePct} />
          </td>
        ))}
      </tr>
      {open && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={student.cells.length + 1} className="px-3 py-3">
            <StudentDrill student={student} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The per-student drill-in: each assignment's status, score, due, last activity. */
function StudentDrill({ student }: { student: ClassProgressStudent }) {
  const { titleFor } = useEntityTitles(
    student.cells.map((c) => ({ token: c.token, id: c.resourceId })),
  );
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {student.name || student.email}&apos;s assignments
      </p>
      <ul className="space-y-1.5">
        {student.cells.map((c) => (
          <li
            key={`${c.token}:${c.resourceId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {titleFor({ token: c.token, id: c.resourceId })}
            </span>
            <DueDateLabel dueDate={c.dueDate} />
            <AssignmentStatusBadge status={c.status} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ScorePill scorePct={c.scorePct} />
              {c.attempts > 0 && (
                <span className="tabular-nums">
                  · {c.correct}/{c.attempts}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Rollup({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
