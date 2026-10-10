// features/education/convert/runKey.ts
//
// THE RUN KEY: one kit run names every artifact it creates. A tab that dies
// after an artifact's create (before the kit edge is written) is resumed by the
// same run, which finds its artifact by this key and adopts it instead of making
// a second one beside the kit. Every artifact writer (deck, quiz, practice test,
// notes, summary, mind map, memory aid, audio) stamps it under the same
// metadata/config field and finds it with the same filter.

import type { SectionJournal } from "./sectionJournal";

/** The field a run's artifact carries (`metadata.run_key` / `config.run_key`). */
export const RUN_KEY_FIELD = "run_key";

/** PostgREST JSON-path filter column for a `jsonb` column holding the key. */
export const runKeyPath = (column: "metadata" | "config"): string => `${column}->>${RUN_KEY_FIELD}`;

/** `record` with the run key stamped in (unchanged when there is no key). */
export function withRunKey<T extends Record<string, unknown>>(
  record: T | undefined | null,
  runKey: string | null | undefined,
): T {
  const base = (record ?? {}) as T;
  return runKey ? { ...base, [RUN_KEY_FIELD]: runKey } : base;
}

/**
 * The run key of a target that does not run per section (audio): the kit run's
 * scope plus the target kind. Null outside a kit run, so a one-click convert
 * never adopts anything.
 */
export function singleArtifactRunKey(
  journal: Pick<SectionJournal, "runScope"> | undefined,
  targetKind: string,
): string | null {
  return journal?.runScope ? `${journal.runScope}|${targetKind}` : null;
}
