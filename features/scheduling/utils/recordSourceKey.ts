/**
 * THE EVENT-SOURCE KEY OF A RECORD-STORE TABLE, AS THE SCHEDULE SCREENS READ AND WRITE IT
 * (lane SOURCE-KEY, 2026-09-25).
 *
 * A record-store table's changes are `record:<table id>` events: the store's token is `record`,
 * and the older `custom_record:<table id>` named the retired tier-2 table. The store writes only
 * the new key, reads both, and (until the next step) turns an older client's old key into the new
 * one on the way in (`custom.record_source_key`, `custom._record_source_key_is_record`).
 *
 * WHY THE SCREENS DO NOT TAKE THE KEY FROM THE INSTALLED @ai-matrx/records. A client on a package
 * that still writes `custom_record:` would save a trigger the store will soon refuse, and on the
 * day it refuses, a schedule that never fires. So the screens save the key the STORE's own door
 * answers (`custom.record_change_actions`), and every key they read or save passes through
 * `toRecordSourceKey`, whichever package version is installed. Once the package that exports
 * `recordSourceTable` is installed everywhere, this file delegates to it.
 */

const SOURCE_KEY =
  /^(record|custom_record):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/** The table a record-store key names (either prefix), or `null` for any other key. */
export function recordSourceTable(key: string | null | undefined): string | null {
  const m = key ? SOURCE_KEY.exec(key) : null;
  return m ? m[2]! : null;
}

/** Whether a trigger's key names a record-store table's changes. */
export function isRecordSourceKey(key: string | null | undefined): boolean {
  return recordSourceTable(key) !== null;
}

/** The one key a record-store table's changes are saved under: `record:<table id>`. */
export function recordSourceKey(tableId: string): string {
  return `record:${tableId}`;
}

/** Any key, with an older `custom_record:<table id>` turned into `record:<table id>`. */
export function toRecordSourceKey(key: string): string {
  const table = recordSourceTable(key);
  return table ? recordSourceKey(table) : key;
}
