/**
 * THE HOST'S TOASTS, HANDED TO records-ui (UI-FIX-19).
 *
 * `@ai-matrx/records-ui` says a sentence through its host's `notify` when one is bound, and
 * inline when not. A sentence that must outlive the screen that said it — "Rooms now lives in
 * Elm Street Workshop.", said by the chip that the page re-mounts the moment the move lands —
 * has only one home that survives: the platform's toasts (`@/lib/toast`, which also captures an
 * error for diagnostics). Every RecordsMount that hosts the where-it-lives chip binds this.
 *
 * `reversible`: a reversible act the package did (a table archived) goes to the platform's one
 * announcer (`lib/reversible`), which decides how loud to be for this person and answers ⌘Z. The
 * package does not know this app's routes, so where the thing went is filled in here by noun.
 */
import type { ReversibleAnnouncement, ReversibleFoundAt } from "@ai-matrx/kit/reversible";
import { toast } from "@/lib/toast";
import { announceReversible } from "@/lib/reversible/announceReversible";
import { ARCHIVED_TABLES_PLACE } from "@/features/unified-data/home/archivedTablesPlace";
import { readTheHomeAgain } from "@/features/unified-data/home/readTheHomeAgain";

/** Where each kind of record-store thing waits once it is archived. */
const FOUND_AT_BY_NOUN: Record<string, ReversibleFoundAt> = {
  table: ARCHIVED_TABLES_PLACE,
};

export const RECORDS_NOTIFY = {
  // A plain sentence, or a sentence with the one button the package hands (never an Undo: an undo
  // goes through `reversible` below).
  success: (message: string, action?: { label: string; run: () => void }) => {
    if (action) toast.success(message, { action: { label: action.label, onClick: action.run } });
    else toast.success(message);
  },
  error: (message: string) => {
    toast.error(message);
  },
  reversible: (announcement: ReversibleAnnouncement) => {
    announceReversible({
      ...announcement,
      foundAt: announcement.foundAt ?? FOUND_AT_BY_NOUN[announcement.noun],
      // The toast's Undo and ⌘Z run this one undo; once it lands, the Data home lists the thing
      // again without a reload (lane TABLE-ACTIONS fix round).
      undo: async () => {
        await announcement.undo();
        readTheHomeAgain();
      },
    });
  },
};
