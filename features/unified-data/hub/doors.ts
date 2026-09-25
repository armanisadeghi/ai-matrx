// features/unified-data/hub/doors.ts — LANE DATA-HUB
//
// THE FIVE STORE DOORS THE HUB CALLS THAT `@ai-matrx/records`' CLIENT DOES NOT
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

import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

export interface DoorFailure {
  /** The store's own words. Never rewritten, never swallowed. */
  message: string;
  hint?: string | undefined;
}

export type DoorAnswer<T> = { ok: true; data: T } | { ok: false; error: DoorFailure };

/**
 * THE SWITCH, READ ONCE PER ORGANIZATION AND CHECKED ON EVERY CALL THAT READS
 * ONE ORGANIZATION'S STORE.
 *
 * The hub's own component reads it too, and the page above that is already
 * behind it — this is the layer that cannot be walked past, because it is
 * inside the only file that can send these three doors at all. Asking per call
 * would be an extra round trip per row on the page, so the answer is held for
 * the lifetime of the tab, keyed by organization; the switch is one
 * organization's decision, set once, on a screen that reloads the app.
 *
 * `off` and `could not check` are different sentences and both are returned as
 * a refusal, never as an empty list.
 */
const switchAnswers = new Map<string, Promise<{ on: boolean; why: string }>>();

function storeIsOpen(organizationId: string): Promise<{ on: boolean; why: string }> {
  const held = switchAnswers.get(organizationId);
  if (held) return held;
  const asked = UNIFIED_DATA_CAMPAIGN.check(organizationId).then((answer) => ({
    on: answer.state === "on",
    why:
      answer.state === "unavailable"
        ? `The record store's switch could not be read, so nothing was read — this is not an answer about the organization. ${answer.cause}`
        : "This organization does not keep its data in the record store, so nothing was read.",
  }));
  switchAnswers.set(organizationId, asked);
  return asked;
}

async function call<T>(
  dataSource: RecordsDataSource,
  fn: string,
  args: Record<string, unknown>,
  organizationId?: string,
): Promise<DoorAnswer<T>> {
  if (organizationId) {
    const gate = await storeIsOpen(organizationId);
    if (!gate.on) return { ok: false, error: { message: gate.why } };
  }
  const answered = await dataSource.rpc(fn, args, { schema: "custom" });
  if (answered.error) {
    return {
      ok: false,
      error: {
        message: answered.error.message ?? `custom.${fn} did not answer.`,
        hint: answered.error.hint ?? undefined,
      },
    };
  }
  return { ok: true, data: (answered.data ?? []) as T };
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
  return call<PipelineRow[]>(dataSource, "pipelines", { p_organization_id: organizationId }, organizationId);
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
    { p_organization_id: organizationId },
    organizationId,
  );
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
  kept_by_the_app?: boolean | null;
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
  return call<TableFactRow[]>(dataSource, "table_facts", { p_organization_id: organizationId }, organizationId);
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
    { p_organization_id: organizationId, p_kind: kind, p_ids: ids.slice(0, 500) },
    organizationId,
  );
}

export interface TableICanOpenRow {
  table_id: string;
  table_name: string;
  organization_id: string;
  organization_name: string;
  /** False for an outsider the organization let in by a share. */
  member: boolean;
  /** The record's own `visibility` column: personal · internal · link · public. */
  visibility: string;
  updated_at: string | null;
}

/**
 * EVERY TABLE THIS PERSON CAN OPEN, IN EVERY ORGANIZATION SHE CAN REACH —
 * `custom.tables_i_can_open()` (lane ACCESS-IS-PERSONAL). The hub's "All my
 * organizations" list: the active organization filters a list only while the page says
 * which one, and this is the "select all" (owner's law, 2026-09-23). It takes no
 * organization; the door skips every organization whose store is off, so there is no
 * single switch to ask here.
 */
export function tablesICanOpen(dataSource: RecordsDataSource): Promise<DoorAnswer<TableICanOpenRow[]>> {
  return call<TableICanOpenRow[]>(dataSource, "tables_i_can_open", {});
}
