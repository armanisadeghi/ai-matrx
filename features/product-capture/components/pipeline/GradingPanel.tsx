"use client";

/**
 * GradingPanel — the finalization gate: the standard grading criteria
 * (cosmetic / working / completeness / packaging, extensible) each get an
 * explicit grade + note, and "Ready" asserts no ambiguity remains. Listing
 * generation is blocked until every criterion is resolved.
 */

import React from "react";
import { CheckCircle2, FileOutput } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  GRADING_CRITERIA,
  type GradeValue,
  type GradingResult,
} from "../../pipeline-types";
import {
  CommitField,
  CommitTextArea,
  PanelSection,
  SelectField,
} from "./panel-primitives";

const GRADE_OPTIONS: Array<{ value: GradeValue; label: string }> = [
  { value: "A", label: "A — like new" },
  { value: "B", label: "B — light wear" },
  { value: "C", label: "C — visible wear" },
  { value: "D", label: "D — heavy wear" },
  { value: "F", label: "F — for parts" },
  { value: "na", label: "Not graded" },
];

function withDefaults(
  grading: Partial<GradingResult>,
): NonNullable<GradingResult["criteria"]> {
  const existing = grading.criteria ?? [];
  const byKey = new Map(existing.map((c) => [c.key, c]));
  const base = GRADING_CRITERIA.map(
    (c) =>
      byKey.get(c.key) ?? {
        key: c.key,
        label: c.label,
        grade: "na" as GradeValue,
      },
  );
  const extras = existing.filter(
    (c) => !GRADING_CRITERIA.some((g) => g.key === c.key),
  );
  return [...base, ...extras];
}

export function GradingPanel({
  grading,
  onEdit,
  onGenerateListing,
}: {
  grading: Partial<GradingResult>;
  onEdit: (patch: Partial<GradingResult>) => void;
  onGenerateListing: () => Promise<void>;
}) {
  const criteria = withDefaults(grading);
  const allGraded = criteria.every((c) => c.grade !== "na");
  const ready = grading.ready === true;

  return (
    <PanelSection
      title="Final grading"
      badge={
        ready ? (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </span>
        ) : undefined
      }
      actions={
        <Button
          size="sm"
          className="h-8"
          disabled={!ready}
          onClick={() => void onGenerateListing()}
          title={
            ready
              ? "Move to listing generation"
              : "Grade every criterion and confirm Ready first"
          }
        >
          <FileOutput className="mr-1.5 h-3.5 w-3.5" />
          Generate listing
        </Button>
      }
    >
      <div className="space-y-2">
        {criteria.map((c, i) => (
          <div
            key={c.key}
            className="grid grid-cols-[11rem_11rem_1fr] items-center gap-2"
          >
            <span className="truncate text-sm">{c.label}</span>
            <SelectField
              value={c.grade}
              options={GRADE_OPTIONS}
              onChange={(v) =>
                onEdit({
                  criteria: criteria.map((row, j) =>
                    j === i ? { ...row, grade: v as GradeValue } : row,
                  ),
                })
              }
              className={cn(c.grade === "na" && "border-warning text-warning")}
            />
            <CommitField
              value={c.note ?? ""}
              placeholder="Note"
              onCommit={(v) =>
                onEdit({
                  criteria: criteria.map((row, j) =>
                    j === i ? { ...row, note: v } : row,
                  ),
                })
              }
            />
          </div>
        ))}
      </div>

      <CommitTextArea
        label="Overall note"
        value={grading.overallNote ?? ""}
        placeholder="Anything the listing writer must know…"
        onCommit={(v) => onEdit({ overallNote: v })}
        rows={2}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ready}
          disabled={!allGraded}
          onChange={(e) =>
            onEdit({ criteria, ready: e.target.checked })
          }
          className="h-4 w-4"
        />
        Everything is accurate and finalized — no ambiguity remains
        {!allGraded && (
          <span className="text-xs text-muted-foreground">
            (grade every criterion first)
          </span>
        )}
      </label>
    </PanelSection>
  );
}
