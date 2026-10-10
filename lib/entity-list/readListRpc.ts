/**
 * readListRpc — THE ONE READER for a list surface's facet and count RPCs
 * (`*_list_facets`, `*_list_scope_counts`, `*_list_counts`, `*_lane_facets`, …).
 *
 * The API caps every response at 1,000 rows and says so only in a header. A
 * facet RPC returns one row per (facet, value), so a person with many tags,
 * models or categories passes the cap and every row after 1,000 — whole facets
 * included — vanished without a word (transcripts: 1,394 rows for admin; agents'
 * System lane: 1,421). This reader:
 *
 *  1. asks for the first page WITH the total (`count: "exact"`); a complete page
 *     is returned as the server ordered it — one request, unchanged behaviour;
 *  2. past the cap, re-reads EVERY page under a stable caller-named order (an
 *     unordered set-returning function can repeat and skip rows between pages);
 *  3. when the rows provably cannot be collected in full, answers with an
 *     `error` (code `incomplete_read`) — never a confident short list. The
 *     list shell renders that as a failed side read with Try again.
 *
 * It answers `{ data, error }` like supabase-js so a caller keeps its own
 * error mapping. Guard: `__tests__/list-rpc-reads-never-truncate.test.ts`,
 * which also fails when any facet/count RPC is called around this reader.
 */
import { IncompleteReadError, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

/** The API's `db-max-rows`: the most rows one response carries. */
export const LIST_RPC_PAGE_ROWS = 1000;

export interface ListRpcError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface ListRpcResult<Row> {
  data: Row[] | null;
  error: ListRpcError | null;
}

interface PageResponse<Row> {
  data: Row[] | null;
  error: ListRpcError | null;
  count?: number | null;
}

interface PageBuilder<Row> extends PromiseLike<PageResponse<Row>> {
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): PageBuilder<Row>;
  range(from: number, to: number): PageBuilder<Row>;
}

/** Any supabase-js client or schema handle (`supabase.schema("education")`). */
export interface ListRpcClient {
  rpc(fn: string, args?: object, options?: { count?: "exact" }): unknown;
}

export interface ListRpcOptions<Row> {
  /**
   * Columns that order the rows totally (together unique per row). Used only
   * when the result passes one page, so paging can neither repeat nor skip.
   */
  order: readonly [keyof Row & string, ...(keyof Row & string)[]];
  /** Defaults to the browser client's `public` schema. */
  client?: ListRpcClient;
}

type PublicFunctions = Database["public"]["Functions"];
type RowOf<F extends keyof PublicFunctions> = PublicFunctions[F]["Returns"] extends readonly (infer R)[]
  ? R
  : never;

/** Typed: a `public` function the generated types know. */
export function readListRpc<F extends keyof PublicFunctions & string>(
  fn: F,
  args: PublicFunctions[F]["Args"],
  options: ListRpcOptions<RowOf<F>>,
): Promise<ListRpcResult<RowOf<F>>>;
/** Untyped: another schema, or a function newer than the generated types. */
export function readListRpc<Row>(
  fn: string,
  args: Record<string, unknown>,
  options: ListRpcOptions<Row>,
): Promise<ListRpcResult<Row>>;
export async function readListRpc<Row>(
  fn: string,
  args: object,
  options: ListRpcOptions<Row>,
): Promise<ListRpcResult<Row>> {
  const client: ListRpcClient = options.client ?? (supabase as unknown as ListRpcClient);
  const page = (from: number, to: number, ordered: boolean): PageBuilder<Row> => {
    let builder = client.rpc(fn, args, { count: "exact" }) as PageBuilder<Row>;
    if (ordered) {
      for (const column of options.order) builder = builder.order(column, { ascending: true, nullsFirst: true });
    }
    return builder.range(from, to);
  };

  try {
    const first = await page(0, LIST_RPC_PAGE_ROWS - 1, false);
    if (first.error) return { data: null, error: first.error };
    const rows = first.data ?? [];
    const total = typeof first.count === "number" ? first.count : null;
    if (total === null && rows.length < LIST_RPC_PAGE_ROWS) return { data: rows, error: null };
    if (total !== null && rows.length >= total) return { data: rows, error: null };

    const all = await readAllRows<Row>(
      async ({ from, to }) => {
        const res = await page(from, to, true);
        // Keep the API's own error (code, hint) for the caller's mapping.
        if (res.error) throw new ListRpcFailure(res.error);
        return res;
      },
      { label: fn, pageSize: LIST_RPC_PAGE_ROWS },
    );
    return { data: all, error: null };
  } catch (err) {
    if (err instanceof ListRpcFailure) return { data: null, error: err.error };
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof IncompleteReadError) {
      console.error(`[readListRpc] ${fn}: incomplete read refused — ${message}`);
      return { data: null, error: { message, code: "incomplete_read" } };
    }
    return { data: null, error: { message } };
  }
}

class ListRpcFailure extends Error {
  constructor(readonly error: ListRpcError) {
    super(error.message);
  }
}
