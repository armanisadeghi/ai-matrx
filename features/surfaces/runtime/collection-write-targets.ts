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
