/**
 * features/surfaces/runtime/collection-write-targets.ts
 *
 * ONE way to make a page's records agent-writable: create / update / delete a
 * LIST of one record type, through the page's own save functions.
 *
 * A page supplies, per record type, only what is specific to it — how to read
 * and check the agent's list (pure, throws a sentence the agent can act on)
 * and how to save one item (the page's canonical create/update/delete). This
 * module supplies everything that must behave identically on every page:
 *
 *  - the target names: `create_<plural>`, `update_<plural>`, `delete_<plural>`;
 *  - `validate` runs the WHOLE-list check before the person's approval card
 *    (a bad list is refused and no card is shown);
 *  - `apply` re-checks against the live page, then saves item by item;
 *  - a failure part-way names what was already done and what was not
 *    attempted, so a retry never duplicates;
 *  - the result tells the agent exactly what landed (ids, names), because the
 *    page snapshot the agent holds was taken when its run started and will
 *    not show the new records.
 *
 * A page with five record types calls this five times. Worked example:
 * `features/education/classes/components/ClassesHome.tsx`.
 */

import type {
  SurfaceWriteHandlerEntry,
  SurfaceWriteOutcome,
} from "./SurfaceRuntimeContext";

/** How a saved record is reported back to the agent. */
export interface CollectionRecordRef {
  id: string;
  name: string;
  slug?: string | null;
}

/** One operation (create, update or delete) over a list of one record type. */
export interface CollectionOperation<TPlan> {
  /**
   * Read and check the agent's whole value. Pure; throws a sentence the agent
   * can act on. Runs before the approval card AND again at apply time against
   * the live page (records may have changed while the card was open).
   */
  parse: (value: unknown) => TPlan[];
  /** Save one planned item through the page's own save function. */
  run: (plan: TPlan) => Promise<CollectionRecordRef>;
  /** How the item is named in a part-way failure message. */
  nameOf: (plan: TPlan) => string;
  /** Optional: which fields an update changed, reported per item. */
  changedOf?: (plan: TPlan) => string[];
  /**
   * Optional: turn an error from `run` into a refusal instead of a failure
   * (e.g. the person closed the workspace picker before anything was saved).
   * Return nothing to treat it as an ordinary failure.
   */
  refusalFor?: (error: unknown, savedSoFar: number) => string | undefined;
}

export interface CollectionWriteSpec {
  /** Plural record noun used in target names and messages: "classes". */
  plural: string;
  /** Singular noun for messages: "class". */
  singular: string;
  create?: CollectionOperation<any>;
  update?: CollectionOperation<any>;
  delete?: CollectionOperation<any>;
}

/** Thrown to refuse a write with a reason (the seam reports it as a refusal). */
export type Refuse = (message: string) => never;

const VERBS = { create: "Created", update: "Updated", delete: "Deleted" } as const;

/**
 * Read the list an agent sent. Accepts a bare array or `{ <plural>: [...] }`.
 * The seam has already turned a JSON string into a real value.
 */
export function readCollectionList(
  target: string,
  plural: string,
  value: unknown,
  max = 25,
): unknown[] {
  const list =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as Record<string, unknown>)[plural])
      ? ((value as Record<string, unknown>)[plural] as unknown[])
      : value;
  if (!Array.isArray(list))
    throw new Error(
      `${target} expects an ARRAY of ${plural}; received ${
        value === null ? "null" : typeof value
      }. For one item send a list of one.`,
    );
  if (list.length === 0) throw new Error(`${target} needs at least one item.`);
  if (list.length > max)
    throw new Error(
      `${target} takes at most ${max} items per write; received ${list.length}. Split the list.`,
    );
  return list;
}

/** Refuse keys that repeat within one list (names, ids). */
export function refuseRepeats(
  target: string,
  keys: readonly string[],
  what: string,
): void {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const key of keys) {
    const k = key.trim().toLowerCase();
    if (seen.has(k)) repeated.add(key);
    seen.add(k);
  }
  if (repeated.size > 0)
    throw new Error(
      `${target} lists the same ${what} more than once: ${[...repeated].join(", ")}. Nothing was changed.`,
    );
}

/**
 * The repeat problem for keys that repeat within one list, or nothing.
 * `keys` is ALIGNED to the list (index i = item i; null/undefined skipped),
 * so the message names every position a repeat sits at.
 */
export function repeatsProblem(
  target: string,
  keys: readonly (string | null | undefined)[],
  what: string,
  advice = "Keep one of each.",
): string | undefined {
  const at = new Map<string, { label: string; positions: number[] }>();
  keys.forEach((key, i) => {
    if (typeof key !== "string" || !key.trim()) return;
    const k = key.trim().toLowerCase();
    const entry = at.get(k) ?? { label: key.trim(), positions: [] };
    entry.positions.push(i);
    at.set(k, entry);
  });
  const repeated = [...at.values()].filter((e) => e.positions.length > 1);
  if (repeated.length === 0) return undefined;
  return `${target} lists the same ${what} more than once: ${repeated
    .map((e) => `"${e.label}" (at ${e.positions.map((p) => `[${p}]`).join(", ")})`)
    .join("; ")}. ${advice}`;
}

// ─── Reporting EVERY problem at once ─────────────────────────────────────────
//
// Owner ruling 2026-09-27: a rejected list reports every problem in one
// refusal, never just the first, so the agent can fix everything in one retry.
// Per-item problems come first (in list order), then list-level ones
// (repeats within the list, clashes with existing records, unknown ids).

const NOTHING_CHANGED = /\s*Nothing was (?:changed|created|deleted|saved|sent|posted|removed|answered|copied)\.\s*$/;

/** Throw from a per-item check to report a LIST-level problem (e.g. an unknown id). */
export class ListLevelProblem extends Error {}

/** A refusal carrying several problems. `message` is the numbered list. */
export class WriteProblemsError extends Error {
  readonly problems: string[];
  constructor(target: string, problems: string[]) {
    super(formatProblems(target, problems));
    this.name = "WriteProblemsError";
    this.problems = problems;
  }
}

/** The problem sentences an error carries (one for an ordinary Error). */
export function problemsOf(error: unknown): string[] {
  if (error instanceof WriteProblemsError) return error.problems;
  const message = error instanceof Error ? error.message : String(error);
  return [message || "unknown problem"];
}

/** One refusal text: every problem, numbered, ending "Nothing was changed." */
export function formatProblems(target: string, problems: readonly string[]): string {
  const clean = problems.map((p) => p.replace(NOTHING_CHANGED, "").trim());
  if (clean.length === 1) return `${clean[0]} Nothing was changed.`;
  return `${target} was refused: ${clean.length} problems.\n${clean
    .map((p, i) => `${i + 1}. ${p}`)
    .join("\n")}\nFix all of them and send the whole value again. Nothing was changed.`;
}

/**
 * Collects problems for one value; `throwIfAny` throws them together. For
 * checks over ONE object's fields (a draft, a view change) and inside one
 * list item (nest it: `collectProblems` flattens what it throws).
 */
export class ProblemList {
  readonly problems: string[] = [];
  constructor(readonly target: string) {}
  /** Record a problem; falsy values are ignored so `add(check())` reads well. */
  add(problem: string | null | undefined | false): void {
    if (problem) this.problems.push(problem);
  }
  /** Run a check; whatever it throws is recorded and `undefined` returned. */
  check<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.problems.push(...problemsOf(error));
      return undefined;
    }
  }
  get ok(): boolean {
    return this.problems.length === 0;
  }
  throwIfAny(): void {
    if (this.problems.length) throw new WriteProblemsError(this.target, this.problems);
  }
}

/** One list item after its per-item check, as list-level checks see it. */
export interface CheckedItem<TOut> {
  index: number;
  raw: unknown;
  /** The item's name when it could be read (even if the item is invalid). */
  name?: string;
  /** True when the per-item check passed; `value` is its result. */
  ok: boolean;
  value?: TOut;
}

export interface CollectProblemsOptions<TOut> {
  /** The item's name, read from the RAW item, to label its problems. */
  nameOf?: (raw: unknown, index: number) => string | null | undefined;
  /**
   * List-level checks over EVERY item (valid or not; see `ok`). Return the
   * problems (falsy entries are ignored): repeats, clashes with existing
   * records. They are reported after every per-item problem.
   */
  listChecks?: (items: CheckedItem<TOut>[]) => readonly (string | null | undefined | false)[];
}

function labelProblem(target: string, index: number, name: string | undefined, message: string): string {
  const position = `${target}[${index}]`;
  const label = name ? `${position} "${name}"` : position;
  if (!message.startsWith(position)) return `${label}: ${message}`;
  if (!name) return message;
  const rest = message.slice(position.length);
  return rest.startsWith(".") ? `${label}: ${rest.slice(1)}` : `${label}${rest}`;
}

/**
 * Check every item of a list and report EVERY problem at once. `checkOne`
 * reads one item and throws on a problem (an Error, a `WriteProblemsError`
 * for several, or a `ListLevelProblem` for a problem that belongs with the
 * list-level ones, such as an unknown id). Each per-item problem is labelled
 * with the item's position and name. Throws one `WriteProblemsError` listing
 * all of them, numbered, ending "Nothing was changed."; returns the results
 * when there are none.
 */
export function collectProblems<TOut>(
  target: string,
  items: readonly unknown[],
  checkOne: (raw: unknown, index: number) => TOut,
  options: CollectProblemsOptions<TOut> = {},
): TOut[] {
  const itemProblems: string[] = [];
  const listProblems: string[] = [];
  const checked: CheckedItem<TOut>[] = items.map((raw, index) => {
    let name: string | undefined;
    try {
      const n = options.nameOf?.(raw, index);
      name = typeof n === "string" && n.trim() ? n.trim() : undefined;
    } catch {
      name = undefined;
    }
    try {
      return { index, raw, name, ok: true, value: checkOne(raw, index) };
    } catch (error) {
      if (error instanceof ListLevelProblem) listProblems.push(error.message);
      else
        for (const problem of problemsOf(error))
          itemProblems.push(labelProblem(target, index, name, problem));
      return { index, raw, name, ok: false };
    }
  });
  for (const problem of options.listChecks?.(checked) ?? [])
    if (problem) listProblems.push(problem);
  const all = [...itemProblems, ...listProblems];
  if (all.length) throw new WriteProblemsError(target, all);
  return checked.map((c) => c.value as TOut);
}

function describe(ref: CollectionRecordRef): string {
  return `"${ref.name}" (id ${ref.id}${ref.slug ? `, slug ${ref.slug}` : ""})`;
}

function entryFor(
  op: "create" | "update" | "delete",
  operation: CollectionOperation<any>,
  spec: CollectionWriteSpec,
  refuse: Refuse,
): SurfaceWriteHandlerEntry {
  const verb = VERBS[op];
  const noun = (n: number) => (n === 1 ? spec.singular : spec.plural);
  return {
    validate: (value) => {
      operation.parse(value);
    },
    apply: async (value): Promise<SurfaceWriteOutcome> => {
      const plans = operation.parse(value);
      const done: CollectionRecordRef[] = [];
      const changed: string[][] = [];
      for (const [i, plan] of plans.entries()) {
        try {
          done.push(await operation.run(plan));
          changed.push(operation.changedOf?.(plan) ?? []);
        } catch (error) {
          const refusal = operation.refusalFor?.(error, done.length);
          if (refusal && done.length === 0) refuse(refusal);
          const rest = plans.slice(i + 1).map(operation.nameOf);
          throw new Error(
            `${verb} ${done.length} of ${plans.length} ${spec.plural}${
              done.length ? ` (${done.map(describe).join(", ")})` : ""
            }. "${operation.nameOf(plan)}" failed: ${
              error instanceof Error && error.message ? error.message : "unknown error"
            }.${rest.length ? ` Not attempted: ${rest.join(", ")}.` : ""}`,
          );
        }
      }
      const lines = done.map(
        (ref, i) => `${describe(ref)}${changed[i]?.length ? ` [${changed[i].join(", ")}]` : ""}`,
      );
      return {
        summary: `${verb} ${done.length} ${noun(done.length)}: ${lines.join("; ")}.`,
        data: {
          [spec.plural]: done.map((ref) => ({
            id: ref.id,
            name: ref.name,
            ...(ref.slug !== undefined ? { slug: ref.slug } : {}),
          })),
        },
      };
    },
  };
}

/**
 * The handler entries for one record type, keyed by target name. Spread the
 * result of each call into the page's `getWriteHandlers` return.
 */
export function collectionWriteHandlers(
  spec: CollectionWriteSpec,
  refuse: Refuse,
): Record<string, SurfaceWriteHandlerEntry> {
  const out: Record<string, SurfaceWriteHandlerEntry> = {};
  if (spec.create) out[`create_${spec.plural}`] = entryFor("create", spec.create, spec, refuse);
  if (spec.update) out[`update_${spec.plural}`] = entryFor("update", spec.update, spec, refuse);
  if (spec.delete) out[`delete_${spec.plural}`] = entryFor("delete", spec.delete, spec, refuse);
  return out;
}
