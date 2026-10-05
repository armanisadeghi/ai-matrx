"use client";

// components/rich-editor/in-place/InPlaceEditor.tsx
//
// EDIT IN PLACE — the editing half. THE ONE editor (`RichEditor`) mounted in
// the spot the rendered text occupied, at its width and at least its height
// (no layout jump), with the caret where the person double-clicked.
//
//   • ⌘/Ctrl+Enter (and ⌘S) saves — the editor's own shortcut table.
//   • Escape / Cancel leaves; a changed draft asks first. Escape belongs to the
//     innermost open thing (slash / {{ menu, an island's code editor, the find
//     field, focus mode) — only an Escape none of them owns leaves the editor.
//   • Bytes are sacred (`in-place-session.ts`): opening and cancelling, or
//     saving with no change, writes nothing; an autosave host writes only
//     changed drafts.
//   • Formatting (the one selection toolbar) and copy come with the editor.
//
// First host: the AI answer (RC-B5). Read/edit swap + double-click:
// `EditInPlace.tsx`. Docs: components/rich-editor/FEATURE.md "Edit in place".

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useIsMobile } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RichEditor, { type RichEditorController, type RichEditorProps } from "../RichEditor";
import type { CaretContext } from "../core/caret-context";
import { createInPlaceSession, type InPlaceSaveMode } from "./in-place-session";

export type InPlaceEditorPassThrough = Omit<
  RichEditorProps,
  "value" | "onSave" | "onChange" | "onCancel" | "onNothingToSave" | "cancelLabel" | "controllerRef"
>;

export interface InPlaceEditorProps {
  /** The stored text the editor opens on. */
  value: string;
  mode?: InPlaceSaveMode;
  /** The host's write — called only with changed text (see in-place-session). */
  write: (text: string) => Promise<string | void> | string | void;
  /** Back to the rendered view. */
  close: () => void;
  /** Where the person double-clicked (the caret goes there). */
  caret?: CaretContext | null;
  /** The rendered view's height: the editor never opens shorter (no jump). */
  minHeight?: number;
  /** Offer Expand (the same editor instance full screen). Phones open expanded. */
  expandable?: boolean;
  startExpanded?: boolean;
  /** Words for the discard dialog ("The note stays exactly as it was saved…"). */
  discardDescription?: string;
  /** RichEditor props the host sets (surfaceName, contentSource, toolbarExtras…). */
  editor?: InPlaceEditorPassThrough;
  className?: string;
  /** Data attribute value for tests and page shortcuts. */
  id?: string;
  /** Extra toolbar content (before Expand). */
  toolbarExtras?: ReactNode;
  /**
   * More outcomes beside Save, each run with the current text and then the
   * editor closes (a chat message: Save & resubmit, Fork & resubmit).
   */
  actions?: readonly InPlaceAction[];
}

export interface InPlaceAction {
  id: string;
  label: string;
  run: (text: string) => Promise<void>;
}

export function InPlaceEditor({
  value,
  mode = "explicit",
  write,
  close,
  caret,
  minHeight,
  expandable = false,
  startExpanded = false,
  discardDescription = "What you typed here is dropped; the saved text stays as it was.",
  editor,
  className,
  id,
  toolbarExtras,
  actions,
}: InPlaceEditorProps) {
  const isMobile = useIsMobile();
  const [openedOn] = useState(value);
  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  });
  // One session per opening: the byte rules (in-place-session.ts).
  const [session] = useState(() => createInPlaceSession({ openedOn: value, mode, write: (text) => writeRef.current(text) }));
  const [draft, setDraft] = useState(openedOn);
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(startExpanded ? true : null);
  const expanded = expandable && (expandedChoice ?? isMobile);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const controller = useRef<RichEditorController>(null);
  const dirty = draft !== openedOn;

  // The caret lands where the person clicked, once the editor is ready.
  useEffect(() => {
    let tries = 0;
    let frame = 0;
    const place = () => {
      const c = controller.current;
      if (c && (caret ? c.placeCaret(caret) : (c.focus(), true))) return;
      if (++tries > 90) {
        controller.current?.focus();
        return;
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [caret]);

  // The editor reports text ~120 ms after a keystroke, so `draft` can lag a
  // fast Escape: any document input since the last report counts as unsaved.
  const inputSinceReport = useRef(false);
  const onDraft = (text: string) => {
    inputSinceReport.current = false;
    setDraft(text);
    void session.draft(text);
  };
  const markDocumentInput = (event: { target: EventTarget }) => {
    if (event.target instanceof Element && event.target.closest(".ProseMirror, .cm-content")) {
      inputSinceReport.current = true;
    }
  };

  const cancel = () => {
    if (dirty || inputSinceReport.current) setConfirmDiscard(true);
    else close();
  };
  const discard = async () => {
    await session.cancel();
    close();
  };

  const onSave = async (text: string): Promise<string | void> => {
    const result = await session.save(text);
    window.setTimeout(close, 0);
    return result.wrote ? result.stored : undefined;
  };

  const [running, setRunning] = useState<string | null>(null);
  const runAction = async (action: InPlaceAction) => {
    const text = controller.current?.flush() ?? draft;
    setRunning(action.id);
    try {
      await action.run(text);
      close();
    } catch {
      // The host's outcome announced its own failure; the draft stays.
    } finally {
      setRunning(null);
    }
  };

  const escapeOwnedByChild = useRef(false);
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    const target = event.target instanceof Element ? event.target : null;
    escapeOwnedByChild.current =
      !!document.querySelector('.react-renderer > [role="listbox"]') ||
      !!target?.closest(".ProseMirror .cm-editor") ||
      !shellRef.current?.querySelector('[role="tablist"][aria-label="View"]') ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || escapeOwnedByChild.current) return;
    if (!(event.target instanceof Node) || !shellRef.current?.contains(event.target)) return;
    event.preventDefault();
    cancel();
  };

  return (
    <div
      ref={shellRef}
      onKeyDownCapture={onKeyDownCapture}
      onInputCapture={markDocumentInput}
      onBeforeInputCapture={markDocumentInput}
      onKeyDown={onKeyDown}
      data-in-place-editor={id ?? ""}
      style={expanded || !minHeight ? undefined : { minHeight }}
      className={cn(
        "flex w-full flex-col overflow-hidden",
        expanded
          ? "fixed inset-0 z-50 h-dvh bg-background pt-safe"
          : "max-h-[min(80dvh,56rem)] min-h-40 rounded-lg border border-border",
        !expanded && className,
      )}
    >
      <RichEditor
        defaultView="visual"
        defaultOutlineOpen={false}
        {...editor}
        controllerRef={controller}
        value={openedOn}
        onChange={onDraft}
        onSave={onSave}
        className={cn(expanded ? "h-full" : "h-auto min-h-0", editor?.className)}
        onCancel={cancel}
        cancelLabel={dirty ? "Cancel" : "Close"}
        onNothingToSave={close}
        toolbarExtras={
          <>
            {editor?.toolbarExtras}
            {toolbarExtras}
            {actions?.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                disabled={running !== null}
                onClick={() => void runAction(action)}
              >
                {action.label}
              </Button>
            ))}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpandedChoice(!expanded)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title={expanded ? "Back into place" : "Expand to full screen"}
                aria-label={expanded ? "Back into place" : "Expand to full screen"}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your edit?"
        description={discardDescription}
        confirmLabel="Discard edit"
        cancelLabel="Keep editing"
        onConfirm={() => void discard()}
      />
    </div>
  );
}
