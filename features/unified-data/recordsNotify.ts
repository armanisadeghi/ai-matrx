/**
 * THE HOST'S TOASTS, HANDED TO records-ui (UI-FIX-19).
 *
 * `@ai-matrx/records-ui` says a sentence through its host's `notify` when one is bound, and
 * inline when not. A sentence that must outlive the screen that said it — "Rooms now lives in
 * Elm Street Workshop.", said by the chip that the page re-mounts the moment the move lands —
 * has only one home that survives: the platform's toasts (`@/lib/toast`, which also captures an
 * error for diagnostics). Every RecordsMount that hosts the where-it-lives chip binds this.
 */
import { toast } from "@/lib/toast";

export const RECORDS_NOTIFY = {
  success: (message: string) => {
    toast.success(message);
  },
  error: (message: string) => {
    toast.error(message);
  },
};
