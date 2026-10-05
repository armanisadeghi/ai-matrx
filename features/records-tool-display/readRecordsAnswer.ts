/**
 * readRecordsAnswer — what a data tool's answer IS, read from the result's own shape (never the
 * arguments the model sent: the `records` tool takes an `action` + `args` envelope that is lifted
 * before it runs, and an argument says what was asked, not what happened).
 *
 * Three answers a person can see:
 *  - ROWS: records the tool read (`records.record_read` with a table → `records[]`, one record →
 *    `record`; `dataset.get` / `dataset.search` → `rows[]` + `dataset_id`). Drawn as the table.
 *  - WRITE: records the tool added, changed or archived (`written` + `record_ids`, `record_id` +
 *    `created`, a batch's `updated[]`, `record_delete`). Drawn as one line + the doors.
 *  - LINE: everything else, as one honest sentence (a table made, a column added, a list of
 *    tables, a guide read). Never the JSON.
 *
 * A held write (`applied: false` + `awaiting_approval`) is NOT read here: the shell mounts the one
 * approval card for every tool before any renderer is asked (`heldWriteOf`).
 */

export interface AnswerRow {
  recordId: string | null;
  values: Record<string, unknown>;
}

export type RecordsAnswer =
  | {
      kind: "rows";
      tableId: string;
      rows: AnswerRow[];
      /** How many records the same question matches, when the store counted more than one page. */
      total: number | null;
      partial: boolean;
      withheldNote: string | null;
    }
  | {
      kind: "write";
      tableId: string | null;
      added: number;
      changed: number;
      archived: number;
      /** The one record this write is about, when it is about one. */
      recordId: string | null;
      notDone: string | null;
    }
  | { kind: "line"; text: string; tableId: string | null };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** What a guide topic is about, in words (a topic is a verb key; the key never reaches the screen). */
const GUIDE_TOPIC_WORDS: Record<string, string> = {
  record_read: "reading records",
  record_write: "writing records",
  record_aggregate: "counts and totals",
  record_delete: "archiving records",
  record_history: "a record's history",
  table_propose: "making a table",
  field_propose: "adding a column",
  import_propose: "importing rows",
  metadata_search: "finding tables",
  table_list: "listing tables",
};

function rowsOf(list: unknown, idKey: string, valuesKey: string): AnswerRow[] | null {
  if (!Array.isArray(list)) return null;
  const rows: AnswerRow[] = [];
  for (const item of list) {
    const row = obj(item);
    if (!row) continue;
    const values = obj(row[valuesKey]);
    if (!values) continue;
    rows.push({ recordId: str(row[idKey]), values });
  }
  return rows;
}

export function readRecordsAnswer(result: Record<string, unknown> | null): RecordsAnswer | null {
  if (!result) return null;
  const action = str(result.action) ?? "";
  const notDone = str(result.not_done);

  // ── ROWS ────────────────────────────────────────────────────────────────────
  const tableId = str(result.table_id) ?? str(result.dataset_id);
  const readRows = rowsOf(result.records, "record_id", "values") ?? rowsOf(result.rows, "row_id", "data");
  if (tableId && readRows && (action === "record_read" || action === "" || action === "get" || action === "search")) {
    return {
      kind: "rows",
      tableId,
      rows: readRows,
      total: num(result.total_records),
      partial: result.partial === true,
      withheldNote: notDone,
    };
  }
  const one = obj(result.record);
  if (action === "record_read" && one) {
    const id = str(one.table_id);
    const values = obj(one.values);
    if (id && values) {
      return {
        kind: "rows",
        tableId: id,
        rows: [{ recordId: str(one.id), values }],
        total: null,
        partial: false,
        withheldNote: Array.isArray(one.withheld) && one.withheld.length > 0 ? "Some values are withheld." : null,
      };
    }
  }

  // ── WRITE ───────────────────────────────────────────────────────────────────
  if (action === "record_write" || action === "record_delete") {
    if (result.applied === false) return null; // the shell's approval card owns a held write
    const ids = Array.isArray(result.record_ids) ? result.record_ids.filter((id): id is string => typeof id === "string") : [];
    const updated = Array.isArray(result.updated) ? result.updated : [];
    const single = str(result.record_id);
    const added = num(result.written) ?? (result.created === true && single ? 1 : 0);
    const changed = updated.length + (result.created === false && single ? 1 : 0);
    const archived = action === "record_delete" ? 1 : 0;
    const recordId =
      ids.length === 1 ? ids[0] : single ?? (updated.length === 1 ? str(obj(updated[0])?.record_id) : null);
    return { kind: "write", tableId, added, changed, archived, recordId, notDone };
  }

  // ── LINE ────────────────────────────────────────────────────────────────────
  if (notDone) return { kind: "line", text: notDone, tableId };
  const count = num(result.count);
  if (action === "table_list" || (!action && Array.isArray(result.tables))) {
    const n = count ?? (Array.isArray(result.tables) ? result.tables.length : 0);
    return { kind: "line", text: `Found ${plural(n, "table", "tables")}.`, tableId: null };
  }
  if (action === "metadata_search") {
    return { kind: "line", text: `Found ${plural(count ?? 0, "match", "matches")}.`, tableId: null };
  }
  if (action === "record_aggregate") {
    const groups = num(result.groups_total) ?? (Array.isArray(result.buckets) ? result.buckets.length : null);
    return {
      kind: "line",
      text: groups != null && groups > 1 ? `Worked out ${plural(groups, "group", "groups")}.` : "Worked out the total.",
      tableId,
    };
  }
  if (action === "record_history") return { kind: "line", text: "Read the record's history.", tableId };
  if (action === "table_propose" || action === "import_propose") {
    const name = str(obj(result.table)?.name) ?? str(result.table_name);
    const written = num(result.rows_written);
    if (result.applied === false) return null;
    const made = name ? `Made the table ${name}` : "Made the table";
    return { kind: "line", text: written != null ? `${made} with ${plural(written, "record", "records")}.` : `${made}.`, tableId };
  }
  if (action === "field_propose") {
    if (result.applied === false) return null;
    const label = str(obj(result.field)?.label);
    return { kind: "line", text: label ? `Added the column ${label}.` : "Added a column.", tableId };
  }
  if (str(result.topic) && str(result.how)) {
    const topic = GUIDE_TOPIC_WORDS[String(result.topic)];
    return { kind: "line", text: topic ? `Read the guide to ${topic}.` : "Read the guide.", tableId: null };
  }
  if (str(result.table_name) && tableId) {
    return { kind: "line", text: `Made the table ${String(result.table_name)}.`, tableId };
  }
  return null;
}

/** The one sentence a write says. */
export function writeSentence(answer: Extract<RecordsAnswer, { kind: "write" }>, tableName: string | null): string {
  const parts: string[] = [];
  if (answer.added) parts.push(`Added ${plural(answer.added, "record", "records")}`);
  if (answer.changed) parts.push(`${parts.length ? "changed" : "Changed"} ${plural(answer.changed, "record", "records")}`);
  if (answer.archived) parts.push(`${parts.length ? "archived" : "Archived"} ${plural(answer.archived, "record", "records")}`);
  const what = parts.length ? parts.join(", ") : "Saved";
  const where = tableName ? (answer.added && !answer.changed && !answer.archived ? ` to ${tableName}` : ` in ${tableName}`) : "";
  return `${what}${where}.`;
}

/** The record page, or the table page when there is no one record. */
export function tableHref(tableId: string, recordId?: string | null): string {
  return recordId ? `/data/${tableId}?record=${encodeURIComponent(recordId)}` : `/data/${tableId}`;
}
