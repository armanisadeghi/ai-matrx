/**
 * AN EMPTY CREDENTIAL IS A FACT; AN EMPTY READ OF A FULL ONE IS A FAILURE (DD-160, lane
 * ERRORS-HONEST 2026-09-24).
 *
 * RLS refuses a row by returning nothing, so a list that reads a credential's fields and gets `[]`
 * cannot tell "there is nothing in it" from "the database filtered the read" — from 2026-07 to
 * 2026-09-12 a restrictive policy hid every field from its own owner and the screen reported
 * success. The list used to guess from the whole scope ("no field and no file anywhere" = alarm),
 * which blanked an organization whose only credential was simply empty (Pinecrest Records'
 * Bandcamp label login).
 *
 * The guess is replaced by the database's own answer: `users.credential_item_holdings(ids)` counts
 * the live field and file rows of each credential the caller may read (counts only, never a value).
 * The alarm fires only for a credential that HOLDS something the read did not return.
 */

export type HoldingRow = { credential_item_id: string; field_count: number; file_count: number };

export type Holdings =
  | { state: "answered"; rows: HoldingRow[] }
  /** The door is not on this database yet — the migration below has not been applied. */
  | { state: "absent"; why: string }
  | { state: "unavailable"; why: string };

export const HOLDINGS_DOOR_MIGRATION =
  "migrations/campaign/errorshonest_s8_a_credential_says_how_much_it_holds.sql";

/** The error codes that mean "no such function on this database", not "the read failed". */
export function holdingsDoorIsAbsent(code: string | undefined | null): boolean {
  return code === "PGRST202" || code === "42883";
}

function staleAlarm(total: number): string {
  return (
    `Your vault has ${total} ${total === 1 ? "item" : "items"} but none of their ` +
    `fields or files could be read. Either every one of these items is genuinely still empty, ` +
    `or the database refused the read without reporting an error — the second is a known ` +
    `failure mode of this screen (DD-160). Nothing has been lost: reload, and if the items are ` +
    `still blank, report it rather than re-entering the credentials.`
  );
}

/**
 * The alarm sentence, or null when every credential that read empty is genuinely empty.
 *
 * @param total      how many credentials the list read
 * @param emptyIds   the ones whose field AND file reads came back empty
 * @param holdings   the database's answer for `emptyIds`
 */
export function emptyReadAlarm(total: number, emptyIds: readonly string[], holdings: Holdings): string | null {
  if (emptyIds.length === 0) return null;
  if (holdings.state === "answered") {
    const asked = new Set(emptyIds);
    const unread = holdings.rows.filter(
      (r) => asked.has(r.credential_item_id) && (r.field_count > 0 || r.file_count > 0),
    );
    if (unread.length === 0) return null;
    const n = unread.length;
    return (
      `${n === 1 ? "One credential" : `${n} credentials`} in this vault ${n === 1 ? "holds" : "hold"} ` +
      `fields or files this screen could not read — the database refused the read without reporting ` +
      `an error, a known failure mode of this screen (DD-160). Nothing has been lost: reload, and if ` +
      `${n === 1 ? "it is" : "they are"} still blank, report it rather than re-entering the credentials.`
    );
  }
  // Without the database's answer the list cannot tell empty from filtered. It keeps the older,
  // whole-vault rule (every credential empty at once is not a coincidence) and says why.
  if (emptyIds.length < total) return null;
  if (holdings.state === "absent") {
    console.warn(
      `[vault] users.credential_item_holdings is not on this database (${holdings.why}); the empty-read ` +
        `alarm falls back to the whole-vault rule until ${HOLDINGS_DOOR_MIGRATION} is applied.`,
    );
    return staleAlarm(total);
  }
  return (
    `${staleAlarm(total)} (The check that tells an empty credential from an unreadable one did not ` +
    `answer either: ${holdings.why})`
  );
}
