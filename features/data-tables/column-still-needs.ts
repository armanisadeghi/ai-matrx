/**
 * WHAT A NEW COLUMN STILL NEEDS BEFORE IT CAN BE ADDED — one sentence, or null (grids review 3).
 *
 * Adopted from the record grids' column panel (`@ai-matrx/records-ui` FieldEditor's `missing`): a
 * Relation with no table picked did nothing on Add Column, with no message (the silent no-op); a
 * Formula with no formula was accepted and made an empty column. The Sheet's Add Column dialog keeps
 * its own controls and takes this behaviour: the button waits, and this sentence sits beside it.
 */
import { parseFormula } from "@ai-matrx/design-system/formulas";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

export function whatTheColumnStillNeeds(args: {
  name: string;
  nameProblem: string | null;
  format: FieldFormatConfig;
  /** The tables a relation may point at; `null` while they are read, `undefined` when not asked. */
  relationTargets?: readonly unknown[] | null;
  defaultProblem: string | null;
  defaultAsked: boolean;
}): string | null {
  const { format } = args;
  const options = (format.options ?? {}) as { relation_target?: unknown; formula?: { expression?: string } };
  if (args.name.trim() === "") return "Name the column.";
  if (args.nameProblem) return args.nameProblem;
  if (format.id === "relation" && !options.relation_target) {
    return args.relationTargets && args.relationTargets.length === 0
      ? "There is no other table in this organization to point at yet. Make that table first."
      : "Pick the table this column points at, under “Points at the records of”.";
  }
  if (format.id === "formula") {
    const expression = options.formula?.expression ?? "";
    if (expression.trim() === "") return "Write the formula this column works out.";
    if (!parseFormula(expression).ok) return "The formula has a mistake — it is marked above.";
    return null;
  }
  if (args.defaultProblem) return args.defaultProblem;
  if (args.defaultAsked) return "Answer the question under Default Value first.";
  return null;
}
