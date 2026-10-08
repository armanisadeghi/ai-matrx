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
import { createClient } from "@/utils/supabase/server";

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

async function askSeed(tableId: string, recordId: string | null): Promise<TablePageSeed | null> {
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
  // The table's bundle and, on a record page, the record's — side by side, both as the person.
  const [bundleRaw, recordRaw] = await Promise.all([
    custom.rpc("table_page_bundle", { p_organization_id: organizationId, p_table_id: tableId, p_view_id: null }),
    recordId ? custom.rpc("record_page_bundle", { p_organization_id: organizationId, p_record_id: recordId }) : Promise.resolve(null),
  ]);
  return {
    tableId,
    where,
    organizationId,
    bundle: { data: bundleRaw.data ?? null, error: plainError(bundleRaw.error) },
    recordId,
    recordBundle: recordRaw ? { data: recordRaw.data ?? null, error: plainError(recordRaw.error) } : null,
  };
}

/**
 * Start a table page's first reads as the signed-in person. NOT awaited by the route: the promise
 * is handed to the client page and resolves into the stream. Never rejects.
 */
export function readTablePageSeed(tableId: string, recordId: string | null = null): Promise<TablePageSeed | null> {
  if (!isUuidShape(tableId)) return Promise.resolve(null);
  const record = recordId && isUuidShape(recordId) ? recordId : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SEED_BUDGET_MS);
  });
  const asked = askSeed(tableId, record).catch((thrown: unknown) => {
    console.warn(`[tablePageSeed] the server could not ask for table ${tableId}; the browser will.`, thrown);
    return null;
  });
  return Promise.race([asked, budget]).finally(() => clearTimeout(timer));
}
