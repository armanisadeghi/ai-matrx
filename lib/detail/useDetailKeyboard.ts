// lib/detail/useDetailKeyboard.ts
//
// The keyboard model, once, for all three presentations (Linear's bones):
//   Escape            → close
//   [ / ]             → previous / next record in the list it was opened from
//   Cmd/Ctrl + Enter  → save, when a section registered a save handler
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
    if (event.key === "[" && h.onPrev) {
      event.preventDefault();
      h.onPrev();
      return;
    }
    if (event.key === "]" && h.onNext) {
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
