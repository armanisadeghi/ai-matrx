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

/** What a stopped archive left behind: the passes that landed still landed. */
export interface ArchiveLeft {
  archived: number;
  remaining: number;
  total: number;
}

export type ArchiveFromHome =
  | { outcome: "archived"; name: string }
  | { outcome: "needs-confirm" }
  /** `left` is set when rows had already been archived before it stopped: say exactly what is left. */
  | { outcome: "refused"; sentence: string; error?: RecordsError; left?: ArchiveLeft };

/** Passes in a row that archive nothing and leave the same count behind before the run says it is stuck. */
const STALL_PASSES = 5;
/** No table, however big, takes more passes than this: past it the run stops and says so. */
const MAX_PASSES = 2000;

/** The one sentence for a run that stopped part way (never "nothing changed" after a pass that moved rows). */
export function partialArchiveSentence(name: string, left: ArchiveLeft, why: string): string {
  return `“${name}” is only partly archived: ${left.remaining} of ${left.total} records are still live. ${why}`;
}

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
  onProgress,
  fallbackName,
}: {
  client: RecordsClient;
  tableId: string;
  notify: RecordsUiHost["notify"];
  onOptimisticHide: () => void;
  onRollback: () => void;
  onRestored: () => void;
  /** After every pass that did not finish: how far the run is. */
  onProgress?: (progress: ArchiveLeft & { name: string }) => void;
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
  let last: ArchiveLeft | undefined;
  let passes = 0;
  let stalled = 0;
  let name = fallbackName;
  // Every way out of this loop other than "archived" puts the row back and says what is left.
  const stop = (sentence: string, error?: RecordsError): ArchiveFromHome => {
    onRollback();
    const left = last && last.archived > 0 ? last : undefined;
    return {
      outcome: "refused",
      sentence: left ? partialArchiveSentence(name, left, sentence) : sentence,
      ...(error ? { error } : {}),
      ...(left ? { left } : {}),
    };
  };
  try {
    for (;;) {
      const pass = await client.tableArchive({ table_id: tableId, chunk: size, includeTable: true });
      if (!pass.ok) {
        if (pass.error.code === "timed_out" && size > MIN_PASS) {
          size = Math.max(MIN_PASS, Math.floor(size / 2));
          continue;
        }
        return stop(refusalForAPerson(pass.error).sentence, pass.error);
      }
      passes += 1;
      name = pass.data.table_name || name;
      const before = last?.remaining;
      last = { archived: pass.data.archived_total, remaining: pass.data.remaining, total: pass.data.total };
      if (pass.data.done) {
        if (!pass.data.table_archived) return stop(pass.data.message || "The table could not be archived.");
        announceTableArchived({ notify, client, tableId, name, onRestored });
        return { outcome: "archived", name };
      }
      onProgress?.({ ...last, name });
      stalled = pass.data.archived === 0 && before === last.remaining ? stalled + 1 : 0;
      if (stalled >= STALL_PASSES || passes >= MAX_PASSES) {
        return stop("It stopped moving. Archive it again to carry on.");
      }
    }
  } catch (thrown) {
    // A pass that threw (a dropped connection) is a failed run, never a silent one.
    return stop(`Archiving stopped: ${thrown instanceof Error && thrown.message ? thrown.message : "the connection was lost"}. Archive it again to carry on.`);
  }
}
