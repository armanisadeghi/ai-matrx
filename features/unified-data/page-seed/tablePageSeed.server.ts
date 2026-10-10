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
// the cap (the knob `data/server_rows_cap_ms`, lane SSR-ROWS-3) answers null and the browser asks for
// itself at once, as it always did — never "empty".

import "server-only";

import { isUuidShape } from "@ai-matrx/kit/uuid";
import { storeDoors, type RecordsSeed } from "@ai-matrx/records/core";
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

/**
 * A SHORT CAP THAT NEVER COSTS ANYTHING (lane SSR-ROWS-3). The route's HTML shell and the table's
 * own final-geometry skeleton (`app/(core)/data/[tableId]/loading.tsx`, the route's Suspense fallback)
 * flush at once. The page waits for the server's first reads at most this long from the request's
 * start (or the person's `data/server_rows_cap_ms`, once the bundle names it): past it the boundary
 * resolves with no seed and the browser asks for itself at once. A cold chain that would have
 * outrun it therefore costs the page ~nothing over asking from the browser alone, and a warm one
 * draws its rows from the server. Equal to the knob's platform default.
 */
export const DEFAULT_CAP_MS = 1_200;

/**
 * WHETHER THIS PERSON'S TABLE PAGE DRAWS ITS ROWS ON THE SERVER (lanes SSR-ROWS-2, SSR-ROWS-3): the
 * knobs `data/server_rows` and `data/server_rows_cap_ms`, resolved for the person in the table's
 * organization and carried by the table's own bundle (`custom.table_page_bundle`'s `server_rows`
 * part, `serverRowsOf`) — the read the page makes anyway, so deciding costs no extra read. Off unless
 * the bundle says on: a refused part, an older store, no organization or a bundle slower than the cap
 * are all off.
 */
export interface ServerRowsGate {
  on: boolean;
  capMs: number;
}

function organizationOf(where: SeededDoorAnswer): string | null {
  const row = where.data as { organization_id?: unknown; kind?: unknown } | null;
  return !where.error && row && typeof row === "object" && row.kind === "table" && typeof row.organization_id === "string"
    ? row.organization_id
    : null;
}

async function askSeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tableId: string,
  recordId: string | null,
  rows: boolean,
  forceOn: boolean,
  decided: (gate: ServerRowsGate) => void,
  opened: (opening: TablePageSeed | null) => void,
): Promise<TablePageSeed | null> {
  // PARALLEL AT THE START (lane SSR-ROWS-3): where the table lives and who is asking are asked at
  // once; the bundle (and the record's bundle) start the moment the organization is known — they
  // cannot start sooner, both doors take it — and the first page the moment the bundle names its sort.
  const claimsAsked = getClaimsUser(supabase).catch(() => ({ data: { user: null } }));
  const where: SeededDoorAnswer = await storeDoors(supabase).whereIdOpens(tableId);
  const organizationId = organizationOf(where);
  if (!organizationId) {
    decided(OFF);
    const nowhere = { tableId, where, organizationId: null, bundle: null };
    opened(nowhere);
    return nowhere;
  }
  const { data: claims } = await claimsAsked;
  const userId = claims.user?.id ?? null;
  const records = await askTablePageSeed({
    dataSource: supabase,
    organizationId,
    tableId,
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    recordId,
    rows: (asked) => {
      // THE OPENING, NEVER CAPPED (lane SSR-ROWS-3): where the table lives and its bundle stream to
      // the browser the moment they land, before (and whatever becomes of) the rows, so the browser's
      // own chain takes them instead of asking again.
      const bundle = asked.answers.find((a) => a.door === "table_page_bundle");
      opened({ tableId, where, organizationId, bundle: bundle ? { data: bundle.data, error: null } : null, records: asked });
      const knob = serverRowsOf(asked);
      const on = forceOn || knob?.on === true;
      decided({ on, capMs: knob?.capMs ?? DEFAULT_CAP_MS });
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
  /** The page's first reads. Never rejects; null when they fail or outrun the cap. */
  seed: Promise<TablePageSeed | null>;
  /**
   * Where the table lives and its bundle (no rows), the moment they land — not capped, so a miss
   * never throws them away. The browser's own reads take their doors from it. Never rejects.
   */
  opening: Promise<TablePageSeed | null>;
}

const OFF: ServerRowsGate = { on: false, capMs: DEFAULT_CAP_MS };

/**
 * Start a table page's first reads as the signed-in person. NOT awaited by the route: both promises
 * are handed to the client page and resolve into the stream. Neither rejects, and neither takes
 * longer than the cap (`DEFAULT_CAP_MS`, or the person's `data/server_rows_cap_ms` once the bundle
 * names it) counted from this call: past it the gate is off and the seed is null, and the browser
 * asks for itself at once.
 *
 * `rows`: the address opens the plain table, so the grid's first page may be asked.
 * `forceOn`: a development host asked for server rows on this one request (`?server_rows=1`).
 */
export function readTablePage(
  tableId: string,
  recordId: string | null = null,
  options: { rows?: boolean; forceOn?: boolean } = {},
): TablePageReads {
  if (!isUuidShape(tableId)) return { gate: Promise.resolve(OFF), seed: Promise.resolve(null), opening: Promise.resolve(null) };
  const record = recordId && isUuidShape(recordId) ? recordId : null;
  const t0 = Date.now();
  let resolveGate: (gate: ServerRowsGate) => void = () => {};
  const gate = new Promise<ServerRowsGate>((resolve) => {
    resolveGate = resolve;
  });
  let resolveOpening: (opening: TablePageSeed | null) => void = () => {};
  const opening = new Promise<TablePageSeed | null>((resolve) => {
    resolveOpening = resolve;
  });
  let resolveSeed: (seed: TablePageSeed | null) => void = () => {};
  const seed = new Promise<TablePageSeed | null>((resolve) => {
    resolveSeed = resolve;
  });
  // ONE CLOCK FROM THE REQUEST'S START. The first decision wins (a promise resolves once): the bundle's
  // knob, or "off / no seed" when the cap fires first. The person's own cap, once known, re-times it.
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  const capAt = (ms: number) => {
    clearTimeout(capTimer);
    capTimer = setTimeout(
      () => {
        resolveGate(OFF);
        resolveSeed(null);
      },
      Math.max(0, ms - (Date.now() - t0)),
    );
  };
  capAt(DEFAULT_CAP_MS);
  const decide = (g: ServerRowsGate) => {
    resolveGate(g);
    if (g.capMs !== DEFAULT_CAP_MS) capAt(g.capMs);
  };
  createClient()
    .then((supabase) => askSeed(supabase, tableId, record, options.rows !== false, options.forceOn === true, decide, resolveOpening))
    .then(
      (answered) => resolveSeed(answered),
      (thrown: unknown) => {
        console.warn(`[tablePageSeed] the server could not ask for table ${tableId}; the browser will.`, thrown);
        resolveSeed(null);
      },
    )
    .finally(() => {
      resolveGate(OFF);
      resolveOpening(null); // no-op once the bundle opened it
      clearTimeout(capTimer);
    });
  return { gate, seed, opening };
}
