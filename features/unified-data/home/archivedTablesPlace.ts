// features/unified-data/home/archivedTablesPlace.ts
//
// WHERE AN ARCHIVED TABLE WAITS — the Data home's "Show archived tables" disclosure
// (`DataHomeArchive`). A reversible-action announcement for a table points here; the disclosure
// opens itself and flashes when the address carries this spot (`lib/reversible/useFoundHere`).
import type { ReversibleFoundAt } from "@ai-matrx/kit/reversible";

export const ARCHIVED_TABLES_SPOT = "archived-tables";

export const ARCHIVED_TABLES_PLACE: ReversibleFoundAt = {
  label: "Archived tables",
  href: "/data-v2",
  highlight: ARCHIVED_TABLES_SPOT,
};
