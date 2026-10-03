// features/unified-data/home/dataHomeArchived.ts — lane TABLE-ACTIONS item 10
//
// THE DATA HOME'S ARCHIVE IS ITS LIST'S ARCHIVED FILTER (the shell's ArchiveFilter: hide archived ·
// show all · archived only — common-docs/policies/archived-items.md). This reads what that filter
// shows: every archived table and portal of every organization the person belongs to. It runs only
// when the filter asks (`createDataHomeService.loadArchived`), never on first paint.
//
// NEVER THOUSANDS AT ONCE (DATA-HOME-3F; VERIFY-DATA-HOME-3 W4): the door is asked 200 at a time
// until a short page, up to DATA_HOME_ROW_CAP. A statement timeout (57014) is said in a person's
// words; Postgres's sentence never reaches the screen.

import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { archivedPortalRow, archivedTableRow, type DataHomeRow } from "./dataHomeRows";

export const ARCHIVE_PAGE = 200;

/** The most archived rows read (the home's own stated bound). */
export const ARCHIVE_ROW_CAP = 5000;

/** The archive read's failure, in a person's words. */
export function archiveReadFailure(failure: doors.DoorFailure): Error {
  return new Error(
    failure.sqlstate === "57014" || /canceling statement|statement timeout/i.test(failure.message)
      ? "The archive took too long to answer. Try again in a moment."
      : `The archive could not be read. ${failure.message}`,
    { cause: failure },
  );
}

export async function readArchivedDataHome(dataSource: RecordsDataSource): Promise<DataHomeRow[]> {
  const rows: DataHomeRow[] = [];
  for (let offset = 0; offset < ARCHIVE_ROW_CAP; offset += ARCHIVE_PAGE) {
    const page = await doors.archivedTablesEverywhere(dataSource, { limit: ARCHIVE_PAGE, offset });
    if (!page.ok) throw archiveReadFailure(page.error);
    rows.push(...page.data.map(archivedTableRow));
    if (page.data.length < ARCHIVE_PAGE) break;
  }
  const portals = await doors.archivedPortalsEverywhere(dataSource);
  if (!portals.ok) throw archiveReadFailure(portals.error);
  rows.push(...portals.data.map(archivedPortalRow));
  return rows;
}
