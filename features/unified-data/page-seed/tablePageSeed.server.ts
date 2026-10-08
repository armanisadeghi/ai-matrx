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
// SEED_BUDGET_MS answers null and the browser asks for itself as it always did — never "empty".

import "server-only";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { RecordsSeed } from "@ai-matrx/records/core";
import { askTablePageSeed } from "@ai-matrx/records-ui/first-page";
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

/**
 * THE KNOB `data/server_rows` (platform.feature_knob, lane SSR-ROWS-2): whether a table page waits for
 * the server's first reads and draws its rows in the server's HTML. OFF unless the row says `true` —
 * an absent row, an archived one, or a refused read all mean OFF: the page draws as it did before
 * (skeleton, then the browser asks). Read once a minute per server process, as the person.
 */
const KNOB_TTL_MS = 60_000;
let knobHeld: { on: boolean; at: number } | null = null;
export async function serverRowsOn(): Promise<boolean> {
  if (knobHeld && Date.now() - knobHeld.at < KNOB_TTL_MS) return knobHeld.on;
  let on = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("platform" as never)
      .from("feature_knob" as never)
      .select("value")
      .eq("feature", "data")
      .eq("key", "server_rows")
      .is("archived_at", null)
      .maybeSingle();
    on = (data as { value?: unknown } | null)?.value === true;
  } catch {
    on = false;
  }
  knobHeld = { on, at: Date.now() };
  return on;
}

/** Past this the browser has booted and would have asked by now: it asks for itself instead. */
const SEED_BUDGET_MS = 2_500;

const plainError = (error: unknown): SeededDoorAnswer["error"] => {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: unknown; message?: unknown };
  return {
    code: typeof e.code === "string" ? e.code : null,
    message: typeof e.message === "string" ? e.message : "The record store refused.",
  };
};

async function askSeed(tableId: string, recordId: string | null, rows: boolean): Promise<TablePageSeed | null> {
  const supabase = await createClient();
  const custom = supabase.schema("custom" as never) as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const whereRaw = await custom.rpc("where_id_opens", { p_id: tableId });
  const where: SeededDoorAnswer = { data: whereRaw.data ?? null, error: plainError(whereRaw.error) };
  const row = where.data as { organization_id?: unknown; kind?: unknown } | null;
  const organizationId =
    !where.error && row && typeof row === "object" && row.kind === "table" && typeof row.organization_id === "string"
      ? row.organization_id
      : null;
  if (!organizationId) return { tableId, where, organizationId: null, bundle: null };
  // The table's bundle, the grid's first page and, on a record page, the record's bundle — asked by
  // the records client exactly as the browser's would ask them, as the person, and recorded.
  const { data: claims } = await getClaimsUser(supabase);
  const userId = claims.user?.id ?? null;
  const records = await askTablePageSeed({
    dataSource: supabase,
    organizationId,
    tableId,
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    recordId,
    rows,
  });
  const answered = (door: string): SeededDoorAnswer | null => {
    const found = records.answers.find((a) => a.door === door);
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

/**
 * Start a table page's first reads as the signed-in person. NOT awaited by the route: the promise
 * is handed to the client page and resolves into the stream. Never rejects.
 */
export function readTablePageSeed(
  tableId: string,
  recordId: string | null = null,
  options: { rows?: boolean } = {},
): Promise<TablePageSeed | null> {
  if (!isUuidShape(tableId)) return Promise.resolve(null);
  const record = recordId && isUuidShape(recordId) ? recordId : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SEED_BUDGET_MS);
  });
  const asked = askSeed(tableId, record, options.rows !== false).catch((thrown: unknown) => {
    console.warn(`[tablePageSeed] the server could not ask for table ${tableId}; the browser will.`, thrown);
    return null;
  });
  return Promise.race([asked, budget]).finally(() => clearTimeout(timer));
}
