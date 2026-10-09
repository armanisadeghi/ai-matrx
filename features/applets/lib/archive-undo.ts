// features/applets/lib/archive-undo.ts — what a person hears AFTER archiving an Applet.
//
// Every archive door (the /applets row menu, Settings › Danger) confirms the act with one toast that
// names the Applet and carries Undo, which restores it in place (live audit 2026-10-09, A1: archiving
// from Settings ended on the list with nothing said, and no way back but the Archived filter).

import { toast } from "@/lib/toast";
import { forgetAppletListReads, restoreApplet } from "@/features/applets/browse/service";

export interface ArchivedToastOptions {
  /** After Undo restored it — refresh a list, or go back to the Applet. */
  onRestored?: () => void;
  /** Injectable for tests. */
  restore?: (appId: string) => Promise<void>;
}

/** The one sentence a person hears after archiving. Exported for tests. */
export function archivedToastTitle(name: string): string {
  return `Archived "${name}"`;
}

export function toastAppletArchived(appId: string, name: string, options: ArchivedToastOptions = {}): void {
  const restore = options.restore ?? restoreApplet;
  toast.success(archivedToastTitle(name), {
    action: {
      label: "Undo",
      onClick: () => {
        void restore(appId).then(
          () => {
            forgetAppletListReads();
            toast.success(`Restored "${name}"`);
            options.onRestored?.();
          },
          (error: unknown) => {
            toast.error(error instanceof Error && error.message ? error.message : "The Applet could not be restored. Try again.");
          },
        );
      },
    },
  });
}
