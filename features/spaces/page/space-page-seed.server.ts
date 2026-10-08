// features/spaces/page/space-page-seed.server.ts — round 34: a Space's first reads start on the server.
//
// Before this, nothing about a page was asked until the browser had booted the whole app: then the
// snapshot (`store.get`), then the room, then each inline table's organization (`custom.where_id_opens`),
// its bundle and its first rows — a production page showed its table rows after ~10 s. The server holds
// the person's session, so the route asks AS THEM:
//   1. the page itself (the same `SupabaseSpacesStore.get` the browser runs) — awaited, so the page's
//      text is in the HTML;
//   2. for every inline custom table on it, `custom.table_page_server_rows` (where the table opens + the
//      person's knobs `data/server_rows` / `data/server_rows_budget_ms`, resolved in the table's
//      organization), and when the knob is on, `askTablePageSeed` (records-ui `/first-page`, embedded) —
//      handed to the page as a promise that streams in.
// Same doors, same person, same arguments: row security decides exactly as from the browser. A read that
// fails, refuses or outruns its budget answers null and the browser asks for itself as it always did.

import "server-only";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { RecordsSeed } from "@ai-matrx/records/core";
import { askTablePageSeed } from "@ai-matrx/records-ui/first-page";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { createClient } from "@/utils/supabase/server";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { SupabaseSpacesStore } from "../store-db/supabase-store";
import type { SpaceTablesSeed, SeededWhere } from "./space-seed-context";

/** The page read waits at most this long; past it the browser reads the page as before. */
const DOC_BUDGET_MS = 2_000;
/** `data/server_rows_budget_ms`'s default, used when the gate itself does not answer. */
const DEFAULT_ROWS_BUDGET_MS = 2_500;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type CustomRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

function within<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))])
    .catch(() => fallback)
    .finally(() => clearTimeout(timer));
}

/** Every custom table an inline database block on the page reads (built-in modules read the entity engine). */
export function inlineTableIds(blocks: readonly SpaceBlock[]): string[] {
  const out = new Set<string>();
  const walk = (list: readonly SpaceBlock[]) => {
    for (const b of list) {
      if (b.type === "database") {
        const source = (b.props as { source?: { kind?: unknown; tableId?: unknown } } | undefined)?.source;
        if (source?.kind === "table" && typeof source.tableId === "string" && isUuidShape(source.tableId)) out.add(source.tableId);
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return [...out];
}

interface TableGate {
  tableId: string;
  where: SeededWhere;
  organizationId: string | null;
  on: boolean;
  budgetMs: number;
}

async function askGate(custom: CustomRpc, tableId: string): Promise<TableGate | null> {
  const raw = await custom.rpc("table_page_server_rows", { p_table_id: tableId });
  const answer = raw.data as { where?: unknown; on?: unknown; budget_ms?: unknown } | null;
  if (raw.error || !answer || typeof answer !== "object") return null;
  const where: SeededWhere = { data: answer.where ?? null, error: null };
  const row = answer.where as { organization_id?: unknown; kind?: unknown } | null;
  const organizationId = row && typeof row === "object" && row.kind === "table" && typeof row.organization_id === "string" ? row.organization_id : null;
  return {
    tableId,
    where,
    organizationId,
    on: answer.on === true,
    budgetMs: typeof answer.budget_ms === "number" && answer.budget_ms > 0 ? answer.budget_ms : DEFAULT_ROWS_BUDGET_MS,
  };
}

async function askTables(supabase: Supabase, tableIds: string[]): Promise<SpaceTablesSeed | null> {
  if (!tableIds.length) return null;
  const custom = supabase.schema("custom" as never) as unknown as CustomRpc;
  const [gates, claims] = await Promise.all([
    Promise.all(tableIds.map((id) => askGate(custom, id).catch(() => null))),
    getClaimsUser(supabase).then((r) => r.data.user?.id ?? null).catch(() => null),
  ]);
  const actor = claims ? { actor: "user" as const, user_id: claims } : { actor: "user" as const };
  const where: Record<string, SeededWhere> = {};
  const asked: Promise<RecordsSeed | null>[] = [];
  for (const gate of gates) {
    if (!gate) continue;
    where[gate.tableId] = gate.where;
    if (!gate.on || !gate.organizationId) continue;
    asked.push(
      within(
        gate.budgetMs,
        askTablePageSeed({ dataSource: supabase, organizationId: gate.organizationId, tableId: gate.tableId, actor, embedded: true }),
        null,
      ),
    );
  }
  const seeds = (await Promise.all(asked)).filter((s): s is RecordsSeed => !!s);
  if (!Object.keys(where).length) return null;
  return {
    where,
    // One seed for the page: every table's answers under the earliest time any was asked.
    records: seeds.length ? { at: Math.min(...seeds.map((s) => s.at)), answers: seeds.flatMap((s) => s.answers) } : null,
  };
}

export interface SpacePageReads {
  /** The page as stored, when the server could read it in time; undefined = the browser reads it. */
  doc: SpaceDoc | undefined;
  /** The inline tables' first reads. Never rejects; null when none were asked or all failed. */
  tables: Promise<SpaceTablesSeed | null>;
}

/** Read a Space as the signed-in person. The page is awaited; its tables stream. */
export async function readSpacePage(spaceId: string): Promise<SpacePageReads> {
  if (!isUuidShape(spaceId)) return { doc: undefined, tables: Promise.resolve(null) };
  const supabase = await createClient().catch(() => null);
  if (!supabase) return { doc: undefined, tables: Promise.resolve(null) };
  // The organization argument is the write target for NEW top-level pages; a read never uses it.
  const store = new SupabaseSpacesStore(supabase as never, "");
  const doc = await within<SpaceDoc | null | undefined>(DOC_BUDGET_MS, store.get(spaceId), undefined);
  if (!doc) return { doc: undefined, tables: Promise.resolve(null) };
  const tables = askTables(supabase, inlineTableIds(doc.blocks)).catch((thrown: unknown) => {
    console.warn(`[spaces] the server could not ask for the tables of ${spaceId}; the browser will.`, thrown);
    return null;
  });
  return { doc, tables };
}
