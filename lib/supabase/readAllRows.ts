/**
 * readAllRows — the ONE way to read a LIST YOU INTEND TO TREAT AS COMPLETE.
 *
 * THE BUG THIS EXISTS TO KILL (FOUND_DEFECTS D190)
 * ------------------------------------------------
 * PostgREST caps every response at `db-max-rows` (1000 on Matrx Main). It does
 * not error. It returns HTTP 206 and a `Content-Range: 0-999/4185` header, and
 * `supabase-js` hands you a perfectly successful-looking array of 1000 rows.
 *
 * If that array is only rendered, nothing is wrong — the user sees a screenful.
 * If that array is used to DECIDE SOMETHING, it is a silent, confident lie:
 *
 *   - `rows.find(...)`  → "no such row"          (it exists, it was row 1200)
 *   - `set.has(...)`    → "not registered"       (…)
 *   - set subtraction   → "stale, delete it"     ← this one DELETES LIVE DATA
 *   - `a.length === b.length` → "out of sync"
 *
 * Measured 2026-08-14: `public._schema_migrations` held 1611 rows,
 * `scripts/check-migrations.ts` saw 1000, and reported the 5 newest migrations
 * UNAPPLIED to a release that had just applied them — hard-blocking every
 * `--strict` release. Same day: `ui.ui_surface_value` held 4185 rows and fed a
 * `deleteStale` set-subtraction in the surface manifest sync.
 *
 * THE RULE
 * --------
 * An **existence check, a diff, a set subtraction, or a completeness/`.length`
 * comparison MUST read through `readAllRows`** (or `readAllRowsRest`). A bare
 * `.select()` is only acceptable when a short list is an acceptable answer —
 * i.e. you are rendering, sampling, or previewing.
 *
 * This helper refuses to guess. It pages to the declared total and, if it
 * cannot prove it collected every row, it THROWS instead of returning a
 * confidently wrong partial list. Callers that would rather skip a check than
 * assert a wrong one use `tryReadAllRows`, which logs loudly and returns null.
 *
 * USAGE (supabase-js)
 * -------------------
 *   const rows = await readAllRows<Row>(
 *     ({ from, to }) =>
 *       sb.schema("ui").from("ui_surface_value")
 *         .select("surface_name, name", { count: "exact" })  // count REQUIRED
 *         .order("id", { ascending: true })                  // stable order REQUIRED
 *         .range(from, to),
 *     { label: "ui.ui_surface_value" },
 *   );
 *
 * Two things the caller owns and this helper cannot check for you:
 *   1. `{ count: "exact" }` — without it there is no total to verify against,
 *      and the read throws rather than trusting a full-looking page.
 *   2. A **stable total order** (`.order()` on a unique-ish column). Paging an
 *      unordered relation can repeat and skip rows between requests — you would
 *      collect the right COUNT of rows and still miss one.
 */

/** The shape every supabase-js `.range()` call resolves to. */
export interface PagedReadResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * A factory that runs ONE page. It must be a factory, not a builder: a
 * supabase-js query is a single-use thenable, so paging needs a fresh one per
 * request.
 */
export type PagedReadQuery<T> = (range: {
  from: number;
  to: number;
}) => PromiseLike<PagedReadResult<T>>;

export interface ReadAllRowsOptions {
  /** `schema.table` (or RPC name) — appears in every error. Required: a silent truncation is unfindable without it. */
  label: string;
  /** Rows per request. Must not exceed the server's `db-max-rows` (1000 here). */
  pageSize?: number;
  /** Runaway guard. A read past this throws rather than looping forever. */
  maxRows?: number;
}

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_ROWS = 500_000;

/** Thrown when the full set provably could not be collected. Never swallow this into an empty list. */
export class IncompleteReadError extends Error {
  constructor(
    readonly label: string,
    readonly collected: number,
    readonly expected: number | null,
    detail: string,
  ) {
    super(
      `readAllRows(${label}): ${detail} — collected ${collected}` +
        (expected === null ? "" : ` of ${expected}`) +
        ". Refusing to return a partial list: a truncated read used for an " +
        "existence/diff decision produces a confidently WRONG answer.",
    );
    this.name = "IncompleteReadError";
  }
}

/**
 * Read EVERY row, or throw. See the file header for the contract.
 *
 * @throws IncompleteReadError when the collected count cannot be proven complete.
 * @throws Error on any underlying query error.
 */
export async function readAllRows<T>(
  query: PagedReadQuery<T>,
  opts: ReadAllRowsOptions,
): Promise<T[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const rows: T[] = [];
  let total: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const res = await query({ from, to: from + pageSize - 1 });
    if (res.error) {
      throw new Error(
        `readAllRows(${opts.label}): query failed — ${res.error.message}`,
      );
    }
    const page = res.data ?? [];
    rows.push(...page);
    if (typeof res.count === "number") total = res.count;

    // No total on the first request means the caller omitted `{ count: "exact" }`.
    // A full-looking page is exactly what truncation looks like, so we cannot
    // accept it. A short first page is provably everything.
    if (total === null) {
      if (page.length < pageSize) return rows;
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        null,
        'the query returned no count — pass { count: "exact" } to select() so ' +
          "completeness can be verified",
      );
    }

    if (rows.length >= total) break;
    if (page.length === 0) {
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        total,
        "a page came back empty before the declared total was reached",
      );
    }
    if (rows.length > maxRows) {
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        total,
        `exceeded the ${maxRows}-row safety limit`,
      );
    }
  }

  if (rows.length !== total) {
    throw new IncompleteReadError(
      opts.label,
      rows.length,
      total,
      "final row count does not match the total the server reported",
    );
  }
  return rows;
}

/**
 * Same contract, but a provably-incomplete read returns `null` after SCREAMING
 * instead of throwing. For gate scripts that would rather SKIP a check than
 * assert a wrong verdict (`check-migrations.ts` is the exemplar). A `null`
 * return must never be coerced to `[]`.
 */
export async function tryReadAllRows<T>(
  query: PagedReadQuery<T>,
  opts: ReadAllRowsOptions,
): Promise<T[] | null> {
  try {
    return await readAllRows(query, opts);
  } catch (err) {
    console.error(
      `[readAllRows] INCOMPLETE READ of ${opts.label} — check skipped rather ` +
        `than answered wrongly: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Raw-REST variant — for scripts that talk to PostgREST with `fetch`
 * and have no supabase-js client (they read `.env` directly).
 * ------------------------------------------------------------------ */

export interface ReadAllRowsRestOptions extends ReadAllRowsOptions {
  /** Supabase project URL, with or without a trailing slash. */
  url: string;
  /** apikey / bearer token. */
  key: string;
  /**
   * Path + query AFTER `/rest/v1/`, e.g.
   * `definition?select=name,parameters&order=name.asc`.
   * It MUST carry a stable `order=` — see the file header.
   */
  path: string;
  /** Postgres schema for the `Accept-Profile` header (the db.matrxserver.com proxy defaults to `api`). */
  schema?: string;
}

/**
 * Read EVERY row over raw REST, or throw. Uses `Range` headers and verifies the
 * collected count against the total in `Content-Range: 0-999/4185`.
 */
export async function readAllRowsRest<T>(
  opts: ReadAllRowsRestOptions,
): Promise<T[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const endpoint = `${opts.url.replace(/\/$/, "")}/rest/v1/${opts.path}`;
  const rows: T[] = [];
  let total: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const res = await fetch(endpoint, {
      headers: {
        apikey: opts.key,
        Authorization: `Bearer ${opts.key}`,
        Accept: "application/json",
        ...(opts.schema ? { "Accept-Profile": opts.schema } : {}),
        // Without this PostgREST answers `Content-Range: 0-999/*` — a page with
        // no total, which is unverifiable and therefore refused below. This is
        // the REST twin of supabase-js's `{ count: "exact" }`.
        Prefer: "count=exact",
        Range: `${from}-${from + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(
        `readAllRowsRest(${opts.label}): HTTP ${res.status} — ${await res.text()}`,
      );
    }
    const page = (await res.json()) as T[];
    rows.push(...page);

    // `Content-Range: 0-999/4185` — the part after the slash is the true total.
    // `*` means the server declined to count; treat it as unverifiable.
    const totalPart = res.headers.get("content-range")?.split("/")[1];
    if (totalPart && totalPart !== "*") total = Number(totalPart);

    if (total === null) {
      if (page.length < pageSize) return rows;
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        null,
        "the server reported no total in Content-Range, and the page came back full",
      );
    }
    if (rows.length >= total) break;
    if (page.length === 0) {
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        total,
        "a page came back empty before the declared total was reached",
      );
    }
    if (rows.length > maxRows) {
      throw new IncompleteReadError(
        opts.label,
        rows.length,
        total,
        `exceeded the ${maxRows}-row safety limit`,
      );
    }
  }

  if (rows.length !== total) {
    throw new IncompleteReadError(
      opts.label,
      rows.length,
      total,
      "final row count does not match Content-Range's total",
    );
  }
  return rows;
}

/** `tryReadAllRows` for the REST variant. */
export async function tryReadAllRowsRest<T>(
  opts: ReadAllRowsRestOptions,
): Promise<T[] | null> {
  try {
    return await readAllRowsRest<T>(opts);
  } catch (err) {
    console.error(
      `[readAllRowsRest] INCOMPLETE READ of ${opts.label} — check skipped ` +
        `rather than answered wrongly: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
