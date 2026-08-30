"use client";

/**
 * The right-rail "complete these fields" checklist. Nothing is priced until
 * every row is satisfied; each unsatisfied row says what is still missing.
 */

import { Check, Circle } from "lucide-react";
import { cn } from "@/utils/cn";

export interface ChecklistRow {
  id: string;
  label: string;
  /** The chosen value, or null while the field is unset. */
  value: string | null;
}

interface RequirementChecklistProps {
  rows: ChecklistRow[];
}

export function RequirementChecklist({ rows }: RequirementChecklistProps) {
  const remaining = rows.filter((row) => row.value === null).length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {remaining === 0
          ? "All fields complete"
          : `Complete these fields (${remaining})`}
      </h3>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const done = row.value !== null;
          return (
            <li key={row.id} className="flex items-start gap-2">
              {done ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-medium",
                    done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {row.label}
                </p>
                {done ? (
                  <p className="truncate text-xs text-foreground">{row.value}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not selected</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
