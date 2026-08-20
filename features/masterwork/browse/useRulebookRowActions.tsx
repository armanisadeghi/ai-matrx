"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Link2, Share2, Trash2, Workflow } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { softDeleteRulebook } from "../service";
import type { RulebookListRow } from "../types";

export function useRulebookRowActions(
  list: EntityListController<RulebookListRow>,
): EntityRowActionsResult<RulebookListRow> {
  const router = useRouter();
  const [deleting, setDeleting] = useState<RulebookListRow | null>(null);
  const [sharing, setSharing] = useState<RulebookListRow | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await softDeleteRulebook(deleting.id);
      list.removeRow(deleting.id);
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the Rulebook",
      );
    } finally {
      setBusy(false);
    }
  }, [deleting, list]);

  const menuFor = useCallback(
    (row: RulebookListRow) => (): ItemMenuConfig => ({
      sections: [
        {
          id: "open",
          items: [
            {
              id: "open",
              label: "Open",
              icon: Eye,
              kind: "link",
              href: `/masterwork/${row.id}`,
            },
            {
              id: "masterworks",
              label: "Masterworks",
              icon: Workflow,
              kind: "link",
              href: `/masterwork/${row.id}/masterworks`,
            },
          ],
        },
        {
          id: "copy",
          items: [
            {
              // CANONICAL SHARING (Arman, 2026-08-20): the same ShareModal
              // every other entity opens — `rulebook` is a registered
              // shareable resource. Never a bespoke Masterwork share model.
              id: "share",
              label: "Share",
              icon: Share2,
              onSelect: () => setSharing(row),
            },
            {
              id: "copy-link",
              label: "Copy link",
              icon: Link2,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/masterwork/${row.id}`,
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
    (row: RulebookListRow) => router.push(`/masterwork/${row.id}`),
    [router],
  );

  return {
    actions: { menuFor, onOpenRow },
    modals: (
      <>
      {sharing ? (
        <ShareModal
          isOpen={sharing !== null}
          onClose={() => setSharing(null)}
          resourceType="rulebook"
          resourceId={sharing.id}
          resourceName={sharing.name}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this Rulebook?"
        description={
          deleting
            ? `"${deleting.name}" and its ${deleting.rule_count} rules will be removed. Masterworks already built from it keep working, but you won't be able to rebuild them.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={busy}
        onConfirm={() => void confirmDelete()}
      />
      </>
    ),
  };
}
