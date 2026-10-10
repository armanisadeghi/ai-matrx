// features/unified-data/hub/doors.ts — LANE DATA-HUB
//
// THE STORE DOORS THE HUB CALLS THAT `@ai-matrx/records`' CLIENT DOES NOT
// CARRY YET, AND NOTHING ELSE.
//
// Three of them are this lane's own (`custom.pipelines`, `custom.shares_outside`,
// `custom.hub_changed_by`, applied to the live store on 2026-09-22); two are
// older doors the installed client 0.54.0 predates (`custom.table_kernel_id`,
// `custom.table_share_outside_for_me`). Every one of them goes through the
// package's OWN data seam — `recordsDataSource(...).rpc(fn, args, { schema })` —
// so the schema is said out loud and this file holds no table read, no raw
// `.from()`, and no second way into the store. When the next `@ai-matrx/records`
// release carries these as client methods, this file is deleted and the calls
// move; nothing else in the hub changes, because everything above it takes the
// ROWS and not the transport.
//
// A door that answers an error hands the error back verbatim. Nothing here
// invents an empty array: "there is nothing" and "the call did not happen" are
// different sentences, and the hub prints whichever one is true.

import type { RecordsDataSource } from "@ai-matrx/records";


export interface DoorFailure {
  /** The store's own words. Never rewritten, never swallowed. */
  message: string;
  hint?: string | undefined;
  /** The SQLSTATE the store answered with (57014 = its statement timeout), when it gave one. */
  sqlstate?: string | undefined;
}

export type DoorAnswer<T> = { ok: true; data: T } | { ok: false; error: DoorFailure };

/**
 * A door's failure in a person's words where the store's own are Postgres's: the statement timeout
 * (57014, "canceling statement due to statement timeout") is never printed (VERIFY-DATA-HOME-3 W4,
 * DATA-HOME-3F — the same sentence reached the list's failure slot on the member seat). Every other
 * door sentence is the store's and passes unedited.
 */
export function doorFailureLine(failure: DoorFailure): string {
  if (failure.sqlstate === "57014" || /canceling statement|statement timeout/i.test(failure.message)) {
    return "It took too long to answer.";
  }
  return failure.message;
}

/** One store door, asked as the signed-in person. No store switch is asked first — the store is never off. */
async function call<T>(
  dataSource: RecordsDataSource,
  fn: string,
  args: Record<string, unknown>,
): Promise<DoorAnswer<T>> {
  const answered = await dataSource.rpc(fn, args, { schema: "custom" });
  if (answered.error) {
    return {
      ok: false,
      error: {
        message: answered.error.message ?? `custom.${fn} did not answer.`,
        hint: answered.error.hint ?? undefined,
        ...(answered.error.code ? { sqlstate: answered.error.code } : {}),
      },
    };
  }
  return { ok: true, data: (answered.data ?? []) as T };
}

/**
 * Lane 7 W5 — the organization of one standard row, read AS THE PERSON (`custom.entity_record_home`,
 * SECURITY INVOKER). Answers `{organization_id}` or `{refused, reason}`; never raises. The
 * custom-fields section on every record view asks it, never the active organization.
 */
export interface RecordHomeAnswer {
  organization_id?: string;
  refused?: string;
  reason?: string;
}
export function entityRecordHome(
  dataSource: RecordsDataSource,
  token: string,
  recordId: string,
): Promise<DoorAnswer<RecordHomeAnswer>> {
  return call<RecordHomeAnswer>(dataSource, "entity_record_home", { p_token: token, p_record_id: recordId });
}

/**
 * Lane 7 W5 — whether this person can open the record's custom values at all
 * (`custom.entity_record_read`, the read the custom-fields section itself makes). The section asks it
 * once before it mounts, so a store refusal is turned into a short state and never printed raw.
 */
export function entityRecordReadable(
  dataSource: RecordsDataSource,
  organizationId: string,
  token: string,
  recordId: string,
): Promise<DoorAnswer<unknown>> {
  return call<unknown>(dataSource, "entity_record_read", {
    p_organization_id: organizationId,
    p_token: token,
    p_record_id: recordId,
  });
}

/** REC-27's Table kernel. Every Table of an organization is a record in it. */
export function tableKernelId(dataSource: RecordsDataSource): Promise<DoorAnswer<string>> {
  return call<string>(dataSource, "table_kernel_id", {});
}

export interface PipelineRow {
  table_id: string;
  table_name: string;
  stage_field: string | null;
  stage_label: string | null;
  stages: number;
  rules: number;
  /** The store's own refusal when a declared board cannot be drawn. Never hidden. */
  broken: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Every board in this organization, across the Tables this person can open. */
export function pipelines(
  dataSource: RecordsDataSource,
  organizationId: string,
): Promise<DoorAnswer<PipelineRow[]>> {
  return call<PipelineRow[]>(dataSource, "pipelines", { p_organization_id: organizationId });
}

export interface ShareOutsideRow {
  invitation_id: string;
  table_id: string;
  table_name: string;
  email: string;
  level: string;
  level_label: string;
  status: string;
  joined: boolean;
  expired: boolean;
  invited_at: string | null;
  expires_at: string | null;
  say: string;
}

/** Everyone outside this organization who has been given one of its tables. */
export function sharesOutside(
  dataSource: RecordsDataSource,
  organizationId: string,
): Promise<DoorAnswer<ShareOutsideRow[]>> {
  return call<ShareOutsideRow[]>(
    dataSource,
    "shares_outside",
    { p_organization_id: organizationId });
}

export interface ShareInboundRow {
  invitation_id: string;
  organization_id: string;
  organization: string;
  table_id: string;
  table_name: string;
  level: string;
  level_label: string;
  /**
   * 🚨 THE DOOR ANSWERS ONLY `status = 'pending'` INVITATIONS, and the token is
   * how one is accepted. Measured on the live store, 2026-09-23: the three rows
   * this listing showed `test@test.com` were invitations nobody had accepted —
   * `iam.permissions` held ZERO active grants for that person on that
   * organization — so `custom.portal_admits` was false, every door refused, and
   * the row could not open the table however the address was written. What the
   * row opens is the INVITATION's own screen.
   */
  token: string;
  expires_at: string | null;
}

/**
 * WHAT SOMEBODY ELSE'S ORGANIZATION HAS OFFERED THE PERSON SIGNED IN.
 *
 * `custom.table_share_outside_for_me` returns PENDING invitations and nothing
 * else — never an accepted share. Accepting one (`/invitations/table/accept/<token>`)
 * writes the grant and takes the row off this list, which is why the listing
 * shrinks after a person opens one.
 */
export function sharedWithMe(
  dataSource: RecordsDataSource,
): Promise<DoorAnswer<ShareInboundRow[]>> {
  return call<ShareInboundRow[]>(dataSource, "table_share_outside_for_me", {});
}

export interface SharedTableRow {
  table_id: string;
  organization_id: string;
  organization: string;
  table_name: string;
  level: string;
  level_label: string;
  shared_at: string | null;
  /** Whether the owner's outside door is still open, so the table will actually open. */
  opens: boolean;
  /** The store's sentence — what this share lets them do, or why it will not open now. */
  say: string;
}

/**
 * THE SHARES THE PERSON SIGNED IN HAS ACCEPTED — `custom.tables_shared_with_me()`
 * (lane HUB-FIX, VERIFIER-15 H6). Live grants addressed to them on a Table of an
 * organization they are not a member of. Without it, accepting a share took the
 * table off the hub for good, because the pending door above is all it read.
 */
export function tablesSharedWithMe(
  dataSource: RecordsDataSource,
): Promise<DoorAnswer<SharedTableRow[]>> {
  return call<SharedTableRow[]>(dataSource, "tables_shared_with_me", {});
}

export interface TableFactRow {
  table_id: string;
  /** The record's own `visibility` column: personal · internal · link · public. */
  visibility: string;
  /** Whether the person signed in MADE this Table. Never who did. */
  mine: boolean;
  /**
   * The store keeps this Table for itself (SC-1: a column's pick list, its own saved views,
   * bookkeeping). The Table list is built from the DOCUMENT, which need not carry it, so the hub
   * folds it on from here — otherwise a pick list is listed as one of the organization's tables.
   * Absent on a store whose door answers only the first three columns.
   */
  platform_owned?: boolean | null;
  /** The store's sentence for who keeps a kept Table. */
  keeper_says?: string | null;
}

/**
 * WHO CAN SEE EACH TABLE, AND WHETHER THE CALLER MADE IT — `custom.table_facts(org)`
 * (lane HUB-FIX). Both are COLUMNS of `custom.record`, and the Table list is built
 * from each Table's DOCUMENT, so without this every Table arrived with neither and
 * no lane could be decided: Mine read 0 everywhere (VERIFIER-16 M6).
 */
export function tableFacts(
  dataSource: RecordsDataSource,
  organizationId: string,
): Promise<DoorAnswer<TableFactRow[]>> {
  return call<TableFactRow[]>(dataSource, "table_facts", { p_organization_id: organizationId });
}

/** The three kinds `custom.hub_changed_by` knows. Closed, and it refuses a fourth. */
export type ChangedByKind = "structure" | "form" | "portal";

export interface ChangedByRow {
  id: string;
  at: string | null;
  who: string | null;
}

/**
 * WHO LAST TOUCHED EACH OF THESE — one call for a whole page of the hub.
 *
 * Asking per item would be one round trip per row, which is the fan-out the
 * whole hub exists to remove. The store bounds what it will answer: structural
 * objects only, never a person's business record.
 */
export function changedBy(
  dataSource: RecordsDataSource,
  organizationId: string,
  kind: ChangedByKind,
  ids: readonly string[],
): Promise<DoorAnswer<ChangedByRow[]>> {
  if (ids.length === 0) return Promise.resolve({ ok: true, data: [] });
  return call<ChangedByRow[]>(
    dataSource,
    "hub_changed_by",
    { p_organization_id: organizationId, p_kind: kind, p_ids: ids.slice(0, 500) });
}

export interface DataHomeTableRow {
  table_id: string;
  table_name: string;
  organization_id: string;
  organization_name: string;
  /** False for an outsider the organization let in by a share. */
  member: boolean;
  /** The record's own `visibility` column: personal · internal · link · public. */
  visibility: string;
  updated_at: string | null;
  /** The Table record's own created_by is the person signed in. */
  mine: boolean;
  /** A live grant names the person signed in, given by somebody else. */
  shared_with_me: boolean;
  /** The store keeps this Table for itself (custom.table_placement). Listed all the same. */
  platform_owned: boolean;
  /**
   * What it is, in the store's one word: table (the person's own) · list · scope · form · view ·
   * comment · dashboard · action · checklist · booking · workflow · kit · store · demo · app.
   */
  kind: string;
  /** The Table's maker shares a live team with the person in its organization (My team). */
  team?: boolean;
  /** Its organization is one the platform keeps (System). */
  system?: boolean;
  /** The Table's own maker (`created_by`) — the fact Mine and My team are decided from. */
  created_by?: string | null;
  /**
   * The maker's name from `custom.history_people` in the Table's own organization (the door
   * "Changed by" uses). Null = the maker is not a member of that organization, or there is none.
   */
  created_by_name?: string | null;
  /**
   * Lane 10 FD: part of the business's day-one data (`custom.data_home` reads it off the Table's
   * document). Absent on a store before that door learned it — read as not Foundation.
   */
  foundation?: boolean;
}

/**
 * EVERY TABLE THIS PERSON CAN OPEN, IN EVERY ORGANIZATION SHE CAN REACH, WITH THE FOUR FACTS THE
 * DATA HOME'S FILTERS READ — `custom.data_home_tables()` (lane DATA-HOME-1). The walk is
 * `custom.tables_i_can_open()`'s own; the door adds whether she made each one, whether
 * somebody shared it with her, and — because the home hides nothing (Arman, 21:40 PT) — the
 * tables the app keeps for itself, each with its kind. The door skips every organization whose
 * store is off, so there is no single switch to ask here.
 *
 * `organizationId` — THE ORGANIZATION DROPDOWN, HONOURED IN THE DOOR (lane DATA-HOME-2): named, the
 * door walks only that organization (`p_organization_id`), in every lane and kind; null walks them
 * all. It only narrows: it never admits an organization the walk would not.
 */
export function dataHomeTables(
  dataSource: RecordsDataSource,
  organizationId: string | null = null,
  options: PlatformTablesOption = {},
): Promise<DoorAnswer<DataHomeTableRow[]>> {
  return call<DataHomeTableRow[]>(
    dataSource,
    "data_home_tables",
    // "SHOW PLATFORM TABLES" (CHAIR-DOORS-2, N-C8): the door leaves out the tables the app keeps for
    // agents' outputs; the (uuid, boolean) overload is picked by naming BOTH arguments.
    options.includePlatformTables
      ? { p_organization_id: organizationId, p_include_platform_tables: true }
      : organizationId
        ? { p_organization_id: organizationId }
        : {},
  );
}

/** Every kind of row the data home lists beside its tables (`custom.data_home_items`, DATA-HOME-2). */
export type DataHomeItemKind =
  | "form"
  | "booking"
  | "portal"
  | "dashboard"
  | "digest"
  | "checklist"
  | "automation"
  | "share";

/** One row the data home lists beside its tables. */
export interface DataHomeItemRow {
  kind: DataHomeItemKind;
  organization_id: string;
  organization_name: string;
  item_id: string;
  table_id: string | null;
  table_name: string | null;
  /** The row the store's own list door (custom.forms, custom.dashboards …) answers for it. */
  item_row: Record<string, unknown>;
}

/**
 * EVERY FORM, BOOKING PAGE, PORTAL, DASHBOARD, DIGEST, CHECKLIST, AUTOMATION AND OUTSIDE SHARE THIS
 * PERSON MAY SEE, IN EVERY ORGANIZATION THE DATA HOME WALKS — or in the one named (lane DATA-HOME-2).
 * The same organizations `custom.data_home_tables` walks; each organization's rows are the store's
 * own list doors' answers, so their walls decide what is listed.
 */
export function dataHomeItems(
  dataSource: RecordsDataSource,
  organizationId: string | null = null,
): Promise<DoorAnswer<DataHomeItemRow[]>> {
  return call<DataHomeItemRow[]>(
    dataSource,
    "data_home_items",
    organizationId ? { p_organization_id: organizationId } : {},
  );
}

/** An archived Table of any organization the person belongs to (`custom.archived_tables_everywhere`). */
export interface ArchivedEverywhereRow {
  id: string;
  document: { name?: string } | null;
  archived_at: string | null;
  archived_by_name: string | null;
  organization_id: string;
  organization_name: string | null;
  /**
   * The table's maker, for the Mine lane (`custom.archived_tables_everywhere` since
   * tableactions_d; absent on a store without it, and then no archived row is "Mine").
   */
  created_by?: string | null;
  /** The maker's name, the same sentence the door gives the archiver. */
  created_by_name?: string | null;
}

/**
 * THE ARCHIVED TABLES OF EVERY ORGANIZATION THE PERSON BELONGS TO, one page at a time, each row
 * naming its organization (org-filter sweep, 2026-09-29). Newest first; `limit` is capped at 1000.
 */
export async function archivedTablesEverywhere(
  dataSource: RecordsDataSource,
  page: { limit: number; offset: number },
  /** The store's order (tableactions_e): archived_at (default, newest first) · name · organization. */
  sort?: { sort: "archived_at" | "name" | "organization"; desc: boolean },
): Promise<DoorAnswer<ArchivedEverywhereRow[]>> {
  const base = { p_lane: "org", p_limit: page.limit, p_offset: page.offset };
  const sorted = sort && !(sort.sort === "archived_at" && sort.desc);
  let answered = await call<{ tables?: ArchivedEverywhereRow[] }>(
    dataSource,
    "archived_tables_everywhere",
    sorted ? { ...base, p_sort: sort.sort, p_desc: sort.desc } : base,
  );
  // A STORE WITHOUT THE SORTED DOOR YET (main before the chair applies tableactions_e) answers the
  // archive newest archived first, as it always did.
  if (!answered.ok && sorted && (answered.error.sqlstate === "PGRST202" || answered.error.sqlstate === "42883")) {
    answered = await call<{ tables?: ArchivedEverywhereRow[] }>(dataSource, "archived_tables_everywhere", base);
  }
  return answered.ok ? { ok: true, data: answered.data.tables ?? [] } : answered;
}

/** One Table's count from `custom.table_row_counts`: the rows THIS reader may see. */
export interface TableRowCount {
  table_id: string;
  visible_rows: number;
}

/** One Field of a Table as the Map reads it (`custom.table_map_fields`): a link, or one of the first columns. */
export interface TableMapFieldRow {
  table_id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  /** The Table a link column points at; null for every other column. */
  relation_target: string | null;
  /** Set when the link is two-way: the name of its reverse column on the target. */
  inverse_key: string | null;
  field_sort: number | string | null;
  is_link: boolean;
}

/** The Map's door counts at most this many Tables a call. */
export const TABLE_MAP_MAX = 500;

/**
 * THE TABLES MAP IN ONE CALL PER ORGANIZATION (`custom.table_map_fields`, lane TABLE-MAP): every link
 * column of the named Tables plus each one's first few columns, for the Tables the reader may know.
 * A Table she may not know gets no rows, exactly as an invented id does.
 */
export async function tableMapFields(
  dataSource: RecordsDataSource,
  organizationId: string,
  tableIds: readonly string[],
): Promise<DoorAnswer<TableMapFieldRow[]>> {
  return call<TableMapFieldRow[]>(dataSource, "table_map_fields", {
    p_organization_id: organizationId,
    p_table_ids: [...tableIds],
  });
}

/** The door counts at most this many Tables a call. */
export const TABLE_ROW_COUNTS_MAX = 500;

/**
 * EXACT ROW COUNTS FOR THE TABLES A SCREEN SHOWS (`custom.table_row_counts`, GRID-PRIMITIVES G12),
 * one organization a call, at most 500 Tables. A Table the reader may not know gets no row.
 */
export async function tableRowCounts(
  dataSource: RecordsDataSource,
  organizationId: string,
  tableIds: readonly string[],
): Promise<DoorAnswer<TableRowCount[]>> {
  return call<TableRowCount[]>(dataSource, "table_row_counts", {
    p_organization_id: organizationId,
    p_table_ids: [...tableIds],
  });
}

/** An archived portal of any organization the person belongs to (`custom.list_portals_everywhere`). */
export interface ArchivedPortalEverywhereRow {
  portal_id: string;
  title: string | null;
  client_table_id: string;
  client_table: string | null;
  organization_id: string;
  organization_name: string | null;
}

export async function archivedPortalsEverywhere(
  dataSource: RecordsDataSource,
): Promise<DoorAnswer<ArchivedPortalEverywhereRow[]>> {
  const answered = await call<{ portals?: ArchivedPortalEverywhereRow[] }>(dataSource, "list_portals_everywhere", {
    p_archived: "archived",
  });
  return answered.ok ? { ok: true, data: answered.data.portals ?? [] } : answered;
}

/** Bring one archived record back, in the organization it lives in (all-organizations archive). */
export async function restoreRecordIn(
  dataSource: RecordsDataSource,
  organizationId: string,
  recordId: string,
): Promise<DoorAnswer<null>> {
  const answered = await call<unknown>(dataSource, "record_restore", {
    p_organization_id: organizationId,
    p_record_id: recordId,
  });
  return answered.ok ? { ok: true, data: null } : answered;
}

/** One pass of `custom.table_restore` (lane TABLE-ACTIONS): what came back and what still waits. */
export interface TableRestorePass {
  table_id: string;
  table_name: string;
  restored: number;
  structure_restored: number;
  built_on_restored: number;
  remaining: number;
  built_on_remaining: number;
  /** Rows refused on their own now, left archived and named. */
  left: number;
  /** Each row left archived, with the store's own reason for it. */
  left_reasons?: Record<string, string>;
  /** Restoring events of this table still open (a re-archive mid-restore leaves two). */
  events_open?: number;
  table_restored: boolean;
  done: boolean;
  message: string;
}

/** The pass `restoreTableIn` starts with; the door also stops each pass itself at 1 s. */
export const TABLE_RESTORE_PASS = 20;
const TABLE_RESTORE_MAX_PASSES = 500;

/**
 * BRING A WHOLE TABLE BACK, PASS BY PASS (`custom.table_restore`, lane TABLE-ACTIONS 2026-10-03).
 *
 * `custom.record_restore` on a Table brought the Table, its structure, every record and everything
 * built on it back in ONE statement and timed out on a big table. This loops the paged door until
 * it answers `done`, halving the pass on a statement timeout (a timed-out pass changed nothing).
 * The same loop as `@ai-matrx/records` 0.66 `client.tableRestoreWhole`; this repo installs that
 * version once it is published, and this goes.
 *
 * `carryOnOnly` (the Trash, whose own door already brought the Table and its first pass back):
 * a Record rather than a Table, or nothing left waiting, answers `null` — there is nothing to carry
 * on. Otherwise a store without the door yet (the main database before the chair's apply) brings
 * the table back through the one-call `record_restore`, as before.
 */
export async function restoreTableIn(
  dataSource: RecordsDataSource,
  organizationId: string,
  tableId: string,
  options: { carryOnOnly?: boolean; onPass?: (pass: TableRestorePass) => void } = {},
): Promise<DoorAnswer<TableRestorePass | null>> {
  let size = TABLE_RESTORE_PASS;
  for (let pass = 0; pass < TABLE_RESTORE_MAX_PASSES; pass += 1) {
    const answered = await call<TableRestorePass>(dataSource, "table_restore", {
      p_organization_id: organizationId,
      p_table_id: tableId,
      p_chunk: size,
    });
    if (!answered.ok) {
      const code = answered.error.sqlstate;
      if (code === "57014" && size > 1) {
        size = Math.max(1, Math.floor(size / 2));
        continue;
      }
      const doorAbsent = code === "PGRST202" || code === "42883";
      if (options.carryOnOnly && pass === 0 && (doorAbsent || code === "02000")) return { ok: true, data: null };
      if (doorAbsent && pass === 0) {
        const back = await restoreRecordIn(dataSource, organizationId, tableId);
        return back.ok ? { ok: true, data: null } : back;
      }
      return answered;
    }
    options.onPass?.(answered.data);
    if (answered.data.done) return answered;
  }
  return {
    ok: false,
    error: { message: `The table is not all back after ${TABLE_RESTORE_MAX_PASSES} passes. Bring it back again to carry on.` },
  };
}

/** One (organization, kind, ids) question for `custom.data_home_changed_by`. */
export interface ChangedByAsk {
  organization_id: string;
  kind: ChangedByKind;
  ids: string[];
}

/**
 * WHO CHANGED EACH ROW, FOR EVERY ORGANIZATION SHOWN, IN ONE CALL (`custom.data_home_changed_by`,
 * DATA-HOME-2): `custom.hub_changed_by` per organization, each decided by the door in its own name.
 */
export function dataHomeChangedBy(
  dataSource: RecordsDataSource,
  asks: readonly ChangedByAsk[],
): Promise<DoorAnswer<Array<ChangedByRow & { organization_id: string }>>> {
  const real = asks.filter((a) => a.ids.length > 0).map((a) => ({ ...a, ids: a.ids.slice(0, 500) }));
  if (real.length === 0) return Promise.resolve({ ok: true, data: [] });
  return call<Array<ChangedByRow & { organization_id: string }>>(dataSource, "data_home_changed_by", {
    p_asks: real.slice(0, 200),
  });
}

/**
 * "SHOW PLATFORM TABLES" (CHAIR-DOORS-2, v6 N-C8): every table door leaves out the tables the app
 * keeps out of default lists (`custom.table_kept_out_of_lists` — an agent's outputs tables) unless
 * asked. Omitted or false = the default list.
 */
export interface PlatformTablesOption {
  includePlatformTables?: boolean;
}

/** The data home in one answer (`custom.data_home`, DATA-HOME-2). */
export interface DataHomeAnswer {
  tables: DataHomeTableRow[];
  items: DataHomeItemRow[];
  /** Who changed each row the page shows, per organization (custom.data_home_changed_by's rows). */
  changed_by: Array<ChangedByRow & { organization_id: string }>;
}

/**
 * THE DATA HOME IN ONE CALL (`custom.data_home`, chair ruling 2026-09-29): the tables, everything else
 * the home lists, and who changed each row — the rows of custom.data_home_tables, custom.data_home_items
 * and custom.data_home_changed_by, with the walk of which Tables she may open asked once for all of
 * them. `organizationId` narrows to one organization, decided by the door in its own name.
 */
export async function dataHome(
  dataSource: RecordsDataSource,
  organizationId: string | null = null,
  options: PlatformTablesOption = {},
): Promise<DoorAnswer<DataHomeAnswer>> {
  const answered = await call<DataHomeAnswer | null>(dataSource, "data_home", {
    ...(organizationId ? { p_organization_id: organizationId } : {}),
    ...(options.includePlatformTables ? { p_include_platform_tables: true } : {}),
  });
  if (!answered.ok) return answered;
  const data = answered.data && !Array.isArray(answered.data) ? answered.data : null;
  return {
    ok: true,
    data: { tables: data?.tables ?? [], items: data?.items ?? [], changed_by: data?.changed_by ?? [] },
  };
}

/**
 * Where a server search matched a row (`custom.data_home(p_search)`, DATA-HOME-3B): its title, its
 * description, one of its Fields (label or key), or a whole id pasted in.
 */
export type DataHomeMatchedIn = "name" | "description" | "field" | "id";

/** What a searched row carries beside its own columns. */
export interface DataHomeMatch {
  /** `public.mtx_search_score` — higher is better; the door already ordered the rows by it. */
  match_rank: number;
  matched_in: DataHomeMatchedIn;
  /** The Field label (or key) that matched, when `matched_in` is `field`; otherwise null. */
  matched_field: string | null;
}

/** The data home narrowed to one search, ranked (`custom.data_home(p_organization_id, p_search)`). */
export interface DataHomeSearchAnswer {
  /** The search the door answered, trimmed — compare it with the box to drop a stale answer. */
  search: string;
  tables: Array<DataHomeTableRow & DataHomeMatch>;
  items: Array<DataHomeItemRow & DataHomeMatch>;
  changed_by: Array<ChangedByRow & { organization_id: string }>;
}

/**
 * THE DATA HOME'S SERVER SEARCH, IN THE SAME ONE CALL (`custom.data_home(p_organization_id,
 * p_search)`, lane DATA-HOME-3B): the rows the unsearched home lists, narrowed to the ones whose
 * title, description or Fields (label or key) match, best match first, each with `match_rank`,
 * `matched_in` and `matched_field`. It never answers a row the unsearched home would not (the door's
 * walls decide both). `organizationId` narrows exactly as in `dataHome`. A blank search sends nothing
 * and answers no server hits (`search: ""`): the unsearched home is `dataHome`'s. Over 200 characters the door refuses (22023).
 * No record counts and no search inside records: neither has a door that fits this call.
 */
export async function dataHomeSearch(
  dataSource: RecordsDataSource,
  search: string,
  organizationId: string | null = null,
  options: PlatformTablesOption = {},
): Promise<DoorAnswer<DataHomeSearchAnswer>> {
  const q = search.trim();
  if (q === "") return { ok: true, data: { search: "", tables: [], items: [], changed_by: [] } };
  const answered = await call<DataHomeSearchAnswer | null>(dataSource, "data_home", {
    ...(organizationId ? { p_organization_id: organizationId } : {}),
    p_search: q,
    ...(options.includePlatformTables ? { p_include_platform_tables: true } : {}),
  });
  if (!answered.ok) return answered;
  const data = answered.data && !Array.isArray(answered.data) ? answered.data : null;
  return {
    ok: true,
    data: {
      search: data?.search ?? q,
      tables: data?.tables ?? [],
      items: data?.items ?? [],
      changed_by: data?.changed_by ?? [],
    },
  };
}
