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
//
// A FINDING PAST THE GROUP CAP SAYS SO (lane DRILL-LIVE-FIXES, VERIFY-DRILL-LIVE F5): the door lists at
// most `drill.groups_per_level` groups (100) and carries the true count on every row
// (`distinct_groups`: 120 hours met the spike rule, 2026-09-30). The finding's badge is that true
// count; "and N more" counts from it; the tooltip says how many the list holds. Never a silent cut.
//
// A FINDING ROW IS NAMED BY THE EXPLORER'S ONE NAME BOOK (lane DRILL-D1, VERIFY-DRILL-FINAL D1): the
// rows shown hand the book their door rows — the door's labels are kept, the host's resolver is asked
// for exactly the ids still unnamed. Before, a request or person row read "Reading the name…" forever.

import { useEffect, useState, type ReactNode } from "react";
import { SearchCheck } from "lucide-react";
import type { DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import {
  drillInto,
  drillValueLabel,
  parseDimensionRef,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { doorWindow, drillRowOf, drillWindowKey } from "./useDrillExplorer";
import { findingQuestion, type DrillFinding } from "./types";
import { formatCount } from "@ai-matrx/kit/format";
import { InfoHint } from "@/components/official/InfoHint";

import { findingCount } from "./explorerWords";
import { useDrillNameBookOr, useDrillNames, type DrillNameBook } from "./drillNames";

/** Rows a finding shows before "and N more" (the finding's own drill shows the rest). */
const ROWS_SHOWN = 5;

type FindingAnswer =
  | { state: "reading" }
  | { state: "failed"; message: string }
  | {
      state: "answered";
      rows: Array<{ groups: Record<string, string | null>; value: number | null; rowCount: number }>;
      /** Groups that meet the rule — the door's true count, past its cap. */
      count: number;
      /** Groups the door listed (its cap), when fewer than `count`. */
      listed: number | null;
      more: number;
    };


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
  label,
  sections,
  book: hostBook,
}: {
  /** The explorer's one name book (drillNames.ts); absent = the door's labels on these rows only. */
  book?: DrillNameBook | undefined;
  /** The heading over this definition's findings when sibling sections follow ("Usage"). */
  label?: string | undefined;
  /** Sibling definitions' findings in the same panel (DrillSiblingFindings), each under its heading. */
  sections?: ReadonlyArray<{ label: string; count: number; render: (open: boolean, close: () => void) => ReactNode }> | undefined;
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
  const book = useDrillNameBookOr(hostBook, undefined);
  const names = useDrillNames(book);
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
          question: { ...finding.question, lane, ...doorWindow(asked, { key: drillWindowKey(dimensions) }) },
        })
        .then((got) => {
          if (cancelled) return;
          let answer: FindingAnswer;
          if (!got.ok) answer = { state: "failed", message: got.error.message || "This finding could not be read." };
          else {
            const raw = got.data!.rows;
            const groups = raw.filter((r) => r.kind === "group").map((row) => drillRowOf(row));
            // the rows on screen are named: the door's labels, then the host's names for the rest
            void book.readRows(raw.filter((r) => r.kind === "group").slice(0, ROWS_SHOWN));
            const distinct = raw.find((r) => typeof r.distinct_groups === "number")?.distinct_groups ?? null;
            const { count, capped } = findingCount(groups.length, distinct);
            answer = {
              state: "answered",
              rows: groups.slice(0, ROWS_SHOWN).map((r) => ({ groups: r.groups, value: measure ? (r.measures[measure] ?? null) : null, rowCount: r.row_count })),
              count,
              listed: capped ? groups.length : null,
              more: Math.max(0, count - Math.min(ROWS_SHOWN, groups.length)),
            };
          }
          setAnswers((held) => ({ ...held, [finding.key]: answer }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, client, findingsKey, sourceKey, lane, windowKey, book]);

  const labelOf = (groups: Record<string, string | null>, by: readonly string[]) =>
    by
      .map((ref) => {
        const value = groups[ref] ?? null;
        return (value ? names[parseDimensionRef(ref).key]?.[value] : undefined) ?? drillValueLabel(dimensions, ref, value, emptyLabel);
      })
      .join(" › ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button icon={<SearchCheck />} type="button" variant="quiet" data-drill-explorer-findings> Findings ({findings.length + (sections ?? []).reduce((n, x) => n + x.count, 0)})
        </Button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */ align="end" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <ul className="max-h-[70vh] divide-y divide-border overflow-auto type-body">
          {sections?.length && findings.length > 0 ? <li className="bg-muted/40 px-3 py-1 type-meta font-medium text-muted-foreground">{label ?? "Findings"}</li> : null}
          {findings.map((finding) => {
            const answer = answers[finding.key] ?? { state: "reading" };
            const asked = findingQuestion(finding, question);
            const measureKey = asked.sort?.key ?? asked.show[0];
            const measure = measures.find((m) => m.key === measureKey);
            return (
              <li key={finding.key} data-drill-explorer-finding={finding.key} className="px-3 py-2">
                <p className="flex items-center gap-1.5 type-title text-foreground">
                  <span className="min-w-0 truncate">{finding.label}</span>
                  {answer.state === "answered" && answer.count > 0 ? (
                    <span data-drill-explorer-finding-count className="rounded bg-muted px-1.5 type-meta font-medium tabular-nums text-muted-foreground">
                      {formatCount(answer.count)}
                    </span>
                  ) : null}
                  {answer.state === "answered" && answer.listed !== null ? (
                    <InfoHint text={`${formatCount(answer.count)} groups meet the rule; the list holds the top ${formatCount(answer.listed)}.`} label="Past the group cap" />
                  ) : null}
                </p>
                {answer.state === "reading" ? (
                  <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
                ) : answer.state === "failed" ? (
                  <p className="mt-1 type-secondary text-destructive">{answer.message}</p>
                ) : answer.rows.length === 0 ? (
                  <p className="mt-1 type-secondary text-muted-foreground" data-drill-explorer-finding-none>
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
                            {row.value === null ? "—" : measure?.format ? measure.format(row.value) : formatCount(row.value)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {answer.more > 0 ? <li className="px-1 type-meta text-muted-foreground">{`and ${answer.more.toLocaleString()} more`}</li> : null}
                  </ul>
                )}
              </li>
            );
          })}
          {(sections ?? []).map((section) => (
            <li key={section.label} className="contents">
              <ul className="divide-y divide-border">
                <li className="bg-muted/40 px-3 py-1 type-meta font-medium text-muted-foreground">{section.label}</li>
                {section.render(open, () => setOpen(false))}
              </ul>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
