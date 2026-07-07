"use client";

// features/education/study/analytics/useStudyAnalytics.ts
//
// Fetches the cross-mode study data and folds it into `StudyAnalytics` via the
// pure `computeAnalytics`. One round of parallel reads over the spine
// (all-mastery, all-attempts, sessions, streak) + an fc_card topic resolve for
// the weak-topic breakdown. Mode-agnostic — no per-mode wiring.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { studyService } from "../service/studyService";
import { computeAnalytics, type StudyAnalytics } from "./computeAnalytics";
import type { ItemMasteryRow } from "../types";

const TREND_WEEKS = 4;
const MS_PER_WEEK = 7 * 86_400_000;

export interface UseStudyAnalyticsResult {
  analytics: StudyAnalytics | null;
  /** Raw mastery rows (all item types) — reused by StudyTrends without refetch. */
  mastery: ItemMasteryRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useStudyAnalytics(): UseStudyAnalyticsResult {
  const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null);
  const [mastery, setMastery] = useState<ItemMasteryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const since = new Date(Date.now() - TREND_WEEKS * MS_PER_WEEK).toISOString();
      const [masteryRes, attemptsRes, sessionsRes, streakRes] =
        await Promise.all([
          studyService.listAllMastery(),
          studyService.listAllAttempts({ since }),
          studyService.listSessions({ limit: 1000 }),
          studyService.getStreak(),
        ]);
      if (cancelled) return;

      if (masteryRes.error) {
        setError(masteryRes.error);
        setAnalytics(null);
        setLoading(false);
        return;
      }

      const masteryRows = masteryRes.data ?? [];
      setMastery(masteryRows);
      // Resolve fc_card topics for the weak-topic breakdown (dynamic import so
      // this stays mode-agnostic infrastructure).
      let topicsById: Record<string, string | null> | undefined;
      const fcIds = masteryRows
        .filter((m) => m.item_type === "fc_card")
        .map((m) => m.item_id);
      if (fcIds.length > 0) {
        const { fcService } = await import(
          "@/features/flashcards/data/fcService"
        );
        const res = await fcService.getTopicsForCardIds(fcIds);
        if (cancelled) return;
        topicsById = res.data ?? {};
      }

      setAnalytics(
        computeAnalytics(
          {
            mastery: masteryRows,
            attempts: attemptsRes.data ?? [],
            sessions: sessionsRes.data ?? [],
            currentStreak: streakRes.data?.current_streak ?? 0,
            topicsById,
          },
          new Date(),
        ),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    analytics,
    mastery,
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
  };
}
