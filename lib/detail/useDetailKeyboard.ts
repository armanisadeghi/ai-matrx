// lib/detail/useDetailKeyboard.ts
//
// The keyboard model, once, for all three presentations (Linear's bones):
//   Escape                        → close
//   ArrowUp / ArrowDown           → previous / next record in the list it was
//   ArrowLeft / ArrowRight          opened from; `[` / `]` are aliases
//   Cmd/Ctrl + Enter              → save, when a section registered a save handler
//
// ARROWS ARE THE PRIMARY BINDING (Arman, 2026-09-17: "Escape closes, ARROWS
// move between records, Cmd+Enter saves"). `[` / `]` stay as aliases because
// Linear and Notion both carry them and muscle memory is cheap to honour.
// Every movement key is read only when focus is NOT in an editable — in a
// field an arrow moves the caret, which is what the person meant.
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

/** Previous record. Arrows are the binding Arman asked for; brackets are aliases. */
const PREV_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowLeft", "["]);
/** Next record. Same order: arrow first, bracket as the alias. */
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowRight", "]"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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
    if (isTypingTarget(event.target)) return;
    if (event.key === "Escape" && h.onClose) {
      event.preventDefault();
      event.stopPropagation();
      h.onClose();
      return;
    }
    // A modified arrow belongs to the browser (word jump, history, zoom).
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (PREV_KEYS.has(event.key) && h.onPrev) {
      event.preventDefault();
      h.onPrev();
      return;
    }
    if (NEXT_KEYS.has(event.key) && h.onNext) {
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
