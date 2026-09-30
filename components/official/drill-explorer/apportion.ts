// components/official/drill-explorer/apportion.ts — ROWS THAT ADD UP TO THE TOTAL SHOWN
// (VERIFIER-32 F6, 2026-09-30).
//
// Money is stored in dollars and shown in whole credits (or cents). Rounding every row on its own
// let the rows under a total add up to 4–51 credits more than the total line printed beneath them.
// This rounds ONCE at the top — the total — and then gives every level its parent's rounded amount,
// split by the largest-remainder method (Hamilton), so each set of siblings plus its "everything
// else" row adds up exactly to the number printed above it. A pivot's cells split their row's
// amount the same way. Pure: the table's model (`drillRequests`, the groups) is the design system's.

import {
  drillRequestKey,
  drillRequests,
  type MatrxDrillAnswerRow,
  type MatrxDrillAnswers,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

/** Split integer `target` over `raws` (same unit, fractional) so the parts sum to it exactly. */
export function largestRemainder(target: number, raws: readonly number[]): number[] {
  const floors = raws.map((r) => Math.floor(Math.max(0, r)));
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = raws
    .map((r, i) => ({ i, frac: Math.max(0, r) - Math.floor(Math.max(0, r)) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  // Short (the usual case): the largest fractions round up. Over (a parent rounded down by its own
  // split): the smallest fractions of the non-zero parts give one back.
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) out[order[k]!.i]! += 1;
  const back = [...order].reverse();
  for (let k = 0; left < 0 && back.length > 0; k = (k + 1) % back.length) {
    const i = back[k]!.i;
    if (out[i]! > 0) {
      out[i]! -= 1;
      left++;
    }
  }
  return out;
}

function sameGroups(row: MatrxDrillAnswerRow, parent: MatrxDrillAnswerRow, keys: readonly string[]): boolean {
  return keys.every((k) => (row.groups[k] ?? null) === (parent.groups[k] ?? null));
}

/**
 * The answers with `measure` expressed in display units that add up (`toUnits` turns a stored value
 * into fractional display units, `fromUnits` turns a whole number of them back, so the table's own
 * formatter prints exactly that whole number). Other Measures are untouched.
 */
export function apportionAnswers(
  answers: MatrxDrillAnswers,
  question: MatrxDrillQuestion,
  measure: string,
  toUnits: (stored: number) => number,
  fromUnits: (units: number) => number,
): MatrxDrillAnswers {
  const units = new Map<string, number[]>(); // request key → whole units per row (same order)
  const out: Record<string, MatrxDrillAnswerRow[]> = {};
  const put = (key: string, rows: readonly MatrxDrillAnswerRow[], whole: number[]) => {
    units.set(key, whole);
    out[key] = rows.map((row, i) => ({ ...row, measures: { ...row.measures, [measure]: row.measures[measure] == null ? null : fromUnits(whole[i]!) } }));
  };
  for (const request of drillRequests(question)) {
    const rows = answers[request.key];
    if (!rows) continue;
    if (request.by.length === 0) {
      put(request.key, rows, rows.map((r) => Math.round(toUnits(Number(r.measures[measure] ?? 0)))));
      continue;
    }
    const across = question.across ?? null;
    const parentBy = across && request.by.at(-1) === across ? request.by.slice(0, -1) : request.by.slice(0, -1);
    const parentKey = drillRequestKey(parentBy);
    const parentRows = answers[parentKey];
    const parentUnits = units.get(parentKey);
    if (!parentRows || !parentUnits) {
      put(request.key, rows, rows.map((r) => Math.round(toUnits(Number(r.measures[measure] ?? 0)))));
      continue;
    }
    const whole = rows.map(() => 0);
    parentRows.forEach((parent, p) => {
      const kids = rows.map((r, i) => ({ r, i })).filter(({ r }) => sameGroups(r, parent, parentBy));
      const raw = kids.map(({ r }) => toUnits(Number(r.measures[measure] ?? 0)));
      // The rest a group limit left out is a sibling too, so the shown rows + "everything else" add up.
      const rest = Math.max(0, toUnits(Number(parent.measures[measure] ?? 0)) - raw.reduce((a, b) => a + b, 0));
      const split = largestRemainder(parentUnits[p]!, [...raw, rest]);
      kids.forEach(({ i }, k) => (whole[i] = split[k]!));
    });
    put(request.key, rows, whole);
  }
  for (const [key, rows] of Object.entries(answers)) if (!(key in out) && rows) out[key] = [...rows];
  return out;
}

/**
 * ONE ROUNDING RULE (VERIFY-DRILL-WAVE1 F5): a row's money Measures rounded to whole display units
 * exactly as `apportionAnswers` rounds the total — so a number the screen names twice (the header's
 * total and the coverage line's whole) reads the same both times, never once rounded and once
 * ceiled by the formatter.
 */
export function roundMoneyRow(
  row: MatrxDrillAnswerRow,
  keys: readonly string[],
  toUnits: (stored: number) => number,
  fromUnits: (units: number) => number,
): MatrxDrillAnswerRow {
  const measures = { ...row.measures };
  for (const key of keys) {
    const v = measures[key];
    if (v !== null && v !== undefined) measures[key] = fromUnits(Math.round(toUnits(v)));
  }
  return { ...row, measures };
}
