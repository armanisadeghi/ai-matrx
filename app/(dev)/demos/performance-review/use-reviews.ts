"use client";

// Client state layer for the Performance Review demo.
//
// Everything persists to localStorage today. The persistence surface is
// deliberately isolated here (loadReviews / persist) so that swapping to a
// database later means replacing this one hook — the UI never touches storage
// directly.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBlankReview,
  Review,
  TOTAL_RATING_ITEMS,
  RatingValue,
  ratingKey,
  RATING_SCHEMA,
  ListSectionKey,
} from "./schema";

const STORAGE_KEY = "matrx.performanceReviews.v1";

function loadReviews(): Review[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Review[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReviews(reviews: Review[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch {
    /* quota or private mode — silently ignore for the demo */
  }
}

export type SaveState = "idle" | "saving" | "saved";

export interface ReviewStats {
  average: number | null;
  ratedCount: number;
  totalCount: number;
  completionPct: number;
  categoryAverages: Record<string, number | null>;
}

export interface UseReviews {
  hydrated: boolean;
  reviews: Review[];
  active: Review | null;
  activeId: string | null;
  saveState: SaveState;
  stats: ReviewStats;
  selectReview: (id: string) => void;
  createReview: () => void;
  duplicateReview: () => void;
  deleteReview: (id: string) => void;
  updateField: <K extends keyof Review>(field: K, value: Review[K]) => void;
  addListItem: (section: ListSectionKey, text: string) => void;
  editListItem: (section: ListSectionKey, index: number, text: string) => void;
  removeListItem: (section: ListSectionKey, index: number) => void;
  moveListItem: (section: ListSectionKey, index: number, dir: -1 | 1) => void;
  setRating: (category: string, item: string, value: RatingValue) => void;
  setOverall: (key: string) => void;
  exportActive: () => void;
  importReviews: (json: string) => boolean;
}

export function useReviews(): UseReviews {
  const [hydrated, setHydrated] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once on mount (client only) to avoid SSR mismatch.
  useEffect(() => {
    const loaded = loadReviews();
    if (loaded.length === 0) {
      const blank = createBlankReview();
      setReviews([blank]);
      setActiveId(blank.id);
    } else {
      setReviews(loaded);
      setActiveId(loaded[0].id);
    }
    setHydrated(true);
  }, []);

  // Debounced persistence whenever reviews change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveReviews(reviews);
      setSaveState("saved");
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [reviews, hydrated]);

  const active = useMemo(
    () => reviews.find((r) => r.id === activeId) ?? null,
    [reviews, activeId],
  );

  const mutateActive = useCallback(
    (mutator: (draft: Review) => Review) => {
      setReviews((prev) =>
        prev.map((r) =>
          r.id === activeId ? { ...mutator(r), updatedAt: Date.now() } : r,
        ),
      );
    },
    [activeId],
  );

  const selectReview = useCallback((id: string) => setActiveId(id), []);

  const createReview = useCallback(() => {
    const blank = createBlankReview();
    setReviews((prev) => [blank, ...prev]);
    setActiveId(blank.id);
  }, []);

  const duplicateReview = useCallback(() => {
    if (!active) return;
    const copy: Review = {
      ...structuredClone(active),
      id: createBlankReview().id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      employeeName: `${active.employeeName || "Untitled"} (copy)`,
    };
    setReviews((prev) => [copy, ...prev]);
    setActiveId(copy.id);
  }, [active]);

  const deleteReview = useCallback(
    (id: string) => {
      setReviews((prev) => {
        const next = prev.filter((r) => r.id !== id);
        if (next.length === 0) {
          const blank = createBlankReview();
          setActiveId(blank.id);
          return [blank];
        }
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  const updateField = useCallback(
    <K extends keyof Review>(field: K, value: Review[K]) => {
      mutateActive((r) => ({ ...r, [field]: value }));
    },
    [mutateActive],
  );

  const addListItem = useCallback(
    (section: ListSectionKey, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      mutateActive((r) => ({ ...r, [section]: [...r[section], trimmed] }));
    },
    [mutateActive],
  );

  const editListItem = useCallback(
    (section: ListSectionKey, index: number, text: string) => {
      mutateActive((r) => {
        const next = [...r[section]];
        const trimmed = text.trim();
        if (!trimmed) next.splice(index, 1);
        else next[index] = trimmed;
        return { ...r, [section]: next };
      });
    },
    [mutateActive],
  );

  const removeListItem = useCallback(
    (section: ListSectionKey, index: number) => {
      mutateActive((r) => {
        const next = [...r[section]];
        next.splice(index, 1);
        return { ...r, [section]: next };
      });
    },
    [mutateActive],
  );

  const moveListItem = useCallback(
    (section: ListSectionKey, index: number, dir: -1 | 1) => {
      mutateActive((r) => {
        const next = [...r[section]];
        const target = index + dir;
        if (target < 0 || target >= next.length) return r;
        [next[index], next[target]] = [next[target], next[index]];
        return { ...r, [section]: next };
      });
    },
    [mutateActive],
  );

  const setRating = useCallback(
    (category: string, item: string, value: RatingValue) => {
      const k = ratingKey(category, item);
      mutateActive((r) => {
        const ratings = { ...r.ratings };
        if (ratings[k] === value) delete ratings[k];
        else ratings[k] = value;
        return { ...r, ratings };
      });
    },
    [mutateActive],
  );

  const setOverall = useCallback(
    (key: string) => mutateActive((r) => ({ ...r, overall: key })),
    [mutateActive],
  );

  const exportActive = useCallback(() => {
    if (!active || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(active, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-${(active.employeeName || "untitled")
      .replace(/\s+/g, "_")
      .toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [active]);

  const importReviews = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      const incoming: Review[] = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = incoming
        .filter((r) => r && typeof r === "object")
        .map((r) => ({
          ...createBlankReview(),
          ...r,
          id: createBlankReview().id,
          updatedAt: Date.now(),
        }));
      if (normalized.length === 0) return false;
      setReviews((prev) => [...normalized, ...prev]);
      setActiveId(normalized[0].id);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stats: ReviewStats = useMemo(() => {
    const ratings = active?.ratings ?? {};
    const values = Object.values(ratings);
    const average =
      values.length > 0
        ? values.reduce((a, c) => a + c, 0) / values.length
        : null;

    const categoryAverages: Record<string, number | null> = {};
    for (const cat of RATING_SCHEMA) {
      const catVals = cat.items
        .map((it) => ratings[ratingKey(cat.key, it.key)])
        .filter((v): v is RatingValue => typeof v === "number");
      categoryAverages[cat.key] =
        catVals.length > 0
          ? catVals.reduce((a, c) => a + c, 0) / catVals.length
          : null;
    }

    // Completion: header fields + 3 lists + all-rated + overall.
    let done = 0;
    let total = 0;
    const headerFields: (keyof Review)[] = [
      "employeeName",
      "title",
      "department",
      "dateOfHire",
      "reviewPeriod",
      "dateOfEvaluation",
      "goals",
      "additionalComments",
    ];
    for (const f of headerFields) {
      total += 1;
      if (active && String(active[f] ?? "").trim()) done += 1;
    }
    for (const s of ["accomplishments", "strengths", "opportunities"] as const) {
      total += 1;
      if (active && active[s].length > 0) done += 1;
    }
    total += 1;
    if (values.length === TOTAL_RATING_ITEMS) done += 1;
    total += 1;
    if (active?.overall) done += 1;

    return {
      average,
      ratedCount: values.length,
      totalCount: TOTAL_RATING_ITEMS,
      completionPct: Math.round((done / total) * 100),
      categoryAverages,
    };
  }, [active]);

  return {
    hydrated,
    reviews,
    active,
    activeId,
    saveState,
    stats,
    selectReview,
    createReview,
    duplicateReview,
    deleteReview,
    updateField,
    addListItem,
    editListItem,
    removeListItem,
    moveListItem,
    setRating,
    setOverall,
    exportActive,
    importReviews,
  };
}
