/**
 * Column validation rules for user data tables — THE one rule model.
 *
 * A rule lives on `workbench.udt_dataset_fields.validation_rules` (jsonb) and
 * answers one question: may this value be written into this column? The
 * champions are Excel's data validation (a rule per column; an invalid entry is
 * refused WITH the reason) and Airtable (type-level only). We take Excel's
 * posture: the reason is the product.
 *
 * THREE LAWS this module exists to keep:
 *
 * 1. **`required` is NOT stored here.** The column already declares it as
 *    `is_required`, and a second copy is a second truth. `ValidationRules.required`
 *    is a read-only MIRROR for callers that want one object to reason about —
 *    `parseValidationRules` never invents it and the editor never writes it.
 *
 * 2. **A rule judges a value the user MEANT to write; it never judges what is
 *    already stored.** Existing values that violate a rule are legal, are never
 *    rewritten, and render in the SAME amber the format system already uses for
 *    a mismatch (`<FormattedFieldValue validationRules>`). Declaring a rule is
 *    how a user FINDS the stray values in their data, exactly as declaring a
 *    choice column's options is.
 *
 * 3. **An empty value is never a rule violation.** Emptiness is `is_required`'s
 *    question, asked once, by the callers that own the whole row. A `min: 0`
 *    rule that refused an empty cell would make every optional number column
 *    mandatory by accident.
 *
 * `unique` is the one rule this module cannot answer alone: it is a statement
 * about the OTHER rows, so the caller passes `existingValues` (the loaded rows'
 * values for that column) when it holds them. Without them the rule is skipped
 * rather than guessed — and it is deliberately NOT enforced by the database
 * trigger, because a cross-row check inside a per-row BEFORE trigger is the
 * wrong shape (it cannot see concurrent inserts and it walks the table on every
 * write). See `migrations/udt_validation_rules_strict_enforcement.sql`.
 */

import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

export type ValidationRules = {
  /**
   * MIRROR of the column's `is_required`. Never stored in `validation_rules`,
   * never written by the editor — present so a caller can carry one object.
   */
  required?: boolean;
  /** Smallest number accepted. Number-ish columns only. */
  min?: number;
  /** Largest number accepted. Number-ish columns only. */
  max?: number;
  /** Fewest characters accepted. Text-ish columns only. */
  minLength?: number;
  /** Most characters accepted. Text-ish columns only. */
  maxLength?: number;
  /**
   * A regular expression the value must match. Written in the dialect BOTH
   * JavaScript and Postgres understand, and **anchored by the author** — an
   * unanchored `\d{3}` matches "abc123def" in both engines, which is almost
   * never what a person drawing a rule means.
   */
  pattern?: string;
  /** Plain-English shape shown when `pattern` refuses, e.g. `###-####`. */
  patternHint?: string;
  /**
   * The exact values accepted. Only for a column that is NOT a choice column —
   * a choice column already carries its options in its format, and a second
   * list would be a second vocabulary for the same column.
   */
  allowedValues?: string[];
  /** No two rows may carry the same value. Checked by the caller, never by the trigger. */
  unique?: boolean;
};

export type ValidationOk = { ok: true };
export type ValidationFailure = { ok: false; reason: string };
export type ValidationResult = ValidationOk | ValidationFailure;

const OK: ValidationOk = { ok: true };

/** Keys the editor may write. `required` is deliberately absent — law 1. */
const STORED_KEYS = [
  "min",
  "max",
  "minLength",
  "maxLength",
  "pattern",
  "patternHint",
  "allowedValues",
  "unique",
] as const;

function finiteNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function nonNegativeInteger(raw: unknown): number | undefined {
  const n = finiteNumber(raw);
  if (n === undefined) return undefined;
  const i = Math.trunc(n);
  return i >= 0 ? i : undefined;
}

/**
 * Read whatever is stored on the column into the rule model. TOLERANT by
 * design: this reads a jsonb column that predates the feature, that an agent or
 * an import may have written, and that a future version may extend. Anything it
 * cannot understand is dropped, never thrown on — a column with a garbled rule
 * must still be editable.
 */
export function parseValidationRules(raw: unknown): ValidationRules {
  let source: unknown = raw;
  if (typeof source === "string") {
    const text = source.trim();
    if (text === "") return {};
    try {
      source = JSON.parse(text);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const obj = source as Record<string, unknown>;
  const out: ValidationRules = {};

  const min = finiteNumber(obj.min);
  if (min !== undefined) out.min = min;
  const max = finiteNumber(obj.max);
  if (max !== undefined) out.max = max;

  const minLength = nonNegativeInteger(obj.minLength);
  if (minLength !== undefined) out.minLength = minLength;
  const maxLength = nonNegativeInteger(obj.maxLength);
  if (maxLength !== undefined) out.maxLength = maxLength;

  if (typeof obj.pattern === "string" && obj.pattern.trim() !== "") {
    out.pattern = obj.pattern;
    if (typeof obj.patternHint === "string" && obj.patternHint.trim() !== "") {
      out.patternHint = obj.patternHint.trim();
    }
  }

  if (Array.isArray(obj.allowedValues)) {
    const values = obj.allowedValues
      .filter(
        (v): v is string | number | boolean =>
          typeof v === "string" || typeof v === "number" || typeof v === "boolean",
      )
      .map((v) => String(v).trim())
      .filter((v) => v !== "");
    // De-duplicate, keeping the author's order.
    const seen = new Set<string>();
    const unique = values.filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length > 0) out.allowedValues = unique;
  }

  if (obj.unique === true) out.unique = true;

  return out;
}

/** True when the column actually constrains anything. */
export function hasValidationRules(rules: ValidationRules | null | undefined): boolean {
  if (!rules) return false;
  return STORED_KEYS.some((key) => rules[key] !== undefined);
}

/**
 * The object to STORE. Strips `required` (law 1) and every empty key, so a
 * column whose rules were all cleared stores `{}` rather than a husk of nulls
 * — which also matters because `update_user_table_config` COALESCEs the column,
 * so `{}` is the only way to clear it.
 */
export function serializeValidationRules(
  rules: ValidationRules | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!rules) return out;
  for (const key of STORED_KEYS) {
    const value = rules[key];
    if (value === undefined) continue;
    if (key === "allowedValues" && (!Array.isArray(value) || value.length === 0)) continue;
    if (key === "unique" && value !== true) continue;
    if ((key === "pattern" || key === "patternHint") && String(value).trim() === "") continue;
    out[key] = value;
  }
  // A hint with no pattern says nothing; drop it rather than store a dangling half-rule.
  if (out.patternHint !== undefined && out.pattern === undefined) delete out.patternHint;
  return out;
}

/** Plain-English list of what a column requires — for tooltips and for agents. */
export function describeValidationRules(rules: ValidationRules): string[] {
  const out: string[] = [];
  if (rules.min !== undefined && rules.max !== undefined) {
    out.push(`Between ${rules.min} and ${rules.max}`);
  } else if (rules.min !== undefined) {
    out.push(`At least ${rules.min}`);
  } else if (rules.max !== undefined) {
    out.push(`At most ${rules.max}`);
  }
  if (rules.minLength !== undefined && rules.maxLength !== undefined) {
    out.push(`${rules.minLength}–${rules.maxLength} characters`);
  } else if (rules.minLength !== undefined) {
    out.push(`At least ${rules.minLength} characters`);
  } else if (rules.maxLength !== undefined) {
    out.push(`At most ${rules.maxLength} characters`);
  }
  if (rules.pattern) {
    out.push(rules.patternHint ? `Pattern ${rules.patternHint}` : `Matches ${rules.pattern}`);
  }
  if (rules.allowedValues?.length) {
    out.push(`One of: ${rules.allowedValues.join(", ")}`);
  }
  if (rules.unique) out.push("Unique across rows");
  return out;
}

const CHOICE_FORMATS = new Set(["choice", "multi_choice", "person"]);

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** The value as the user reads it — the basis for every text rule. */
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export type ValidateCellArgs = {
  rules: ValidationRules | null | undefined;
  /** The column's storage type (`string` | `number` | `integer` | …). */
  dataType: string;
  /** The column's declared display format, when it has one. */
  format?: FieldFormatConfig | null;
  /** The value the user is trying to write, already type-normalized. */
  value: unknown;
  /**
   * Every OTHER row's value for this column, when the caller holds them. Only
   * `unique` reads this; omit it and `unique` is skipped rather than guessed.
   */
  existingValues?: unknown[];
};

/**
 * Judge one value against one column's rules.
 *
 * Returns the FIRST reason it fails, in the order a person would check them
 * (range, length, shape, membership, uniqueness) — a wall of five complaints
 * about one cell is not more helpful than the first one.
 */
export function validateCellValue(args: ValidateCellArgs): ValidationResult {
  const { rules, dataType, format, value, existingValues } = args;
  if (!rules || !hasValidationRules(rules)) return OK;

  // Law 3 — emptiness belongs to `is_required`, not to a rule.
  if (isEmptyValue(value)) return OK;

  const text = asText(value);
  const numeric = finiteNumber(value);

  // ── range ───────────────────────────────────────────────────────────────
  // Applied only when a number can honestly be read out of the value. A
  // non-numeric value in a number column is a TYPE problem, already reported by
  // the format layer and by strict mode; saying "Must be at least 0" about the
  // word "pending" would be a second, worse answer to a question already asked.
  if (numeric !== undefined) {
    if (rules.min !== undefined && numeric < rules.min) {
      return { ok: false, reason: `Must be at least ${rules.min}` };
    }
    if (rules.max !== undefined && numeric > rules.max) {
      return { ok: false, reason: `Must be at most ${rules.max}` };
    }
  }

  // ── length ──────────────────────────────────────────────────────────────
  if (rules.minLength !== undefined && text.length < rules.minLength) {
    return {
      ok: false,
      reason: `Must be at least ${rules.minLength} character${rules.minLength === 1 ? "" : "s"} (this is ${text.length})`,
    };
  }
  if (rules.maxLength !== undefined && text.length > rules.maxLength) {
    return {
      ok: false,
      reason: `Must be at most ${rules.maxLength} character${rules.maxLength === 1 ? "" : "s"} (this is ${text.length})`,
    };
  }

  // ── shape ───────────────────────────────────────────────────────────────
  if (rules.pattern) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(rules.pattern);
    } catch {
      // An unparseable pattern is the AUTHOR's defect, not this value's. It is
      // reported where it is written (the editor refuses to save one); here it
      // must never turn into a refusal the typist cannot act on.
      re = null;
    }
    if (re && !re.test(text)) {
      return {
        ok: false,
        reason: rules.patternHint
          ? `Must match the pattern ${rules.patternHint}`
          : `Must match the pattern ${rules.pattern}`,
      };
    }
  }

  // ── membership ──────────────────────────────────────────────────────────
  // Skipped on a choice column by construction: its options are its format's
  // job, they are offered in the picker, and an off-list value there is legal
  // and amber by design. A second list here would contradict that.
  const isChoiceColumn = format ? CHOICE_FORMATS.has(format.id) : false;
  if (rules.allowedValues?.length && !isChoiceColumn) {
    const target = text.trim();
    const hit = rules.allowedValues.some(
      (v) => v === target || v.toLowerCase() === target.toLowerCase(),
    );
    if (!hit) {
      return {
        ok: false,
        reason: `Must be one of: ${rules.allowedValues.join(", ")}`,
      };
    }
  }

  // ── uniqueness ──────────────────────────────────────────────────────────
  if (rules.unique && existingValues && existingValues.length > 0) {
    const target = text.trim().toLowerCase();
    const clash = existingValues.some(
      (other) => !isEmptyValue(other) && asText(other).trim().toLowerCase() === target,
    );
    if (clash) {
      return {
        ok: false,
        reason: `Must be unique — another row already has "${text}"`,
      };
    }
  }

  // `dataType` is not read by any rule today: every rule above is answered by
  // the VALUE, and the storage type is already enforced by strict mode and by
  // the format layer. It stays in the signature because it is the one fact a
  // future rule (a date range, say) cannot be written without, and adding it
  // later would change every callsite.
  void dataType;

  return OK;
}
