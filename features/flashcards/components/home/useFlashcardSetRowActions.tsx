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
  Copy,
  ExternalLink,
  Eye,
  FolderInput,
  Pencil,
  Play,
  TextCursorInput,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { FolderTagPicker } from "../organize/FolderTagPicker";
import { DeckRowAccessById } from "../sharing/DeckRowAccess";
import { SHOWN_TO_LABEL } from "@/lib/row-access";
import {
  duplicateDeck,
  renameDeck,
} from "../../data/deckOperations";
import { copyName } from "./deckAgentWrites";
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
  type FlashcardSetListRow,
} from "./flashcardSetList";

export function useFlashcardSetRowActions(
  list: EntityListController<FlashcardSetListRow>,
): EntityRowActionsResult<FlashcardSetListRow> {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [pendingArchive, setPendingArchive] =
    useState<FlashcardSetListRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<FlashcardSetListRow | null>(null);
  const [filing, setFiling] = useState<FlashcardSetListRow | null>(null);
  const [sharing, setSharing] = useState<FlashcardSetListRow | null>(null);

  const duplicate = async (row: FlashcardSetListRow) => {
    const taken = new Set(
      list.rows
        .filter((r) => r.created_by === userId && !r.archived)
        .map((r) => r.name.trim().toLowerCase()),
    );
    const pending = toast.loading(`Copying "${row.name}"…`);
    try {
      const copy = await duplicateDeck({
        id: row.id,
        name: copyName(row.name, taken),
      });
      // Says what happened, names the copy, and can be taken back.
      toast.success(`Made a copy: "${copy.name}"`, {
        id: pending,
        action: {
          label: "Undo",
          onClick: () => {
            void archiveRecord("fc_set", copy.id, "deck")
              .then(() => {
                list.removeRow(copy.id);
                list.refresh();
                toast.success(`Removed the copy "${copy.name}"`);
              })
              .catch((e: unknown) =>
                toast.error(
                  e instanceof Error ? e.message : "The copy was not removed.",
                ),
              );
          },
        },
      });
      list.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The deck was not copied.", {
        id: pending,
      });
    }
  };


  const restore = async (row: FlashcardSetListRow) => {
    try {
      await restoreFromTrash("fc_set", row.id);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not restore this deck.",
      );
      return;
    }
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
    const own = row.created_by === userId;
    const offLimits = own ? "Restore the deck first" : "Only the deck's owner can change this";
    const manage: ItemMenuEntry[] = [
      {
        id: "rename",
        label: "Rename",
        icon: TextCursorInput,
        disabled: !own || row.archived,
        disabledReason: offLimits,
        onSelect: () => setRenaming(row),
      },
      {
        id: "duplicate",
        label: own ? "Duplicate" : "Make a copy",
        icon: Copy,
        disabled: row.archived,
        disabledReason: "Restore the deck to copy it",
        onSelect: () => {
          void duplicate(row);
        },
      },
      {
        id: "folders",
        label: "Move to folder",
        icon: FolderInput,
        disabled: !own || row.archived,
        disabledReason: offLimits,
        onSelect: () => setFiling(row),
      },
      {
        id: "row-access",
        label: "Shown to",
        icon: Users,
        disabled: !own || row.archived,
        disabledReason: offLimits,
        onSelect: () => setSharing(row),
      },
    ];
    return {
      header: { title: row.name },
      sections: [
        { id: "open", items: open },
        { id: "study", label: "Study", items: study },
        { id: "organize", label: "Organize", items: manage },
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
    <>
    <TextInputDialog
      open={renaming !== null}
      onOpenChange={(open) => {
        if (!open) setRenaming(null);
      }}
      title="Rename deck"
      defaultValue={renaming?.name ?? ""}
      confirmLabel="Rename"
      validate={(value) => (value.trim() ? null : "A deck needs a name.")}
      onConfirm={async (value) => {
        if (!renaming) return;
        const row = renaming;
        try {
          const saved = await renameDeck(row.id, value);
          list.patchRow(row.id, { name: saved.name });
          toast.success(`Renamed to "${saved.name}"`);
          setRenaming(null);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "The new name was not saved.");
        }
      }}
    />
    <Dialog
      open={filing !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFiling(null);
          list.refresh();
        }
      }}
    >
      <DialogContent className="matrx-touch-targets sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Folders for &ldquo;{filing?.name}&rdquo;</DialogTitle>
        </DialogHeader>
        {filing ? <FolderTagPicker setId={filing.id} /> : null}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => {
            setFiling(null);
            list.refresh();
          }}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog
      open={sharing !== null}
      onOpenChange={(open) => {
        if (!open) setSharing(null);
      }}
    >
      <DialogContent className="matrx-touch-targets sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{SHOWN_TO_LABEL}: &ldquo;{sharing?.name}&rdquo;</DialogTitle>
        </DialogHeader>
        {sharing ? <DeckRowAccessById setId={sharing.id} /> : null}
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={pendingArchive !== null}
      onOpenChange={(open) => {
        if (!open) setPendingArchive(null);
      }}
      title="Archive this deck?"
      description={
        pendingArchive ? archiveConfirmSentence(`"${pendingArchive.name}"`, { restoreFrom: "list_filters" }) : ""
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
        list.removeRow(pendingArchive.id);
        list.refresh();
        toast.success(`Archived "${pendingArchive.name}"`);
        setPendingArchive(null);
      }}
    />
    </>
  );

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(flashcardSetHref(row)),
    },
    modals,
  };
}
