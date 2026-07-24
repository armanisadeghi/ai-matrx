/**
 * validateItem — the matrx-frontend twin of aidream's canonical collection-item
 * validator (aidream/services/cms/collection_validation.py — CW3). Pure
 * function, no I/O, no env, no DOM: the admin item editor and the
 * /api/cms/collections route both run it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A TWIN, NOT AN ORIGINAL. Three implementations of these semantics
 * exist and must agree byte-for-byte:
 *   1. aidream/aidream/services/cms/collection_validation.py  (CANONICAL)
 *   2. my-matrx/lib/collections/validateItem.js               (visitor path)
 *   3. THIS FILE                                              (admin path)
 * They are pinned to each other by the shared language-neutral fixture
 * `collection-validation-rules.json` (copied verbatim from aidream — never
 * edit the copy). Run `pnpm check:collection-validator` to prove this twin
 * still matches. Change a rule ⇒ change all three ⇒ change the fixture ⇒ run
 * every suite. A collection marked `strict` must reject an admin-authored item
 * for exactly the reasons it rejects a visitor's.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Normative definitions (W2C-design §2.3, adversarial finding 9, plus the
 * 2026-07-23 twin-divergence rulings (a)–(g)):
 *   - `max_length` counts Unicode CODE POINTS ([...str].length), never UTF-16
 *     units — "𝒳".length is 2, but it is ONE code point — and it applies to
 *     EVERY string value whatever type the field declares (ruling (b)): a
 *     declared constraint is never silently ignored.
 *   - Byte caps are NOT this function's job: the ROUTE is the size authority
 *     (UTF-8 bytes of JSON.stringify(data)) — see `itemByteSize` below.
 *   - `datetime` accepts ONLY strict ISO-8601 (regex + an explicit civil
 *     calendar check); bare `new Date(str)` permissive parsing is forbidden —
 *     and so is `Date.UTC` for the calendar check, because it maps years 0–99
 *     onto 1900–1999 and would reject the valid year "0050".
 *   - `number` must be a finite JSON number: `"5"` is a mismatch; NaN/Infinity
 *     reject; a literal outside the finite IEEE-754 double range rejects on all
 *     twins (ruling (g)).
 *   - `richtext` never appears on public_write collections (the definition
 *     layer forbids the combination), so at THIS layer richtext is validated
 *     exactly like text (string + length only). Sanitization is Python-side.
 *
 * Empty string (ruling (a) — the highest-traffic real-world shape, since
 * browsers submit "" for untouched inputs): "" counts as "not provided" ONLY
 * for the string-ish types (text/richtext/email/url/datetime/select). On a
 * `number` or `boolean` field "" is a present value of the WRONG TYPE — a type
 * mismatch, never an absence, so a required numeric field can never be
 * satisfied by a blank. On a `json` field "" is a valid JSON value and passes.
 *
 * Malformed field_schema (ruling (f)): a version restore or a direct DB write
 * can bring bad shapes back, so every twin is defensive identically — a
 * malformed constraint is IGNORED (treated as absent), never reinterpreted. A
 * field whose `key` is not a NON-EMPTY STRING is skipped entirely (its data key
 * then reads as an unknown key in strict mode).
 *
 * Regex dialect (rulings (c)/(d)/(e)): `url` uses the SAME regex as Python —
 * `new URL()` is forbidden here, it accepts `HTTP://`, leading whitespace,
 * `http:/x` and embedded tabs that the canonical regex rejects. No `\s` in a
 * shared pattern (JS counts U+FEFF as whitespace and Python does not; Python
 * counts U+001C–U+001F/U+0085 and JS does not) — WS_CLASS below is the
 * contract. JS `$` is the normative end anchor (Python must use `\Z`).
 * Fractional seconds accept up to 9 digits.
 *
 * `required` (ruling (h)): constrains ONLY when it is the literal boolean
 * `true`. `1`, `"true"`, `[]`, `{}`, `0`, `null` are MALFORMED and IGNORED,
 * exactly like a malformed max_length. Never `if (field.required)` — JS truthy
 * and Python truthy disagree about `[]`/`{}`.
 *
 * Issue shape — a PUBLIC WIRE CONTRACT (ruling (i)): the my-matrx visitor route
 * returns these objects verbatim to the browser and its DATA_API.md documents
 * them, so every twin emits `{key, code, message}` (the property is `key`,
 * never `field`) with `code` drawn from exactly six values:
 *   required_missing | unknown_key | type_mismatch
 *   max_length | out_of_range | invalid_option
 * EVERY constraint failure on a field is reported, not just the first (ruling
 * (j)); a TYPE mismatch still short-circuits its own field's constraints.
 *
 * Modes (W2C-design §2.3):
 *   - advisory (default): unknown keys pass silently; type/constraint
 *     mismatches are recorded as WARNINGS; only required-missing rejects.
 *   - strict: unknown keys and type/constraint mismatches reject too.
 */

import type { CollectionValidationMode } from "@/features/cms/types";

const FIELD_TYPES = new Set([
  "text",
  "richtext",
  "number",
  "boolean",
  "email",
  "url",
  "datetime",
  "select",
  "json",
]);

/** String-typed field types: for these — and ONLY these — "" counts as missing. */
const STRING_TYPES = new Set([
  "text",
  "richtext",
  "email",
  "url",
  "datetime",
  "select",
]);

/** The normative whitespace class. NEVER use `\s` in a shared format regex. */
const WS_CLASS =
  "\\t\\n\\x0b\\x0c\\r \\x1c-\\x1f\\x85\\xa0" +
  "\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";

/**
 * Strict ISO-8601: date, or date + T time (seconds/fraction optional) with an
 * optional Z / ±hh:mm offset. Anything else — RFC 2822 dates, `Date.parse`
 * liberalism, bare times — is a mismatch.
 */
const ISO_8601_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:Z|([+-]\d{2}):(\d{2}))?)?$/;

const EMAIL_RE = new RegExp(
  `^[^@${WS_CLASS}]+@[^@${WS_CLASS}]+\\.[^@${WS_CLASS}]+$`,
);
const URL_RE = new RegExp(`^https?://[^${WS_CLASS}]+$`);

/**
 * Largest finite IEEE-754 double — the shared "this number survived JSON.parse"
 * bound (ruling (g)). Number.MAX_VALUE, spelled out so every twin reads alike.
 */
const FLOAT_MAX = 1.7976931348623157e308;

export interface ItemValidationProblem {
  key: string;
  code: string;
  message: string;
}

export interface ItemValidationReport {
  ok: boolean;
  errors: ItemValidationProblem[];
  warnings: ItemValidationProblem[];
}

/** A field definition as it may actually appear on disk — possibly malformed. */
interface LooseField {
  key: string;
  type: unknown;
  required?: unknown;
  max_length?: unknown;
  min?: unknown;
  max?: unknown;
  options?: unknown;
}

/** Counts Unicode code points, NOT UTF-16 code units. */
function codePointLength(str: string): number {
  return [...str].length;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function isValidIso8601(value: string): boolean {
  const m = ISO_8601_RE.exec(value);
  if (!m) return false;
  // Groups: 1 y, 2 mo, 3 d, 4 h, 5 mi, 6 s, 7 fraction (skipped), 8 offH, 9 offM
  const [, y, mo, d, h, mi, s, , offH, offM] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  // Proleptic Gregorian, years 1–9999 (Python's date() bounds). Computed by
  // hand — Date.UTC(50, ...) means 1950, which would reject the valid "0050".
  if (year < 1) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (h !== undefined) {
    if (Number(h) > 23 || Number(mi) > 59) return false;
    if (s !== undefined && Number(s) > 59) return false;
  }
  if (offH !== undefined) {
    if (Math.abs(Number(offH)) > 23 || Number(offM) > 59) return false;
  }
  return true;
}

/**
 * Normative `max_length` reader (ruling (f)) — constrains ONLY when the
 * declared value is a non-negative INTEGRAL JSON number. `-1`, `true`, `"5"`,
 * `null`, `2.5`, NaN/Infinity are malformed → IGNORED (never reinterpreted).
 * `2.0` is honoured as `2`: JSON cannot distinguish it from `2`.
 */
function declaredMaxLength(field: LooseField): number | null {
  const raw = field.max_length;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
  return raw;
}

/**
 * Normative `min`/`max` reader (ruling (f)) — a real, non-bool, non-NaN JSON
 * number or nothing at all. `min: true` constrains NOTHING.
 */
function declaredBound(field: LooseField, name: "min" | "max"): number | null {
  const raw = field[name];
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return raw;
}

/**
 * Normative `options` reader (ruling (f)) — constrains ONLY when it is a
 * non-empty array of strings. A bare string was once SUBSTRING-tested on the
 * Python side, which is a bug in any reading; a mixed array is equally
 * un-actionable. Both leave the select unconstrained.
 */
function declaredOptions(field: LooseField): string[] | null {
  const raw = field.options;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every((option: unknown) => typeof option === "string")) return null;
  return raw as string[];
}

/** Type check a single value against a field def. null = OK. */
function checkType(
  field: LooseField,
  value: unknown,
): { code: string; message: string } | null {
  switch (field.type) {
    case "text":
    case "richtext": {
      if (typeof value !== "string") {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a string`,
        };
      }
      return null;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a finite JSON number`,
        };
      }
      if (value < -FLOAT_MAX || value > FLOAT_MAX) {
        // Unreachable after JSON.parse (it yields Infinity, caught above) —
        // kept so a hand-built object is judged the same as a parsed one.
        return {
          code: "type_mismatch",
          message: `${field.key} is outside the IEEE-754 double range`,
        };
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a boolean`,
        };
      }
      return null;
    }
    case "email": {
      if (typeof value !== "string" || !EMAIL_RE.test(value)) {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a valid email address`,
        };
      }
      return null;
    }
    case "url": {
      // The canonical regex, NOT `new URL()` — see the header (ruling (c)).
      if (typeof value !== "string" || !URL_RE.test(value)) {
        return {
          code: "type_mismatch",
          message: `${field.key} must be an http(s) URL`,
        };
      }
      return null;
    }
    case "datetime": {
      if (typeof value !== "string" || !isValidIso8601(value)) {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a strict ISO-8601 datetime`,
        };
      }
      return null;
    }
    case "select": {
      if (typeof value !== "string") {
        return {
          code: "type_mismatch",
          message: `${field.key} must be a string`,
        };
      }
      return null;
    }
    case "json": {
      // Any JSON value is acceptable — including "" (ruling (a)).
      return null;
    }
    default: {
      // Unknown field type in the DEFINITION: canonical semantics treat any
      // provided value as a mismatch (nothing can legitimately satisfy a type
      // the validator doesn't know) — strict rejects, advisory warns.
      return {
        code: "type_mismatch",
        message: `${field.key} has an unrecognized field type`,
      };
    }
  }
}

/** Constraint checks that only run when the TYPE already matched. */
function checkConstraints(
  field: LooseField,
  value: unknown,
): { code: string; message: string }[] {
  const problems: { code: string; message: string }[] = [];
  // max_length applies to EVERY string value, whatever the declared type.
  if (typeof value === "string") {
    const maxLength = declaredMaxLength(field);
    if (maxLength !== null && codePointLength(value) > maxLength) {
      problems.push({
        code: "max_length",
        message: `${field.key} exceeds max_length ${maxLength} (code points)`,
      });
    }
  }
  if (
    field.type === "number" &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    const min = declaredBound(field, "min");
    const max = declaredBound(field, "max");
    if (min !== null && value < min) {
      problems.push({
        code: "out_of_range",
        message: `${field.key} is below min ${min}`,
      });
    }
    if (max !== null && value > max) {
      problems.push({
        code: "out_of_range",
        message: `${field.key} is above max ${max}`,
      });
    }
  }
  if (field.type === "select" && typeof value === "string") {
    const options = declaredOptions(field);
    if (options !== null && !options.includes(value)) {
      problems.push({
        code: "invalid_option",
        message: `${field.key} must be one of the configured options`,
      });
    }
  }
  return problems;
}

/**
 * Normative `required` reader (ruling (h)) — the literal boolean `true` and
 * NOTHING else. Language-native truthiness is BANNED here: `[]` and `{}` are
 * truthy in JS/TS and falsy in Python, so "is this field required?" used to
 * depend on which twin you asked — 368 divergences per 5,000 random cases, the
 * largest ever measured on this seam. A malformed `required` is IGNORED, the
 * same ruling as a malformed max_length/min/max/options; `parseFieldSchema` in
 * `app/api/cms/collections/route.ts` refuses to STORE a non-boolean one.
 */
function declaredRequired(field: LooseField): boolean {
  return field.required === true;
}

/**
 * Is this value an ABSENCE for `required` purposes? Absent and null always;
 * "" only on a string-ish type (ruling (a)).
 */
function isMissing(field: LooseField, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return value === "" && STRING_TYPES.has(String(field.type));
}

export function validateItem(
  fieldSchema: unknown,
  data: Record<string, unknown>,
  mode: CollectionValidationMode = "advisory",
): ItemValidationReport {
  const errors: ItemValidationProblem[] = [];
  const warnings: ItemValidationProblem[] = [];
  const strict = mode === "strict";

  const schema: unknown[] = Array.isArray(fieldSchema) ? fieldSchema : [];
  // A field is declared IFF `key` is a non-empty string (ruling (f)).
  const byKey = new Map<string, LooseField>();
  for (const entry of schema) {
    if (!isPlainObject(entry)) continue;
    const key = entry.key;
    if (typeof key !== "string" || key === "") continue;
    if (FIELD_TYPES.has(String(entry.type))) {
      byKey.set(key, { ...entry, key, type: entry.type });
    } else {
      // Keep the key known (so it isn't flagged unknown) even if type is bad;
      // any provided value is then a mismatch, exactly as in Python.
      byKey.set(key, { ...entry, key, type: "_unvalidatable" });
    }
  }

  // 1. declared fields — required-missing, then type, then constraints.
  //    (Same single pass as Python, so the twins can't drift on ordering.)
  for (const [key, field] of byKey.entries()) {
    const present = Object.prototype.hasOwnProperty.call(data, key);
    const value = present ? data[key] : undefined;
    if (!present || isMissing(field, value)) {
      if (declaredRequired(field)) {
        errors.push({
          key,
          code: "required_missing",
          message: `${key} is required`,
        });
      }
      continue; // optional + absent/null/empty → nothing to check
    }
    const typeProblem = checkType(field, value);
    if (typeProblem) {
      const entry = { key, ...typeProblem };
      if (strict) errors.push(entry);
      else warnings.push(entry);
      continue; // constraints are meaningless on a mistyped value
    }
    for (const problem of checkConstraints(field, value)) {
      const entry = { key, ...problem };
      if (strict) errors.push(entry);
      else warnings.push(entry);
    }
  }

  // 2. unknown keys — strict rejects; advisory passes silently.
  for (const key of Object.keys(data)) {
    if (!byKey.has(key)) {
      if (strict) {
        errors.push({
          key,
          code: "unknown_key",
          message: `${key} is not a defined field`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Normative UTF-8 byte counter. `TextEncoder` (not `Buffer`) so the identical
 * function runs in the route AND in the browser editor.
 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Item payload size: compact JSON, no ascii escaping, counted in UTF-8 bytes. */
export function itemByteSize(data: unknown): number {
  return utf8ByteLength(JSON.stringify(data) ?? "");
}

/** Count keys recursively ("after flatten") across nested objects/arrays. */
export function countKeys(value: unknown): number {
  if (Array.isArray(value)) {
    let n = 0;
    for (const entry of value) n += countKeys(entry);
    return n;
  }
  if (typeof value === "object" && value !== null) {
    let n = 0;
    for (const key of Object.keys(value)) {
      n += 1 + countKeys((value as Record<string, unknown>)[key]);
    }
    return n;
  }
  return 0;
}
