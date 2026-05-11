"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_DRAFT,
  makeInjuryDraft,
  type ClaimDraft,
  type InjuryDraft,
  type RatingDraft,
} from "./types";

const STORAGE_KEY = "matrx:wc-pd-ratings:draft:v1";

function loadFromStorage(): RatingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatingDraft;
    if (!parsed?.claim || !Array.isArray(parsed.injuries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(draft: RatingDraft) {
  if (typeof window === "undefined") return;
  try {
    // `removedPersistedInjuryIds` is transient — don't bleed it into a
    // fresh-page localStorage draft, where it would be meaningless.
    const { removedPersistedInjuryIds: _omit, ...persistable } = draft;
    void _omit;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // localStorage full or disabled — silent
  }
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Strip transient fields and serialize for dirty-comparison. We compare
 * against a baseline snapshot captured when a saved case is first
 * loaded; this lets the UI know whether the user has made unsaved edits.
 */
function snapshotForCompare(draft: RatingDraft): string {
  const { removedPersistedInjuryIds: _omit, ...rest } = draft;
  void _omit;
  return JSON.stringify(rest);
}

export interface UseRatingDraftOptions {
  initialDraft?: RatingDraft;
  persist?: boolean;
}

export function useRatingDraft(options: UseRatingDraftOptions = {}) {
  const { initialDraft, persist = true } = options;
  const [draft, setDraft] = useState<RatingDraft>(initialDraft ?? EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Baseline snapshot for dirty-tracking. Captured once we hydrate from
  // either `initialDraft` (saved-case mode) or localStorage / empty draft
  // (draft mode). `markClean()` re-baselines after a successful save.
  const baselineRef = useRef<string>(snapshotForCompare(draft));

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
      baselineRef.current = snapshotForCompare(initialDraft);
      setHydrated(true);
      return;
    }
    const stored = loadFromStorage();
    if (stored) {
      setDraft(stored);
      baselineRef.current = snapshotForCompare(stored);
    } else {
      baselineRef.current = snapshotForCompare(EMPTY_DRAFT);
    }
    setHydrated(true);
  }, [initialDraft]);

  useEffect(() => {
    if (!hydrated || !persistRef.current) return;
    saveToStorage(draft);
  }, [draft, hydrated]);

  const updateClaim = useCallback((patch: Partial<ClaimDraft>) => {
    setDraft((prev) => ({ ...prev, claim: { ...prev.claim, ...patch } }));
  }, []);

  const replaceInjuries = useCallback((injuries: InjuryDraft[]) => {
    setDraft((prev) => ({ ...prev, injuries }));
  }, []);

  const addInjury = useCallback((seed?: Partial<InjuryDraft>) => {
    const next = { ...makeInjuryDraft(), ...seed };
    setDraft((prev) => ({ ...prev, injuries: [...prev.injuries, next] }));
    return next.tmpId;
  }, []);

  const updateInjury = useCallback(
    (tmpId: string, patch: Partial<InjuryDraft>) => {
      setDraft((prev) => ({
        ...prev,
        injuries: prev.injuries.map((injury) =>
          injury.tmpId === tmpId ? { ...injury, ...patch } : injury,
        ),
      }));
    },
    [],
  );

  const removeInjury = useCallback((tmpId: string) => {
    setDraft((prev) => {
      const target = prev.injuries.find((inj) => inj.tmpId === tmpId);
      const remaining = prev.injuries.filter((inj) => inj.tmpId !== tmpId);
      // If the removed injury was already persisted on the server, queue
      // it for deletion on the next save/update. Otherwise it never
      // hit the backend and we just drop it locally.
      if (target?.persistedId) {
        const existing = prev.removedPersistedInjuryIds ?? [];
        return {
          ...prev,
          injuries: remaining,
          removedPersistedInjuryIds: existing.includes(target.persistedId)
            ? existing
            : [...existing, target.persistedId],
        };
      }
      return { ...prev, injuries: remaining };
    });
  }, []);

  const setPersistence = useCallback(
    (claimId: string, reportId: string, injuryIds: Record<string, string>) => {
      setDraft((prev) => {
        const next: RatingDraft = {
          ...prev,
          persistedClaimId: claimId,
          persistedReportId: reportId,
          injuries: prev.injuries.map((injury) => ({
            ...injury,
            persistedId: injuryIds[injury.tmpId] ?? injury.persistedId,
          })),
          removedPersistedInjuryIds: [],
        };
        // Re-baseline so isDirty flips back to clean.
        baselineRef.current = snapshotForCompare(next);
        return next;
      });
      if (persistRef.current) clearStorage();
    },
    [],
  );

  /**
   * Re-baseline against the current draft. Call after a successful
   * save/update so the UI knows there are no longer unsaved changes.
   */
  const markClean = useCallback(() => {
    setDraft((prev) => {
      const cleaned: RatingDraft = {
        ...prev,
        removedPersistedInjuryIds: [],
      };
      baselineRef.current = snapshotForCompare(cleaned);
      return cleaned;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    baselineRef.current = snapshotForCompare(EMPTY_DRAFT);
    if (persistRef.current) clearStorage();
  }, []);

  const isDirty = useMemo(
    () => snapshotForCompare(draft) !== baselineRef.current,
    [draft],
  );

  return {
    draft,
    setDraft,
    hydrated,
    isDirty,
    updateClaim,
    addInjury,
    updateInjury,
    removeInjury,
    replaceInjuries,
    setPersistence,
    markClean,
    resetDraft,
  };
}
