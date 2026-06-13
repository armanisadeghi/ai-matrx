// features/dictionary/hooks/useDictionary.ts
//
// Per-owner CRUD for the dictionary manager UI. Wraps the service + slice so
// the manager component stays declarative: list, upsert, delete, and the
// inline-policy setting for one (level, ownerId).

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { dictionaryService } from "@/features/dictionary/service/dictionaryService";
import {
  dictionaryActions,
  loadEntries,
  ownerKey,
} from "@/features/dictionary/redux/dictionarySlice";
import { selectDictEntriesByOwner } from "@/features/dictionary/redux/selectors";
import type { DictEntry, DictEntryDraft, DictLevel } from "@/features/dictionary/types";

export function useDictionary(level: DictLevel, ownerId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const cell = useAppSelector(
    selectDictEntriesByOwner(level, ownerId ?? "__none__"),
  );
  const [settings, setSettings] = useState<{ max_inline_chars: number | null; has_row: boolean }>({
    max_inline_chars: null,
    has_row: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ownerId) void dispatch(loadEntries(level, ownerId));
  }, [dispatch, level, ownerId]);

  useEffect(() => {
    let cancelled = false;
    if (ownerId) {
      void dictionaryService
        .getSettings(level, ownerId)
        .then((s) => {
          if (!cancelled) setSettings(s);
        })
        .catch(() => {
          /* settings are optional; default applies */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [level, ownerId]);

  const reload = useCallback(() => {
    if (ownerId) return dispatch(loadEntries(level, ownerId, true));
    return Promise.resolve();
  }, [dispatch, level, ownerId]);

  const upsert = useCallback(
    async (drafts: DictEntryDraft[]): Promise<DictEntry[]> => {
      if (!ownerId) return [];
      setBusy(true);
      try {
        const next = await dictionaryService.upsertEntries(level, ownerId, drafts);
        dispatch(dictionaryActions.entriesReceived({ key: ownerKey(level, ownerId), entries: next }));
        return next;
      } finally {
        setBusy(false);
      }
    },
    [dispatch, level, ownerId],
  );

  const remove = useCallback(
    async (ids: string[]): Promise<void> => {
      if (!ownerId || ids.length === 0) return;
      setBusy(true);
      try {
        await dictionaryService.deleteEntries(level, ownerId, ids);
        await dispatch(loadEntries(level, ownerId, true));
      } finally {
        setBusy(false);
      }
    },
    [dispatch, level, ownerId],
  );

  const saveInlinePolicy = useCallback(
    async (maxInlineChars: number | null): Promise<void> => {
      if (!ownerId) return;
      const next = await dictionaryService.setSettings(level, ownerId, maxInlineChars);
      setSettings(next);
    },
    [level, ownerId],
  );

  return {
    entries: cell?.data ?? [],
    status: cell?.status ?? "idle",
    error: cell?.error ?? null,
    settings,
    busy,
    reload,
    upsert,
    remove,
    saveInlinePolicy,
  };
}
