"use client";

// features/flashcards/components/home/useFlashcardSetRowActions.tsx
//
// The ONE action list for a flashcard deck row — the kebab, the phone card and
// the right-click menu all consume this builder, so they can never drift.
// Archive goes through Trash's one archive (`archiveRecord`), so the deck is
// restorable from /trash and from this list's own Archived filter.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Eye,
  Pencil,
  Play,
  Zap,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import {
  flashcardFastFireHref,
  flashcardSetHref,
  flashcardStudyHref,
  type FlashcardSetLibrary,
  type FlashcardSetListRow,
} from "./flashcardSetList";

/** Bind the hook to the library its list reads, so writes keep it current. */
export function makeUseFlashcardSetRowActions(library: FlashcardSetLibrary) {
  return function useFlashcardSetRowActions(
    list: EntityListController<FlashcardSetListRow>,
  ): EntityRowActionsResult<FlashcardSetListRow> {
    const router = useRouter();
    const [pendingArchive, setPendingArchive] =
      useState<FlashcardSetListRow | null>(null);
    const [busy, setBusy] = useState(false);

    const restore = async (row: FlashcardSetListRow) => {
      try {
        await restoreFromTrash("fc_set", row.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not restore this deck.");
        return;
      }
      library.patch(row.id, { archived: false, deleted_at: null });
      list.refresh();
      toast.success(`Restored "${row.name}"`);
    };

    const menuFor = (row: FlashcardSetListRow) => (): ItemMenuConfig => {
      const href = flashcardSetHref(row);
      const open: ItemMenuEntry[] = [
        { id: "open", label: "Open", icon: Eye, kind: "link", href },
        {
          id: "open-tab",
          label: "Open in new tab",
          icon: ExternalLink,
          kind: "link",
          href,
          target: "_blank",
        },
      ];
      const study: ItemMenuEntry[] = [
        {
          id: "study",
          label: "Study",
          icon: Play,
          kind: "link",
          href: flashcardStudyHref(row),
          disabled: row.archived,
          disabledReason: "Restore the deck to study it",
        },
        {
          id: "fast-fire",
          label: "Fast Fire drill",
          icon: Zap,
          kind: "link",
          href: flashcardFastFireHref(row),
          disabled: row.archived,
          disabledReason: "Restore the deck to drill it",
        },
        {
          id: "edit",
          label: "Edit cards",
          icon: Pencil,
          kind: "link",
          href: `${href}/edit`,
          disabled: row.archived,
          disabledReason: "Restore the deck to edit it",
        },
      ];
      return {
        header: { title: row.name },
        sections: [
          { id: "open", items: open },
          { id: "study", label: "Study", items: study },
          {
            id: "manage",
            label: "Manage",
            items: [
              row.archived
                ? {
                    id: "restore",
                    label: "Restore",
                    icon: ArchiveRestore,
                    onSelect: () => {
                      void restore(row);
                    },
                  }
                : {
                    id: "archive",
                    label: "Archive",
                    icon: Archive,
                    tone: "destructive",
                    onSelect: () => setPendingArchive(row),
                  },
            ],
          },
        ],
      };
    };

    const modals = (
      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null);
        }}
        title="Archive this deck?"
        description={
          pendingArchive
            ? archiveConfirmSentence(`"${pendingArchive.name}"`)
            : ""
        }
        confirmLabel="Archive"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          if (!pendingArchive) return;
          setBusy(true);
          try {
            await archiveRecord("fc_set", pendingArchive.id, "deck");
          } catch (e) {
            setBusy(false);
            toast.error(
              e instanceof Error ? e.message : "Could not archive this deck.",
            );
            return;
          }
          setBusy(false);
          library.patch(pendingArchive.id, {
            archived: true,
            deleted_at: new Date().toISOString(),
          });
          list.removeRow(pendingArchive.id);
          list.refresh();
          toast.success(`Archived "${pendingArchive.name}"`);
          setPendingArchive(null);
        }}
      />
    );

    return {
      actions: {
        menuFor,
        onOpenRow: (row) => router.push(flashcardSetHref(row)),
      },
      modals,
    };
  };
}
