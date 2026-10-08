// features/spaces/page/space-page-seed.server.ts — a Space's first reads start on the server.
//
// Before round 34 nothing about a page was asked until the browser had booted the whole app: then the
// snapshot (`store.get`), then the room, then each database block's reads — a production page showed its
// table rows after ~10 s. The server holds the person's session, so the route asks AS THEM:
//   1. the page itself (the same `SupabaseSpacesStore.get` the browser runs) — its text is in the HTML;
//   2. for EVERY database block on it (round 36), the very questions that block's first pass sends, each
//      block's answers its own promise that streams in when they land — nothing waits for a slower block:
//        - a custom table: `custom.where_id_opens` (its organization), `askTablePageSeed` (embedded), and
//          for a chart view the tile's two aggregates (`askTileSeed`, the specs `ChartView` sends);
//        - a built-in module (task, project, crm_deal, hr_employee): its describe and first page (the
//          drill doors `useEntityRows` asks), the chart's `drill_ask` (`askChartSeed`) for a chart view,
//          the board's entity-engine reads (`askEntityBlockSeed`) for a board view.
// The gate is the person's `data/server_rows` knob: a table's own bundle carries it (`serverRowsOf`) at no
// extra read; a built-in block reads it once per page (`platform.knob_resolve`) in an organization of the
// page's tables, else the person's remembered one. Off = nothing is asked and the browser reads as before.
// Same doors, same person, same arguments: row security decides exactly as from the browser. A read that
// fails or refuses is simply not in the seed and the block asks for it itself. Nothing here has a budget:
// the shell and the static body flush first and every block's rows stream in when they land.

import "server-only";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { EntityColumn } from "@ai-matrx/records-ui";
import { asRecordsDataSource, createRecordsClient, recordingDataSource, type RecordsSeed } from "@ai-matrx/records/core";
import { askChartSeed, askEntityBlockSeed, askTablePageSeed, askTileSeed, mergeSeeds, serverRowsOf } from "@ai-matrx/records-ui/first-page";
import { headers } from "next/headers";

import { activeOrgCookie } from "@/lib/organizations/activeOrgCookie";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { createClient } from "@/utils/supabase/server";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { activeView, chartTileSpecs, DEFAULT_CHART, ENTITY_PAGE, entityChartBy, entityRowsArgs, entityShownColumns, hasListFilter } from "../data/first-reads";
import { AGENCY_SAMPLE_ID, readDatabaseProps, type DatabaseBlockProps } from "../data/sources";
import { SupabaseSpacesStore } from "../store-db/supabase-store";
import type { BlockSeed, SeededWhere, SpaceBlockSeeds } from "./space-seed-context";

/** The page read waits at most this long; past it the browser reads the page as before. */
const DOC_BUDGET_MS = 2_000;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Actor = { actor: "user"; user_id?: string };

function within<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))])
    .catch(() => fallback)
    .finally(() => clearTimeout(timer));
}

interface DatabaseOnPage {
  blockId: string;
  props: DatabaseBlockProps;
}

/** Every database block on the page (nested ones included), with its stored props. */
export function databaseBlocks(blocks: readonly SpaceBlock[]): DatabaseOnPage[] {
  const out: DatabaseOnPage[] = [];
  const walk = (list: readonly SpaceBlock[]) => {
    for (const b of list) {
      if (b.type === "database") {
        const props = readDatabaseProps((b.props ?? {}) as Record<string, unknown>);
        if (props) out.push({ blockId: b.id, props });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Every custom table an inline database block on the page reads. */
export function inlineTableIds(blocks: readonly SpaceBlock[]): string[] {
  const out = new Set<string>();
  for (const { props } of databaseBlocks(blocks)) if (props.source.kind === "table" && isUuidShape(props.source.tableId)) out.add(props.source.tableId);
  return [...out];
}

interface TableWhere {
  where: SeededWhere;
  organizationId: string | null;
}

async function askWhere(custom: Rpc, tableId: string): Promise<TableWhere> {
  const raw = await custom.rpc("where_id_opens", { p_id: tableId });
  const e = raw.error as { code?: unknown; message?: unknown } | null;
  const where: SeededWhere = {
    data: raw.data ?? null,
    error: e ? { code: typeof e.code === "string" ? e.code : null, message: typeof e.message === "string" ? e.message : "The record store refused." } : null,
  };
  const row = raw.data as { organization_id?: unknown; kind?: unknown } | null;
  const organizationId = !e && row && typeof row === "object" && row.kind === "table" && typeof row.organization_id === "string" ? row.organization_id : null;
  return { where, organizationId };
}

/** One page's reads: each question asked once however many blocks ask it (four charts of one module). */
class PageReads {
  private memo = new Map<string, Promise<unknown>>();
  constructor(
    readonly supabase: Supabase,
    readonly actor: Actor,
    readonly userId: string | null,
    readonly rememberedOrg: string | null,
  ) {}

  once<T>(key: string, ask: () => Promise<T>): Promise<T> {
    const held = this.memo.get(key);
    if (held) return held as Promise<T>;
    const asked = ask();
    this.memo.set(key, asked);
    return asked;
  }

  where(tableId: string): Promise<TableWhere | null> {
    const custom = this.supabase.schema("custom" as never) as unknown as Rpc;
    return this.once(`where:${tableId}`, () => askWhere(custom, tableId).catch(() => null));
  }

  /** The table's page seed; its bundle carries the knob, and the rows are asked only when it is on. */
  tablePage(tableId: string, organizationId: string): Promise<RecordsSeed> {
    return this.once(`table:${tableId}`, () =>
      askTablePageSeed({
        dataSource: this.supabase,
        organizationId,
        tableId,
        actor: this.actor,
        embedded: true,
        rows: (sofar) => serverRowsOf(sofar)?.on === true,
      }),
    );
  }

  /** `data/server_rows` for the built-in blocks: read once per page, in `organizationId`'s scope. */
  knob(organizationId: string | null): Promise<boolean> {
    return this.once(`knob:${organizationId}`, async () => {
      if (!organizationId) return false;
      const platform = this.supabase.schema("platform" as never) as unknown as Rpc;
      const raw = await platform.rpc("knob_resolve", { p_feature: "data", p_key: "server_rows", p_organization_id: organizationId, p_user_id: this.userId });
      return !raw.error && raw.data === true;
    });
  }

  /**
   * A built-in block's describe and first page, exactly as `useEntityRows` asks them on its first pass
   * (the records client carries no organization then: the app has not resolved it yet).
   */
  entityRows(token: string, filters: Record<string, unknown>, sort: { field: string; direction: "asc" | "desc" } | null): Promise<{ seed: RecordsSeed; columns: EntityColumn[] }> {
    return this.once(`rows:${token}|${JSON.stringify(filters)}|${JSON.stringify(sort)}`, async () => {
      const recording = recordingDataSource(asRecordsDataSource(this.supabase));
      const client = createRecordsClient({ dataSource: recording.source, organizationId: null as never, actor: this.actor, onError: () => undefined });
      const source = { kind: "entity" as const, token };
      const [def, page] = await Promise.all([client.drillDescribe({ source }), client.drillRows(entityRowsArgs(token, filters, sort, "", ENTITY_PAGE))]);
      const api = def.ok ? (def.data as unknown as { api?: { columns?: EntityColumn[] } }).api : undefined;
      const columns = def.ok && page.ok ? entityShownColumns(api?.columns ?? [], page.data.columns) : [];
      return { seed: recording.seed(), columns };
    });
  }
}

async function tableBlockSeed(reads: PageReads, { props }: DatabaseOnPage): Promise<BlockSeed | null> {
  if (props.source.kind !== "table" || !isUuidShape(props.source.tableId)) return null;
  const tableId = props.source.tableId;
  const where = await reads.where(tableId);
  if (!where) return null;
  if (!where.organizationId || props.sample === AGENCY_SAMPLE_ID) return { tableId, where: where.where, records: null };
  const page = await reads.tablePage(tableId, where.organizationId);
  if (serverRowsOf(page)?.on !== true) return { tableId, where: where.where, records: null };
  const view = activeView(props.views, props.activeViewId);
  const filter = (view.filters ?? {}) as Record<string, unknown>;
  let tiles: RecordsSeed | null = null;
  if (view.layout === "chart" && !hasListFilter(filter)) {
    const { grouped, whole } = chartTileSpecs({ ...DEFAULT_CHART, ...view.chart }, filter);
    tiles = await askTileSeed({ dataSource: reads.supabase, organizationId: where.organizationId, actor: reads.actor, tableId, spec: [grouped, whole] });
  }
  return { tableId, where: where.where, records: mergeSeeds(page, tiles) };
}

async function entityBlockSeed(reads: PageReads, { props }: DatabaseOnPage, knobOrg: Promise<string | null>): Promise<BlockSeed | null> {
  if (props.source.kind !== "entity") return null;
  const token = props.source.token;
  if (!(await reads.knob(await knobOrg))) return null;
  const view = activeView(props.views, props.activeViewId);
  const filters = (view.filters ?? {}) as Record<string, unknown>;
  const sort = view.sorts?.[0] ?? null;
  const rows = await reads.entityRows(token, filters, sort);
  const base = { dataSource: reads.supabase, organizationId: null as never, actor: reads.actor };
  let more: RecordsSeed | null = null;
  if (view.layout === "chart") {
    // `EntityChartBlock`'s question as `EntityFrame` hands it: the view's group, else the module's first choice column.
    const by = entityChartBy(view, rows.columns);
    more = await askChartSeed({ ...base, source: { kind: "entity", token }, question: { by, where: Object.keys(filters).length ? filters : undefined } });
  } else if (view.layout === "kanban") {
    // The board is records-ui's embedded entity `TablePage` (`useEntityTable`, 50 rows embedded, no search).
    more = await askEntityBlockSeed({ ...base, token, question: { pageSize: ENTITY_PAGE } });
  }
  return { records: mergeSeeds(rows.seed, more) };
}

export interface SpacePageReads {
  /** The page as stored, when the server could read it in time; undefined = the browser reads it. */
  doc: SpaceDoc | undefined;
  /** Per database block id: its first reads, streaming. Never rejects; null when nothing was seeded. */
  seeds: SpaceBlockSeeds;
}

function askBlocks(supabase: Supabase, doc: SpaceDoc): SpaceBlockSeeds {
  const found = databaseBlocks(doc.blocks);
  if (!found.length) return {};
  const who = getClaimsUser(supabase)
    .then((r) => r.data.user?.id ?? null)
    .catch(() => null);
  const ctx = Promise.all([who, headers().catch(() => null)]).then(([userId, h]) => {
    const actor: Actor = userId ? { actor: "user", user_id: userId } : { actor: "user" };
    // org-filter: server-call the person's server-rows knob is resolved in the organization they last chose
    const remembered = h ? activeOrgCookie.readFromCookieHeader(h.get("cookie"), userId) : null;
    return new PageReads(supabase, actor, userId, remembered);
  });
  // The knob's scope for built-in blocks: an organization of the page's own tables, else the remembered one.
  const firstTable = found.find((b) => b.props.source.kind === "table");
  const knobOrg = ctx.then(async (reads) => {
    const table = firstTable?.props.source.kind === "table" ? await reads.where(firstTable.props.source.tableId) : null;
    return table?.organizationId ?? reads.rememberedOrg;
  });
  const seeds: SpaceBlockSeeds = {};
  for (const block of found) {
    seeds[block.blockId] = ctx
      .then((reads) => (block.props.source.kind === "entity" ? entityBlockSeed(reads, block, knobOrg) : tableBlockSeed(reads, block)))
      .catch((thrown: unknown) => {
        console.warn(`[spaces] the server could not ask for database block ${block.blockId}; the browser will.`, thrown);
        return null;
      });
  }
  return seeds;
}

/** Read a Space as the signed-in person. The page is awaited; each database block's reads stream. */
export async function readSpacePage(spaceId: string): Promise<SpacePageReads> {
  if (!isUuidShape(spaceId)) return { doc: undefined, seeds: {} };
  const supabase = await createClient().catch(() => null);
  if (!supabase) return { doc: undefined, seeds: {} };
  // The organization argument is the write target for NEW top-level pages; a read never uses it.
  const store = new SupabaseSpacesStore(supabase as never, "");
  const doc = await within<SpaceDoc | null | undefined>(DOC_BUDGET_MS, store.get(spaceId), undefined);
  if (!doc) return { doc: undefined, seeds: {} };
  return { doc, seeds: askBlocks(supabase, doc) };
}
