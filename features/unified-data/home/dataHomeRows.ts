// features/unified-data/home/dataHomeRows.ts — LANE DATA-HOME-3A
//
// THE DATA HOME'S ONE ROW TYPE. Tables, forms, booking pages, portals, dashboards, digests,
// checklists, automations, outside shares and tables shared in are ONE row type with a `kind`
// column (the list shell's ratified rule: heterogeneous rows are one type, never special-cased
// inside the shell — lib/entity-list/FEATURE.md).
//
// ADOPT, DO NOT REPLACE. Every row is built by the old hub's own declarations
// (`features/unified-data/hub/capabilities.ts` HUB_CAPABILITIES): each kind's address, facts,
// trouble sentence and public link are exactly what the ten sections showed. This file only
// flattens the ten answers into one list, folds on the lane facts, and de-duplicates an accepted
// share that is already a Table row (census item 8).

import type { RecordsClient } from "@ai-matrx/records/core";
import type { RecordsDataSource } from "@ai-matrx/records";
import { isKeptTable } from "@ai-matrx/records-ui";

import {
  HUB_CAPABILITIES,
  attachChangedBy,
  type HubCapability,
  type HubItem,
  type HubReadContext,
} from "@/features/unified-data/hub/capabilities";
import type { ArchivedEverywhereRow, ArchivedPortalEverywhereRow, DataHomeAnswer, DataHomeTableRow, DoorFailure } from "@/features/unified-data/hub/doors";
import { isPublicVisibility, kindOne, type ScopeFacts } from "@/features/unified-data/hub/dataHomeScope";

/** Which lane put a row in front of the person — one word, the strongest reason first. */
export type DataHomeAccess = "mine" | "team" | "org" | "shared" | "public" | "system";

export interface DataHomeRow {
  /** Unique across kinds and organizations: `${kind}:${organization}:${item}`. */
  id: string;
  /** The thing's own id (a table, a form, an invitation …). */
  itemId: string;
  name: string;
  /** The store's one kind word (`table`, `form`, `dashboard`, `list` …). */
  kind: string;
  organizationId: string | null;
  organizationName: string | null;
  tableId: string | null;
  /** The table it belongs to, only when that is not the row's own name. */
  parentName: string | null;
  updatedAt: string | null;
  /** The Table's maker, when the door says (`custom.data_home_tables.created_by`). */
  createdBy: string | null;
  /** The maker's name (`created_by_name`); null when the door has none. */
  createdByName: string | null;
  mine: boolean;
  team: boolean;
  member: boolean;
  sharedWithMe: boolean;
  visibility: string | null;
  system: boolean;
  access: DataHomeAccess | null;
  /** Record count. Null = not measured (the door does not count yet) — shown `—`, never 0. */
  records: number | null;
  changedBy: string | null;
  /** The row's short facts joined ("4 stages · 12 answers"). */
  details: string;
  href: string;
  publicHref: string | null;
  publicLabel: string | null;
  /** The store's own sentence when something is wrong with the row. */
  trouble: string | null;
  /**
   * A table the app keeps for itself rather than one a person made — above all the List a choice
   * column keeps its choices in ("Status choices"). Decided by THE ONE RULE (`isKeptTable` from
   * `@ai-matrx/records-ui`) over the door's own facts; false for every non-table row. The home
   * lists these only under "Show platform tables" (lane 10 item 7).
   */
  platformOwned: boolean;
  /**
   * Lane 10 FD: the table is Foundation — part of the business's day-one data. Listed first, with
   * a badge, and the Foundation filter keeps only these. False for every non-table row.
   */
  foundation: boolean;
  /**
   * Lane VISION-REACH wave 3: where the table syncs from (`custom.data_home`'s `synced_from`, the
   * provider of its `sync_source`: `postgres`, `google_sheets`), null for a table of our own.
   */
  syncedFrom: string | null;
  /**
   * Set only on a row the SERVER search found and the instant title search did not (a Field, a
   * description): where it matched, for the "Matched in" line. Absent on every other row.
   */
  matched?: { in: "name" | "description" | "field" | "id"; field: string | null } | undefined;
  /**
   * An archived table, listed only under the list's Archived filter (lane TABLE-ACTIONS item 10).
   * Its menu offers Open and Restore; `isArchivedRow` keeps its cells read-only.
   */
  archived?: boolean;
}

/**
 * ONE ARCHIVED TABLE AS A DATA HOME ROW (`custom.archived_tables_everywhere`). The door reads the
 * organizations the person belongs to, so the row is an organization row; it says when it was
 * archived and by whom in its facts.
 */
export function archivedTableRow(table: ArchivedEverywhereRow, me: string | null = null): DataHomeRow {
  // Mine = I made it. Only the store can say so; until its door answers `created_by`, no archived
  // row claims Mine (a guess would put other people's tables in the lane).
  const mine = Boolean(me && table.created_by && table.created_by === me);
  const when = table.archived_at ? new Date(table.archived_at).toLocaleDateString() : null;
  return {
    id: `table:${table.organization_id}:${table.id}`,
    itemId: table.id,
    name: table.document?.name?.trim() || "Untitled table",
    kind: "table",
    organizationId: table.organization_id,
    organizationName: table.organization_name,
    tableId: table.id,
    parentName: null,
    updatedAt: table.archived_at,
    createdBy: table.created_by ?? null,
    createdByName: table.created_by_name ?? null,
    mine,
    team: false,
    member: true,
    sharedWithMe: false,
    visibility: null,
    system: false,
    access: mine ? "mine" : "org",
    records: null,
    changedBy: table.archived_by_name,
    details: ["Archived", when, table.archived_by_name ? `by ${table.archived_by_name}` : null].filter(Boolean).join(" "),
    href: `/data/${table.id}`,
    publicHref: null,
    publicLabel: null,
    trouble: null,
    platformOwned: false,
    foundation: false,
    syncedFrom: null,
    archived: true,
  };
}

/** ONE ARCHIVED PORTAL AS A ROW: it is brought back from its clients table's Portals rail. */
export function archivedPortalRow(portal: ArchivedPortalEverywhereRow): DataHomeRow {
  return {
    ...archivedTableRow({
      id: portal.client_table_id,
      document: null,
      archived_at: null,
      archived_by_name: null,
      organization_id: portal.organization_id,
      organization_name: portal.organization_name,
    }),
    id: `portal:${portal.organization_id}:${portal.portal_id}`,
    itemId: portal.portal_id,
    name: portal.title || "Untitled portal",
    kind: "portal",
    parentName: portal.client_table,
    href: `/data/${portal.client_table_id}?rail=portals&item=${portal.portal_id}`,
  };
}

/** Singular kind words the hub's KIND_ONE does not carry (the item kinds). */
const ITEM_KIND_ONE: Record<string, string> = {
  portal: "Portal",
  digest: "Digest",
  automation: "Automation",
  share: "Outside share",
};

export function dataHomeKindWord(kind: string): string {
  return ITEM_KIND_ONE[kind] ?? kindOne(kind);
}

/** What each listing's rows are, in the store's kind words (the old hub's LISTING_KIND). */
const LISTING_KIND: Record<string, string> = {
  forms: "form",
  bookings: "booking",
  portals: "portal",
  dashboards: "dashboard",
  digests: "digest",
  checklists: "checklist",
  automations: "automation",
  "shared-outside": "share",
  "shared-with-me": "table",
};

export function accessOf(facts: ScopeFacts): DataHomeAccess | null {
  if (facts.mine) return "mine";
  if (facts.team) return "team";
  if (facts.member) return "org";
  if (facts.sharedWithMe) return "shared";
  if (isPublicVisibility(facts.visibility)) return "public";
  if (facts.system) return "system";
  return null;
}

export const ACCESS_WORD: Record<DataHomeAccess, string> = {
  mine: "Mine",
  team: "Team",
  org: "Org",
  shared: "Shared",
  public: "Public",
  system: "System",
};

/** The tooltip: why this row is shown (one sentence, verified against the lane facts). */
export const ACCESS_WHY: Record<DataHomeAccess, string> = {
  mine: "You made it.",
  team: "Someone on your team made it.",
  org: "It is in an organization you belong to.",
  shared: "Someone shared it with you.",
  public: "Anyone with its link can open it.",
  system: "AI Matrx keeps it for everyone.",
};

/** Is this Tables-listing row one the app keeps (a value set, a checklist's steps …)? The package's rule. */
/** The door's `synced_from` (custom.data_home, VISION-REACH wave 3); the package type predates it. */
function syncedFromOf(table: DataHomeTableRow): string | null {
  const value = (table as DataHomeTableRow & { synced_from?: unknown }).synced_from;
  return typeof value === "string" && value ? value : null;
}

export function keptTableRow(table: DataHomeTableRow): boolean {
  return isKeptTable({ id: table.table_id, name: table.table_name, kind: table.kind, kept_by_the_app: table.kept_by_the_app });
}

function toRow(
  item: HubItem & { kind: string },
  tables: ReadonlyMap<string, DataHomeTableRow>,
  fromTablesListing: boolean,
): DataHomeRow {
  const facts: ScopeFacts = item.scope ?? { mine: false, member: true, sharedWithMe: false, visibility: null };
  const table = item.tableId ? tables.get(item.tableId) : undefined;
  const parent = item.tableName && item.tableName !== item.title ? item.tableName : null;
  return {
    id: `${item.kind}:${item.organizationId ?? "-"}:${item.id}`,
    itemId: item.id,
    name: item.title,
    kind: item.kind,
    organizationId: item.organizationId ?? null,
    organizationName: item.organizationName ?? null,
    tableId: item.tableId,
    // A table shared in names its organization in `tableName` (the hub's "in <their organization>"),
    // which is the Organization column here — never repeated as a parent.
    parentName: item.kind === "table" ? null : parent,
    updatedAt: item.changedAt ?? null,
    createdBy: table?.created_by ?? null,
    createdByName: table?.created_by_name ?? null,
    mine: facts.mine,
    team: Boolean(facts.team),
    member: facts.member,
    sharedWithMe: facts.sharedWithMe,
    visibility: facts.visibility,
    system: Boolean(facts.system),
    access: accessOf(facts),
    records: null,
    changedBy: item.changedBy ?? null,
    details: item.facts.filter(Boolean).join(" · "),
    href: item.href,
    publicHref: item.publicHref ?? null,
    publicLabel: item.publicLabel ?? null,
    trouble: item.trouble ?? null,
    // Only the Tables listing's own row is the table; a form or dashboard ON a kept table is not kept.
    platformOwned: fromTablesListing && table !== undefined && item.id === table.table_id && keptTableRow(table),
    foundation: fromTablesListing && table !== undefined && item.id === table.table_id && table.foundation === true,
    syncedFrom:
      fromTablesListing && table !== undefined && item.id === table.table_id ? syncedFromOf(table) : null,
  };
}

export interface DataHomeBuild {
  rows: DataHomeRow[];
  /** Listings whose door refused, in the store's own words — never an empty list standing in. */
  refusals: Array<{ listing: string; error: DoorFailure }>;
}

/**
 * Flatten the home's one answer (`custom.data_home`) into rows, through the old hub's declarations.
 * `capabilities` is injectable for tests; the page passes HUB_CAPABILITIES.
 */
export async function buildDataHomeRows(
  input: {
    client: RecordsClient;
    dataSource: RecordsDataSource;
    answer: DataHomeAnswer;
  },
  capabilities: readonly HubCapability[] = HUB_CAPABILITIES,
): Promise<DataHomeBuild> {
  const { answer } = input;
  const tables = new Map(answer.tables.map((t) => [t.table_id, t]));
  const ctx: HubReadContext = {
    client: input.client,
    dataSource: input.dataSource,
    organizationId: null,
    tables: [],
    tableKernelId: null,
    everywhere: { ok: true, rows: answer.tables },
    items: { ok: true, rows: answer.items },
    changedBy: new Map(answer.changed_by.map((row) => [`${row.organization_id}:${row.id}`, { at: row.at, who: row.who }])),
  };
  const refusals: DataHomeBuild["refusals"] = [];
  const answered = await Promise.all(
    capabilities.map(async (capability) => {
      const read = await capability.read(ctx);
      if (!read.ok) {
        refusals.push({ listing: capability.title, error: read.error });
        return [] as Array<HubItem & { kind: string; fromTablesListing: boolean }>;
      }
      await attachChangedBy(ctx, capability, read.items);
      return read.items
        // An accepted share is already a row under Tables; listing it twice says one thing twice.
        // An offer not yet accepted stays (census item 8).
        .filter(
          (item) =>
            !(capability.id === "shared-with-me" && item.tableId && tables.has(item.tableId) && item.id.startsWith("accepted:")),
        )
        .map((item) => {
          if (capability.id === "shared-with-me") {
            return {
              ...item,
              kind: "table",
              organizationName: item.tableName,
              scope: item.scope ?? { mine: false, member: false, sharedWithMe: true, visibility: null },
              fromTablesListing: false,
            };
          }
          return {
            ...item,
            kind: item.kind ?? LISTING_KIND[capability.id] ?? capability.id,
            fromTablesListing: capability.id === "tables",
          };
        });
    }),
  );
  return { rows: answered.flat().map((item) => toRow(item, tables, item.fromTablesListing)), refusals };
}
