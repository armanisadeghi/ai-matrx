"use client";

// features/education/classes/components/ClassAssignmentsPanel.tsx
//
// The OWNER's assignments manager: list every assigned deck/quiz with its due
// date (inline-editable), remove an assignment, or open the picker to assign
// more. Reads/writes the membership-gated edu_class_* RPCs via useClassAssignments
// (the owner check is the SERVER's, not this component's isOwner prop).

import { useState } from "react";
import { ClipboardList, Plus, Trash2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useClassAssignments } from "../hooks/useClassAssignments";
import { AssignResourceSheet } from "./AssignResourceSheet";
import { DueDateLabel } from "./assignmentDisplay";
import type { AssignableToken } from "../types";

export function ClassAssignmentsPanel({
  classId,
  className,
  assignments,
}: {
  classId: string;
  className: string;
  /** Shared instance so the progress panel refreshes off the same source. */
  assignments: ReturnType<typeof useClassAssignments>;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDue, setPendingDue] = useState("");

  async function remove(token: string, resourceId: string, title: string) {
    const ok = await confirm({
      title: `Remove "${title}"?`,
      description:
        "It stops being an assignment for this class. The deck/quiz itself and everyone's study history are untouched.",
      confirmLabel: "Remove assignment",
      variant: "destructive",
    });
    if (!ok) return;
    await assignments.unassign(token, resourceId);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Assignments
          {assignments.assignments.length > 0 && (
            <span className="text-muted-foreground">
              ({assignments.assignments.length})
            </span>
          )}
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Assign
        </Button>
      </div>

      {assignments.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : assignments.error ? (
        <p className="text-xs text-destructive">{assignments.error}</p>
      ) : assignments.assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No assignments yet. Assign a deck or a quiz and your roster gets it —
            with a due date and per-student completion tracking.
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Assign content
          </Button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {assignments.assignments.map((a) => {
            const Icon = a.Icon;
            return (
              <li
                key={`${a.token}:${a.resourceId}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {a.title}
                    </span>
                    {a.href && (
                      <button
                        type="button"
                        onClick={() => a.href && router.push(a.href)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Open resource"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <DueDateLabel dueDate={a.dueDate} />
                </div>
                <input
                  type="date"
                  value={a.dueDate ?? ""}
                  disabled={assignments.acting}
                  onChange={(e) =>
                    assignments.setDueDate(
                      a.token as AssignableToken,
                      a.resourceId,
                      e.target.value || null,
                    )
                  }
                  aria-label={`Due date for ${a.title}`}
                  className="h-7 shrink-0 rounded-md border border-border bg-background px-2 text-xs text-foreground [color-scheme:light] dark:[color-scheme:dark]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={assignments.acting}
                  onClick={() => remove(a.token, a.resourceId, a.title)}
                  aria-label="Remove assignment"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AssignResourceSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        className={className}
        assignments={assignments}
        dueDate={pendingDue}
        onDueDateChange={setPendingDue}
      />
    </section>
  );
}
