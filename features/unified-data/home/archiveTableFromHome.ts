// features/unified-data/home/archiveTableFromHome.ts — the Data home's one archive.
//
// ARCHIVE FROM THE LIST KNOWS WHAT IT WILL DO BEFORE IT DRAWS ANYTHING. The row's menu used to open
// a dialog that mounted the whole table-settings panel, which then worked out what to do while the
// page showed it (the jumping), and never told the list it had finished (the stale row). Now: one
// size look (changes nothing), then either
//   - small (at or under the organization's line): the row leaves the list at once, the archive runs
//     behind it, the toast says what happened with Undo; a refusal puts the row back and says why.
//   - big, mid-run or unknown: `needsConfirm` — the caller shows the counted confirm, as before.
// No second modal on the automatic path: the toast is the whole announcement.

import type { RecordsClient } from "@ai-matrx/records/core";
import type { RecordsError } from "@ai-matrx/records";
import { announceTableArchived, refusalForAPerson, type RecordsUiHost } from "@ai-matrx/records-ui";

/** The pass size the package's own loop starts at; halves on a timeout, never below the floor. */
const PASS = 20;
const MIN_PASS = 10;

export type ArchiveFromHome =
  | { outcome: "archived"; name: string }
  | { outcome: "needs-confirm" }
  | { outcome: "refused"; sentence: string; error?: RecordsError };

export async function archiveTableFromHome({
  client,
  tableId,
  notify,
  /** The row leaves the list now. Called once, only when the archive will run without asking. */
  onOptimisticHide,
  /** The archive failed: the row comes back. */
  onRollback,
  /** Undo brought the table back. */
  onRestored,
  fallbackName,
}: {
  client: RecordsClient;
  tableId: string;
  notify: RecordsUiHost["notify"];
  onOptimisticHide: () => void;
  onRollback: () => void;
  onRestored: () => void;
  fallbackName: string;
}): Promise<ArchiveFromHome> {
  const look = await client.tableArchive({ table_id: tableId, chunk: 0, includeTable: true });
  if (!look.ok) return { outcome: "refused", sentence: refusalForAPerson(look.error).sentence, error: look.error };
  const line = look.data.confirm_over;
  if (look.data.in_progress || typeof line !== "number" || look.data.remaining > line) {
    return { outcome: "needs-confirm" };
  }

  onOptimisticHide();
  let size = PASS;
  for (;;) {
    const pass = await client.tableArchive({ table_id: tableId, chunk: size, includeTable: true });
    if (!pass.ok) {
      if (pass.error.code === "timed_out" && size > MIN_PASS) {
        size = Math.max(MIN_PASS, Math.floor(size / 2));
        continue;
      }
      onRollback();
      return { outcome: "refused", sentence: refusalForAPerson(pass.error).sentence, error: pass.error };
    }
    if (pass.data.done) {
      if (!pass.data.table_archived) {
        onRollback();
        return { outcome: "refused", sentence: pass.data.message || "The table could not be archived." };
      }
      const name = pass.data.table_name || fallbackName;
      announceTableArchived({ notify, client, tableId, name, onRestored });
      return { outcome: "archived", name };
    }
  }
}
