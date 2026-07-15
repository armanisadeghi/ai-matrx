"use client";

// features/education/classes/components/AssignedToYouPanel.tsx
//
// A MEMBER's "Assigned to you" list: every deck/quiz the teacher assigned, with
// this student's OWN completion status, score, and due date, plus a link to study
// each. Assignments come from the membership-gated edu_class_assignments RPC (so an
// enrolled student in the teacher's org can read them without org access); the
// student's own completion comes from edu_class_student_progress(class, self).
// Reuses the shared assignment display primitives + the education entityRoutes map.

import { ClipboardList, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useClassAssignments } from "../hooks/useClassAssignments";
import { useMyClassProgress } from "../hooks/useClassProgress";
import {
  AssignmentStatusBadge,
  DueDateLabel,
  ScorePill,
} from "./assignmentDisplay";
import type { AssignmentProgress } from "../types";

export function AssignedToYouPanel({ classId }: { classId: string }) {
  const router = useRouter();
  const assignments = useClassAssignments(classId);
  const { progress, loading: progressLoading } = useMyClassProgress(classId);

  const progressByKey = new Map<string, AssignmentProgress>();
  for (const p of progress) progressByKey.set(`${p.token}:${p.resourceId}`, p);

  const loading = assignments.loading || progressLoading;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        Assigned to you
        {assignments.assignments.length > 0 && (
          <span className="text-muted-foreground">
            ({assignments.assignments.length})
          </span>
        )}
      </h2>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : assignments.error ? (
        <p className="text-xs text-destructive">{assignments.error}</p>
      ) : assignments.assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing assigned yet. When your teacher assigns a deck or quiz, it shows
          up here with its due date.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.assignments.map((a) => {
            const Icon = a.Icon;
            const p = progressByKey.get(`${a.token}:${a.resourceId}`);
            const status = p?.status ?? "not_started";
            return (
              <li
                key={`${a.token}:${a.resourceId}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {a.title}
                  </span>
                  <div className="mt-0.5 flex items-center gap-3">
                    <DueDateLabel dueDate={a.dueDate} />
                    <AssignmentStatusBadge status={status} />
                    {p && p.scorePct != null && <ScorePill scorePct={p.scorePct} />}
                  </div>
                </div>
                {a.studyHref && (
                  <button
                    type="button"
                    onClick={() =>
                      a.studyHref && router.push(a.studyHref)
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    {status === "completed" ? "Review" : "Study"}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
