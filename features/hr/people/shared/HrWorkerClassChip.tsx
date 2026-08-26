"use client";

// features/hr/people/shared/HrWorkerClassChip.tsx
//
// 🚨 ARMAN'S Q3 RULING, IMPLEMENTED: mark a contractor QUIETLY, AS A FACT —
// never as a lesser status.
//
// So: one small neutral chip, the same visual weight for every non-employee
// class, no colour that reads as warning, no "external" framing, no icon that
// implies caution. `employee` renders NOTHING at all, because the default class
// needs no annotation and labelling it would make the others look marked.
//
// The MARKETPLACE OF RECORD (Upwork, Fiverr, an agency) is deliberately NOT here.
// SPEC-EMPLOYEES §4.7 puts it inside the Job tab, where an HR admin working on
// the engagement needs it — a directory row broadcasting "Upwork" to every
// colleague is exactly the lesser-status rendering the ruling forbids.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { HR_WORKER_CLASSES, type HrWorkerClass } from "../../constants";

const LABELS: Record<HrWorkerClass, string> = {
  employee: "Employee",
  contractor: "Contractor",
  intern: "Intern",
  seasonal: "Seasonal",
  volunteer: "Volunteer",
};

function isWorkerClass(value: unknown): value is HrWorkerClass {
  return (
    typeof value === "string" &&
    (HR_WORKER_CLASSES as readonly string[]).includes(value)
  );
}

export function hrWorkerClassLabel(value: string | null | undefined): string | null {
  return isWorkerClass(value) ? LABELS[value] : null;
}

export function HrWorkerClassChip({
  workerClass,
  className,
}: {
  workerClass: string | null | undefined;
  className?: string;
}) {
  if (!isWorkerClass(workerClass)) return null;
  // The default class carries no chip. See the header note.
  if (workerClass === "employee") return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border px-1.5 py-0 text-[0.6875rem] font-normal text-muted-foreground",
        className,
      )}
    >
      {LABELS[workerClass]}
    </Badge>
  );
}
