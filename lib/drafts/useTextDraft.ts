"use client";

/**
 * A DIALOG NEVER LOSES TYPED TEXT — the shared draft keeper.
 *
 * THE BUG THIS EXISTS FOR (live, 2026-09-15, Masterwork Rulebook): a
 * non-technical Expert pasted an ~8,000-character interview transcript into
 * the "Add rules from a source" dialog. Mid-typing the dialog unmounted — a
 * duplicate React key among its sibling dialogs made React destroy and
 * recreate that whole region — and the text was simply gone. It happened
 * TWICE, with no warning, no error and nothing to recover. (Radix then
 * restored focus to a background textarea, so the rest of the keystrokes
 * landed in an unrelated field: that half is fixed in the dialog primitive.)
 *
 * The key collision is fixed and guarded. This exists because that was only
 * ONE of the ways a dialog can go away: a reload, a crash, a realtime refresh,
 * a mis-click on the backdrop, a laptop lid. Losing a long paste to any of
 * them is unacceptable — "never losing user input" is table stakes on this
 * platform, never a question.
 *
 * WHAT IT DOES
 * - Mirrors the value into `sessionStorage` as the person types (debounced).
 * - Restores it when the same field reopens, and reports that it did so — a
 *   silent restore is its own kind of lie, so the caller shows the notice.
 * - Clears on a successful submit, and only then.
 * - Never throws: a private window, blocked storage or a quota refusal
 *   degrades to "no draft kept", announced through `available`, never a crash
 *   and never a silent no-op the caller believes is working.
 *
 * SCOPE: per browser, per field. This is a crash net, not a synced draft.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough that it survives a reload; short enough that it is not a store. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 400;
/** Below this, a lost value costs the user nothing worth a restore notice. */
export const DRAFT_MIN_CHARS = 40;
const PREFIX = "matrx.draft.";

type StoredDraft = { value: string; at: number };

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.sessionStorage;
    // Touch it: a blocked store throws here rather than at the first write.
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readDraft(key: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed.value !== "string") return null;
    if (Date.now() - parsed.at > DRAFT_TTL_MS) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    if (value.length < DRAFT_MIN_CHARS) {
      s.removeItem(PREFIX + key);
      return true;
    }
    s.setItem(PREFIX + key, JSON.stringify({ value, at: Date.now() } satisfies StoredDraft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear is not a failure */
  }
}

export type TextDraft = {
  /** A draft was found and handed back on mount — say so on screen. */
  restored: boolean;
  /** False when the browser refuses storage: the caller must say drafts are off. */
  available: boolean;
  /** Call on every change. */
  remember: (value: string) => void;
  /** Call once the value has actually been accepted by the server. */
  forget: () => void;
  /** Dismiss the restore notice without discarding the text. */
  acknowledge: () => void;
};

/**
 * @param key      stable per field AND per record, e.g. `ingest-text:${rulebookId}`
 * @param value    the field's current value
 * @param setValue applied once, on mount, when a draft is found
 * @param enabled  usually the dialog's `open`
 */
export function useTextDraft(
  key: string,
  value: string,
  setValue: (next: string) => void,
  enabled: boolean,
): TextDraft {
  const [restored, setRestored] = useState(false);
  const [available, setAvailable] = useState(true);
  const loadedRef = useRef(false);
  // Once the server has taken the text, nothing may put it back — not the
  // debounce still in flight, and not the flush on the way out.
  const forgottenRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = false;
      forgottenRef.current = false;
      setRestored(false);
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    setAvailable(storage() !== null);
    const saved = readDraft(key);
    // Never overwrite something the user can already see.
    if (saved && saved.length >= DRAFT_MIN_CHARS && value.length === 0) {
      setValue(saved);
      setRestored(true);
    }
    // `value`/`setValue` deliberately excluded: this runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !loadedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (forgottenRef.current) return;
    timerRef.current = setTimeout(() => {
      const ok = writeDraft(key, value);
      if (!ok) setAvailable(false);
    }, WRITE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, key, value]);

  // The unmount we could not see coming is exactly the case this is for, so
  // the last value is flushed synchronously on the way out rather than left in
  // a pending debounce.
  useEffect(() => {
    const flush = () => {
      if (loadedRef.current && !forgottenRef.current) writeDraft(key, valueRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key]);

  const remember = useCallback(
    (next: string) => {
      valueRef.current = next;
      forgottenRef.current = false;
      const ok = writeDraft(key, next);
      if (!ok) setAvailable(false);
    },
    [key],
  );

  const forget = useCallback(() => {
    forgottenRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    clearDraft(key);
    setRestored(false);
  }, [key]);

  const acknowledge = useCallback(() => setRestored(false), []);

  return { restored, available, remember, forget, acknowledge };
}
