/**
 * Supabase / Postgres insert payload helpers.
 *
 * WHY THIS EXISTS
 * ---------------
 * Postgres only applies a column's `DEFAULT` when the column is **omitted**
 * from the INSERT statement. Explicitly sending `NULL` for a NOT NULL column
 * bypasses the default and raises a 23502 `not-null constraint` violation.
 *
 * Example that bit us on `agx_agent`:
 *   column `custom_tools jsonb NOT NULL DEFAULT '[]'::jsonb`
 *   payload `{ custom_tools: null, ... }`   → 23502
 *   payload `{ /* custom_tools omitted *\/ }` → default `[]` applied ✅
 *
 * The generated Supabase types express this correctly (`custom_tools: Json`,
 * not `Json | null`), but hand-written insert builders routinely cast away the
 * nullability with `as unknown as AgentInsert[...]` and silently pass `null`.
 *
 * RULE
 * ----
 * For INSERTs, never send `null` or `undefined` for a field whose value you
 * don't know. Omit the key. Let the database defaults win. Run every
 * insert payload through `stripNullish()` as the last step — it's cheap,
 * idempotent, and makes it impossible to reintroduce this bug.
 *
 * DO NOT use this on UPDATE payloads. For UPDATE, `null` is a meaningful
 * value (clear the column) and must pass through untouched.
 */

export type NullishStripped<T> = {
  [K in keyof T as T[K] extends null | undefined ? never : K]: Exclude<
    T[K],
    null | undefined
  >;
};

/**
 * Returns a shallow copy of `obj` with every key whose value is `null` or
 * `undefined` removed. Preserves keys holding `false`, `0`, `""`, `[]`, `{}`.
 *
 * Use for Supabase INSERT payloads only. See file header for rationale.
 */
export function stripNullish<T extends Record<string, unknown>>(
  obj: T,
): NullishStripped<T> {
  const out: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out as NullishStripped<T>;
}
