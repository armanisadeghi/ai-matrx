// features/unified-data/home/dataHomeCorpus.ts — LANE DATA-HOME-3A
//
// THE DATA HOME'S ROWS IN HAND, AND THE SERVER SEARCH BESIDE THEM.
//
// `load` reads the home's one door once per data seam (`custom.data_home`, every organization; the
// organization filter narrows in hand) and builds the rows through the old hub's declarations.
// `meta` is what the load learned, for the columns' words, the tokens and the notice.
//
// THE SERVER LAYER (lane DATA-HOME-3B's `custom.data_home(p_organization_id, p_search)`): what a row
// does not carry — a Field's label, a description. Asked 250 ms after the last keystroke for that
// text, cached per (organization, text); an answer whose text is no longer the box's is kept in the
// cache but announces nothing (a stale answer never reorders the list under the cursor). The instant
// title hits never wait for it.

import type { RecordsClient } from "@ai-matrx/records/core";
import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { buildDataHomeRows, customFieldsRow, type DataHomeRow } from "./dataHomeRows";
import { kindIsListed } from "./dataHomeKindWords";
import { DATA_HOME_ROW_CAP, type ServerMatches } from "./dataHomeService";


export const SERVER_SEARCH_DEBOUNCE_MS = 250;

export interface DataHomeCorpus {
  meta: {
    kinds: string[];
    organizations: Array<{ id: string; name: string }>;
    names: Map<string, string>;
    refusals: Array<{ listing: string; message: string }>;
    capped: boolean;
    /** The server search's own refusal, in the store's words (the instant hits still answer). */
    searchTrouble: string | null;
  };
  load: () => Promise<DataHomeRow[]>;
  /** The rows `load` resolved to, once in hand (undefined before) — the list's synchronous answer. */
  loaded: () => DataHomeRow[] | undefined;
  server: {
    lookup: (search: string, organizationId: string | null) => ServerMatches | undefined;
    request: (search: string, organizationId: string | null) => void;
  };
  /** Called when a server answer for the box's CURRENT text lands; returns the unsubscribe. */
  onAnswer: (listener: () => void) => () => void;
}

const keyOf = (search: string, organizationId: string | null) => `${organizationId ?? "*"}|${search.trim().toLowerCase()}`;

export function createDataHomeCorpus(
  client: RecordsClient,
  dataSource: RecordsDataSource,
  deps: {
    dataHome?: typeof doors.dataHome;
    dataHomeSearch?: typeof doors.dataHomeSearch;
    dataHomeCustomFields?: typeof doors.dataHomeCustomFields;
    debounceMs?: number;
    /**
     * "Show platform tables": also read the tables the app keeps for agents' outputs (the door's switch)
     * AND list every table the one rule calls kept — a choice column's List above all. Off, both
     * stay out; a table a person made is listed either way.
     */
    includePlatformTables?: boolean;
  } = {},
): DataHomeCorpus {
  const dataHome = deps.dataHome ?? doors.dataHome;
  const dataHomeSearch = deps.dataHomeSearch ?? doors.dataHomeSearch;
  const dataHomeCustomFields = deps.dataHomeCustomFields ?? doors.dataHomeCustomFields;
  const debounceMs = deps.debounceMs ?? SERVER_SEARCH_DEBOUNCE_MS;
  const meta: DataHomeCorpus["meta"] = {
    kinds: [],
    organizations: [],
    names: new Map(),
    refusals: [],
    capped: false,
    searchTrouble: null,
  };
  let held: Promise<DataHomeRow[]> | null = null;
  let inHand: DataHomeRow[] | undefined;

  const read = async (): Promise<DataHomeRow[]> => {
    const answered = await dataHome(dataSource, null, { includePlatformTables: deps.includePlatformTables === true });
    if (!answered.ok) {
      throw new Error(`Could not read tables. ${doors.doorFailureLine(answered.error)}`, { cause: answered.error });
    }
    const built = await buildDataHomeRows({ client, dataSource, answer: answered.data });
    meta.refusals = built.refusals.map((r) => ({ listing: r.listing, message: doors.doorFailureLine(r.error) }));
    // THE ONE RULE (`isKeptTable`, folded onto each row as `platformOwned`): the door answers a
    // choice column's Lists whether or not platform tables were asked for, so the home leaves them out here.
    // WHAT EACH THING IS (dataHomeKindWords.ts): kinds with no plain word stay out of this view; the
    // tables the app keeps come back under "Show platform tables" as "Platform table".
    const showPlatform = deps.includePlatformTables === true;
    let rows = built.rows.filter((row) => kindIsListed(row.kind, showPlatform) && (showPlatform || !row.platformOwned));
    // CUSTOM FIELDS ON STANDARD TABLES are rows too (one door, every organization). A refusal is
    // named in the notice, never an empty stand-in.
    const customFields = await dataHomeCustomFields(dataSource, null);
    if (customFields.ok) rows = [...rows, ...customFields.data.map(customFieldsRow)];
    else meta.refusals.push({ listing: "Custom fields", message: doors.doorFailureLine(customFields.error) });
    // THE STATED BOUND: past it the newest rows are kept and the page says so.
    meta.capped = rows.length > DATA_HOME_ROW_CAP;
    if (meta.capped) {
      rows = [...rows].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, DATA_HOME_ROW_CAP);
    }
    const names = new Map<string, string>();
    for (const row of rows) if (row.organizationId && row.organizationName) names.set(row.organizationId, row.organizationName);
    meta.names = names;
    meta.kinds = [...new Set(rows.map((r) => r.kind))];
    meta.organizations = [...names.entries()].map(([id, name]) => ({ id, name }));
    inHand = rows;
    return rows;
  };

  const answers = new Map<string, ServerMatches>();
  const listeners = new Set<() => void>();
  let latest: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = new Set<string>();

  const ask = async (search: string, organizationId: string | null, key: string) => {
    inFlight.add(key);
    const answered = await dataHomeSearch(dataSource, search, organizationId, {
      includePlatformTables: deps.includePlatformTables === true,
    });
    inFlight.delete(key);
    if (!answered.ok) {
      meta.searchTrouble = answered.error.message;
      console.error("[data home] the server search did not answer; the title search still does:", answered.error.message);
      answers.set(key, new Map());
      if (latest === key) listeners.forEach((l) => l());
      return;
    }
    meta.searchTrouble = null;
    const matches: ServerMatches = new Map();
    for (const t of answered.data.tables) {
      // The row id carries the table's own kind (`scope:`, `list:` …), never a fixed `table:`.
      matches.set(`${t.kind || "table"}:${t.organization_id}:${t.table_id}`, { rank: t.match_rank, in: t.matched_in, field: t.matched_field });
    }
    for (const i of answered.data.items) {
      matches.set(`${i.kind}:${i.organization_id}:${i.item_id}`, { rank: i.match_rank, in: i.matched_in, field: i.matched_field });
    }
    answers.set(key, matches);
    // A STALE ANSWER announces nothing: the box has moved on.
    if (latest === key && keyOf(answered.data.search, organizationId) === key) listeners.forEach((l) => l());
  };

  return {
    meta,
    load: () => {
      if (!held) {
        held = read().catch((error: unknown) => {
          held = null; // a failed read is retried on the next ask, never cached as empty
          throw error;
        });
      }
      return held;
    },
    loaded: () => inHand,
    server: {
      lookup: (search, organizationId) => answers.get(keyOf(search, organizationId)),
      request: (search, organizationId) => {
        const key = keyOf(search, organizationId);
        latest = key;
        if (answers.has(key) || inFlight.has(key)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (latest === key) void ask(search, organizationId, key);
        }, debounceMs);
      },
    },
    onAnswer: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
