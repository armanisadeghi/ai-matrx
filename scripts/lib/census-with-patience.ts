// scripts/lib/census-with-patience.ts — A CENSUS THAT COULD NOT BE READ SAYS SO.
//
// Extracted from `check-store-doors-decide.ts` so the retry POLICY can be proven on its
// own (`scripts/__tests__/census-with-patience.test.ts`) without a live database: the SQL
// it runs is unchanged and still runs live, but "how many times do we ask, and what do we
// say when contention wins" is control flow, and control flow is testable.

/**
 * One census row. The callers name their own row shape; this module only carries rows from
 * the query to the caller, so it is generic rather than a second definition of `Row`.
 */
import { formatDurationMs } from "@ai-matrx/kit/format";
export type CensusRow = Record<string, unknown>;

/**
 * A census that dies on `55P03 canceling statement due to lock timeout` HAS NOT BEEN
 * MEASURED, and "not measured" is neither a pass nor a door being wrong.
 *
 * Census 12 reads three answers in every `shared_only` organization; it takes 79-98 s
 * against the live database and it died twice on 55P03 during lane DOORS-GREEN's runs
 * before completing on the third. A CI run of it is therefore intermittently red for a
 * reason that is not a door — and an intermittent red is how a guard stops being read.
 *
 * So: retry with backoff, and if contention still wins, say `[NOT MEASURED — contention]`
 * and carry that through to a DISTINCT exit code. Never a false red (it is not reported as
 * a door that decides nothing) and never a false green (the run does not exit 0). Every
 * other error class is thrown exactly as before — a syntax error, a permission refusal or a
 * statement timeout is a real failure and this helper hides none of them.
 */
const CONTENTION = new Set(["55P03"]);
/** Waits between attempts, in ms. Three attempts, ~20 s of patience in total. */
export const CONTENTION_BACKOFF = [5_000, 15_000];

export interface Measured<R = CensusRow> {
  readonly rows: R[];
  /** null when it was measured; the reason when it was not. */
  readonly unmeasured: string | null;
}

export async function censusWithPatience<R = CensusRow>(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  label: string,
  sql: string,
  timeout = "900s",
  /** The waits between attempts. Only a test passes anything else. */
  waits: readonly number[] = CONTENTION_BACKOFF,
): Promise<Measured<R>> {
  for (let attempt = 0; ; attempt++) {
    await client.query("begin");
    try {
      await client.query(`set local statement_timeout = '${timeout}'`);
      const rows = (await client.query(sql)).rows as R[];
      await client.query("rollback").catch(() => undefined);
      if (attempt > 0) {
        console.log(`[INFO] ${label} completed on attempt ${attempt + 1} after lock contention.`);
      }
      return { rows, unmeasured: null };
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      const code = (err as { code?: string }).code ?? "";
      if (!CONTENTION.has(code)) throw err;
      const wait = waits[attempt];
      if (wait === undefined) {
        return {
          rows: [],
          unmeasured:
            `${label}: ${waits.length + 1} attempts all died on 55P03 (lock timeout). ` +
            "Something else held a lock on the rows this census reads for the whole window.",
        };
      }
      console.log(
        `[INFO] ${label} hit 55P03 (lock timeout) on attempt ${attempt + 1}; waiting ${formatDurationMs(wait, { style: "compact" })} and asking again.`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

