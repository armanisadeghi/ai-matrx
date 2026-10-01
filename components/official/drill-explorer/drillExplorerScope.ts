// components/official/drill-explorer/drillExplorerScope.ts — WHAT THE EXPLORER HANDS THE PAGE'S SURFACE
// (lane DRILL-FLIP-FIXES L4; VERIFY-DRILL-FINAL: the old Spend and CX usage screens fed their explorer
// state to the surface runtime, so an agent on the page read the question and its answer).
//
// Built at READ time from the screen's live state (never a stale copy): the question as the address
// holds it and in words, the window, the money unit, and the answer — its total and outermost groups by
// their names and Measure labels, money always in dollars (what the door counts). The contract is the
// manifest's (`features/surfaces/manifests/admin-ai-usage.manifest.ts`, createDrillExplorerSurfaceScope).

import {
  dimensionRefLabel,
  drillRequestKey,
  drillValueLabel,
  drillWindowLabel,
  type MatrxDrillAnswers,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { createDrillExplorerSurfaceScope } from "@/features/surfaces/manifests/admin-ai-usage.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** How many outermost groups the scope carries (the answer's first rows; the rest are its total). */
export const DRILL_SCOPE_ROWS = 50;

export function drillExplorerScope(input: {
  definitionKey: string;
  definitionLabel: string | null;
  openView: string | null;
  question: MatrxDrillQuestion;
  dimensions: readonly MatrxDrillDimension[];
  measures: readonly MatrxDrillMeasure[];
  answers: MatrxDrillAnswers;
  error: string | null;
  asOf: string | null;
  says: readonly string[];
  money: "points" | "usd";
  emptyLabel: string;
}): SurfaceScopePayload {
  const { question: q, dimensions, measures, answers } = input;
  const label = (key: string) => measures.find((m) => m.key === key)?.label ?? key;
  const windowLabel = drillWindowLabel(q.window ?? null);
  const filters = q.where.map((w) => `${dimensionRefLabel(dimensions, w.dim)}: ${drillValueLabel(dimensions, w.dim, w.value, input.emptyLabel)}`);
  const words = [
    q.show.map(label).join(", "),
    q.by.length > 0 ? `by ${q.by.map((ref) => dimensionRefLabel(dimensions, ref)).join(" › ")}` : "",
    q.across ? `across ${dimensionRefLabel(dimensions, q.across)}` : "",
    filters.length > 0 ? `where ${filters.join("; ")}` : "",
    windowLabel,
  ]
    .filter(Boolean)
    .join(" ");
  const totalRow = answers[drillRequestKey([])]?.[0] ?? null;
  const outer = q.by.length > 0 ? answers[drillRequestKey(q.by.slice(0, 1))] : undefined;
  const byLabel = (values: Record<string, number | null>) => Object.fromEntries(q.show.map((k) => [label(k), values[k] ?? null]));
  const state = input.error ? "failed" : totalRow ? "answered" : "reading";
  return createDrillExplorerSurfaceScope({
    definition_key: input.definitionKey,
    question: { by: q.by, across: q.across ?? null, show: q.show, where: q.where, window: q.window ?? null, sort: q.sort ?? null },
    question_words: words,
    window_label: windowLabel,
    money_unit: input.money,
    answer_state: state,
    ...(input.definitionLabel ? { definition_label: input.definitionLabel } : {}),
    ...(input.openView ? { open_view: input.openView } : {}),
    ...(input.error ? { answer_error: input.error } : {}),
    ...(input.asOf ? { counted_through: input.asOf } : {}),
    ...(totalRow ? { answer_total: byLabel(totalRow.measures) } : {}),
    ...(outer && q.by[0]
      ? {
          answer_rows: outer.slice(0, DRILL_SCOPE_ROWS).map((row) => ({
            [dimensionRefLabel(dimensions, q.by[0]!)]: drillValueLabel(dimensions, q.by[0]!, row.groups[q.by[0]!] ?? null, input.emptyLabel),
            ...byLabel(row.measures),
          })),
        }
      : {}),
    ...(input.says.length > 0 ? { answer_notes: [...input.says] } : {}),
  });
}
