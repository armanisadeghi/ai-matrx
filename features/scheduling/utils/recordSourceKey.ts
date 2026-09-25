/**
 * THE EVENT-SOURCE KEY OF A RECORD-STORE TABLE, AS THE SCHEDULE SCREENS READ AND WRITE IT
 * (lane SOURCE-KEY, closed 2026-09-25).
 *
 * A record-store table's changes are `record:<table id>` events: the store's token is `record`;
 * the older `custom_record:<table id>` named the retired tier-2 table and nothing reads or writes
 * it any more. The store refuses a write of the old key by name (`custom._record_source_key_is_record`,
 * 23514) and its two readers (`custom.record_source_keys`, `custom.record_source_table`) no longer
 * match it either — so this file, the last acceptance of the old key on the client, retires it too.
 *
 * WHY THE SCREENS DO NOT TAKE THE KEY FROM THE INSTALLED @ai-matrx/records. A client on a package
 * that still writes `custom_record:` would save a trigger the store refuses outright. So the
 * screens save the key the STORE's own door answers (`custom.record_change_actions`), and every
 * key they read or save passes through `toRecordSourceKey`, whichever package version is
 * installed. Once the package that exports `recordSourceTable` is installed everywhere, this file
 * delegates to it.
 */

const SOURCE_KEY =
  /^record:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/** The table a record-store key names, or `null` for any other key (including a retired `custom_record:` one). */
export function recordSourceTable(key: string | null | undefined): string | null {
  const m = key ? SOURCE_KEY.exec(key) : null;
  return m ? m[1]! : null;
}

/** Whether a trigger's key names a record-store table's changes. */
export function isRecordSourceKey(key: string | null | undefined): boolean {
  return recordSourceTable(key) !== null;
}

/** The one key a record-store table's changes are saved under: `record:<table id>`. */
export function recordSourceKey(tableId: string): string {
  return `record:${tableId}`;
}

/**
 * Any key, unchanged. Kept as the one pass-through point every read/save goes through (rather
 * than inlining `entity_type` reads) so a future key change is one file again. A retired
 * `custom_record:<table id>` key is no longer recognized or rewritten — the store refuses it on
 * write, so a live key is always already `record:<table id>`.
 */
export function toRecordSourceKey(key: string): string {
  return key;
}
