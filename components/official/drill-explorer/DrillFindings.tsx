"use client";

// components/official/drill-explorer/DrillFindings.tsx — "DIG HERE", DECLARED (lane DRILL-EXPLORER;
// program DRILL-FINISH decisions 7 and 13).
//
// A finding is a question the definition file declares (`findings: [{key, label, question}]`, its
// thresholds a `having` on Measures whose lines are knobs). Each is answered by the same door,
// `platform.drill_ask`, in the explorer's lane and window; a finding with nothing says "none"; a
// finding's row DRILLS — it opens the explorer on that finding's grouping narrowed to the row, the
// same answer one click away. Rendered only when describe returns findings; the control lives in
// the explorer's existing toolbar row.

import { useEffect, useState } from "react";
import { SearchCheck } from "lucide-react";
import type { DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import {
  drillInto,
  drillValueLabel,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { doorWindow, drillRowOf } from "./useDrillExplorer";
import { findingQuestion, type DrillFinding } from "./types";

/** Rows a finding shows before "and N more" (the finding's own drill shows the rest). */
const ROWS_SHOWN = 5;

type FindingAnswer =
  | { state: "reading" }
  | { state: "failed"; message: string }
  | { state: "answered"; rows: Array<{ groups: Record<string, string | null>; value: number | null; rowCount: number }>; more: number };


export function DrillFindings({
  client,
  source,
  lane,
  findings,
  question,
  dimensions,
  measures,
  paths,
  emptyLabel,
  onOpen,
}: {
  client: RecordsClient | null;
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  findings: readonly DrillFinding[];
  question: MatrxDrillQuestion;
  dimensions: readonly MatrxDrillDimension[];
  measures: readonly MatrxDrillMeasure[];
  paths: readonly (readonly string[])[];
  emptyLabel: string;
  onOpen: (question: MatrxDrillQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, FindingAnswer>>({});
  const windowKey = question.window ?? "";
  const findingsKey = JSON.stringify(findings);
  const sourceKey = JSON.stringify(source);

  // Answered when the panel opens (and again when the window moves while it is open).
  useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    const declared = JSON.parse(findingsKey) as DrillFinding[];
    setAnswers(Object.fromEntries(declared.map((f) => [f.key, { state: "reading" } as FindingAnswer])));
    for (const finding of declared) {
      const asked = findingQuestion(finding, { by: [], show: [], where: [], window: windowKey || null });
      const measure = asked.sort?.key ?? asked.show[0];
      void client
        .drillAsk({
          source: JSON.parse(sourceKey) as DrillSource,
          question: { ...finding.question, lane, ...doorWindow(asked) },
        })
        .then((got) => {
          if (cancelled) return;
          let answer: FindingAnswer;
          if (!got.ok) answer = { state: "failed", message: got.error.message || "This finding could not be read." };
          else {
            const groups = got.data!.rows.filter((r) => r.kind === "group").map(drillRowOf);
            answer = {
              state: "answered",
              rows: groups.slice(0, ROWS_SHOWN).map((r) => ({ groups: r.groups, value: measure ? (r.measures[measure] ?? null) : null, rowCount: r.row_count })),
              more: Math.max(0, groups.length - ROWS_SHOWN),
            };
          }
          setAnswers((held) => ({ ...held, [finding.key]: answer }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, client, findingsKey, sourceKey, lane, windowKey]);

  const labelOf = (groups: Record<string, string | null>, by: readonly string[]) =>
    by.map((ref) => drillValueLabel(dimensions, ref, groups[ref] ?? null, emptyLabel)).join(" › ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="gap-1" data-drill-explorer-findings>
          <SearchCheck className="h-3 w-3" /> Findings ({findings.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <ul className="max-h-[70vh] divide-y divide-border overflow-auto text-sm">
          {findings.map((finding) => {
            const answer = answers[finding.key] ?? { state: "reading" };
            const asked = findingQuestion(finding, question);
            const measureKey = asked.sort?.key ?? asked.show[0];
            const measure = measures.find((m) => m.key === measureKey);
            return (
              <li key={finding.key} data-drill-explorer-finding={finding.key} className="px-3 py-2">
                <p className="text-sm font-medium text-foreground">{finding.label}</p>
                {answer.state === "reading" ? (
                  <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
                ) : answer.state === "failed" ? (
                  <p className="mt-1 text-xs text-destructive">{answer.message}</p>
                ) : answer.rows.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground" data-drill-explorer-finding-none>
                    none
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {answer.rows.map((row) => (
                      <li key={JSON.stringify(row.groups)}>
                        <button
                          type="button"
                          data-drill-explorer-finding-row
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setOpen(false);
                            onOpen(drillInto(asked, row.groups, dimensions, undefined, paths));
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{labelOf(row.groups, asked.by)}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {row.value === null ? "—" : measure?.format ? measure.format(row.value) : row.value.toLocaleString()}
                          </span>
                        </button>
                      </li>
                    ))}
                    {answer.more > 0 ? <li className="px-1 text-[11px] text-muted-foreground">{`and ${answer.more.toLocaleString()} more`}</li> : null}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
