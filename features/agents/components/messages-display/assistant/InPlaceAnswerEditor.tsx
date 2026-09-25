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
 */

import { useRef, useState, type KeyboardEvent } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useIsMobile } from "@ai-matrx/design-system";
import RichEditor from "@/components/rich-editor/RichEditor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { updateMessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { saveAnswerEdit } from "@/features/agents/redux/execution-system/message-crud/save-answer-edit.thunk";

interface InPlaceAnswerEditorProps {
  conversationId: string;
  messageId: string;
  /** The answer text as stored (`projectAnswerText(record.content).text`). */
  storedText: string;
}

export function InPlaceAnswerEditor({ conversationId, messageId, storedText }: InPlaceAnswerEditorProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  // The text the editor opened on; later store changes never reset a draft.
  const [openedOn] = useState(storedText);
  const [draft, setDraft] = useState(storedText);
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const expanded = expandedChoice ?? isMobile;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const dirty = draft !== openedOn;

  const close = () => {
    dispatch(updateMessageRecord({ conversationId, messageId, patch: { _editingInPlace: false } }));
  };

  const cancel = () => {
    if (dirty) setConfirmDiscard(true);
    else close();
  };

  const onSave = async (text: string) => {
    const result = await dispatch(saveAnswerEdit({ conversationId, messageId, newText: text }));
    if (saveAnswerEdit.rejected.match(result)) {
      throw new Error(result.payload?.message ?? result.error.message ?? "The answer was not saved.");
    }
    // Back to the preview once the editor has proven the write.
    window.setTimeout(close, 0);
    return result.payload.storedText;
  };

  // Escape belongs to the innermost thing that is open: the slash / variable
  // menu, an island's own code editor, the find field. Only an Escape none of
  // them owns leaves the editor. ProseMirror's base keymap marks EVERY Escape
  // handled (selectParentNode), so `defaultPrevented` cannot tell them apart —
  // ownership is read in the capture phase, before any child reacts.
  const escapeOwnedByChild = useRef(false);
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    const target = event.target instanceof Element ? event.target : null;
    escapeOwnedByChild.current =
      // The editor's slash / {{ menus mount as Tiptap ReactRenderers on <body>.
      !!document.querySelector('.react-renderer > [role="listbox"]') ||
      !!target?.closest(".ProseMirror .cm-editor") ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || escapeOwnedByChild.current) return;
    // Portaled dialogs (link, consent) bubble through React but are not inside
    // this DOM node — their Escape closes them, not the editor.
    if (!(event.target instanceof Node) || !shellRef.current?.contains(event.target)) return;
    event.preventDefault();
    cancel();
  };

  return (
    <div
      ref={shellRef}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      data-in-place-editor={messageId}
      className={cn(
        "flex flex-col overflow-hidden",
        expanded
          ? "fixed inset-0 z-50 h-dvh bg-background pt-safe"
          : "max-h-[min(80dvh,56rem)] min-h-56 rounded-lg border border-border",
      )}
    >
      <RichEditor
        value={openedOn}
        onChange={setDraft}
        onSave={onSave}
        defaultView="visual"
        surfaceName="matrx-user/assistant-message"
        sourceFeature="chat"
        contentSource={{ type: "chat-message", conversationId, messageId }}
        className={expanded ? "h-full" : "h-auto min-h-0"}
        toolbarExtras={
          <>
            <button
              type="button"
              onClick={() => setExpandedChoice(!expanded)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title={expanded ? "Back into the conversation" : "Expand to full screen"}
              aria-label={expanded ? "Back into the conversation" : "Expand to full screen"}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Leave without saving (Esc)"
            >
              <X className="h-3.5 w-3.5" />
              {dirty ? "Cancel" : "Close"}
            </button>
          </>
        }
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your edit?"
        description="The answer stays exactly as it was saved; what you typed here is dropped."
        confirmLabel="Discard edit"
        cancelLabel="Keep editing"
        onConfirm={close}
      />
    </div>
  );
}
