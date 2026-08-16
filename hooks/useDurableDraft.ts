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
  // Which key the user's live keystrokes belong to. Their typing beats a
  // stale saved copy ONLY for the same key — a key CHANGE always adopts the
  // new key's saved value (or empty), so a swapped entity id can never show
  // or send the previous entity's text.
  const touchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Restore runs on mount AND on every key change (localStorage is
    // unavailable during SSR, hence effect not render).
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      // Restore is best-effort; the write path warns once (above).
    }
    setDraftState((current) =>
      touchedKeyRef.current === storageKey && current ? current : (saved ?? ""),
    );
  }, [storageKey]);

  const setDraft = (value: string) => {
    touchedKeyRef.current = storageKey;
    setDraftState(value);
    storageWrite(storageKey, value);
  };

  const clearDraft = () => {
    touchedKeyRef.current = storageKey;
    setDraftState("");
    storageWrite(storageKey, "");
  };

  return { draft, setDraft, clearDraft };
}
