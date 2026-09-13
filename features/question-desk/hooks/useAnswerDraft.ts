"use client";

// features/question-desk/hooks/useAnswerDraft.ts
//
// NEVER LOSE HIS WORDS (attack F12).
//
// The own-words box holds the most expensive text in the platform: a ruling
// nobody else can write. Between typing it and saving it there is a navigation,
// a refresh, a closed tab and a crashed browser, so the draft is persisted per
// QUESTION (never per screen) the moment it changes and restored on return.
//
// `localStorage` is the right home and the honest limit: it is per browser,
// per device, and it can throw outright (private windows, blocked site data,
// a thumbnailer). Every read and write is wrapped, a failure is reported ONCE
// to the caller so the screen can say the draft is not being kept, and the box
// keeps working either way — a broken safety net never blocks the typing.

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "qd.draft.";

export interface AnswerDraft {
  /** The restored (or current) draft text for this question. */
  text: string;
  /** Replace the draft. Verbatim — no trim, ever. */
  setText: (next: string) => void;
  /** Forget this question's draft (after a successful save, or a discard). */
  clear: () => void;
  /** Set when the browser refused to keep drafts, so the screen can say so. */
  storageError: string | null;
}

export function useAnswerDraft(questionId: string | null): AnswerDraft {
  const [text, setTextState] = useState("");
  const [storageError, setStorageError] = useState<string | null>(null);
  const questionRef = useRef(questionId);
  questionRef.current = questionId;

  // Restore on question change. A missing key is simply an empty box.
  useEffect(() => {
    if (!questionId) {
      setTextState("");
      return;
    }
    try {
      setTextState(window.localStorage.getItem(PREFIX + questionId) ?? "");
    } catch (error) {
      setTextState("");
      setStorageError(
        `This browser will not keep a draft of your answer (${error instanceof Error ? error.message : String(error)}). Save before you leave the page.`,
      );
    }
  }, [questionId]);

  const setText = useCallback((next: string) => {
    setTextState(next);
    const id = questionRef.current;
    if (!id) return;
    try {
      if (next.length === 0) window.localStorage.removeItem(PREFIX + id);
      else window.localStorage.setItem(PREFIX + id, next);
      setStorageError(null);
    } catch (error) {
      setStorageError(
        `This browser will not keep a draft of your answer (${error instanceof Error ? error.message : String(error)}). Save before you leave the page.`,
      );
    }
  }, []);

  const clear = useCallback(() => {
    setTextState("");
    const id = questionRef.current;
    if (!id) return;
    try {
      window.localStorage.removeItem(PREFIX + id);
    } catch {
      // A draft that cannot be removed is harmless: the next save overwrites
      // it and the box shows the saved answer, not the stale draft.
    }
  }, []);

  return { text, setText, clear, storageError };
}
