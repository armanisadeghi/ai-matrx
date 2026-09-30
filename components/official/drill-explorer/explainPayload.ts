// components/official/drill-explorer/explainPayload.ts — "EXPLAIN THIS": THE QUESTION ON SCREEN AND
// ITS ANSWER, AS ONE TYPED PAYLOAD (lane DRILL-EXPLAIN; program DRILL-FINISH decisions 10 and 22).
//
// The explorer never talks to a model and never picks an agent (law: agents never author agents).
// It hands this payload to the platform's one Alchemy session (`openAlchemySession`, the same
// preparation workspace every Alchemy menu opens), where the PERSON chooses "Open in a new chat" /
// "Open an assistant window" / tools, picks the agent and writes the question. The payload rides as
// ATTACHED CONTENT (a chat resource), never as user_input.
//
// No registered content_ir kind fits a drill question + answer (searched 2026-09-30: the nearest,
// `aggregate_result`, has no question, window, trail or Other and forbids extra fields), so this is
// the Alchemy content item's documented structured form: a `json` Payload plus its AI envelope
// (`EnvelopeMeta`: kind, location, description, summary, attributes, context). The envelope `kind`
// "drill-answer" is Alchemy's source label, not a content_ir `__kind`.
//
// "As shown": every group is the table's own tree (`buildDrillTree`: the same sort, the same levels,
// the same "Other" rows), every value is printed with the screen's own formatter and unit, and the
// raw number rides beside it so a model can do arithmetic without re-parsing "1.2K credits".

import {
  buildDrillTree,
  dimensionRefLabel,
  drillCrumbs,
  drillDelta,
  drillShare,
  drillValueLabel,
  drillWindowLabel,
  pivotCell,
  pivotColumns,
  type MatrxDrillAnswerRow,
  type MatrxDrillAnswers,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillNode,
  type MatrxDrillOther,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import type { EnvelopeMeta } from "@ai-matrx/design-system/content-transfer";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The envelope's source label for a drill question + answer (Alchemy's `kind`, not a content_ir kind). */
export const DRILL_EXPLAIN_KIND = "drill-answer";

export interface DrillExplainInput {
  /** The screen's name ("Usage"). */
  title: string;
  /** Where it lives, in words ("Administration › Usage"). */
  location: string;
  /** The definition's key (`ai_usage`). */
  definitionKey: string | null;
  /** The trail's root words ("All usage"). */
  rootLabel: string;
  /** The Dimensions and Measures exactly as the screen built them (labels, `labelFor`, `format`). */
  dimensions: readonly MatrxDrillDimension[];
  measures: readonly MatrxDrillMeasure[];
  /** Each Measure's stored unit (`usd`, `tokens`, …) by key, from the definition. */
  measureUnits: Readonly<Record<string, string | undefined>>;
  /** The question the table draws (auto grain applied). */
  question: MatrxDrillQuestion;
  /** The answers the table draws (money already apportioned to the shown total). */
  answers: MatrxDrillAnswers;
  /** The window without the trail, for the coverage line. */
  whole: MatrxDrillAnswerRow | null;
  /** The headline Measure's key. */
  headlineKey: string | null;
  /** How money is shown right now: "credits" or "dollars". */
  moneyUnit: "points" | "credits" | "dollars";
  /** The window as moments (null = all time). */
  range: { from: string; to: string } | null;
  /** The door's "counted through", or the host's own. */
  asOf: string | null;
  /** The answer's own sentences (the door's `says`). */
  says: readonly string[];
  /**
   * Conditions the question carries beyond the address, in words (an open Saved view's own filters,
   * group limit or thresholds). Absent = none.
   */
  conditions?: readonly string[];
  /** The address that reopens this exact question. */
  address: string | null;
  rowNoun: string;
  emptyLabel: string;
}

export interface DrillExplainPayload {
  label: string;
  value: { [key: string]: Json };
  envelope: EnvelopeMeta;
}

const COMPARE_WORDS: Record<string, string> = {
  previous_period: "the previous period of the same length",
  same_period_last_year: "the same period last year",
};

function shownValue(measure: MatrxDrillMeasure, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return measure.format ? measure.format(value) : value.toLocaleString();
}

/** One row's Measures: `{ "<label>": { shown, value[, before, change_pct][, share_pct] } }`. */
function measuresOf(
  row: Pick<MatrxDrillAnswerRow, "measures"> & Partial<Pick<MatrxDrillAnswerRow, "prior_measures">>,
  input: DrillExplainInput,
  parent: Pick<MatrxDrillAnswerRow, "measures"> | null,
): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  for (const key of input.question.show) {
    const m = input.measures.find((x) => x.key === key);
    if (!m) continue;
    const value = row.measures[key] ?? null;
    const cell: { [key: string]: Json } = { shown: shownValue(m, value), value };
    if (input.question.compare) {
      const before = row.prior_measures?.[key] ?? null;
      const delta = drillDelta(value, before);
      cell.before = before;
      cell.before_shown = shownValue(m, before);
      cell.change_pct = delta.pct === null ? null : Math.round(delta.pct * 1000) / 10;
    }
    if (input.question.share && parent && m.additive) {
      const share = drillShare(value, parent.measures[key]);
      cell.share_pct = share === null ? null : Math.round(share * 1000) / 10;
    }
    out[m.label] = cell;
  }
  return out;
}

function otherRow(other: MatrxDrillOther, input: DrillExplainInput): { [key: string]: Json } {
  return {
    group: "Other",
    note: "Everything the group limit left out, so the rows add up to the total.",
    [input.rowNoun === "record" ? "records" : `${input.rowNoun}s`]: other.row_count,
    measures: measuresOf({ measures: other.measures }, input, null),
  };
}

function groupRow(
  node: MatrxDrillNode,
  input: DrillExplainInput,
  parent: MatrxDrillAnswerRow | null,
  columns: ReturnType<typeof pivotColumns>,
): { [key: string]: Json } {
  const ref = input.question.by[node.level]!;
  const raw = node.groups[ref] ?? null;
  const row: { [key: string]: Json } = {
    [dimensionRefLabel(input.dimensions, ref)]: drillValueLabel(input.dimensions, ref, raw, input.emptyLabel),
  };
  const label = drillValueLabel(input.dimensions, ref, raw, input.emptyLabel);
  if (raw !== null && raw !== label) row.value = raw;
  row[input.rowNoun === "record" ? "records" : `${input.rowNoun}s`] = node.row.row_count;
  row.measures = measuresOf(node.row, input, parent);
  if (columns && input.question.across) {
    const across: { [key: string]: Json } = {};
    for (const column of columns) {
      const cells: { [key: string]: Json } = {};
      for (const key of input.question.show) {
        const m = input.measures.find((x) => x.key === key);
        if (!m) continue;
        const v = pivotCell(input.question, input.answers, node, column, columns, m);
        cells[m.label] = { shown: shownValue(m, v), value: v };
      }
      across[column.label] = cells;
    }
    row.across = across;
  }
  if (node.children.length > 0 || node.other) {
    row.groups = [
      ...node.children.map((child) => groupRow(child, input, node.row, columns)),
      ...(node.other ? [otherRow(node.other, input)] : []),
    ];
  }
  return row;
}

/** The question in one plain sentence ("Cost (credits) by Provider, for Person admin@…, last 30 days"). */
export function drillQuestionSentence(input: DrillExplainInput): string {
  const q = input.question;
  const shown = q.show.map((key) => input.measures.find((m) => m.key === key)?.label ?? key);
  const by = q.by.map((ref) => dimensionRefLabel(input.dimensions, ref));
  const trail = q.where.map((w) => `${dimensionRefLabel(input.dimensions, w.dim)} ${drillValueLabel(input.dimensions, w.dim, w.value, input.emptyLabel)}`);
  const parts = [
    `${shown.join(", ") || "Totals"}${by.length ? ` by ${by.join(", then ")}` : ""}${q.across ? `, across ${dimensionRefLabel(input.dimensions, q.across)}` : ""}`,
    trail.length ? `for ${trail.join(", ")}` : `for ${input.rootLabel.toLowerCase()}`,
    drillWindowLabel(q.window ?? null).toLowerCase(),
    ...(q.compare ? [`compared with ${COMPARE_WORDS[q.compare] ?? q.compare}`] : []),
  ];
  return `${input.title}: ${parts.join(", ")}.`;
}

/**
 * THE PAYLOAD, or null while the answer is not on screen yet (a control is absent or honest: the
 * explorer shows "Explain this" only when there is an answer to hand over).
 */
export function drillExplainPayload(input: DrillExplainInput): DrillExplainPayload | null {
  const q = input.question;
  const tree = buildDrillTree(q, input.answers, input.measures);
  if (!tree || !tree.total) return null;
  const columns = q.across ? pivotColumns(q, input.answers, input.dimensions, input.measures) : null;
  const headline = input.headlineKey ? input.measures.find((m) => m.key === input.headlineKey) ?? null : null;
  const crumbs = drillCrumbs(q, input.dimensions, input.rootLabel, input.emptyLabel).filter((c) => c.index >= 0);
  const sentence = drillQuestionSentence(input);

  const coverage =
    q.where.length > 0 && headline && input.whole?.measures[headline.key] != null && tree.total.measures[headline.key] != null
      ? {
          measure: headline.label,
          slice: shownValue(headline, tree.total.measures[headline.key]),
          whole: shownValue(headline, input.whole.measures[headline.key]),
          share_pct:
            input.whole.measures[headline.key]! > 0
              ? Math.round((tree.total.measures[headline.key]! / input.whole.measures[headline.key]!) * 1000) / 10
              : null,
        }
      : null;

  const measureList: Json[] = q.show.map((key) => {
    const m = input.measures.find((x) => x.key === key);
    const unit = input.measureUnits[key];
    return {
      key,
      label: m?.label ?? key,
      unit: unit === "usd" ? `${input.moneyUnit} (stored in US dollars; "value" is dollars, "shown" is ${input.moneyUnit})` : unit ?? "count",
      adds_up: m?.additive ?? true,
    };
  });

  const value: { [key: string]: Json } = {
    screen: input.title,
    ...(input.definitionKey ? { definition: input.definitionKey } : {}),
    question: {
      sentence,
      trail: crumbs.map((c) => ({ dimension: c.dimLabel ?? "", value: c.valueLabel ?? c.label })),
      group_by: q.by.map((ref) => dimensionRefLabel(input.dimensions, ref)),
      across: q.across ? dimensionRefLabel(input.dimensions, q.across) : null,
      window: { label: drillWindowLabel(q.window ?? null), from: input.range?.from ?? null, to: input.range?.to ?? null },
      measures: measureList,
      compare: q.compare ? COMPARE_WORDS[q.compare] ?? q.compare : null,
      ...(input.conditions?.length ? { conditions: [...input.conditions] } : {}),
      sort: q.sort
        ? {
            by: q.sort.key === "label" ? "name" : q.sort.key.startsWith("delta:") ? `change in ${input.measures.find((m) => m.key === q.sort!.key.slice(6))?.label ?? q.sort.key}` : input.measures.find((m) => m.key === q.sort!.key)?.label ?? q.sort.key,
            direction: q.sort.direction === "asc" ? "smallest first" : "largest first",
          }
        : null,
    },
    answer: {
      counted_through: input.asOf,
      money_shown_in: input.moneyUnit,
      total: {
        [input.rowNoun === "record" ? "records" : `${input.rowNoun}s`]: tree.total.row_count,
        measures: measuresOf(tree.total, input, null),
      },
      coverage,
      groups: [
        ...tree.nodes.map((node) => groupRow(node, input, tree.total, columns)),
        ...(tree.other ? [otherRow(tree.other, input)] : []),
      ],
      notes: [...input.says],
    },
    ...(input.address ? { address: input.address } : {}),
  };

  const totalLine = headline ? ` Total ${headline.label}: ${shownValue(headline, tree.total.measures[headline.key])}.` : "";
  const envelope: EnvelopeMeta = {
    kind: DRILL_EXPLAIN_KIND,
    location: `AI Matrx — ${input.location}`,
    description: `A question asked of ${input.title} and its answer exactly as the screen shows it: the drill trail, the grouping, the window, the Measures, the comparison, every group with its "Other" rest, the total, the coverage and when it was counted.`,
    summary: `${sentence}${totalLine}`,
    attributes: {
      definition: input.definitionKey,
      window: drillWindowLabel(q.window ?? null),
      groups: tree.nodes.length,
      money_shown_in: input.moneyUnit,
      counted_through: input.asOf,
    },
    ...(input.address ? { context: { address: input.address } } : {}),
  };

  return { label: `${input.title} — ${sentence.slice(input.title.length + 2).replace(/\.$/, "")}`, value, envelope };
}
