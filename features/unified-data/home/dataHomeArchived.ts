// features/unified-data/home/dataHomeArchived.ts — lane TABLE-ACTIONS item 10
//
// THE DATA HOME'S ARCHIVE IS ITS LIST'S ARCHIVED FILTER (the shell's ArchiveFilter: hide archived ·
// show all · archived only — common-docs/policies/archived-items.md). This reads ONE store page of
// it at a time, newest archived first, only when the list asks (`createDataHomeService.readArchived`):
// the first rows draw as soon as the first page answers. Archived portals (one store read, no
// paging) follow once the archived tables end. A statement timeout (57014) is said in a person's
// words; Postgres's sentence never reaches the screen.

import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { archivedPortalRow, archivedTableRow, type DataHomeRow } from "./dataHomeRows";

/** The archive read's failure, in a person's words. */
export function archiveReadFailure(failure: doors.DoorFailure): Error {
  return new Error(
    failure.sqlstate === "57014" || /canceling statement|statement timeout/i.test(failure.message)
      ? "The archive took too long to answer. Try again in a moment."
      : `The archive could not be read. ${failure.message}`,
    { cause: failure },
  );
}

export async function readArchivedDataHomePage(
  dataSource: RecordsDataSource,
  page: { offset: number; limit: number },
  /** The person reading — an archived table they made is Mine. */
  me: string | null = null,
): Promise<{ rows: DataHomeRow[]; ended: boolean }> {
  const tables = await doors.archivedTablesEverywhere(dataSource, page);
  if (!tables.ok) throw archiveReadFailure(tables.error);
  const rows = tables.data.map((t) => archivedTableRow(t, me));
  if (tables.data.length >= page.limit) return { rows, ended: false };
  const portals = await doors.archivedPortalsEverywhere(dataSource);
  if (!portals.ok) throw archiveReadFailure(portals.error);
  return { rows: [...rows, ...portals.data.map(archivedPortalRow)], ended: true };
}
