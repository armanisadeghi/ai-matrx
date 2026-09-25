"use client";

// features/rich-document/hosts/DocumentDialogsImpl.tsx
//
// The dialogs behind useDocumentDialogsHost, compiled as ONE piece behind the
// host's single dynamic edge: the convert-source dialog, the canonical
// "save table as data" modal, and the save-as-flashcard question prompt.

import * as React from "react";
import { toast } from "@/lib/toast";
import {
  ConvertContentDialog,
  type ConvertOrigin,
} from "@/features/education/convert/ConvertContentDialog";
import SaveTableModal from "@/components/mardown-display/tables/SaveTableModal";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { fcService } from "@/features/flashcards/data/fcService";
import { requireUserId } from "@/utils/auth/getUserId";
import { DocumentAgentReview } from "./DocumentAgentReview";
import { ChatMessageDialogs } from "./ChatMessageDialogs";
import type { RichDocumentActionContext } from "../types";

/** The deck every "Save as flashcard" lands in — one per person. */
const SAVED_CARDS_DECK = "Saved cards";
const SAVED_CARDS_SOURCE = "rich_document_saved_cards";

async function saveFlashcard(front: string, back: string): Promise<void> {
  const userId = requireUserId();
  const sets = await fcService.listSets();
  if (sets.error) throw new Error(String(sets.error));
  let deck = (sets.data ?? []).find(
    (s) =>
      s.created_by === userId &&
      (s.metadata as Record<string, unknown> | null)?.source_system ===
        SAVED_CARDS_SOURCE,
  );
  if (!deck) {
    const created = await fcService.createSet({
      name: SAVED_CARDS_DECK,
      description: "Cards you saved from answers, notes and documents.",
      metadata: { source_system: SAVED_CARDS_SOURCE },
    });
    if (!created.data) {
      throw new Error(String(created.error ?? "Could not create the deck"));
    }
    deck = created.data;
  }
  const added = await fcService.addCards(deck.id, [{ front, back }], {
    orgId: deck.organization_id,
  });
  if (added.error) throw new Error(String(added.error));
  const deckId = deck.id;
  toast.success(`Saved to "${deck.name}"`, {
    action: {
      label: "Open deck",
      onClick: () =>
        window.open(`/education/flashcards/${deckId}`, "_blank", "noopener,noreferrer"),
    },
  });
}

export interface DocumentDialogsImplProps {
  convert: {
    origin: ConvertOrigin;
    text: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  } | null;
  table: { headers: string[]; rows: string[][] } | null;
  onTableClose: () => void;
  cardAnswer: string | null;
  onCardClose: () => void;
  agentReview: {
    actionId: "cleanup" | "help" | "customAgent";
    ctx: RichDocumentActionContext;
  } | null;
  onAgentReviewClose: () => void;
  chatDialog: {
    dialog: "delete" | "history";
    conversationId: string;
    messageId: string;
    surfaceKey: string | null;
  } | null;
  onChatDialogClose: () => void;
}

export default function DocumentDialogsImpl(
  props: DocumentDialogsImplProps,
): React.ReactElement {
  const {
    convert,
    table,
    onTableClose,
    cardAnswer,
    onCardClose,
    agentReview,
    onAgentReviewClose,
    chatDialog,
    onChatDialogClose,
  } = props;
  const [savingCard, setSavingCard] = React.useState(false);
  return (
    <>
      {convert ? (
        <ConvertContentDialog
          open={convert.open}
          onOpenChange={convert.onOpenChange}
          origin={convert.origin}
          text={convert.text}
        />
      ) : null}
      {table ? (
        <SaveTableModal
          isOpen
          onClose={onTableClose}
          tableData={table.rows.map((row) =>
            Object.fromEntries(table.headers.map((h, i) => [h, row[i] ?? ""])),
          )}
        />
      ) : null}
      {chatDialog ? (
        <ChatMessageDialogs {...chatDialog} onClose={onChatDialogClose} />
      ) : null}
      {agentReview ? (
        <DocumentAgentReview
          actionId={agentReview.actionId}
          ctx={agentReview.ctx}
          onClose={onAgentReviewClose}
        />
      ) : null}
      {cardAnswer !== null ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open && !savingCard) onCardClose();
          }}
          title="Save as flashcard"
          description="This passage becomes the answer. Write the question that should bring it to mind."
          placeholder="e.g. How long is the Gold tier refund window?"
          multiline
          rows={3}
          confirmLabel="Save card"
          busy={savingCard}
          onConfirm={async (front) => {
            setSavingCard(true);
            try {
              await saveFlashcard(front.trim(), cardAnswer);
              onCardClose();
            } catch (error) {
              toast.error("Could not save the flashcard", {
                description: error instanceof Error ? error.message : String(error),
              });
            } finally {
              setSavingCard(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
