"use client";

// The one archive/restore action for a template, used by the card and the detail page.
// Archive confirms (Keep it / Archive it); restore is undoing, so it needs no confirm.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { buildTemplateArchiveConfirm, setTemplateArchived } from "./templateArchive";

export function useTemplateArchive() {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archive = useCallback(
    async (id: string, name: string) => {
      if (busyId) return;
      if (!(await confirm({ ...buildTemplateArchiveConfirm(name), variant: "default" } as never))) return;
      setBusyId(id);
      try {
        await setTemplateArchived(id, true);
        toast.success(`Archived "${name}" — show archived templates to restore it.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The template could not be archived.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, router],
  );

  const restore = useCallback(
    async (id: string, name: string) => {
      if (busyId) return;
      setBusyId(id);
      try {
        await setTemplateArchived(id, false);
        toast.success(`Restored "${name}" — it is back in the template list.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The template could not be restored.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, router],
  );

  return { busyId, archive, restore };
}
