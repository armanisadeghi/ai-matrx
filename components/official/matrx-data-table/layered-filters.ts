/**
 * Shared vocabulary for ordered, AND-combined table filters. The same rule
 * shape is URL-safe, can be evaluated by local tables, and can be handed to a
 * controlled table's server query without a surface inventing another query
 * builder.
 */

import { z } from "zod";
import type { ColumnFiltersState } from "./types";

export const LAYERED_FILTER_OPERATORS = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "ends_with",
  "word",
  "not_word",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
] as const;

export type LayeredFilterOperator = (typeof LAYERED_FILTER_OPERATORS)[number];

export interface LayeredFilterRule {
  id: string;
  field: string;
  operator: LayeredFilterOperator;
  value: string;
  valueTo?: string;
}

export type LayeredFilterField =
  | {
      id: string;
      label: string;
      kind: "text";
      operators?: LayeredFilterOperator[];
    }
  | {
      id: string;
      label: string;
      kind: "number";
      operators?: LayeredFilterOperator[];
      placeholder?: string;
    }
  | {
      id: string;
      label: string;
      kind: "select";
      operators?: LayeredFilterOperator[];
      options: Array<{ value: string; label: string }>;
    };

const layeredFilterRuleSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  operator: z.enum(LAYERED_FILTER_OPERATORS),
  value: z.string(),
  valueTo: z.string().optional(),
});

const layeredFilterRulesSchema = z.array(layeredFilterRuleSchema).max(20);

const TEXT_OPERATORS: LayeredFilterOperator[] = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "ends_with",
  "word",
  "not_word",
  "is_empty",
  "is_not_empty",
];

const NUMBER_OPERATORS: LayeredFilterOperator[] = [
  "equals",
  "not_equals",
  "greater_than",
  "greater_or_equal",
  "less_than",
  "less_or_equal",
  "between",
  "is_empty",
  "is_not_empty",
];

const SELECT_OPERATORS: LayeredFilterOperator[] = [
  "equals",
  "not_equals",
  "is_empty",
  "is_not_empty",
];

export const LAYERED_FILTER_OPERATOR_LABELS: Record<
  LayeredFilterOperator,
  string
> = {
  contains: "contains",
  not_contains: "doesn't contain",
  equals: "is",
  not_equals: "is not",
  starts_with: "starts with",
  ends_with: "ends with",
  word: "has the word",
  not_word: "doesn't have the word",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  greater_than: "is greater than",
  greater_or_equal: "is at least",
  less_than: "is less than",
  less_or_equal: "is at most",
  between: "is between",
};

export function operatorsForLayeredField(
  field: LayeredFilterField,
): LayeredFilterOperator[] {
  if (field.operators) return field.operators;
  if (field.kind === "number") return NUMBER_OPERATORS;
  if (field.kind === "select") return SELECT_OPERATORS;
  return TEXT_OPERATORS;
}

export function layeredFilterNeedsValue(
  operator: LayeredFilterOperator,
): boolean {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

export function isCompleteLayeredFilterRule(rule: LayeredFilterRule): boolean {
  if (!layeredFilterNeedsValue(rule.operator)) return true;
  if (rule.value.trim() === "") return false;
  return rule.operator !== "between" || Boolean(rule.valueTo?.trim());
}

export function completeLayeredFilterRules(
  rules: readonly LayeredFilterRule[] | undefined,
): LayeredFilterRule[] {
  return (rules ?? []).filter(isCompleteLayeredFilterRule);
}

export function isLayeredFilterOperator(
  value: string,
): value is LayeredFilterOperator {
  return LAYERED_FILTER_OPERATORS.some((operator) => operator === value);
}

/** Decode URL-owned rules without trusting a hand-edited link. */
export function decodeLayeredFilterRules(
  raw: string | null,
): LayeredFilterRule[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = layeredFilterRulesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** Stable compact URL/wire form; rule order is preserved. */
export function encodeLayeredFilterRules(
  rules: readonly LayeredFilterRule[] | undefined,
): string | null {
  return rules?.length ? JSON.stringify(rules) : null;
}

/**
 * Translate ordinary per-column controls into the same ordered rule language
 * used by the advanced builder. Controlled tables can send these rules to one
 * server evaluator instead of rebuilding numeric/text filter semantics.
 * Select filters are intentionally omitted because their multi-select control
 * is OR-combined and should stay in its native query parameter.
 */
export function columnFiltersToLayeredRules(
  filters: ColumnFiltersState,
  fieldIds: readonly string[],
): LayeredFilterRule[] {
  const rules: LayeredFilterRule[] = [];
  for (const field of fieldIds) {
    const filter = filters[field];
    if (!filter) continue;

    if (filter.kind === "text") {
      rules.push({
        id: `column-${field}`,
        field,
        operator:
          filter.mode === "empty"
            ? "is_empty"
            : filter.mode === "not_empty"
              ? "is_not_empty"
              : "contains",
        value: filter.value,
      });
      continue;
    }

    if (filter.kind === "number") {
      if (filter.min !== undefined && filter.max !== undefined) {
        rules.push({
          id: `column-${field}`,
          field,
          operator: "between",
          value: String(filter.min),
          valueTo: String(filter.max),
        });
      } else if (filter.min !== undefined) {
        rules.push({
          id: `column-${field}`,
          field,
          operator: "greater_or_equal",
          value: String(filter.min),
        });
      } else if (filter.max !== undefined) {
        rules.push({
          id: `column-${field}`,
          field,
          operator: "less_or_equal",
          value: String(filter.max),
        });
      }
      continue;
    }

    if (filter.kind === "boolean") {
      rules.push({
        id: `column-${field}`,
        field,
        operator: "equals",
        value: String(filter.value),
      });
    }
  }
  return rules;
}

function normalizedText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLocaleLowerCase();
}

function words(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Local-table evaluator. Controlled tables send the same rule shape server-side. */
export function layeredFilterMatchesValue(
  value: unknown,
  rule: LayeredFilterRule,
): boolean {
  const actual = normalizedText(value);
  const expected = rule.value.trim().toLocaleLowerCase();
  const expectedTo = rule.valueTo?.trim().toLocaleLowerCase() ?? "";

  switch (rule.operator) {
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "starts_with":
      return actual.startsWith(expected);
    case "ends_with":
      return actual.endsWith(expected);
    case "word":
      return words(actual).includes(expected);
    case "not_word":
      return !words(actual).includes(expected);
    case "is_empty":
      return actual === "";
    case "is_not_empty":
      return actual !== "";
    case "greater_than":
      return Number(actual) > Number(expected);
    case "greater_or_equal":
      return Number(actual) >= Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "less_or_equal":
      return Number(actual) <= Number(expected);
    case "between": {
      const numeric = Number(actual);
      return numeric >= Number(expected) && numeric <= Number(expectedTo);
    }
  }
}

export function layeredFilterRuleSummary(
  rule: LayeredFilterRule,
  fields: readonly LayeredFilterField[],
): string {
  const field = fields.find((candidate) => candidate.id === rule.field);
  const fieldLabel = field?.label ?? rule.field;
  const operator = LAYERED_FILTER_OPERATOR_LABELS[rule.operator];
  if (!layeredFilterNeedsValue(rule.operator))
    return `${fieldLabel} ${operator}`;
  const selectedLabel =
    field?.kind === "select"
      ? field.options.find((option) => option.value === rule.value)?.label
      : undefined;
  const value = selectedLabel ?? rule.value;
  return rule.operator === "between"
    ? `${fieldLabel} ${operator} ${value} and ${rule.valueTo ?? ""}`
    : `${fieldLabel} ${operator} ${value}`;
}
