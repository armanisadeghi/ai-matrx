// features/unified-data/home/archivedTablesPlace.ts
//
// WHERE AN ARCHIVED TABLE WAITS — the Data home list under its Archived filter ("archived only",
// the shell's `?archived=archived`; TABLE-ACTIONS item 10). A reversible-action announcement for a
// table ("Open Archived tables") points here. The older address `?found=archived-tables` lands on
// the same filter (`DataHomeList` turns it into this one).
import type { ReversibleFoundAt } from "@ai-matrx/kit/reversible";

export const ARCHIVED_TABLES_SPOT = "archived-tables";

export const ARCHIVED_TABLES_HREF = "/data-v2?archived=archived";

export const ARCHIVED_TABLES_PLACE: ReversibleFoundAt = {
  label: "Archived tables",
  href: ARCHIVED_TABLES_HREF,
};
