/**
 * Class-aware catalog reads.
 *
 * A model's CLASS is the offering it is served through (Matrx Fast, Matrx
 * Lightning, ...). `ai.model_message_flag_profile(uuid, uuid)` and
 * `ai.offering_capabilities(uuid[], uuid[])` answer for a pinned class; the
 * one-class forms answer for the preferred one.
 *
 * TEMPORARY: until the class-aware SQL is applied to live
 * (common-docs/operations/pending-live-sql/class-aware-flags-and-capabilities.sql),
 * PostgREST answers PGRST202 for the two-argument forms. Callers then fall
 * back to the model-level read and this module warns ONCE per function, so
 * the stand-in announces itself. Delete the fallback once the SQL is live.
 */

export const CLASS_AWARE_SQL_FILE =
  "common-docs/operations/pending-live-sql/class-aware-flags-and-capabilities.sql";

/** PostgREST's "no function matches these arguments" answer. */
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST202" || code === "42883";
}

/** The class pin is not an available offering of the model. */
export function isForeignPinError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P0002";
}

const warned = new Set<string>();

export function warnClassAwareSqlPending(fn: string): void {
  if (warned.has(fn)) return;
  warned.add(fn);
  console.warn(
    `[class-aware] ${fn}(…, offering) is not on this database yet; reading the ` +
      `model's preferred class instead. Pending SQL: ${CLASS_AWARE_SQL_FILE}`,
  );
}

/** Test seam: forget which functions already warned. */
export function resetClassAwareWarnings(): void {
  warned.clear();
}
