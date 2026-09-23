// features/data-tables/data-source/d3.ts — DECISION D3, AS ONE LINE.
//
// GRID-REBUILD.md D3: `/data/[id]` opens the grid over whichever store holds the
// table. A table the record store holds opens in THIS grid, unchanged, with the
// record-store implementation of the data seam behind it (`table-home.ts`).
//
// The owner has this recommendation in front of him. If he rules the other way,
// change the one line below to "data-v2" and a record-store table goes back to
// being sent to `/data-v2/<id>?moved=older-table`, exactly as before this lane.

export type RecordStoreTablesOpenIn = "this-grid" | "data-v2";

export const RECORD_STORE_TABLES_OPEN_IN: RecordStoreTablesOpenIn = "data-v2";
