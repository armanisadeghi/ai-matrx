"use client";

// features/transcripts/browse/useTranscriptRowActions.tsx
//
// The ONE action list for a transcripts-hub row — table kebab, cards, and
// right-click all consume the same builder, so the three can never drift.
// Actions are per-kind: each row opens in its owning surface (Processor /
// Studio / Cleanup / Scribe), with the same secondary destinations the old
// hub cards carried.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Eye,
  Columns2,
  Eraser,
  Mic,
  Inbox,
  Link2,
  ClipboardCopy,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import type { ItemMenuConfig, ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { primaryRowHref, type TranscriptListRow } from "./types";

function link(
  id: string,
  label: string,
  icon: ItemMenuEntry["icon"],
  href: string,
): ItemMenuEntry {
  return { id, label, icon, kind: "link", href };
}

export function useTranscriptRowActions(
  list: EntityListController<TranscriptListRow>,
): EntityRowActionsResult<TranscriptListRow> {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const router = useRouter();

  // THE ONE ARCHIVE for a transcript (restorable: the toast's Undo and Trash).
  const archiveTranscript = async (row: TranscriptListRow) => {
    const name = row.title?.trim() ? `"${row.title.trim()}"` : "this transcript";
    const ok = await confirm({
      title: `Archive ${name}?`,
      // The list's Filters panel carries Archived, so restore lives there (V6-B, verify-7 #2).
      description: archiveConfirmSentence(name, { restoreFrom: "list_filters" }),
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveRecord("transcript", row.id, "transcript");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${name} was not archived.`);
      return;
    }
    // Under "Active + archived" the row stays in the list, now marked archived.
    if (list.query.archived === "all") list.refresh();
    else list.removeRow(row.id);
    toast.success(`Archived ${name}.`, {
      action: {
        label: "Undo",
        onClick: () =>
          void restoreFromTrash("transcript", row.id).then(
            () => {
              list.refresh();
              toast.success(`Put back ${name}.`);
            },
            (err: unknown) =>
              toast.error(err instanceof Error ? err.message : "It could not be put back."),
          ),
      },
    });
  };

  // An archived transcript (Archived filter) comes back the way Undo brings it back.
  const restoreTranscript = async (row: TranscriptListRow) => {
    const name = row.title?.trim() ? `"${row.title.trim()}"` : "this transcript";
    try {
      await restoreFromTrash("transcript", row.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "It could not be put back.");
      return;
    }
    list.refresh();
    toast.success(`Put back ${name}.`);
  };

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const menuFor = (row: TranscriptListRow) => (): ItemMenuConfig => {
      const href = primaryRowHref(row);
      const open: ItemMenuEntry[] = [];
      if (row.kind === "transcript") {
        open.push(
          link("open", "Open in Processor", Eye, href),
          link(
            "studio",
            "Open in Studio",
            Columns2,
            `/transcripts/studio?import=${encodeURIComponent(row.id)}`,
          ),
          link(
            "cleanup",
            "Run Cleanup",
            Eraser,
            `/transcripts/cleanup?import=${encodeURIComponent(row.id)}`,
          ),
        );
      } else if (row.kind === "session") {
        open.push(
          link("open", "Open in Studio", Columns2, href),
          link(
            "scribe",
            "Open in Scribe",
            Mic,
            `/transcripts/scribe/${encodeURIComponent(row.id)}`,
          ),
        );
      } else if (row.kind === "cleanup") {
        open.push(link("open", "Open cleanup session", Eraser, href));
      } else {
        open.push(link("open", "View unsorted recordings", Inbox, href));
      }

      const referenceType =
        row.kind === "transcript" ? "transcript" : "transcript_session";

      return {
        sections: [
          { id: "open", items: open },
          {
            id: "copy",
            items: [
              {
                id: "copy-link",
                label: "Copy link",
                icon: Link2,
                onSelect: async () => {
                  if (!(await copyText(
                    `${window.location.origin}${href}`, "Link copied",
                  ))) return;
                },
              },
              {
                id: "copy-reference",
                label: "Copy reference",
                icon: ClipboardCopy,
                // Unsorted recordings have no referenceable record type.
                hidden: row.kind === "unsorted",
                onSelect: async () => {
                  if (!(await copyText(
                    buildRecordReferenceFence({
                      type: referenceType,
                      id: row.id,
                      label: row.title,
                    }), "Reference copied",
                  ))) return;
                },
              },
            ],
          },
          ...(row.kind === "transcript"
            ? [
                {
                  id: "manage",
                  items: [
                    row.is_archived
                      ? {
                          id: "restore",
                          label: "Restore",
                          icon: ArchiveRestore,
                          onSelect: () => void restoreTranscript(row),
                        }
                      : {
                          id: "archive",
                          label: "Archive",
                          icon: Archive,
                          tone: "destructive" as const,
                          onSelect: () => void archiveTranscript(row),
                        },
                  ],
                },
              ]
            : []),
        ],
      };
  };

  const onOpenRow = (row: TranscriptListRow) =>
    router.push(primaryRowHref(row));

  return { actions: { menuFor, onOpenRow } };
}
