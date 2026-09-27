/**
 * A bulk edit that hits a row in Trash says "in Trash", never "could not be found".
 *
 * `udt_bulk_write` answers `row_in_trash` for update / cell / merge on an
 * archived row (migration udt_dataset_rows_delete_archives_and_trash_restores),
 * and `row_not_found` for a row that is gone. Use case: a clinic's intake
 * coordinator fills a column across a selection that includes a patient row a
 * colleague moved to Trash an hour earlier.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeBulkFailures, type BulkOpError } from "../types";

const trash: BulkOpError = {
  error: "row_in_trash",
  row_id: "r1",
  message: "This row is in Trash. Restore it from Trash to edit it.",
};
const gone: BulkOpError = { error: "row_not_found", row_id: "r2" };

it("names a row in Trash as in Trash, with the remedy", () => {
  expect(describeBulkFailures([trash])).toBe("1 row is in Trash — restore it from Trash to edit.");
});

it("keeps the not-found wording for rows that are really gone", () => {
  expect(describeBulkFailures([gone, { ...gone, row_id: "r3" }])).toBe(
    "2 rows could not be found — they may have been removed by someone else.",
  );
});

it("says both when a batch hits both", () => {
  expect(describeBulkFailures([trash, gone])).toBe(
    "1 row is in Trash — restore it from Trash to edit; 1 row could not be found — it may have been removed by someone else.",
  );
});

it("no bulk surface hand-writes the 'could not be found' sentence any more", () => {
  const root = join(__dirname, "..", "..", "..");
  for (const file of [
    "components/user-generated-table-data/UserTableViewer.tsx",
    "features/data-tables/hooks/useCellUndo.ts",
    "components/mardown-display/tables/SaveTableModal.tsx",
  ]) {
    const src = readFileSync(join(root, file), "utf8");
    expect(src).toContain("describeBulkFailures(");
    expect(src).not.toMatch(/could not be found — they may have been removed/);
  }
});
