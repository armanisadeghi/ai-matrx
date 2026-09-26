/**
 * THE CSV IMPORT WIZARD ASKS THE COLUMN'S RULES BEFORE IT WRITES.
 *
 * 🚨 WHY THIS FILE EXISTS (lane REFUSAL-SWEEP item 2a, 2026-09-23).
 *
 * Lane VALIDATION-REFUSAL's census (row 10) named this and did not build it:
 * *"the wizard never asks the column's rules at all."* A dispatcher pasted a
 * work-order backlog into an existing board, the wizard matched their headers to
 * the board's columns, they pressed the import button, and the STORE refused the
 * rows one at a time on the other side of the write — after the round trip, with
 * the file gone and nothing on screen naming the column that did it.
 *
 * So the same question every other surface now asks — does this value pass the
 * column's own rules? — is asked HERE, on the mapped preview rows, before
 * anything is sent. It is asked with the SAME judge (`validateCellValue`) and
 * answered with the SAME primitive (`columnRuleRefusal` → `<FieldRuleRefusal>`):
 * one validator, one refusal shape, one notice, for the whole platform.
 *
 * WHY THE ANSWER IS PER COLUMN AND NOT PER CELL. A grid paste refuses a handful
 * of cells a person can look at. An import is five hundred rows: five hundred
 * notices is the same as none. A column is the unit a person can act on — they
 * fix the mapping, they drop the column, or they take the rows that pass — so
 * the verdict names the column, what the rule wants, and HOW MANY of the rows
 * they can see fail it.
 *
 * WHY AN UNREADABLE RULE SET IS ITS OWN VERDICT. `parseValidationRules` is
 * deliberately tolerant: it drops anything it cannot understand and returns `{}`
 * so a column with a garbled rule stays editable. That is right for an editor
 * and WRONG for a gate — `{}` and "this column carries rules nobody here could
 * read" would otherwise both mean "import it, nothing to check". A column whose
 * stored rules say something we could not parse gets a verdict of its own,
 * saying so, rather than being waved through as unconstrained.
 */

import { columnRuleRefusal, type ColumnRuleRefusal } from "./validation-refusal";
import {
  hasValidationRules,
  parseValidationRules,
  validateCellValue,
  type ValidationRules,
} from "./validation";
import { parseFieldInput, resolveFieldFormat } from "@ai-matrx/design-system/field-formats";

/** The destination column, exactly as the table config row carries it. */
export interface ImportTargetField {
  field_name: string;
  display_name: string;
  data_type: string;
  metadata?: unknown;
  validation_rules?: unknown;
}

/** One mapped column: where the values come from, and which column they land in. */
export interface ImportColumnMapping {
  /** The header in the person's file. */
  sourceHeader: string;
  field: ImportTargetField;
}

export interface ImportColumnVerdict {
  fieldName: string;
  fieldDisplayName: string;
  /** The header in the person's file that feeds this column — they mapped it, they can unmap it. */
  sourceHeader: string;
  /** The one refusal, in the platform's one shape. */
  refusal: ColumnRuleRefusal;
  /** How many of the rows checked fail this column. */
  failingRowCount: number;
  /** How many rows were checked at all — the honest denominator. */
  checkedRowCount: number;
  /**
   * True when the column stores something under `validation_rules` that the rule
   * reader could not turn into a single rule. Nothing was checked; the screen
   * says so rather than importing as if the column were unconstrained.
   */
  rulesUnreadable: boolean;
}

export interface ImportRuleCheck {
  /** One per refused column, in the order the columns were mapped. */
  verdicts: ImportColumnVerdict[];
  /** Indexes into `rows` that break at least one column's rules. */
  failingRowIndexes: number[];
  /** Rows that pass every mapped column — what an import would write if they proceed. */
  passingRowCount: number;
  /** Rows actually judged. */
  checkedRowCount: number;
}

/** What to do now, on a wizard that holds a file and a mapping rather than an editor. */
const IMPORT_REMEDY =
  "Fix the column this is mapped to, leave the column out, or import only the rows that pass.";

/**
 * True when the column carries SOMETHING under `validation_rules` that the rule
 * reader could not make a rule out of. A column that stores `{}`, `null`, or
 * nothing at all is simply unconstrained and is not this.
 */
export function validationRulesAreUnreadable(
  raw: unknown,
  parsed: ValidationRules,
): boolean {
  if (hasValidationRules(parsed)) return false;
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "" || text === "{}" || text === "null") return false;
    return true;
  }
  if (typeof raw !== "object") return true;
  if (Array.isArray(raw)) return raw.length > 0;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

/**
 * Judge every mapped value in the rows the person can see, column by column.
 *
 * `unique` is not judged here and that is deliberate — the wizard has not read
 * the board's existing rows, and a uniqueness claim made without them would be a
 * guess dressed as a refusal. The store still enforces it; what this removes is
 * the SILENT round trip, not the store's authority.
 */
export function checkImportAgainstColumnRules(args: {
  rows: Record<string, unknown>[];
  columns: ImportColumnMapping[];
}): ImportRuleCheck {
  const rows = args.rows ?? [];
  const verdicts: ImportColumnVerdict[] = [];
  const failing = new Set<number>();

  for (const { sourceHeader, field } of args.columns) {
    const rules = parseValidationRules(field.validation_rules);
    const unreadable = validationRulesAreUnreadable(field.validation_rules, rules);

    if (unreadable) {
      // NOTHING WAS CHECKED AND THE SCREEN SAYS SO. This is the one verdict that
      // does not mark any row as failing: we do not know which rows would fail,
      // and inventing a set would be worse than naming our own blindness.
      verdicts.push({
        fieldName: field.field_name,
        fieldDisplayName: field.display_name,
        sourceHeader,
        refusal: columnRuleRefusal({
          fieldDisplayName: field.display_name,
          reason:
            "This column carries rules this screen could not read, so none of these values have been checked against them",
          rules: null,
          remedy: IMPORT_REMEDY,
        }),
        failingRowCount: 0,
        checkedRowCount: 0,
        rulesUnreadable: true,
      });
      continue;
    }

    if (!hasValidationRules(rules)) continue;

    const format = resolveFieldFormat(field.data_type, field.metadata);
    let firstReason = "";
    let failingRowCount = 0;

    rows.forEach((row, index) => {
      const raw = row[sourceHeader];
      // Coerced the way every other write into this column is coerced, so the
      // wizard judges the value the store would actually receive rather than the
      // characters in the file.
      const value = parseFieldInput(
        raw === null || raw === undefined ? "" : String(raw),
        format,
        field.data_type,
      );
      const verdict = validateCellValue({
        rules,
        dataType: field.data_type,
        format,
        value,
      });
      if (verdict.ok) return;
      failingRowCount += 1;
      failing.add(index);
      if (firstReason === "") firstReason = verdict.reason;
    });

    if (failingRowCount === 0) continue;

    verdicts.push({
      fieldName: field.field_name,
      fieldDisplayName: field.display_name,
      sourceHeader,
      refusal: columnRuleRefusal({
        fieldDisplayName: field.display_name,
        reason: firstReason,
        rules,
        remedy: IMPORT_REMEDY,
      }),
      failingRowCount,
      checkedRowCount: rows.length,
      rulesUnreadable: false,
    });
  }

  return {
    verdicts,
    failingRowIndexes: Array.from(failing).sort((a, b) => a - b),
    passingRowCount: rows.length - failing.size,
    checkedRowCount: rows.length,
  };
}
