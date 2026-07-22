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
// Precedence: a surface callback (controlled React state) always wins; the
// fallback writes through `setFieldValue` (native setter + input event), which
// works on BOTH controlled and uncontrolled textareas. Only methods this
// surface can actually service are present — the per-turn assembler
// (`deriveClientToolsFromHandle`) advertises exactly that subset.

import type { WidgetHandle } from "@/features/agents/types/widget-handle.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

/**
 * Write a value into a textarea so BOTH controlled and uncontrolled fields
 * take it: the native value setter bypasses React's value tracker, and the
 * bubbled `input` event makes a controlled component's onChange fire (state
 * updates instead of React reverting the DOM on the next render). A bare
 * `element.value = x` write silently loses the edit on controlled fields —
 * while the tool result still reports ok:true to the agent.
 */
function setFieldValue(
  el: HTMLTextAreaElement,
  next: string,
  caret: number,
): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    // non-focusable / detached — caret is best-effort
  }
}

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

  // Full-content write. Surface callback wins; the field fallback goes
  // through setFieldValue so controlled AND uncontrolled textareas take it.
  const writeFull = (next: string): void => {
    if (onTextReplace) {
      onTextReplace(next);
      return;
    }
    const el = field();
    if (!el) throw new Error("Surface has no writable target");
    setFieldValue(el, next, next.length);
  };

  // Capability PRESENCE only — this function runs in the shell's render body,
  // so it must never invoke a surface callback (getTextarea reads the DOM,
  // getApplicationScope may serialize the whole document; per-keystroke cost
  // + a React render-purity violation). The method bodies re-check liveness
  // (readCurrent() null checks) at call time, which is the only time it matters.
  const canWrite = Boolean(onTextReplace) || Boolean(getTextarea);
  const canRead = Boolean(getTextarea) || Boolean(getApplicationScope);
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
      setFieldValue(
        el,
        el.value.slice(0, at) + text + el.value.slice(at),
        at + text.length,
      );
    };
  }
  if (onTextInsertAfter || getTextarea) {
    handle.onTextInsertAfter = ({ text }) => {
      if (onTextInsertAfter) return onTextInsertAfter(text);
      const el = field();
      if (!el) throw new Error("Surface has no writable target");
      const at = el.selectionEnd ?? el.value.length;
      setFieldValue(
        el,
        el.value.slice(0, at) + text + el.value.slice(at),
        at + text.length,
      );
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
