/**
 * Pure validation core for the `matrx-admin/database` write targets.
 *
 * Kept free of React so the seam's contract is provable in unit tests
 * (`sql-editor-write-targets.test.ts`) and — more importantly — so the THROW
 * lands SYNCHRONOUSLY inside `applySurfaceWrite`'s try/catch rather than
 * inside a React state updater, where it would escape the seam and blow up a
 * render instead of becoming the safe error envelope the agent reads.
 *
 * Contract (mirrors the manifest target description exactly):
 * - `sql_query` value is a STRING that REPLACES the whole editor buffer.
 *   Leading/trailing whitespace is trimmed (documented, not silent). Empty,
 *   non-string, fenced, or over-long input THROWS — never coerced.
 *
 * WHY THIS IS SAFE ON A DATABASE CONSOLE: staging text into the editor is
 * inert. Nothing connects, nothing executes, nothing is invalidated. The
 * admin reads the SQL and presses Execute — see the manifest's write-target
 * doctrine block for the full "order vs fire" reasoning.
 */

/**
 * Upper bound on a staged query. Real admin SQL on this console runs a few
 * hundred characters (`sql_query` declares `typicalCharCount: 400`); 20k is
 * generous headroom for a genuinely long migration script while still
 * refusing a runaway paste. Exported so the manifest description quotes THIS
 * number rather than re-typing it.
 */
export const SQL_QUERY_WRITE_MAX_CHARS = 20000;

/** Markdown code fences — the single most common way an agent mangles SQL. */
const FENCE_PATTERN = /^\s*```|```\s*$/;

/**
 * Validate a `sql_query` write value into the exact string to stage into the
 * editor. Throws on every contract break; the caller stages the RETURN value.
 */
export function validateSqlQueryWrite(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `sql_query must be a string containing the SQL to stage, got ${
        Array.isArray(value) ? "array" : value === null ? "null" : typeof value
      }.`,
    );
  }
  if (FENCE_PATTERN.test(value)) {
    throw new Error(
      "sql_query must be raw SQL, not a markdown code block. Remove the ``` fences and send the query text on its own.",
    );
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      "sql_query must not be empty. Clearing the editor is the admin's own action — send the SQL you want staged.",
    );
  }
  if (trimmed.length > SQL_QUERY_WRITE_MAX_CHARS) {
    throw new Error(
      `sql_query is ${trimmed.length} characters, over the ${SQL_QUERY_WRITE_MAX_CHARS}-character limit for a staged query.`,
    );
  }
  return trimmed;
}
