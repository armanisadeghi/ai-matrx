// components/admin/markdown-tester/useMarkdownAutosave.ts
// In-progress textarea autosave for the admin Markdown Tester. Named
// samples now live in Supabase (`admin_markdown_samples`); this hook is
// responsible only for the per-browser scratch buffer that survives a
// crash or accidental refresh. 1-second debounced writes to IndexedDB.

"use client";

import { useCallback, useEffect, useRef } from "react";
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "markdown-tester";
const DB_VERSION = 1;
const STORE_NAME = "snippets";
/**
 * One scratch slot per surface. The admin tester and the Markdown Studio
 * shared ONE record and overwrote each other's unsaved drafts (RC-B1 verify
 * D6) — so the slot is now a required argument, never a default. The admin
 * tester keeps the original record id so its existing draft survives.
 */
export const MARKDOWN_AUTOSAVE_SLOTS = {
  "admin-tester": "__autosave__",
  "markdown-studio": "__autosave__:markdown-studio",
} as const;

export type MarkdownAutosaveSlot = keyof typeof MARKDOWN_AUTOSAVE_SLOTS;
const AUTOSAVE_DEBOUNCE_MS = 1000;

interface AutosaveRecord {
  id: string;
  content: string;
  updatedAt: number;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Same store shape as the original snippet store; we just only
        // use the per-surface autosave records now.
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
  });
}

export interface UseMarkdownAutosaveResult {
  loadAutosave: () => Promise<string | null>;
}

/**
 * Debounced autosave of the current textarea content into IndexedDB.
 * Returns `loadAutosave()` so the caller can restore the last buffer
 * after a page refresh.
 */
export function useMarkdownAutosave(
  slot: MarkdownAutosaveSlot,
  currentContent: string,
): UseMarkdownAutosaveResult {
  const recordId = MARKDOWN_AUTOSAVE_SLOTS[slot];
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbRef = useRef<IDBPDatabase | null>(null);

  const ensureDb = useCallback(async () => {
    if (!dbRef.current) dbRef.current = await getDb();
    return dbRef.current;
  }, []);

  useEffect(() => {
    if (!currentContent.trim()) return undefined;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const db = await ensureDb();
        const record: AutosaveRecord = {
          id: recordId,
          content: currentContent,
          updatedAt: Date.now(),
        };
        await db.put(STORE_NAME, record);
      } catch (err) {
        console.error("[MarkdownAutosave] Autosave failed:", err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentContent, ensureDb, recordId]);

  const loadAutosave = useCallback(async (): Promise<string | null> => {
    try {
      const db = await ensureDb();
      const record = (await db.get(STORE_NAME, recordId)) as
        | AutosaveRecord
        | undefined;
      return record?.content ?? null;
    } catch {
      return null;
    }
  }, [ensureDb, recordId]);

  return { loadAutosave };
}
