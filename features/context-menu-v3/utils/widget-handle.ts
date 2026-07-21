// features/context-menu-v3/utils/widget-handle.ts
//
// Inline agent editing — the v1 promise, paid via the platform channel.
//
// Builds a `WidgetHandle` (the canonical client-tool contract — see
// `features/agents/types/widget-handle.types.ts` and CLIENT_SIDE_TOOLS.md)
// from the SAME props an editable surface already passes to
// `EditableContextMenu` (`onTextReplace` / `onTextInsertBefore|After` /
// `getTextarea`). The shell registers it via `useOptionalWidgetHandle` and the
// launch handlers pass the id as `runtime.widgetHandleId`, so any agent
// launched from the menu on an editable surface can stream `widget_text_*`
// tool calls that edit the surface's content in place — zero extra wiring per
// surface, no bespoke edit protocol (the old XML-in-stream idea stays dead).
//
// Precedence mirrors the menu's own Cut/Paste handlers exactly:
//   - a surface callback (controlled React state) always wins;
//   - `spliceInputValue` / direct value writes are the UNCONTROLLED fallback.
// Only methods this surface can actually service are present — the per-turn
// assembler (`deriveClientToolsFromHandle`) advertises exactly that subset.

import type { WidgetHandle } from "@/features/agents/types/widget-handle.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { spliceInputValue } from "./selection-tracking";

export interface BuildEditableWidgetHandleArgs {
  getTextarea?: () => HTMLTextAreaElement | null;
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  /** Live scope builder — read for `content` when there is no textarea. */
  getApplicationScope?: () => ApplicationScope;
}

/**
 * Build the widget handle for an editable surface, or `null` when the surface
 * exposes no way to write (nothing to register, no tools advertised).
 */
export function buildEditableWidgetHandle(
  args: BuildEditableWidgetHandleArgs,
): WidgetHandle | null {
  const {
    getTextarea,
    onTextReplace,
    onTextInsertBefore,
    onTextInsertAfter,
    getApplicationScope,
  } = args;

  const field = (): HTMLTextAreaElement | null => getTextarea?.() ?? null;

  const readCurrent = (): string | null => {
    const el = field();
    if (el) return el.value;
    const content = getApplicationScope?.().content;
    return typeof content === "string" ? content : null;
  };

  // Full-content write. Surface callback (controlled) wins; direct value
  // assignment is the uncontrolled fallback.
  const writeFull = (next: string): void => {
    if (onTextReplace) {
      onTextReplace(next);
      return;
    }
    const el = field();
    if (!el) throw new Error("Surface has no writable target");
    spliceInputValue(el, 0, el.value.length, next);
  };

  const canWrite = Boolean(onTextReplace) || Boolean(getTextarea);
  const canRead = readCurrent() !== null || Boolean(getTextarea);
  if (!canWrite) return null;

  const handle: WidgetHandle = {
    onTextReplace: ({ text }) => writeFull(text),
  };

  // Insert relative to the cursor/selection. Surface callbacks carry their
  // own semantics; the fallback splices at the field's live cursor.
  if (onTextInsertBefore || getTextarea) {
    handle.onTextInsertBefore = ({ text }) => {
      if (onTextInsertBefore) return onTextInsertBefore(text);
      const el = field();
      if (!el) throw new Error("Surface has no writable target");
      const at = el.selectionStart ?? 0;
      spliceInputValue(el, at, at, text);
    };
  }
  if (onTextInsertAfter || getTextarea) {
    handle.onTextInsertAfter = ({ text }) => {
      if (onTextInsertAfter) return onTextInsertAfter(text);
      const el = field();
      if (!el) throw new Error("Surface has no writable target");
      const at = el.selectionEnd ?? el.value.length;
      spliceInputValue(el, at, at, text);
    };
  }

  // Whole-content operations need read + write.
  if (canRead) {
    handle.onTextPrepend = ({ text }) => {
      const current = readCurrent();
      if (current === null) throw new Error("Surface content is unreadable");
      writeFull(text + current);
    };
    handle.onTextAppend = ({ text }) => {
      const current = readCurrent();
      if (current === null) throw new Error("Surface content is unreadable");
      writeFull(current + text);
    };
    handle.onTextPatch = ({ search_text, replacement_text }) => {
      const current = readCurrent();
      if (current === null) throw new Error("Surface content is unreadable");
      const idx = current.indexOf(search_text);
      if (idx === -1)
        throw new Error("search_text not found in surface content");
      writeFull(
        current.slice(0, idx) +
          replacement_text +
          current.slice(idx + search_text.length),
      );
    };
  }

  return handle;
}
