// lib/contract/narrow.ts
//
// THE SHARED READER KIT FOR ANY BOUNDARY THE SERVER SPEAKS ACROSS.
//
// 🚨 WHY THIS EXISTS — the defect it closes, so nobody deletes it.
// On 2026-09-17 `/exports` crashed on every load with React's "Objects are not
// valid as a React child (found: object with keys {label, block})". The live
// server answered `GET /media/export-adapters` with `recognised_not_readable`
// as a LIST of `{label, block}` objects where the hand-written interface said
// `number`; the fetch layer asserted the body with a generic type parameter
// (a PROMISE, not a check) and the component put the value straight into a JSX
// child position. One renamed server key took the whole screen to the global
// error boundary before a single pixel painted.
//
// 🚨 WHY A TYPE ALONE CANNOT FIX IT. A generic type parameter on a fetch
// helper is erased at run time: it describes what we HOPE arrived. Where the
// server declares a route `-> dict[str, Any]`, even a generated type is
// `Record<string, unknown>` and would have caught none of it. Until a route
// publishes a response MODEL, the only thing that can make a shape true is a
// runtime check — and this file is the kit every feature builds those checks
// out of, so the next boundary does not re-invent (or skip) them.
//
// 🚨 WHY NOT ZOD (which this repo already depends on). The sentence is the
// product here, not the validation: every failure must read as one plain
// English line naming the field, what was expected and what arrived, with no
// stack, no issue array and no library vocabulary — and `features/exports`
// asserts that exact wording. A schema library would need a bespoke error
// formatter per call site to produce it, which is the duplication this kit
// removes. Reach for zod where a SCHEMA is the deliverable (forms, generated
// validators); reach for this where a SCREEN must stay honest.
//
// THE RULE THIS ENFORCES, wherever it is used: a component may only render a
// value one of these readers returned.
//
// HOW A FEATURE USES IT:
//
//   export class MyContractError extends ContractError {
//     constructor(field: string, expected: string, got: string) {
//       super(field, expected, got);
//       this.name = "MyContractError";
//     }
//   }
//   const { obj, str, num } = createReaders(
//     (field, expected, got) => new MyContractError(field, expected, got),
//   );
//
// The factory exists because a feature's boundary error usually has to be
// catchable as that feature's own error type (`features/source-library`'s
// extends `MediaApiError`, so every screen that already prints a server
// refusal prints an unreadable shape the same way, with no new branch).

/** A map of counts, the shape a `counts_by_*` field always takes. */
export type CountMap = Record<string, number>;

/**
 * The one sentence every unreadable shape produces.
 *
 * It is the product, not a log line: it names the field, what was expected and
 * what arrived, and it promises out loud that nothing was guessed. Changing a
 * byte of it changes what people read on a broken screen —
 * `features/exports/contract.test.tsx` asserts on its wording.
 */
export function contractSentence(field: string, expected: string, got: string): string {
  return (
    `The server sent this screen a shape it cannot read: "${field}" should be ` +
    `${expected} and arrived as ${got}. Nothing has been guessed or hidden — ` +
    `this part of the screen stays empty until the server and this screen ` +
    `agree again.`
  );
}

/**
 * The server sent something this screen cannot render.
 *
 * `message` is the sentence a person reads. It names the field, what was
 * expected, and what arrived — never a stack, never "something went wrong".
 */
export class ContractError extends Error {
  readonly field: string;
  readonly expected: string;
  readonly got: string;

  constructor(field: string, expected: string, got: string) {
    super(contractSentence(field, expected, got));
    this.name = "ContractError";
    this.field = field;
    this.expected = expected;
    this.got = got;
  }
}

/** What arrived, in the words a person can read — never `[object Object]`. */
export function describe(value: unknown): string {
  if (value === null) return "nothing (null)";
  if (value === undefined) return "nothing at all (the field was missing)";
  if (Array.isArray(value)) {
    return value.length === 1 ? "a list of 1 entry" : `a list of ${value.length} entries`;
  }
  switch (typeof value) {
    case "string":
      return "text";
    case "number":
      return Number.isFinite(value) ? "a number" : "a number that is not finite";
    case "boolean":
      return "true/false";
    case "object": {
      const keys = Object.keys(value as object);
      return keys.length
        ? `an object with keys {${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""}}`
        : "an empty object";
    }
    default:
      return `a ${typeof value}`;
  }
}

/**
 * How a feature turns a broken field into ITS OWN error type.
 *
 * `got` is already the readable description — a factory never calls
 * `describe()` itself.
 */
export type ContractErrorFactory = (field: string, expected: string, got: string) => Error;

/** The primitive readers, bound to one feature's error type. */
export interface Readers {
  /** Throw this boundary's error for `field`. Returns `never`. */
  fail(field: string, expected: string, value: unknown): never;
  obj(value: unknown, field: string): Record<string, unknown>;
  arr(value: unknown, field: string): unknown[];
  str(value: unknown, field: string): string;
  optStr(value: unknown, field: string): string | null;
  num(value: unknown, field: string): number;
  optNum(value: unknown, field: string): number | null;
  bool(value: unknown, field: string): boolean;
  optBool(value: unknown, field: string, fallback: boolean): boolean;
  strList(value: unknown, field: string): string[];
  countMap(value: unknown, field: string): CountMap;
}

/**
 * Build the reader set for one boundary.
 *
 * Every reader takes the value AND the field path, because the path is what
 * makes the sentence actionable: "adapters[0].label", not "a field".
 */
export function createReaders(raise: ContractErrorFactory): Readers {
  function fail(field: string, expected: string, value: unknown): never {
    throw raise(field, expected, describe(value));
  }

  function obj(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(field, "an object", value);
    }
    return value as Record<string, unknown>;
  }

  function arr(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) fail(field, "a list", value);
    return value;
  }

  function str(value: unknown, field: string): string {
    if (typeof value !== "string") fail(field, "text", value);
    return value;
  }

  function optStr(value: unknown, field: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") fail(field, "text or nothing", value);
    return value;
  }

  function num(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(field, "a number", value);
    }
    return value;
  }

  function optNum(value: unknown, field: string): number | null {
    if (value === undefined || value === null) return null;
    return num(value, field);
  }

  function bool(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") fail(field, "true or false", value);
    return value;
  }

  function optBool(value: unknown, field: string, fallback: boolean): boolean {
    if (value === undefined || value === null) return fallback;
    return bool(value, field);
  }

  function strList(value: unknown, field: string): string[] {
    return arr(value, field).map((entry, index) => str(entry, `${field}[${index}]`));
  }

  function countMap(value: unknown, field: string): CountMap {
    const source = obj(value, field);
    const out: CountMap = {};
    for (const [key, entry] of Object.entries(source)) {
      out[key] = num(entry, `${field}.${key}`);
    }
    return out;
  }

  return { fail, obj, arr, str, optStr, num, optNum, bool, optBool, strList, countMap };
}

/**
 * A field this screen can do without.
 *
 * 🚨 A STAND-IN ANNOUNCES ITSELF. When a redundant field (a count that the list
 * beside it already proves) arrives wrong, the screen does NOT die and does NOT
 * quietly paper over it: the derived value is used AND the problem is pushed
 * onto `problems`, which the component shows. Required fields never come
 * through here — they throw.
 */
export function recovered<T>(
  problems: string[],
  field: string,
  expected: string,
  value: unknown,
  read: () => T,
  fallback: () => T,
): T {
  try {
    return read();
  } catch {
    problems.push(
      `The server's "${field}" should be ${expected} and arrived as ` +
        `${describe(value)}. This screen worked it out from the list instead, ` +
        `so the number below is counted here rather than reported by the server.`,
    );
    return fallback();
  }
}

/** A parse that survived, plus every stand-in it had to announce. */
export interface Parsed<T> {
  value: T;
  /** Empty when the server said exactly what it promised. */
  problems: string[];
}
