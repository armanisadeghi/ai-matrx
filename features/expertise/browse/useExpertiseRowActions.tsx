"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Link2, Trash2, Workflow } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { softDeletePack } from "../service";
import type { ExpertisePackListRow } from "../types";

export function useExpertiseRowActions(
  list: EntityListController<ExpertisePackListRow>,
): EntityRowActionsResult<ExpertisePackListRow> {
  const router = useRouter();
  const [deleting, setDeleting] = useState<ExpertisePackListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await softDeletePack(deleting.id);
      list.removeRow(deleting.id);
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the pack",
      );
    } finally {
      setBusy(false);
    }
  }, [deleting, list]);

  const menuFor = useCallback(
    (row: ExpertisePackListRow) => (): ItemMenuConfig => ({
      sections: [
        {
          id: "open",
          items: [
            {
              id: "open",
              label: "Open",
              icon: Eye,
              kind: "link",
              href: `/expertise/${row.id}`,
            },
            {
              id: "desks",
              label: "Desks",
              icon: Workflow,
              kind: "link",
              href: `/expertise/${row.id}/desks`,
            },
          ],
        },
        {
          id: "copy",
          items: [
            {
              id: "copy-link",
              label: "Copy link",
              icon: Link2,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/expertise/${row.id}`,
                );
                toast.success("Link copied");
              },
            },
          ],
        },
        {
          id: "danger",
          items: [
            {
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => setDeleting(row),
            },
          ],
        },
      ],
    }),
    [],
  );

  const onOpenRow = useCallback(
    (row: ExpertisePackListRow) => router.push(`/expertise/${row.id}`),
    [router],
  );

  return {
    actions: { menuFor, onOpenRow },
    modals: (
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this pack?"
        description={
          deleting
            ? `"${deleting.name}" and its ${deleting.principle_count} rules will be removed. Desks already compiled from it keep working, but you won't be able to recompile them.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={busy}
        onConfirm={() => void confirmDelete()}
      />
    ),
  };
}
