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
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";
import { BarChart3, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { educationEntityRoute } from "@/features/education/data/entityRoutes";
import {
  useClassProgressOverview,
  type UseClassProgressOverviewReturn,
} from "../hooks/useClassProgress";
import {
  AssignmentStatusBadge,
  DueDateLabel,
  ProgressCell,
  ScorePill,
} from "./assignmentDisplay";
import type { ClassProgressStudent } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function ClassProgressPanel({
  classId,
  progress,
}: {
  classId: string;
  /** The progress read, when the hub owns it (so its surface scope can read
   *  the same grid). Omitted → the panel reads it itself. */
  progress?: UseClassProgressOverviewReturn;
}) {
  const ownProgress = useClassProgressOverview(classId, !progress);
  const { overview, loading, error, reload } = progress ?? ownProgress;

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
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
          icon={<RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />}
          variant="quiet"
          disabled={loading}
          onClick={() => void reload()}
          aria-label="Refresh class progress"
        />
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-xs text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>
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
          {/* Gradebook stance (D-WP6-5): derived, live, never teacher-entered. */}
          <p className="text-xs text-muted-foreground">
            Completion and scores come straight from each student&apos;s study
            activity on the assigned material — live, and never hand-entered.
          </p>

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
          <MatrxDataTable<ClassProgressStudent>
            tableId="education/classes/progress"
            data={students}
            columns={[
              {
                id: "student",
                header: "Student",
                accessorFn: studentLabel,
                filter: "text",
                width: 200,
                frozen: true,
                cell: (s) => (
                  <span className="block max-w-[10rem] truncate" title={s.email ?? s.userId}>
                    {studentLabel(s)}
                  </span>
                ),
              },
              ...assignments.map((a): MatrxColumnDef<ClassProgressStudent> => {
                const route = educationEntityRoute(a.token);
                const Icon = route.Icon;
                const title = titleFor({ token: a.token, id: a.resourceId });
                const cellOf = (s: ClassProgressStudent) =>
                  s.cells.find((c) => c.resourceId === a.resourceId && c.token === a.token);
                return {
                  id: `a:${a.token}:${a.resourceId}`,
                  label: title,
                  header: (
                    <span className="flex items-center gap-1.5" title={title}>
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="max-w-[6rem] truncate">{title}</span>
                    </span>
                  ),
                  accessorFn: (s) => cellOf(s)?.status ?? "not_started",
                  sortValue: (s) => cellOf(s)?.scorePct ?? -1,
                  filter: "select",
                  filterOptions: [
                    { value: "not_started", label: "Not started" },
                    { value: "in_progress", label: "In progress" },
                    { value: "completed", label: "Completed" },
                  ],
                  width: 130,
                  cell: (s) => {
                    const c = cellOf(s);
                    return c ? <ProgressCell status={c.status} scorePct={c.scorePct} /> : null;
                  },
                };
              }),
            ]}
            getRowId={(s) => s.userId}
            pageSize={0}
            density="condensed"
            viewTabs={false}
            toolbar={{ searchPlaceholder: "Search students" }}
            detail={{ enabled: false }}
            copy={progressCopy(titleFor)}
            searchText={studentLabel}
            expandedDetail={{
              expandedIds,
              onExpandedIdsChange: setExpandedIds,
              render: (s) => <StudentDrill student={s} />,
            }}
            emptyState={{ title: "No students on the roster yet" }}
          />
        </div>
      )}
    </section>
  );
}

const studentLabel = (s: ClassProgressStudent) => s.name || s.email || s.userId;

const progressCopy = (
  titleFor: (ref: { token: string; id: string }) => string,
): MatrxDataTableCopyConfig<ClassProgressStudent> => ({
  label: "Student progress",
  listLabel: "Class progress (this view)",
  location: "Class — progress",
  rowKind: "class-student-progress",
  listKind: "class-progress",
  rowDescription: "One student's completion and score on each assignment of the class.",
  listDescription: "The class roster with completion on every assignment, as currently shown.",
  humanRow: (s) =>
    [
      `Student: ${studentLabel(s)}`,
      ...s.cells.map(
        (c) =>
          `${titleFor({ token: c.token, id: c.resourceId })} — ${c.status.replace("_", " ")}${c.scorePct == null ? "" : `, ${c.scorePct}%`}${c.dueDate ? `, due ${c.dueDate}` : ""}`,
      ),
    ].join("\n"),
});

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
