// features/unified-data/page-seed/tablePageSeed.server.ts — lane PAGE-BUNDLE-2
//
// A TABLE PAGE'S FIRST READS START ON THE SERVER, NOT AFTER THE APP BOOTS.
//
// Dr. Patel's front desk opens "Visits" from a link. Before this, nothing about the table was asked
// until the browser had downloaded and booted the whole app (~1 s on production): then
// `custom.where_id_opens` (which organization the table lives in), and only after its answer,
// `custom.table_page_bundle` (fields, views, look, actions…). The server already holds her session,
// so the route asks both AS HER while the script is still downloading, and streams the answer to
// the page as a promise. The page hands it to the same stores those reads fill (`primeTablePage`).
//
// Same doors, same person, same arguments: RLS and every door's own wall decide exactly as they do
// from the browser. Nothing here decides access. A read that fails, refuses, or is slower than
// its budget (the knob `data/server_rows_budget_ms`) answers null and the browser asks for itself as it always did — never "empty".

import "server-only";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { RecordsSeed } from "@ai-matrx/records/core";
import { askTablePageSeed, serverRowsOf } from "@ai-matrx/records-ui/first-page";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

/** A door's answer as PostgREST gave it — plain JSON, so it streams to the browser as is. */
export interface SeededDoorAnswer {
  data: unknown;
  error: { code?: string | null; message?: string | null } | null;
}

export interface TablePageSeed {
  tableId: string;
  /** `custom.where_id_opens(p_id => tableId)`. */
  where: SeededDoorAnswer;
  /** The organization `where` named, when it named one. */
  organizationId: string | null;
  /** `custom.table_page_bundle(organization, table, view => null)`, when `where` named an organization. */
  bundle: SeededDoorAnswer | null;
  /** The record page's record, when the page is one (`custom.record_page_bundle(organization, record)`). */
  recordId?: string | null;
  recordBundle?: SeededDoorAnswer | null;
  /**
   * EVERY DOOR ANSWER THE SERVER GOT, for `<RecordsSeedProvider>` (lane SSR-ROWS): the bundle's parts,
   * the grid's first page, the record's bundle. The page is drawn from it in the server's HTML — rows
   * included — and hydrates onto it without asking again.
   */
  records?: RecordsSeed | null;
}

/**
 * The address names something other than the plain opening (a view, a filter, a sort, a search, a
 * page, a grouping, a dashboard): the grid will not ask the plain first page, so the server does not.
 */
const ADDRESS_OPENS_ELSEWHERE = ["view", "filter", "sort", "cf", "q", "hide", "page", "group", "dashboard", "grid"];
export function addressAsksThePlainOpening(searchParams: Record<string, string | string[] | undefined> | null | undefined): boolean {
  if (!searchParams) return true;
  return !ADDRESS_OPENS_ELSEWHERE.some((key) => searchParams[key] !== undefined && searchParams[key] !== "");
}

/** The knob `data/server_rows_budget_ms`'s default, used only when the gate itself does not answer. */
const DEFAULT_BUDGET_MS = 2_500;

/**
 * WHETHER THIS PERSON'S TABLE PAGE DRAWS ITS ROWS ON THE SERVER (lane SSR-ROWS-2): the knobs
 * `data/server_rows` and `data/server_rows_budget_ms`, resolved for the person in the table's
 * organization and carried by the table's own bundle (`custom.table_page_bundle`'s `server_rows`
 * part, `serverRowsOf`) — the read the page makes anyway, so deciding costs no extra read. Off unless
 * the bundle says on: a refused part, an older store, no organization or a slow answer are all off.
 */
export interface ServerRowsGate {
  on: boolean;
  budgetMs: number;
}

type CustomRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

function organizationOf(where: SeededDoorAnswer): string | null {
  const row = where.data as { organization_id?: unknown; kind?: unknown } | null;
  return !where.error && row && typeof row === "object" && row.kind === "table" && typeof row.organization_id === "string"
    ? row.organization_id
    : null;
}

const plainError = (error: unknown): SeededDoorAnswer["error"] => {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: unknown; message?: unknown };
  return {
    code: typeof e.code === "string" ? e.code : null,
    message: typeof e.message === "string" ? e.message : "The record store refused.",
  };
};

async function askSeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tableId: string,
  recordId: string | null,
  rows: boolean,
  forceOn: boolean,
  decided: (gate: ServerRowsGate) => void,
): Promise<TablePageSeed | null> {
  const custom = supabase.schema("custom" as never) as unknown as CustomRpc;
  const whereRaw = await custom.rpc("where_id_opens", { p_id: tableId });
  const where: SeededDoorAnswer = { data: whereRaw.data ?? null, error: plainError(whereRaw.error) };
  const organizationId = organizationOf(where);
  if (!organizationId) {
    decided(OFF);
    return { tableId, where, organizationId: null, bundle: null };
  }
  // The table's bundle, the grid's first page (only when the person's knob, read from that bundle,
  // says on) and, on a record page, the record's bundle — asked by the records client exactly as the
  // browser's would ask them, as the person, and recorded.
  const { data: claims } = await getClaimsUser(supabase);
  const userId = claims.user?.id ?? null;
  const records = await askTablePageSeed({
    dataSource: supabase,
    organizationId,
    tableId,
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    recordId,
    rows: (asked) => {
      const knob = serverRowsOf(asked);
      const on = forceOn || knob?.on === true;
      decided({ on, budgetMs: knob?.budgetMs ?? DEFAULT_BUDGET_MS });
      return on && rows;
    },
  });
  decided(OFF); // no-op when the bundle already decided; off when the shape could not be asked
  const answered = (door: string): SeededDoorAnswer | null => {
    const found = records.answers.find((x) => x.door === door);
    return found ? { data: found.data, error: null } : null;
  };
  return {
    tableId,
    where,
    organizationId,
    bundle: answered("table_page_bundle"),
    recordId,
    recordBundle: recordId ? answered("record_page_bundle") : null,
    records,
  };
}

export interface TablePageReads {
  /** Whether this person's page draws its rows on the server, and how long it may wait for them. */
  gate: Promise<ServerRowsGate>;
  /** The page's first reads. Never rejects; null when they fail or outrun the budget. */
  seed: Promise<TablePageSeed | null>;
}

const OFF: ServerRowsGate = { on: false, budgetMs: DEFAULT_BUDGET_MS };

/**
 * Start a table page's first reads as the signed-in person. NOT awaited by the route: both promises
 * are handed to the client page and resolve into the stream. Neither rejects.
 *
 * `rows`: the address opens the plain table, so the grid's first page may be asked.
 * `forceOn`: a development host asked for server rows on this one request (`?server_rows=1`).
 */
export function readTablePage(
  tableId: string,
  recordId: string | null = null,
  options: { rows?: boolean; forceOn?: boolean } = {},
): TablePageReads {
  if (!isUuidShape(tableId)) return { gate: Promise.resolve(OFF), seed: Promise.resolve(null) };
  const record = recordId && isUuidShape(recordId) ? recordId : null;
  // The gate is decided by the bundle (first decision wins), and bounded: past the default budget the
  // page draws as it did before.
  let decide: (gate: ServerRowsGate) => void = () => {};
  const decidedGate = new Promise<ServerRowsGate>((resolve) => {
    decide = resolve;
  });
  let gateTimer: ReturnType<typeof setTimeout> | undefined;
  const gate = Promise.race([
    decidedGate,
    new Promise<ServerRowsGate>((resolve) => {
      gateTimer = setTimeout(() => resolve(OFF), DEFAULT_BUDGET_MS);
    }),
  ]).finally(() => clearTimeout(gateTimer));
  // The seed's budget runs from the moment the gate is decided: the person's `server_rows_budget_ms`.
  const asked = createClient().then((supabase) => askSeed(supabase, tableId, record, options.rows !== false, options.forceOn === true, decide));
  const seed = Promise.race([
    asked,
    gate.then(
      (g) =>
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), g.budgetMs);
          const clear = () => clearTimeout(timer);
          asked.then(clear, clear);
        }),
    ),
  ]).catch((thrown: unknown) => {
    decide(OFF);
    console.warn(`[tablePageSeed] the server could not ask for table ${tableId}; the browser will.`, thrown);
    return null;
  });
  return { gate, seed };
}
