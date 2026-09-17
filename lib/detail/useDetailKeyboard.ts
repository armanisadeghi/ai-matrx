// lib/detail/useDetailKeyboard.ts
//
// The keyboard model, once, for all three presentations (Linear's bones):
//   Escape                        → close
//   ArrowUp / ArrowDown           → previous / next record in the list it was
//   ArrowLeft / ArrowRight          opened from, WHEN the body is not the scroll
//                                   target; `[` / `]` always move
//   Cmd/Ctrl + Enter              → save, when a section registered a save handler
//
// ARROWS ARE THE PRIMARY BINDING (Arman, 2026-09-17: "Escape closes, ARROWS
// move between records, Cmd+Enter saves"). `[` / `]` stay as aliases because
// Linear and Notion both carry them and muscle memory is cheap to honour.
// Every movement key is read only when focus is NOT in an editable — in a
// field an arrow moves the caret, which is what the person meant.
//
// 🚨 NEW-5 — AND AN ARROW NEVER COSTS THE BODY ITS SCROLLING. With a list
// context this hook `preventDefault`ed every ArrowUp/ArrowDown, so a
// keyboard-only reader could not scroll a long dossier at all — the only scroll
// left was PageDown/space (VERIFY-U-P1-R2, break attempt 2). Linear and Notion
// bind the same keys in a peek and do NOT do that. The rule, ruled by the chair
// 2026-09-17: the arrows move between records only when the detail body is not
// the scroll target — when it can scroll, they scroll it, and `[` / `]` remain
// the always-available record navigation.
//
// 🚨 NEW-6 — AND ESCAPE IS NOT SWALLOWED BY A CHECKBOX. `isTypingTarget` is the
// right rule for an ARROW (a caret belongs to the field) and the wrong one for
// Escape: every INPUT counted, so Escape pressed on the presentation pane's
// "Only for file records" checkbox closed nothing. Escape closes from any
// control inside the detail except a menu/select that may be open and a text
// field with uncommitted edits, where it means "undo what I typed".
//
// Keys are read on the presentation's own root (capture phase), so two open
// details never answer one keystroke and a key typed into a field inside the
// detail is left alone — except Cmd/Ctrl+Enter, which is the point of a field.

"use client";

import { useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

export interface DetailKeyboardHandlers {
  onClose?: (() => void) | null;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

export interface DetailKeyboard {
  /** Spread onto the presentation root. */
  rootProps: {
    tabIndex: -1;
    onKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** A section with an editor registers its save; returns the unregister. */
  registerSave: (save: () => void | Promise<void>) => () => void;
  /** Whether anything is registered — the switcher shows the hint only then. */
  hasSave: () => boolean;
}

/** Previous record, when an arrow may move at all. Brackets always may. */
const PREV_ARROWS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowLeft"]);
const NEXT_ARROWS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowRight"]);
const PREV_BRACKET = "[";
const NEXT_BRACKET = "]";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Input types that hold typed text — the only ones an arrow or Escape serves. */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
  "hidden",
]);

/**
 * Whether Escape belongs to the focused control rather than to the detail
 * (NEW-6). Two cases, and only two: something that may be OPEN over the detail
 * (a select's list, a menu, a combobox), and a text field holding edits the
 * person has not committed, where Escape means "put it back".
 */
function escapeBelongsToTheControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "SELECT") return true;
  if (
    target.closest(
      '[aria-expanded="true"], [role="menu"], [role="listbox"], [role="combobox"], [data-state="open"]',
    )
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return target.value !== target.defaultValue;
  if (target instanceof HTMLInputElement) {
    if (NON_TEXT_INPUT_TYPES.has(target.type)) return false;
    return target.value !== target.defaultValue;
  }
  return false;
}

/** Whether an element is a real vertical scroll target with room to move. */
function isScrollTarget(element: HTMLElement): boolean {
  if (element.scrollHeight - element.clientHeight <= 1) return false;
  const overflowY =
    typeof window === "undefined" ? "" : window.getComputedStyle(element).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

/**
 * Whether the detail the keystroke landed in is SCROLLABLE — in which case the
 * arrows are the reader's, not the list's (NEW-5). The walk starts at the
 * keystroke's target and goes up past the presentation root, because every shell
 * puts its own scroll area AROUND the root (the page's body, the docked panel's
 * column, the window's body).
 */
function bodyIsTheScrollTarget(target: EventTarget | null): boolean {
  let node: HTMLElement | null = target instanceof HTMLElement ? target : null;
  while (node) {
    if (isScrollTarget(node)) return true;
    node = node.parentElement;
  }
  return false;
}

export function useDetailKeyboard(handlers: DetailKeyboardHandlers): DetailKeyboard {
  const saveRef = useRef<(() => void | Promise<void>) | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const onKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const h = handlersRef.current;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key === "Enter") {
      if (saveRef.current) {
        event.preventDefault();
        event.stopPropagation();
        void saveRef.current();
      }
      return;
    }
    if (event.key === "Escape") {
      if (!h.onClose || escapeBelongsToTheControl(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      h.onClose();
      return;
    }
    if (isTypingTarget(event.target)) return;
    // A modified arrow or bracket belongs to the browser (word jump, history, zoom).
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key === PREV_BRACKET && h.onPrev) {
      event.preventDefault();
      h.onPrev();
      return;
    }
    if (event.key === NEXT_BRACKET && h.onNext) {
      event.preventDefault();
      h.onNext();
      return;
    }
    const prev = PREV_ARROWS.has(event.key);
    const next = NEXT_ARROWS.has(event.key);
    if (!prev && !next) return;
    // The reader is reading: the arrows scroll, and `[` / `]` still move.
    if (bodyIsTheScrollTarget(event.target)) return;
    if (prev && h.onPrev) {
      event.preventDefault();
      h.onPrev();
      return;
    }
    if (next && h.onNext) {
      event.preventDefault();
      h.onNext();
    }
  }, []);

  const registerSave = useCallback((save: () => void | Promise<void>) => {
    saveRef.current = save;
    return () => {
      if (saveRef.current === save) saveRef.current = null;
    };
  }, []);

  const hasSave = useCallback(() => saveRef.current !== null, []);

  return {
    rootProps: { tabIndex: -1, onKeyDownCapture },
    registerSave,
    hasSave,
  };
}
