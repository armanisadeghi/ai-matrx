/**
 * features/data-tables/formulas.ts — THE formula language for computed columns.
 *
 * A **formula column** holds nothing. Its cell is always `null` in the
 * database; the value the user sees is computed, on read, from the OTHER
 * columns of the SAME row. Champion: Airtable's formula field.
 *
 * THE THREE RULES THIS FILE OBEYS
 *
 * 1. **No `eval`, no `new Function`, no dynamic code.** A formula is user
 *    content; it is tokenized, parsed into an AST, and interpreted. Nothing a
 *    user types ever becomes JavaScript.
 * 2. **Nothing throws.** `parseFormula` and `evaluateFormula` both return a
 *    discriminated result. A syntax error, a missing column, a division by
 *    zero and a type mismatch are all `ok: false` with a plain-English
 *    sentence a non-technical person can act on — never an exception, never a
 *    silent blank cell (THE FALLBACK LAW, `lib/field-formats/FEATURE.md`).
 * 3. **The engine is pure.** It reads cells through a caller-supplied
 *    `resolve(name)`. It never touches Redux, Supabase, or the DOM, which is
 *    what makes every rule below testable.
 *
 * THE COERCION RULES (the whole contract, in one place)
 *
 * - **BLANK** is `null`, `undefined`, or `""`. All three are the same value to
 *   a formula, because a text cell that was cleared holds `""` and a number
 *   cell that was cleared holds `null`, and a user does not distinguish them.
 * - **A missing column is NOT blank.** `resolve()` returns `undefined` for a
 *   column that does not exist (as opposed to `null` for one that is empty),
 *   and that is an error: `{a} + {Typo}` must say the column is unknown rather
 *   than quietly computing with zero.
 * - **Arithmetic treats BLANK as 0.** `{a} + {b}` with `b` empty is `{a}`.
 *   That is the tolerant reading every spreadsheet uses, and the alternative
 *   (the whole cell erroring because one input is empty) makes a formula
 *   column useless on real, partly-filled data.
 * - **Numeric strings coerce.** `"1,234"`, `" 42 "`, `"$5"` and `"3.5"` are
 *   numbers in arithmetic; `"n/a"` is a type error naming the value.
 * - **Booleans are 1 and 0 in arithmetic**, so SUM over a checkbox column
 *   counts the ticks.
 * - **Aggregates SKIP blanks.** `SUM`/`MIN`/`MAX`/`AVERAGE` ignore empty
 *   inputs entirely — `AVERAGE` divides by the count of the values that were
 *   actually there, and returns BLANK when there were none.
 * - **Text conversion**: BLANK becomes `""`, a number becomes its shortest
 *   exact decimal, a boolean becomes `"true"` / `"false"`.
 * - **Comparison** is numeric when both sides read as numbers, otherwise a
 *   plain string comparison. BLANK takes the shape of what it is compared
 *   against — `0` beside a number, `""` beside text — so `{a} = BLANK()`,
 *   `{a} = 0` and `{a} = ''` all hold for an empty cell.
 * - **Truthiness** (for `IF` / `AND` / `OR` / `NOT`): BLANK is false, a
 *   boolean is itself, a number is true unless `0`, a string is true unless
 *   empty.
 * - **Dates are ISO strings, read and written in UTC.** A date function
 *   accepts an ISO string (or a `Date`) and returns an ISO string — date-only
 *   (`2026-09-14`) when the input was date-only, full (`2026-09-14T…Z`)
 *   otherwise. UTC throughout on purpose: reading `2026-09-14` with local
 *   getters turns it into the 13th for half the planet.
 * - **Division (and `%`) by zero is an error**, never `Infinity` and never
 *   `NaN`. A cell may not lie about arithmetic that did not happen.
 */

// ─── AST ─────────────────────────────────────────────────────────────────────

export type FormulaValue = string | number | boolean | null;

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "&"
  | "="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">=";

export type FormulaAst =
  | { kind: "number"; value: number; position: number }
  | { kind: "string"; value: string; position: number }
  | { kind: "boolean"; value: boolean; position: number }
  | { kind: "reference"; name: string; position: number }
  | { kind: "unary"; operator: "-"; operand: FormulaAst; position: number }
  | {
      kind: "binary";
      operator: BinaryOperator;
      left: FormulaAst;
      right: FormulaAst;
      position: number;
    }
  | {
      kind: "call";
      name: FormulaFunctionName;
      args: FormulaAst[];
      position: number;
    };

export type ParseResult =
  | { ok: true; ast: FormulaAst; references: string[] }
  | { ok: false; error: string; position: number };

export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: string };

export type FormulaResultType = "number" | "text" | "boolean" | "date" | "unknown";

/** What a cell lookup may answer: a value, BLANK, or `undefined` = no such column. */
export type ResolveCell = (name: string) => unknown;

/** Best-effort declared type of a column, for static result typing. */
export type ResolveColumnType = (
  name: string,
) => "number" | "text" | "boolean" | "date" | undefined;

// ─── the function table ──────────────────────────────────────────────────────

const FUNCTION_SPECS = {
  SUM: {
    signature: "SUM(number, …)",
    description: "Adds every value, ignoring empty ones.",
    min: 1,
    max: Infinity,
    result: "number",
  },
  MIN: {
    signature: "MIN(number, …)",
    description: "The smallest value, ignoring empty ones.",
    min: 1,
    max: Infinity,
    result: "number",
  },
  MAX: {
    signature: "MAX(number, …)",
    description: "The largest value, ignoring empty ones.",
    min: 1,
    max: Infinity,
    result: "number",
  },
  AVERAGE: {
    signature: "AVERAGE(number, …)",
    description:
      "The average of the values that are filled in. Empty values are not counted.",
    min: 1,
    max: Infinity,
    result: "number",
  },
  ROUND: {
    signature: "ROUND(number, places?)",
    description:
      "Rounds to the given number of decimal places (0 when omitted). Halves round away from zero.",
    min: 1,
    max: 2,
    result: "number",
  },
  ABS: {
    signature: "ABS(number)",
    description: "The value without its minus sign.",
    min: 1,
    max: 1,
    result: "number",
  },
  LEN: {
    signature: "LEN(text)",
    description: "How many characters the text has.",
    min: 1,
    max: 1,
    result: "number",
  },
  UPPER: {
    signature: "UPPER(text)",
    description: "The text in capitals.",
    min: 1,
    max: 1,
    result: "text",
  },
  LOWER: {
    signature: "LOWER(text)",
    description: "The text in lower case.",
    min: 1,
    max: 1,
    result: "text",
  },
  TRIM: {
    signature: "TRIM(text)",
    description: "The text without leading or trailing spaces.",
    min: 1,
    max: 1,
    result: "text",
  },
  CONCATENATE: {
    signature: "CONCATENATE(text, …)",
    description: "Joins every value into one piece of text.",
    min: 1,
    max: Infinity,
    result: "text",
  },
  LEFT: {
    signature: "LEFT(text, count)",
    description: "The first few characters of the text.",
    min: 2,
    max: 2,
    result: "text",
  },
  RIGHT: {
    signature: "RIGHT(text, count)",
    description: "The last few characters of the text.",
    min: 2,
    max: 2,
    result: "text",
  },
  CONTAINS: {
    signature: "CONTAINS(text, part)",
    description:
      "Yes when the text contains that part. Upper and lower case are treated the same.",
    min: 2,
    max: 2,
    result: "boolean",
  },
  IF: {
    signature: "IF(condition, then, otherwise?)",
    description:
      "The second value when the condition holds, otherwise the third (empty when omitted).",
    min: 2,
    max: 3,
    result: "unknown",
  },
  AND: {
    signature: "AND(condition, …)",
    description: "Yes when every condition holds.",
    min: 1,
    max: Infinity,
    result: "boolean",
  },
  OR: {
    signature: "OR(condition, …)",
    description: "Yes when at least one condition holds.",
    min: 1,
    max: Infinity,
    result: "boolean",
  },
  NOT: {
    signature: "NOT(condition)",
    description: "Turns yes into no and no into yes.",
    min: 1,
    max: 1,
    result: "boolean",
  },
  BLANK: {
    signature: "BLANK()",
    description: "An empty value, for comparing against or returning.",
    min: 0,
    max: 0,
    result: "unknown",
  },
  ISBLANK: {
    signature: "ISBLANK(value)",
    description: "Yes when the value is empty.",
    min: 1,
    max: 1,
    result: "boolean",
  },
  TODAY: {
    signature: "TODAY()",
    description: "Today's date.",
    min: 0,
    max: 0,
    result: "date",
  },
  NOW: {
    signature: "NOW()",
    description: "The current date and time.",
    min: 0,
    max: 0,
    result: "date",
  },
  DATEDIFF: {
    signature: "DATEDIFF(from, to, 'days' | 'hours' | 'minutes')",
    description:
      "How far the second date is after the first. Negative when it is earlier.",
    min: 3,
    max: 3,
    result: "number",
  },
  YEAR: {
    signature: "YEAR(date)",
    description: "The four-digit year of the date.",
    min: 1,
    max: 1,
    result: "number",
  },
  MONTH: {
    signature: "MONTH(date)",
    description: "The month of the date, 1 to 12.",
    min: 1,
    max: 1,
    result: "number",
  },
  DAY: {
    signature: "DAY(date)",
    description: "The day of the month, 1 to 31.",
    min: 1,
    max: 1,
    result: "number",
  },
  DATEADD: {
    signature: "DATEADD(date, count, 'days' | 'months' | 'years')",
    description:
      "The date moved forward by that many units. Use a negative count to go back.",
    min: 3,
    max: 3,
    result: "date",
  },
} as const satisfies Record<
  string,
  {
    signature: string;
    description: string;
    min: number;
    max: number;
    result: FormulaResultType;
  }
>;

export type FormulaFunctionName = keyof typeof FUNCTION_SPECS;

const FUNCTION_NAMES = Object.keys(FUNCTION_SPECS) as FormulaFunctionName[];

/** The help list the formula editor shows. Order is the order it renders in. */
export const FORMULA_FUNCTIONS: readonly {
  name: FormulaFunctionName;
  signature: string;
  description: string;
}[] = Object.freeze(
  FUNCTION_NAMES.map((name) => ({
    name,
    signature: FUNCTION_SPECS[name].signature,
    description: FUNCTION_SPECS[name].description,
  })),
);

// ─── tokenizer ───────────────────────────────────────────────────────────────

type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "reference"
  | "operator"
  | "paren-open"
  | "paren-close"
  | "comma"
  | "end";

type Token = { type: TokenType; text: string; position: number };

/** Thrown only INSIDE this module; every public entry point catches it. */
class FormulaError extends Error {
  readonly position: number;
  constructor(message: string, position = 0) {
    super(message);
    this.name = "FormulaError";
    this.position = position;
  }
}

const TWO_CHAR_OPERATORS = ["!=", "<>", "<=", ">="];
const ONE_CHAR_OPERATORS = ["+", "-", "*", "/", "%", "&", "=", "<", ">"];

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "{") {
      const close = source.indexOf("}", i + 1);
      if (close === -1) {
        throw new FormulaError(
          "This column reference is missing its closing brace `}`.",
          i,
        );
      }
      const name = source.slice(i + 1, close).trim();
      if (name === "") {
        throw new FormulaError("This column reference has no name inside `{}`.", i);
      }
      tokens.push({ type: "reference", text: name, position: i });
      i = close + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let text = "";
      let closed = false;
      while (j < source.length) {
        if (source[j] === "\\" && j + 1 < source.length) {
          text += source[j + 1];
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          closed = true;
          j += 1;
          break;
        }
        text += source[j];
        j += 1;
      }
      if (!closed) {
        throw new FormulaError(
          `This text is missing its closing ${quote === '"' ? "double" : "single"} quote.`,
          i,
        );
      }
      tokens.push({ type: "string", text, position: i });
      i = j;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      let j = i;
      let seenDot = false;
      while (j < source.length) {
        if (isDigit(source[j])) {
          j += 1;
          continue;
        }
        if (source[j] === "." && !seenDot) {
          seenDot = true;
          j += 1;
          continue;
        }
        break;
      }
      tokens.push({ type: "number", text: source.slice(i, j), position: i });
      i = j;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let j = i;
      while (j < source.length && isIdentifierPart(source[j])) j += 1;
      tokens.push({ type: "identifier", text: source.slice(i, j), position: i });
      i = j;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "paren-open", text: ch, position: i });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "paren-close", text: ch, position: i });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", text: ch, position: i });
      i += 1;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPERATORS.includes(two)) {
      tokens.push({ type: "operator", text: two, position: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPERATORS.includes(ch)) {
      tokens.push({ type: "operator", text: ch, position: i });
      i += 1;
      continue;
    }

    throw new FormulaError(`\`${ch}\` does not mean anything in a formula.`, i);
  }

  tokens.push({ type: "end", text: "", position: source.length });
  return tokens;
}

// ─── parser ──────────────────────────────────────────────────────────────────
//
// Precedence, loosest first:
//   comparison  =  !=  <>  <  <=  >  >=
//   concat      &
//   additive    +  -
//   multiplicative  *  /  %
//   unary       -
//   primary     literal · {reference} · FUNC(…) · ( … )

const COMPARISON_OPERATORS = ["=", "!=", "<>", "<", "<=", ">", ">="];

class Parser {
  private readonly tokens: Token[];
  private index = 0;
  readonly references: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private matchOperator(candidates: readonly string[]): Token | null {
    const token = this.peek();
    if (token.type === "operator" && candidates.includes(token.text)) {
      this.index += 1;
      return token;
    }
    return null;
  }

  parseProgram(): FormulaAst {
    const expression = this.parseComparison();
    const trailing = this.peek();
    if (trailing.type !== "end") {
      throw new FormulaError(
        `Nothing should follow the formula here — remove \`${trailing.text}\`.`,
        trailing.position,
      );
    }
    return expression;
  }

  private parseComparison(): FormulaAst {
    let left = this.parseConcat();
    let operator = this.matchOperator(COMPARISON_OPERATORS);
    while (operator) {
      const right = this.parseConcat();
      left = {
        kind: "binary",
        operator: operator.text as BinaryOperator,
        left,
        right,
        position: operator.position,
      };
      operator = this.matchOperator(COMPARISON_OPERATORS);
    }
    return left;
  }

  private parseConcat(): FormulaAst {
    let left = this.parseAdditive();
    let operator = this.matchOperator(["&"]);
    while (operator) {
      const right = this.parseAdditive();
      left = {
        kind: "binary",
        operator: "&",
        left,
        right,
        position: operator.position,
      };
      operator = this.matchOperator(["&"]);
    }
    return left;
  }

  private parseAdditive(): FormulaAst {
    let left = this.parseMultiplicative();
    let operator = this.matchOperator(["+", "-"]);
    while (operator) {
      const right = this.parseMultiplicative();
      left = {
        kind: "binary",
        operator: operator.text as BinaryOperator,
        left,
        right,
        position: operator.position,
      };
      operator = this.matchOperator(["+", "-"]);
    }
    return left;
  }

  private parseMultiplicative(): FormulaAst {
    let left = this.parseUnary();
    let operator = this.matchOperator(["*", "/", "%"]);
    while (operator) {
      const right = this.parseUnary();
      left = {
        kind: "binary",
        operator: operator.text as BinaryOperator,
        left,
        right,
        position: operator.position,
      };
      operator = this.matchOperator(["*", "/", "%"]);
    }
    return left;
  }

  private parseUnary(): FormulaAst {
    const minus = this.matchOperator(["-"]);
    if (minus) {
      return {
        kind: "unary",
        operator: "-",
        operand: this.parseUnary(),
        position: minus.position,
      };
    }
    // A leading `+` is harmless and people type it; accept and ignore it.
    const plus = this.matchOperator(["+"]);
    if (plus) return this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaAst {
    const token = this.next();

    if (token.type === "number") {
      return { kind: "number", value: Number(token.text), position: token.position };
    }

    if (token.type === "string") {
      return { kind: "string", value: token.text, position: token.position };
    }

    if (token.type === "reference") {
      if (!this.references.includes(token.text)) this.references.push(token.text);
      return { kind: "reference", name: token.text, position: token.position };
    }

    if (token.type === "paren-open") {
      const inner = this.parseComparison();
      const close = this.next();
      if (close.type !== "paren-close") {
        throw new FormulaError(
          "This opening bracket `(` never closes.",
          token.position,
        );
      }
      return inner;
    }

    if (token.type === "identifier") {
      const upper = token.text.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") {
        return {
          kind: "boolean",
          value: upper === "TRUE",
          position: token.position,
        };
      }
      if (!(FUNCTION_NAMES as string[]).includes(upper)) {
        throw new FormulaError(
          `There is no function called \`${token.text}\`. A column goes in braces, like {${token.text}}.`,
          token.position,
        );
      }
      const name = upper as FormulaFunctionName;
      const open = this.next();
      if (open.type !== "paren-open") {
        throw new FormulaError(
          `\`${name}\` needs brackets after it, like ${FUNCTION_SPECS[name].signature}.`,
          token.position,
        );
      }
      const args: FormulaAst[] = [];
      if (this.peek().type === "paren-close") {
        this.index += 1;
      } else {
        for (;;) {
          args.push(this.parseComparison());
          const separator = this.next();
          if (separator.type === "comma") continue;
          if (separator.type === "paren-close") break;
          throw new FormulaError(
            `\`${name}\` is missing a comma or its closing bracket.`,
            separator.position,
          );
        }
      }
      const spec = FUNCTION_SPECS[name];
      if (args.length < spec.min || args.length > spec.max) {
        throw new FormulaError(
          `\`${name}\` was given ${args.length} value${args.length === 1 ? "" : "s"}. Use ${spec.signature}.`,
          token.position,
        );
      }
      return { kind: "call", name, args, position: token.position };
    }

    if (token.type === "end") {
      throw new FormulaError("The formula stops before it is finished.", token.position);
    }

    throw new FormulaError(
      `\`${token.text}\` cannot start a value here.`,
      token.position,
    );
  }
}

/**
 * Turn formula text into an AST plus the list of columns it reads.
 *
 * `references` holds every `{…}` name exactly as typed, in first-use order —
 * the caller resolves them (display name OR machine field name) through its own
 * lookup, so this module never needs to know the table.
 */
export function parseFormula(source: string): ParseResult {
  try {
    const text = source ?? "";
    if (text.trim() === "") {
      return { ok: false, error: "This formula is empty.", position: 0 };
    }
    const parser = new Parser(tokenize(text));
    const ast = parser.parseProgram();
    return { ok: true, ast, references: parser.references };
  } catch (error) {
    if (error instanceof FormulaError) {
      return { ok: false, error: error.message, position: error.position };
    }
    return {
      ok: false,
      error: "This formula could not be read.",
      position: 0,
    };
  }
}

// ─── value coercion ──────────────────────────────────────────────────────────

const MISSING = Symbol("missing-column");

function isBlank(value: FormulaValue): boolean {
  return value === null || value === "";
}

/** Shortest exact decimal for a number — keeps `0.1 + 0.2` out of the cell. */
function numberToText(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const trimmed = Number(n.toPrecision(15));
  return String(Number.isFinite(trimmed) ? trimmed : n);
}

function toText(value: FormulaValue): string {
  if (value === null) return "";
  if (typeof value === "number") return numberToText(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}

/** A number, or `null` when the value simply is not one. BLANK reads as 0. */
function looseNumber(value: FormulaValue): number | null {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const cleaned = value.replace(/[,\s$€£¥%]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function requireNumber(value: FormulaValue, what: string): number {
  const n = looseNumber(value);
  if (n === null) {
    throw new FormulaError(`${what} needs a number, but got "${toText(value)}".`);
  }
  return n;
}

function truthy(value: FormulaValue): boolean {
  if (value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
}

/** Both sides numeric? compare as numbers. Otherwise compare as text. */
function compareValues(left: FormulaValue, right: FormulaValue): number {
  const looksNumeric = (v: FormulaValue) =>
    typeof v === "number" ||
    (typeof v === "string" && v.trim() !== "" && looseNumber(v) !== null);
  // BLANK takes the shape of whatever it is compared against: 0 beside a
  // number, "" beside text. `{Empty} = 0` and `{Empty} = ''` are both true.
  if (isBlank(left) && isBlank(right)) return 0;
  const blankBesideNumber =
    (isBlank(left) && looksNumeric(right)) ||
    (isBlank(right) && looksNumeric(left));
  if (blankBesideNumber || (looksNumeric(left) && looksNumeric(right))) {
    const a = looseNumber(left) ?? 0;
    const b = looseNumber(right) ?? 0;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    const a = truthy(left);
    const b = truthy(right);
    return a === b ? 0 : a ? 1 : -1;
  }
  const a = toText(left);
  const b = toText(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── dates ───────────────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

type ParsedDate = { ms: number; dateOnly: boolean };

function requireDate(value: FormulaValue, what: string): ParsedDate {
  if (value === null || value === "") {
    throw new FormulaError(`${what} needs a date, but that value is empty.`);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const ms = Date.parse(trimmed);
    if (!Number.isNaN(ms)) return { ms, dateOnly: DATE_ONLY_RE.test(trimmed) };
  }
  throw new FormulaError(`${what} needs a date, but got "${toText(value)}".`);
}

function isoFrom(ms: number, dateOnly: boolean): string {
  const iso = new Date(ms).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}

const DATEDIFF_UNITS: Record<string, number> = {
  days: 86_400_000,
  hours: 3_600_000,
  minutes: 60_000,
};

function requireUnit(
  value: FormulaValue,
  allowed: string[],
  fn: string,
): string {
  const unit = toText(value).trim().toLowerCase();
  if (!allowed.includes(unit)) {
    throw new FormulaError(
      `\`${fn}\` needs one of ${allowed.map((u) => `'${u}'`).join(", ")} — got "${toText(value)}".`,
    );
  }
  return unit;
}

/** Add months/years in UTC, clamping to the end of a shorter month. */
function addMonths(ms: number, count: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const target = new Date(ms);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

// ─── evaluator ───────────────────────────────────────────────────────────────

/** SUM-style: flatten args, drop blanks, demand numbers of the rest. */
function numericArgs(values: FormulaValue[], fn: string): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (isBlank(value)) continue;
    out.push(requireNumber(value, `\`${fn}\``));
  }
  return out;
}

function roundHalfAway(n: number, places: number): number {
  const factor = 10 ** places;
  const scaled = n * factor;
  // Nudge past the float representation of an exact half (1.005 * 100 = 100.49999…).
  const corrected = Number(scaled.toPrecision(15));
  const rounded =
    corrected < 0 ? -Math.round(-corrected) : Math.round(corrected);
  return rounded / factor;
}

function callFunction(
  name: FormulaFunctionName,
  args: FormulaValue[],
): FormulaValue {
  switch (name) {
    case "SUM":
      return numericArgs(args, "SUM").reduce((a, b) => a + b, 0);
    case "MIN": {
      const nums = numericArgs(args, "MIN");
      return nums.length === 0 ? null : Math.min(...nums);
    }
    case "MAX": {
      const nums = numericArgs(args, "MAX");
      return nums.length === 0 ? null : Math.max(...nums);
    }
    case "AVERAGE": {
      const nums = numericArgs(args, "AVERAGE");
      if (nums.length === 0) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "ROUND": {
      const n = requireNumber(args[0], "`ROUND`");
      const places =
        args.length > 1 ? Math.trunc(requireNumber(args[1], "`ROUND`")) : 0;
      return roundHalfAway(n, places);
    }
    case "ABS":
      return Math.abs(requireNumber(args[0], "`ABS`"));
    case "LEN":
      return toText(args[0]).length;
    case "UPPER":
      return toText(args[0]).toUpperCase();
    case "LOWER":
      return toText(args[0]).toLowerCase();
    case "TRIM":
      return toText(args[0]).trim();
    case "CONCATENATE":
      return args.map(toText).join("");
    case "LEFT": {
      const count = Math.trunc(requireNumber(args[1], "`LEFT`"));
      return toText(args[0]).slice(0, Math.max(0, count));
    }
    case "RIGHT": {
      const count = Math.trunc(requireNumber(args[1], "`RIGHT`"));
      if (count <= 0) return "";
      return toText(args[0]).slice(-count);
    }
    case "CONTAINS":
      return toText(args[0]).toLowerCase().includes(toText(args[1]).toLowerCase());
    case "NOT":
      return !truthy(args[0]);
    case "BLANK":
      return null;
    case "ISBLANK":
      return isBlank(args[0]);
    case "TODAY":
      return new Date().toISOString().slice(0, 10);
    case "NOW":
      return new Date().toISOString();
    case "DATEDIFF": {
      const from = requireDate(args[0], "`DATEDIFF`");
      const to = requireDate(args[1], "`DATEDIFF`");
      const unit = requireUnit(args[2], Object.keys(DATEDIFF_UNITS), "DATEDIFF");
      return Math.trunc((to.ms - from.ms) / DATEDIFF_UNITS[unit]);
    }
    case "YEAR":
      return new Date(requireDate(args[0], "`YEAR`").ms).getUTCFullYear();
    case "MONTH":
      return new Date(requireDate(args[0], "`MONTH`").ms).getUTCMonth() + 1;
    case "DAY":
      return new Date(requireDate(args[0], "`DAY`").ms).getUTCDate();
    case "DATEADD": {
      const base = requireDate(args[0], "`DATEADD`");
      const count = Math.trunc(requireNumber(args[1], "`DATEADD`"));
      const unit = requireUnit(args[2], ["days", "months", "years"], "DATEADD");
      const ms =
        unit === "days"
          ? base.ms + count * 86_400_000
          : addMonths(base.ms, unit === "months" ? count : count * 12);
      return isoFrom(ms, base.dateOnly);
    }
    // IF / AND / OR short-circuit in `evaluateNode` and never reach here.
    case "IF":
    case "AND":
    case "OR":
      throw new FormulaError(`\`${name}\` could not be evaluated.`);
  }
}

function applyBinary(
  operator: BinaryOperator,
  left: FormulaValue,
  right: FormulaValue,
): FormulaValue {
  switch (operator) {
    case "&":
      return toText(left) + toText(right);
    case "+":
      return (
        requireNumber(left, "`+`") + requireNumber(right, "`+`")
      );
    case "-":
      return requireNumber(left, "`-`") - requireNumber(right, "`-`");
    case "*":
      return requireNumber(left, "`*`") * requireNumber(right, "`*`");
    case "/": {
      const divisor = requireNumber(right, "`/`");
      if (divisor === 0) {
        throw new FormulaError("This formula divides by zero.");
      }
      return requireNumber(left, "`/`") / divisor;
    }
    case "%": {
      const divisor = requireNumber(right, "`%`");
      if (divisor === 0) {
        throw new FormulaError("This formula divides by zero.");
      }
      return requireNumber(left, "`%`") % divisor;
    }
    case "=":
      return compareValues(left, right) === 0;
    case "!=":
    case "<>":
      return compareValues(left, right) !== 0;
    case "<":
      return compareValues(left, right) < 0;
    case "<=":
      return compareValues(left, right) <= 0;
    case ">":
      return compareValues(left, right) > 0;
    case ">=":
      return compareValues(left, right) >= 0;
  }
}

function normalizeCell(raw: unknown, name: string): FormulaValue {
  if (raw === MISSING) {
    throw new FormulaError(`There is no column called {${name}}.`);
  }
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" || typeof raw === "boolean") return raw;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      throw new FormulaError(`The value in {${name}} is not a usable number.`);
    }
    return raw;
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  // Arrays and objects have no scalar reading; JSON keeps them legible.
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function evaluateNode(node: FormulaAst, resolve: ResolveCell): FormulaValue {
  switch (node.kind) {
    case "number":
    case "string":
    case "boolean":
      return node.value;
    case "reference": {
      const raw = resolve(node.name);
      // `undefined` means the column does not exist; a blank cell is null/"".
      return normalizeCell(raw === undefined ? MISSING : raw, node.name);
    }
    case "unary":
      return -requireNumber(evaluateNode(node.operand, resolve), "`-`");
    case "binary":
      return applyBinary(
        node.operator,
        evaluateNode(node.left, resolve),
        evaluateNode(node.right, resolve),
      );
    case "call": {
      if (node.name === "IF") {
        const condition = truthy(evaluateNode(node.args[0], resolve));
        if (condition) return evaluateNode(node.args[1], resolve);
        return node.args.length > 2 ? evaluateNode(node.args[2], resolve) : null;
      }
      if (node.name === "AND") {
        for (const arg of node.args) {
          if (!truthy(evaluateNode(arg, resolve))) return false;
        }
        return true;
      }
      if (node.name === "OR") {
        for (const arg of node.args) {
          if (truthy(evaluateNode(arg, resolve))) return true;
        }
        return false;
      }
      return callFunction(
        node.name,
        node.args.map((arg) => evaluateNode(arg, resolve)),
      );
    }
  }
}

/**
 * Compute one cell. NEVER throws.
 *
 * `resolve(name)` is given the name exactly as it was typed between the braces
 * and must return the cell's value, or `undefined` when no such column exists —
 * the difference between "empty" and "misspelt", which is the difference
 * between a working formula and a wrong answer.
 */
export function evaluateFormula(
  ast: FormulaAst,
  resolve: ResolveCell,
): FormulaResult {
  try {
    const value = evaluateNode(ast, resolve);
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { ok: false, error: "This formula produced a number too large to show." };
    }
    return { ok: true, value };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message };
    return { ok: false, error: "This formula could not be calculated." };
  }
}

// ─── static result type ──────────────────────────────────────────────────────

/**
 * Best-effort: what kind of value will this formula produce? The UI uses it to
 * pick a sensible display format for the computed column. `unknown` is always a
 * legal answer — never guess a format on a shaky reading.
 */
export function formulaResultType(
  ast: FormulaAst,
  columnType: ResolveColumnType,
): FormulaResultType {
  switch (ast.kind) {
    case "number":
      return "number";
    case "string":
      return "text";
    case "boolean":
      return "boolean";
    case "unary":
      return "number";
    case "reference":
      return columnType(ast.name) ?? "unknown";
    case "binary": {
      if (ast.operator === "&") return "text";
      if (COMPARISON_OPERATORS.includes(ast.operator)) return "boolean";
      return "number";
    }
    case "call": {
      if (ast.name === "IF") {
        const then = formulaResultType(ast.args[1], columnType);
        if (ast.args.length < 3) return then;
        const otherwise = formulaResultType(ast.args[2], columnType);
        if (then === otherwise) return then;
        if (then === "unknown") return otherwise;
        if (otherwise === "unknown") return then;
        return "unknown";
      }
      if (ast.name === "MIN" || ast.name === "MAX") {
        // MIN/MAX over dates is still dates; over anything else, a number.
        const types = ast.args.map((a) => formulaResultType(a, columnType));
        if (types.length > 0 && types.every((t) => t === "date")) return "date";
        return "number";
      }
      return FUNCTION_SPECS[ast.name].result;
    }
  }
}
