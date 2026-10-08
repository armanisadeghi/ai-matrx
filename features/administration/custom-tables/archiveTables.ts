// features/administration/custom-tables/archiveTables.ts — BULK ARCHIVE, THROUGH THE STORE'S OWN DOOR.
//
// One admin-lane bulk action for any organization's tables (lane ONE-HOME, wave 6). There is no new
// door and no bypass: every table goes through `custom.table_archive` — the same door the table page's
// "Archive this table" uses — once per table, pass after pass until the door says `done`. The door
// decides who may (organization wall, then the editor rung on the Table record) and moves everything
// to Trash as ONE archive event, so the data home's Trash brings each table back whole.
//
// NOTHING FAILS SILENTLY: a refused table is reported by name with the door's own sentence and the
// run carries on with the next one; a pass that moves nothing and does not finish is reported as
// stalled instead of looping forever.

import { CODE_NAMED_TABLE_IDS } from "./codeNamedTableIds";

/** The door's answer to one pass (`custom.table_archive` → jsonb). */
export interface TableArchivePass {
  table_id: string;
  table_name?: string;
  archived: number;
  /** What is built on the table (forms, views, dashboards…) THIS pass archived (TABLE-ACTIONS). */
  built_on_archived?: number;
  remaining: number;
  done: boolean;
  table_archived?: boolean;
  message?: string;
}

/** What calling the door returned: the pass, or the door's refusal. */
export type DoorAnswer =
  | { ok: true; data: TableArchivePass }
  | { ok: false; error: { message: string; code?: string | null } };

/** One call of `custom.table_archive` for one table of one organization. */
export type TableArchiveDoor = (args: {
  p_organization_id: string;
  p_table_id: string;
  p_chunk: number;
  p_include_table: boolean;
}) => Promise<DoorAnswer>;

export interface ArchiveTarget {
  tableId: string;
  organizationId: string;
  name: string;
}

export type ArchiveOutcome =
  | { status: "archived"; target: ArchiveTarget; records: number }
  | { status: "refused"; target: ArchiveTarget; message: string; records: number };

/** The door's own default pass size (~35 ms a record against an 8 s statement timeout). */
export const ARCHIVE_CHUNK = 50;
/** A table that needs more passes than this is stopped and reported, never looped on. */
const MAX_PASSES = 400;

export async function archiveTables(
  targets: readonly ArchiveTarget[],
  door: TableArchiveDoor,
  onProgress?: (done: number, total: number) => void,
): Promise<ArchiveOutcome[]> {
  const outcomes: ArchiveOutcome[] = [];
  for (const [index, target] of targets.entries()) {
    outcomes.push(await archiveOne(target, door));
    onProgress?.(index + 1, targets.length);
  }
  return outcomes;
}

async function archiveOne(target: ArchiveTarget, door: TableArchiveDoor): Promise<ArchiveOutcome> {
  let records = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let answer: DoorAnswer;
    try {
      answer = await door({
        p_organization_id: target.organizationId,
        p_table_id: target.tableId,
        p_chunk: ARCHIVE_CHUNK,
        p_include_table: true,
      });
    } catch (thrown) {
      return {
        status: "refused",
        target,
        records,
        message: thrown instanceof Error ? thrown.message : String(thrown),
      };
    }
    if (!answer.ok) {
      return { status: "refused", target, records, message: answer.error.message || "The archive was refused." };
    }
    records += answer.data.archived ?? 0;
    if (answer.data.done) return { status: "archived", target, records };
    // A pass that took only what is built on the table is progress, not a stall.
    if ((answer.data.archived ?? 0) + (answer.data.built_on_archived ?? 0) === 0) {
      return {
        status: "refused",
        target,
        records,
        message: answer.data.message || "Nothing more could be archived in this table.",
      };
    }
  }
  return { status: "refused", target, records, message: "Stopped after too many passes; run it again to continue." };
}

/** A row of the admin list, from either read door. */
export interface CustomTableRow {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  updatedAt: string | null;
  system: boolean;
  /** The store's own keeper signal (`kept_by_the_app`, a kernel, a context Table). */
  platformOwned: boolean;
}

export type ProtectionReason = "kept" | "named-in-code" | "platform-example" | null;

/**
 * Why a table is never offered for bulk archive. The store's keeper signals first; then any table a
 * code path names by id (generated census); then the platform's "Example: …" seed tables in a system
 * organization, which neither signal marks and one of which no code names.
 */
export function protectionOf(row: CustomTableRow): ProtectionReason {
  if (row.platformOwned) return "kept";
  if (CODE_NAMED_TABLE_IDS.has(row.id)) return "named-in-code";
  if (row.system && row.name.startsWith("Example: ")) return "platform-example";
  return null;
}

/** The store keeps this Table for the app: a kernel, a stored keeper word, or a context Table. */
export function documentIsKept(document: Record<string, unknown> | null | undefined): boolean {
  if (!document) return false;
  if ("kernel" in document) return true;
  if (document.kept_by_the_app === true || document.kept_by_the_app === "true") return true;
  if (typeof document.kept_for === "string" && document.kept_for.trim() !== "") return true;
  return document.offered_as_context === true;
}

/** Name contains, case-insensitive; blank keeps every row. */
export function nameMatches(row: CustomTableRow, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return n === "" || row.name.toLowerCase().includes(n);
}

/** The rows the filters leave: the organization filter (null = every organization), then name contains. */
export function filterRows(rows: readonly CustomTableRow[], orgId: string | null, needle: string): CustomTableRow[] {
  return rows.filter((r) => (!orgId || r.organizationId === orgId) && nameMatches(r, needle));
}

/**
 * Copy selection never outlives the page-level filter that showed it. Protected tables remain
 * selectable for copy; the caller separately narrows Archive targets with protectionOf.
 */
export function keepVisibleSelection(selectedIds: readonly string[], visible: readonly CustomTableRow[]): string[] {
  const allowed = new Set(visible.map((r) => r.id));
  return selectedIds.filter((id) => allowed.has(id));
}
