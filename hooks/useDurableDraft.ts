"use client";

// useDurableDraft — user-authored text that MUST survive anything.
//
// A composer draft held only in React state dies with the tab: a mobile
// Safari reload, a crash, an error storm, a mis-tap on Back — and the user's
// two-minute dictated rant is gone. Losing it once costs all trust
// (Arman's ruling, 2026-08-16, after exactly that happened in the Vision
// Interview room).
//
// This hook is write-through: every change lands in localStorage
// synchronously, restore happens on mount, and the draft is removed ONLY
// via clearDraft() — which callers may invoke only after the content has
// durably landed somewhere the user can see (a DB row, a rendered turn).
// A send that fails keeps the draft by construction.
//
// Storage failure (private mode, quota) never breaks typing — state still
// works; the failure is logged loudly once so the degraded durability is
// visible, not silent.

import { useEffect, useRef, useState } from "react";

const PREFIX = "matrx:durable-draft:";

let warnedStorageUnavailable = false;

function storageWrite(storageKey: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(storageKey, value);
    else window.localStorage.removeItem(storageKey);
  } catch (err) {
    if (!warnedStorageUnavailable) {
      warnedStorageUnavailable = true;
      console.warn(
        "[useDurableDraft] localStorage unavailable — drafts survive only in memory this session",
        err,
      );
    }
  }
}

export function useDurableDraft(key: string): {
  draft: string;
  setDraft: (value: string) => void;
  clearDraft: () => void;
} {
  const storageKey = PREFIX + key;
  const [draft, setDraftState] = useState("");
  // Tracks whether the user typed before the restore effect ran — their live
  // keystrokes always beat a stale saved copy.
  const touchedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && !touchedRef.current) setDraftState(saved);
    } catch {
      // Restore is best-effort; the write path warns once (above).
    }
  }, [storageKey]);

  const setDraft = (value: string) => {
    touchedRef.current = true;
    setDraftState(value);
    storageWrite(storageKey, value);
  };

  const clearDraft = () => {
    touchedRef.current = true;
    setDraftState("");
    storageWrite(storageKey, "");
  };

  return { draft, setDraft, clearDraft };
}
