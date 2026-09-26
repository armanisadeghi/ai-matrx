"use client";

// lib/entity-list/components/EntitySourceFailures.tsx
//
// THE notice for a list whose SIDE reads failed while its rows did not — a
// report, a column's facts. One plain sentence per failed source (which
// columns, and why in words), one Retry, and the raw messages handed to the
// Alchemy menu's AI payload instead of the screen. Rendered in an
// `EntityListPage` `notice` slot. Before this, the admin mandate list printed
// `Sources unavailable: readAllRows(mandate.v_reference_latest): query failed —
// canceling statement due to statement timeout` (2026-09-26).

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { plainFailureReason } from "@/lib/entity-list/failure";

export interface EntitySourceFailure {
  /** What the source fills, in the reader's words ("Grades", "Where it is declared and called"). */
  label: string;
  /** Whatever the read threw, or its message. Never shown; sent to the AI payload. */
  error: unknown;
}

export function EntitySourceFailures({
  failures,
  onRetry,
  operation,
  consequence = "Their cells say they are unknown rather than guess.",
}: {
  failures: readonly EntitySourceFailure[];
  /** Ask the failed sources again. Absent = no Retry (a refusal will refuse again). */
  onRetry?: () => void;
  operation: string;
  /** What the reader sees meanwhile, in one sentence. */
  consequence?: string;
}) {
  if (failures.length === 0) return null;
  const sentences = failures.map((f) => `${f.label} ${plainFailureReason(f.error)}.`);
  const details = Object.fromEntries(
    failures.map((f) => [
      f.label,
      f.error instanceof Error ? f.error.message : String(f.error),
    ]),
  );
  return (
    <ErrorNotice
      size="compact"
      title={failures.length === 1 ? "One source could not be read" : "Some sources could not be read"}
      message={`${sentences.join(" ")} ${consequence}`}
      operation={operation}
      details={details}
      actions={
        onRetry ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onRetry}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
