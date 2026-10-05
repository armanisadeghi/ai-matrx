"use client";

/**
 * InPlaceAnswerEditor — edit an assistant answer where it sits (RC-B5,
 * rich-content PLAN decision 11).
 *
 * The pencil (the registry's `edit` action) turns the answer's spot into THE
 * ONE editor (`components/rich-editor`, islands locked); Save writes through
 * the chat save adapter (`saveAnswerEdit` — byte-exact splice into the row's
 * parts, nothing written when nothing changed, prior text archived in
 * `content_history`) and the answer returns to its preview. Escape or Cancel
 * leaves without writing (a changed draft asks first — typed text is never
 * dropped silently).
 *
 * Expand is the SAME editor instance going full screen (only its container's
 * classes change — no remount, so the draft, cursor, view and undo survive);
 * it is never a second editor. On phones the editor opens expanded.
 *
 * The editing shell (Escape ownership, discard confirm, caret, bytes) is THE
 * edit-in-place primitive (`components/rich-editor/in-place`) every editable
 * rich-content host shares; this file is only the answer's load + write.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { InPlaceEditor } from "@ai-matrx/chat/host/ui-slots";
import { takeInPlaceCaret } from "@ai-matrx/chat/utils/rich-editor/in-place/caret-handoff";
import type { CaretContext } from "@ai-matrx/chat/utils/rich-editor/core/caret-context";
import { useAppDispatch } from "../../../../store/hooks";
import { updateMessageRecord } from "../../../redux/execution-system/messages/messages.slice";
import {
  fetchStoredAnswer,
  saveAnswerEdit,
} from "../../../redux/execution-system/message-crud/save-answer-edit.thunk";
import { toast } from "../../../../host/notify";
import { rebaseEdit } from "../../../redux/execution-system/message-crud/answer-text-splice";
import { copyRichContent } from "@ai-matrx/chat/host/ui-slots";

interface InPlaceAnswerEditorProps {
  conversationId: string;
  messageId: string;
  /** Open full screen ("Open in full-screen editor" — the same editor, expanded). */
  startExpanded?: boolean;
}

/**
 * Opens on the row's STORED content, read from the database — never the
 * loaded Redux copy, which for an answer streamed this session is the client's
 * own shape (see `saveAnswerEdit`). The editor mounts once the read lands.
 */
export function InPlaceAnswerEditor({ conversationId, messageId, startExpanded = false }: InPlaceAnswerEditorProps) {
  const dispatch = useAppDispatch();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  // A double-click on the answer left where it landed (the caret goes there).
  const [caret] = useState(() => takeInPlaceCaret(messageId));

  const close = () => {
    dispatch(updateMessageRecord({ conversationId, messageId, patch: { _editingInPlace: false } }));
  };

  useEffect(() => {
    let live = true;
    fetchStoredAnswer(messageId).then(
      (stored) => {
        if (live) setOpenedOn(stored.text);
      },
      (error: unknown) => {
        if (!live) return;
        toast.error(`The answer could not be opened for editing: ${error instanceof Error ? error.message : String(error)}`);
        dispatch(updateMessageRecord({ conversationId, messageId, patch: { _editingInPlace: false } }));
      },
    );
    return () => {
      live = false;
    };
  }, [conversationId, messageId, dispatch]);

  if (openedOn === null) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-border text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening the answer…
      </div>
    );
  }
  return (
    <LoadedAnswerEditor
      conversationId={conversationId}
      messageId={messageId}
      openedOn={openedOn}
      close={close}
      startExpanded={startExpanded}
      caret={caret}
    />
  );
}

function LoadedAnswerEditor({
  conversationId,
  messageId,
  openedOn,
  close,
  startExpanded,
  caret,
}: {
  conversationId: string;
  messageId: string;
  openedOn: string;
  close: () => void;
  startExpanded: boolean;
  caret?: CaretContext | null;
}) {
  const dispatch = useAppDispatch();

  // THE edit-in-place shell writes only changed text (in-place-session); this
  // is the answer's write: the chat save adapter.
  const write = async (text: string): Promise<string | void> => {
    const result = await dispatch(saveAnswerEdit({ conversationId, messageId, newText: text, openedText: openedOn }));
    if (saveAnswerEdit.rejected.match(result) && result.payload?.code === "stale" && result.payload.storedText !== undefined) {
      // ANOTHER TAB SAVED FIRST (verify-RC-B5 r4 N3). Retrying the same save
      // can only be refused again, so it is never offered: the person's edit
      // is carried onto the newer saved text when it does not touch the same
      // words, and otherwise the editor closes onto the saved version with the
      // edit one click away — one instruction, never "reload" + "try again".
      const theirs = result.payload.storedText;
      const merged = rebaseEdit(openedOn, text, theirs);
      if (merged !== null) {
        const rebased = await dispatch(saveAnswerEdit({ conversationId, messageId, newText: merged, openedText: theirs }));
        if (!saveAnswerEdit.rejected.match(rebased)) {
          toast.info("Another tab saved this answer first — your edit was added on top of it.");
          return;
        }
      }
      toast.error("Another tab changed the same words first, so your edit was not saved. The answer shows what is saved.", {
        action: {
          label: "Copy my edit",
          onClick: () => {
            void copyRichContent(text, "markdown");
          },
        },
      });
      return;
    }
    if (saveAnswerEdit.rejected.match(result)) {
      // The editor words it "Not saved: <reason>. Your text is still here" —
      // hand it the reason without its own closing period (no "again..").
      const reason = result.payload?.message ?? result.error.message ?? "the answer was not saved";
      throw new Error(reason.replace(/[.!\s]+$/, ""));
    }
    return result.payload.storedText;
  };

  return (
    <InPlaceEditor
      id={messageId}
      value={openedOn}
      write={write}
      close={close}
      caret={caret}
      expandable
      startExpanded={startExpanded}
      discardDescription="The answer stays exactly as it was saved; what you typed here is dropped."
      editor={{
        imagePolicy: "ai",
        surfaceName: "matrx-user/assistant-message",
        sourceFeature: "chat",
        contentSource: { type: "chat-message", conversationId, messageId },
      }}
    />
  );
}
