"use client";

// features/research/browse/useTopicRowActions.tsx
//
// The ONE action list for a research topic row — the kebab, the phone card
// and the right-click menu all read this builder.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, Link2, Settings, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WriteDidNotLandError } from "@/utils/supabase/writeOne";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { softDeleteTopic } from "./actions";
import { topicHref, type ResearchTopicListRow } from "./types";

export function useTopicRowActions(
  list: EntityListController<ResearchTopicListRow>,
): EntityRowActionsResult<ResearchTopicListRow> {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ResearchTopicListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const open = (row: ResearchTopicListRow) =>
    startTransition(() => router.push(topicHref(row.id)));

  const menuFor = (row: ResearchTopicListRow) => (): ItemMenuConfig => ({
    sections: [
      {
        id: "open",
        items: [
          {
            id: "open",
            label: "Open",
            icon: ArrowRight,
            onSelect: () => open(row),
          },
          {
            id: "open-new-tab",
            kind: "link",
            label: "Open in new tab",
            icon: ExternalLink,
            href: topicHref(row.id),
            target: "_blank",
          },
          {
            id: "settings",
            label: "Settings",
            icon: Settings,
            onSelect: () =>
              startTransition(() => router.push(`${topicHref(row.id)}/settings`)),
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
                `${window.location.origin}${topicHref(row.id)}`,
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
            onSelect: () => setDeleteTarget(row),
          },
        ],
      },
    ],
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteTopic(deleteTarget.id);
      toast.success("Topic deleted.");
      list.refresh();
    } catch (err) {
      toast.error(
        err instanceof WriteDidNotLandError ? err.message : "Failed to delete topic.",
      );
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return {
    actions: { menuFor, onOpenRow: open },
    modals: (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(next) => {
          if (!next && !deleting) setDeleteTarget(null);
        }}
        title="Delete topic"
        description={
          <>
            This archives <b>{deleteTarget?.name}</b> and its sources,
            analyses, and documents. It leaves your topic list; an admin can restore it.
          </>
        }
        confirmLabel="Delete topic"
        variant="destructive"
        busy={deleting}
        onConfirm={handleDelete}
      />
    ),
  };
}
