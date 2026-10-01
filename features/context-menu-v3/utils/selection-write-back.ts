// features/context-menu-v3/utils/selection-write-back.ts
//
// SELECTION WRITE-BACK — the Replace / Insert below doors for an AI result
// that was launched from an editable surface's right-click menu.
//
// History: the legacy prompts menu (DynamicContextMenu, deleted 2026-06-28 in
// 3eef0cab17) ran a text action from an editable selection and showed
// TextActionResultModal with Replace / Insert before / Insert after. The
// agents-era menus (v2 UnifiedAgentContextMenu, then v3) kept only
// `runtime.widgetHandleId`, which lets the MODEL call widget_text_* tools.
// A shortcut whose agent just answers with text (e.g. "Clean up webpage
// content") therefore produced the right text with no way to put it back —
// reported on /notes 2026-10-01. This restores the human door for EVERY
// shortcut / bound agent launched from an editable menu, independent of the
// shortcut's display mode: the per-launch widget handle carries a
// `selection` write-back, and the result's action bar (rich-document
// actions `replace-selection` / `insert-below`) reads it from the
// conversation's widget handle.
//
// Contract: the surface's `onTextReplace` takes the WHOLE new value (see
// buildEditableWidgetHandle). A textarea/input write therefore splices the
// captured range into the live value and hands over the full text. Editors
// without a field (rich editors) use their own caret primitives:
// `insertAtCaret` replaces the live selection, `onTextInsertAfter` inserts a
// block after it.

import type {
  SelectionWriteBack,
  WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import { WIDGET_TOOL_NAME_TO_HANDLE_METHOD } from "@/features/agents/types/widget-handle.types";
import { callbackManager } from "@/utils/callbackManager";
import { spliceInputValue, type SelectionRange } from "./selection-tracking";

export interface BuildSelectionWriteBackArgs {
  /** The text the agent was launched on (the selection, or the whole field). */
  originalText: string;
  /** "selection" when the person selected text; anything else = whole field. */
  textSource: string;
  selectionRange: SelectionRange | null | undefined;
  onTextReplace?: (fullValue: string) => void;
  onTextInsertAfter?: (text: string) => void;
  insertAtCaret?: (text: string) => boolean;
}

type Field = HTMLTextAreaElement | HTMLInputElement;

function isField(el: unknown): el is Field {
  return (
    (typeof HTMLTextAreaElement !== "undefined" &&
      el instanceof HTMLTextAreaElement) ||
    (typeof HTMLInputElement !== "undefined" && el instanceof HTMLInputElement)
  );
}

/**
 * Build the write-back for one launch, or null when the surface cannot be
 * written (read-only, or nothing captured to write over).
 */
export function buildSelectionWriteBack(
  args: BuildSelectionWriteBackArgs,
): SelectionWriteBack | null {
  const {
    originalText,
    textSource,
    selectionRange,
    onTextReplace,
    onTextInsertAfter,
    insertAtCaret,
  } = args;
  if (!originalText) return null;

  const fieldEl =
    selectionRange?.type === "editable" && isField(selectionRange.element)
      ? selectionRange.element
      : null;

  if (fieldEl) {
    // The anchor moves with every successful write, so Replace twice is a
    // no-op re-apply and Insert below after Replace lands under the new text.
    let anchorText = originalText;
    let anchorStart =
      textSource === "selection" ? selectionRange!.start : 0;

    const locate = (): { start: number; end: number } | null => {
      if (!fieldEl.isConnected) return null;
      const value = fieldEl.value;
      if (value.slice(anchorStart, anchorStart + anchorText.length) === anchorText) {
        return { start: anchorStart, end: anchorStart + anchorText.length };
      }
      // The text moved (edits above it) — find it again, only if unambiguous.
      const first = value.indexOf(anchorText);
      if (first === -1 || value.indexOf(anchorText, first + 1) !== -1) {
        return null;
      }
      return { start: first, end: first + anchorText.length };
    };

    const write = (start: number, end: number, insert: string): void => {
      const value = fieldEl.value;
      const next = value.slice(0, start) + insert + value.slice(end);
      if (onTextReplace) onTextReplace(next);
      else spliceInputValue(fieldEl, start, end, insert);
    };

    return {
      originalText,
      replace: (text) => {
        const at = locate();
        if (!at) return false;
        write(at.start, at.end, text);
        anchorStart = at.start;
        anchorText = text;
        return true;
      },
      insertBelow: (text) => {
        const at = locate();
        if (!at) return false;
        const block = "\n\n" + text;
        write(at.end, at.end, block);
        anchorStart = at.end + 2;
        anchorText = text;
        return true;
      },
    };
  }

  // Editors without a field (rich editors) — only a real selection is a
  // target; their caret primitives act on the editor's live selection.
  if (textSource !== "selection") return null;
  if (!insertAtCaret && !onTextInsertAfter) return null;
  return {
    originalText,
    replace: (text) => (insertAtCaret ? insertAtCaret(text) : false),
    insertBelow: (text) => {
      if (!onTextInsertAfter) return false;
      onTextInsertAfter(text);
      return true;
    },
  };
}

/**
 * Register a launch-scoped widget handle: every widget_* method forwards (at
 * call time) to the surface's own handle, plus this launch's `selection`
 * write-back. Returns the id to pass as `runtime.widgetHandleId`, or the
 * surface id unchanged when there is no write-back to add.
 */
export function registerLaunchWidgetHandle(
  surfaceHandleId: string | null | undefined,
  selection: SelectionWriteBack | null,
): string | undefined {
  if (!selection) return surfaceHandleId ?? undefined;
  const handle: WidgetHandle = { selection };
  const keys = [
    ...Object.values(WIDGET_TOOL_NAME_TO_HANDLE_METHOD),
    "onComplete",
    "onCancel",
    "onError",
  ] as const;
  for (const key of keys) {
    Object.defineProperty(handle, key, {
      enumerable: true,
      configurable: true,
      get() {
        const surface = surfaceHandleId
          ? callbackManager.get<WidgetHandle>(surfaceHandleId)
          : undefined;
        const method = surface?.[key];
        return typeof method === "function"
          ? (method as (...a: unknown[]) => unknown).bind(surface)
          : undefined;
      },
    });
  }
  return callbackManager.registerWidgetHandle(handle);
}

/** The write-back a conversation's launch carried, if any. */
export function getSelectionWriteBack(
  widgetHandleId: string | null | undefined,
): SelectionWriteBack | null {
  if (!widgetHandleId) return null;
  return callbackManager.get<WidgetHandle>(widgetHandleId)?.selection ?? null;
}
