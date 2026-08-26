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

export const DEMO_PERFORMANCE_REVIEW_STORAGE_KEY =
  "matrx.performanceReviews.v1";

export function organizationPerformanceReviewStorageKey(
  organizationId: string,
): string {
  return `matrx.performanceReviews.organization.${organizationId}.v1`;
}

function loadReviews(storageKey: string): Review[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((value): value is Partial<Review> =>
        Boolean(value && typeof value === "object"),
      )
      .map((value) => ({
        ...createBlankReview(),
        ...value,
        responsibilities: Array.isArray(value.responsibilities)
          ? value.responsibilities.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        accomplishments: Array.isArray(value.accomplishments)
          ? value.accomplishments.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        strengths: Array.isArray(value.strengths)
          ? value.strengths.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        opportunities: Array.isArray(value.opportunities)
          ? value.opportunities.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
      }));
  } catch (error) {
    console.error("Unable to load saved performance reviews", error);
    return [];
  }
}

function saveReviews(storageKey: string, reviews: Review[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(reviews));
  } catch (error) {
    console.error("Unable to save performance reviews", error);
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
  setRatingValue: (category: string, item: string, value: RatingValue) => void;
  setOverall: (key: string) => void;
  importReviews: (json: string) => boolean;
}

export function useReviews(
  storageKey = DEMO_PERFORMANCE_REVIEW_STORAGE_KEY,
): UseReviews {
  const [hydrated, setHydrated] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once on mount (client only) to avoid SSR mismatch.
  useEffect(() => {
    const timer = setTimeout(() => {
      const loaded = loadReviews(storageKey);
      if (loaded.length === 0) {
        const blank = createBlankReview();
        setReviews([blank]);
        setActiveId(blank.id);
      } else {
        setReviews(loaded);
        setActiveId(loaded[0].id);
      }
      setHydrated(true);
    }, 0);

    return () => clearTimeout(timer);
  }, [storageKey]);

  // Debounced persistence whenever reviews change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    const stateTimer = setTimeout(() => setSaveState("saving"), 0);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveReviews(storageKey, reviews);
      setSaveState("saved");
    }, 400);
    return () => {
      clearTimeout(stateTimer);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [reviews, hydrated, storageKey]);

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

  const setRatingValue = useCallback(
    (category: string, item: string, value: RatingValue) => {
      const key = ratingKey(category, item);
      mutateActive((review) => ({
        ...review,
        ratings: { ...review.ratings, [key]: value },
      }));
    },
    [mutateActive],
  );

  const setOverall = useCallback(
    (key: string) => mutateActive((r) => ({ ...r, overall: key })),
    [mutateActive],
  );

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

    // Completion: header fields + narrative sections + all-rated + overall.
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
    for (const s of [
      "responsibilities",
      "accomplishments",
      "strengths",
      "opportunities",
    ] as const) {
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
    setRatingValue,
    setOverall,
    importReviews,
  };
}
