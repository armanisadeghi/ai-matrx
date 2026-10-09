"use client";

// features/research/browse/useTopicRowActions.tsx
//
// The ONE action list for a research topic row — the kebab, the phone card
// and the right-click menu all read this builder.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowRight, ExternalLink, Link2, Settings } from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WriteDidNotLandError } from "@/utils/supabase/writeOne";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { archiveTopic, restoreTopic } from "./actions";
import { topicHref, type ResearchTopicListRow } from "./types";

export function useTopicRowActions(
  list: EntityListController<ResearchTopicListRow>,
): EntityRowActionsResult<ResearchTopicListRow> {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [archiveTarget, setArchiveTarget] = useState<ResearchTopicListRow | null>(null);
  const [archiving, setArchiving] = useState(false);

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
            onSelect: async () => {
              if (!(await copyText(
                `${window.location.origin}${topicHref(row.id)}`, "Link copied",
              ))) return;
            },
          },
        ],
      },
      {
        id: "archive",
        items: [
          row.archived_at
            ? {
                id: "restore",
                label: "Restore",
                icon: ArchiveRestore,
                onSelect: () => void handleRestore(row),
              }
            : {
                id: "archive",
                label: "Archive",
                icon: Archive,
                tone: "destructive",
                onSelect: () => setArchiveTarget(row),
              },
        ],
      },
    ],
  });

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveTopic(archiveTarget.id);
      toast.success("Topic archived.");
      list.refresh();
    } catch (err) {
      toast.error(
        err instanceof WriteDidNotLandError ? err.message : "Failed to archive topic.",
      );
    } finally {
      setArchiving(false);
      setArchiveTarget(null);
    }
  };

  const handleRestore = async (row: ResearchTopicListRow) => {
    try {
      await restoreTopic(row.id);
      toast.success("Topic restored.");
      list.refresh();
    } catch (err) {
      toast.error(
        err instanceof WriteDidNotLandError ? err.message : "Failed to restore topic.",
      );
    }
  };

  return {
    actions: { menuFor, onOpenRow: open },
    modals: (
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(next) => {
          if (!next && !archiving) setArchiveTarget(null);
        }}
        title="Archive topic"
        description={
          <>
            This archives <b>{archiveTarget?.name}</b> with its sources,
            analyses, reports and documents, for everyone in its organization.
            Nothing is lost: it leaves the list, and Restore in the Archived
            view brings all of it back.
          </>
        }
        confirmLabel="Archive topic"
        variant="destructive"
        busy={archiving}
        onConfirm={handleArchive}
      />
    ),
  };
}
