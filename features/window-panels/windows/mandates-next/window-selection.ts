// features/window-panels/windows/mandates-next/window-selection.ts
//
// WHICH MANDATE THE WINDOW HAS OPEN — only ever the one the person chose (or
// the one it was opened on). The list is a way to choose, never a source of
// choice: filtering, searching or reloading it can never move the open mandate
// (review of the new window, 2026-09-24 — the old derivation fell back to the
// first visible row, so typing in search switched the open mandate, rewrote the
// URL and re-read the record).

export interface SelectableMandateRow {
  id: string;
  mandate_key: string;
}

export type WindowSelection<Row extends SelectableMandateRow> =
  /** Nothing opened yet — the person picks from the list. */
  | { status: "unchosen" }
  /** A key is open; the list has not answered yet (or could not be read). */
  | { status: "pending"; key: string }
  | { status: "found"; key: string; row: Row }
  /** The list answered and nothing in it is this key. */
  | { status: "not-found"; key: string };

export function windowSelectionOf<Row extends SelectableMandateRow>(
  rows: readonly Row[] | null,
  selectedKey: string | null,
): WindowSelection<Row> {
  const key = selectedKey?.trim() ?? "";
  if (!key) return { status: "unchosen" };
  if (!rows) return { status: "pending", key };
  const row = rows.find((r) => r.mandate_key === key || r.id === key);
  return row ? { status: "found", key, row } : { status: "not-found", key };
}
