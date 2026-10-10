"use client";

// components/official/drill-explorer/DrillSiblingFindings.tsx — A SIBLING DEFINITION'S FINDINGS IN THE
// SAME PANEL (lane DRILL-PRESETS-RETIRE; VERIFY-DRILL-LIVE F2; drillSiblings.ts).
//
// The usage page's own definition (`ai_usage`, by hour) holds one of the Spend page's seven "dig here"
// signals; the other six hold facts only one row per execution has (conversation, request, status,
// ten minutes), so they are declared on `ai_usage_executions`. This section answers a sibling's
// findings through the sibling's own door, in the explorer's lane and window, names its groups the
// way the explorer names its own (the door's labels, then the host's resolvers), and a row opens the
// sibling at that row — its address carries the sibling and the drilled question.
// Since lane DRILL-D1 its names are the explorer's ONE name book (drillNames.ts), never its own.

import { useEffect, useState } from "react";
import type { RecordsClient } from "@ai-matrx/records/core";
import { drillInto, drillValueLabel, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";
import { formatCount } from "@ai-matrx/kit/format";
import { usePointsRate } from "@/components/cost/pointsRate.client";

import { useDrillNameBookOr, useDrillNames, type DrillNameBook } from "./drillNames";
import { drillSiblingDimensions, drillSiblingMeasures, type DrillSiblingDefinition } from "./drillSiblings";
import type { DrillMoneyUnit } from "./measureFormat";
import { findingQuestion, findingsOf, type DrillNameResolver } from "./types";
import { doorWindow, drillRowOf, drillWindowKey } from "./useDrillExplorer";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const ROWS_SHOWN = 5;

type Row = { groups: Record<string, string | null>; value: number | null };
type Answer = { state: "reading" } | { state: "failed"; message: string } | { state: "answered"; rows: Row[]; more: number };

export function DrillSiblingFindings({
  client,
  lane,
  window,
  sibling,
  resolvers,
  book: hostBook,
  money,
  emptyLabel,
  open,
  onOpen,
}: {
  client: RecordsClient | null;
  lane: "mine" | "organization" | "platform";
  /** The explorer's window (address grammar). */
  window: string | null;
  sibling: DrillSiblingDefinition;
  resolvers: Record<string, DrillNameResolver> | undefined;
  /** The explorer's one name book; absent = one of this section's own over `resolvers`. */
  book?: DrillNameBook | undefined;
  money: DrillMoneyUnit;
  emptyLabel: string;
  /** The panel is open (answered only then, as the explorer's own findings are). */
  open: boolean;
  /** Open the sibling at this question. */
  onOpen: (question: MatrxDrillQuestion) => void;
}) {
  const findings = findingsOf(sibling.def);
  const rate = usePointsRate();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const book = useDrillNameBookOr(hostBook, resolvers);
  const names = useDrillNames(book);
  const key = `${sibling.token}|${window ?? ""}|${lane}`;

  useEffect(() => {
    if (!open || !client) return;
    let cancelled = false;
    setAnswers(Object.fromEntries(findings.map((f) => [f.key, { state: "reading" } as Answer])));
    for (const finding of findings) {
      const asked = findingQuestion(finding, { by: [], show: [], where: [], window });
      const measure = asked.sort?.key ?? asked.show[0];
      void client.drillAsk({ source: sibling.source, question: { ...finding.question, lane, ...doorWindow(asked, { key: drillWindowKey(sibling.def.dimensions) }) } }).then((got) => {
        if (cancelled) return;
        if (!got.ok) {
          setAnswers((h) => ({ ...h, [finding.key]: { state: "failed", message: got.error.message || "This finding could not be read." } }));
          return;
        }
        const rows = got.data!.rows;
        const groups = rows.filter((r) => r.kind === "group").map((r) => drillRowOf(r));
        setAnswers((h) => ({
          ...h,
          [finding.key]: {
            state: "answered",
            rows: groups.slice(0, ROWS_SHOWN).map((r) => ({ groups: r.groups, value: measure ? (r.measures[measure] ?? null) : null })),
            more: Math.max(0, groups.length - ROWS_SHOWN),
          },
        }));
        // the rows shown are named by the one book: the door's own words, then the host's names
        void book.readRows(rows.filter((r) => r.kind === "group").slice(0, ROWS_SHOWN));
      });
    }
    return () => {
      cancelled = true;
    };
    // the findings, source, lane and window are all in `key`; the book reads the latest resolvers
  }, [open, client, key, book]);

  const dimensions = drillSiblingDimensions(sibling.def, names, resolvers);
  const measures = drillSiblingMeasures(sibling.def, money, rate);
  const paths = (sibling.def.paths ?? []).map((p) => p.levels);

  return (
    <>
      {findings.map((finding) => {
        const answer = answers[finding.key] ?? { state: "reading" };
        const asked = findingQuestion(finding, { by: [], show: [], where: [], window });
        const measureKey = asked.sort?.key ?? asked.show[0];
        const measure = measures.find((m) => m.key === measureKey);
        return (
          <li key={`${sibling.token}:${finding.key}`} data-drill-explorer-finding={`${sibling.token}:${finding.key}`} className="px-3 py-2">
            <p className="type-title text-foreground">{finding.label}</p>
            {answer.state === "reading" ? (
              <div className="mt-1 h-4 w-40 animate-pulse rounded bg-muted" />
            ) : answer.state === "failed" ? (
              <p className="mt-1 type-secondary text-destructive">{answer.message}<ErrorAlchemyMenu error={answer.message} /></p>
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
                      onClick={() => onOpen(drillInto(asked, row.groups, dimensions, undefined, paths))}
                    >
                      <span className="min-w-0 flex-1 truncate">{asked.by.map((ref) => drillValueLabel(dimensions, ref, row.groups[ref] ?? null, emptyLabel)).join(" › ")}</span>
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
    </>
  );
}
