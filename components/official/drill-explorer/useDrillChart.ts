"use client";

// components/official/drill-explorer/useDrillChart.ts — THE CHART'S TWO ROUNDS THROUGH THE ONE DOOR
// (lane DRILL-ADOPT; program DRILL-FINISH decision 5; PROGRESS-DRILL-CHART "Host wiring").
//
// The door's Other is not broken down by period, so the stacked chart asks in two rounds, exactly as
// the package plans them (`drillChartQuestions`): round one the top N of the split over the WHOLE
// window (`series`) and each period's total (`periods`); round two each shown value per period
// (`drillChartCellsQuestion`, `cells`). Other per period = the period's total − the shown values, so
// the bars always add up to the total. Every ask carries the same lane, window and open view's
// filters as the answer table's, so the chart and the table never disagree.

import { drillFailureWords } from "./explorerWords";
import { useEffect, useState } from "react";
import type { DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import {
  drillChartCellsQuestion,
  drillChartQuestions,
  type MatrxDrillChartAnswers,
  type MatrxDrillChartRequest,
  type MatrxDrillChartRow,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { doorWindow, drillRowOf } from "./useDrillExplorer";
import type { DrillNameBook } from "./drillNames";
import type { DrillCarried } from "./questionParts";

export interface DrillChartState {
  answers: MatrxDrillChartAnswers;
  error: string | null;
}

const NONE: MatrxDrillChartAnswers = {};

export function useDrillChart(args: {
  client: RecordsClient | null;
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  /** The question the table draws (auto grain applied). */
  question: MatrxDrillQuestion;
  dimensions: readonly MatrxDrillDimension[];
  measures: readonly MatrxDrillMeasure[];
  measure: string | null;
  /** Measures a built-in view stacks instead of splitting one (L3). */
  stack?: readonly string[] | undefined;
  /** The time reference when the question groups by no time (the auto grain). */
  time: string | null;
  seriesLimit: number | undefined;
  carried: DrillCarried | null;
  windowAlign?: "hour" | undefined;
  countMeasure?: string | undefined;
  /** Changes when the data changed (a recount). */
  version?: number | undefined;
  /** The explorer's one name book (drillNames.ts): the series' ids are named there, as the answer's are. */
  book?: DrillNameBook | undefined;
  /** Nothing is asked while false (no definition yet, or the settings are still being read). */
  enabled: boolean;
}): DrillChartState {
  const { client, source, lane, question, dimensions, measures, measure, stack, time, seriesLimit, carried, windowAlign, countMeasure, version = 0, book, enabled } = args;
  const plan = enabled ? drillChartQuestions(question, seriesLimit, { dimensions, measures, measure, stack, time }) : null;
  const key = JSON.stringify({ first: plan?.first ?? null, refused: plan?.refused ?? null, carried, lane, source, version });
  const [held, setHeld] = useState<{ key: string; answers: MatrxDrillChartAnswers; error: string | null }>({ key: "", answers: NONE, error: null });

  useEffect(() => {
    if (!client || !plan || plan.refused || plan.first.length === 0) return;
    let cancelled = false;
    const ask = async (request: MatrxDrillChartRequest): Promise<{ ok: true; rows: MatrxDrillChartRow[] } | { ok: false; message: string }> => {
      const windowPart = doorWindow({ by: [], show: [], where: [], window: request.window }, windowAlign);
      if (windowPart.window && carried?.windowKey) windowPart.window = { ...windowPart.window, key: carried.windowKey };
      // THE VIEW'S THRESHOLDS PICK THE SPLIT'S SERIES (they are on groups — lane DRILL-FLIP-FIXES L1): asked on
      // the `series` request only, which also shows each Measure a threshold reads; the periods keep their
      // whole totals, so the groups a threshold leaves out are drawn in Other
      const thresholds = request.key === "series" ? (carried?.having ?? []) : [];
      const got = await client.drillAsk({
        source,
        question: {
          by: request.by,
          show: [...request.show, ...thresholds.map((h) => h.measure).filter((k) => !request.show.includes(k))],
          where: { ...(carried?.where ?? {}), ...request.where },
          lane,
          ...windowPart,
          ...(thresholds.length > 0 ? { having: thresholds } : {}),
          ...(request.sort ? { sort: request.sort } : {}),
          ...(request.limit !== null ? { limit: request.limit } : {}),
        },
      });
      if (!got.ok) return { ok: false, message: drillFailureWords(got.error.message, "The chart could not be counted.") };
      // a series the answer does not list (a period's own top N) is named by the same book
      void book?.readRows(got.data!.rows.filter((row) => row.kind === "group"));
      return { ok: true, rows: got.data!.rows.map((row) => drillRowOf(row, countMeasure)) };
    };
    void (async () => {
      const first = await Promise.all(plan.first.map(async (r) => ({ key: r.key, got: await ask(r) })));
      if (cancelled) return;
      const failed = first.find((f) => !f.got.ok);
      if (failed && !failed.got.ok) {
        setHeld({ key, answers: NONE, error: failed.got.message });
        return;
      }
      const answers: Record<string, MatrxDrillChartRow[]> = {};
      for (const f of first) if (f.got.ok) answers[f.key] = f.got.rows;
      const cells = drillChartCellsQuestion(plan, question, answers.series ?? []);
      if (cells) {
        const got = await ask(cells);
        if (cancelled) return;
        if (!got.ok) {
          setHeld({ key, answers: NONE, error: got.message });
          return;
        }
        answers.cells = got.rows;
      }
      setHeld({ key, answers, error: null });
    })();
    return () => {
      cancelled = true;
    };
    // the plan is keyed by `key` (it is rebuilt every render from the same question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  if (!plan) return { answers: NONE, error: null };
  // A refused plan is handed to the chart with no answers: the chart says the refusal in words.
  return held.key === key ? { answers: held.answers, error: held.error } : { answers: NONE, error: null };
}
