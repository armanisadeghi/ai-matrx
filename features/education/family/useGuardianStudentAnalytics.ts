"use client";

// features/education/family/useGuardianStudentAnalytics.ts
//
// The guardian-side twin of `useStudyAnalytics`: it fetches a LINKED student's
// study spine through the gated `familyService` (guardian RPCs) and folds it with
// the SAME pure aggregators the self dashboard uses — `computeAnalytics` (spine →
// StudyAnalytics) and `buildGainReport` (assessment_result → LearningGainReport).
// There is no parallel analytics engine here; this is purely a second data source
// feeding the one that already exists.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { computeAnalytics, type StudyAnalytics } from "@/features/education/study/analytics/computeAnalytics";
import { buildGainReport } from "@/features/education/study/learning-gain/learningGainService";
import type { LearningGainReport } from "@/features/education/study/learning-gain/types";
import type { ItemMasteryRow } from "@/features/education/study/types";
import { familyService } from "./familyService";

const TREND_WEEKS = 4;
const MS_PER_WEEK = 7 * 86_400_000;

export interface UseGuardianStudentAnalyticsResult {
  analytics: StudyAnalytics | null;
  mastery: ItemMasteryRow[];
  gain: LearningGainReport | null;
  loading: boolean;
  /** Set when access was refused (revoked link) or a read failed. */
  error: string | null;
  reload: () => void;
}

export function useGuardianStudentAnalytics(
  studentId: string,
): UseGuardianStudentAnalyticsResult {
  const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null);
  const [mastery, setMastery] = useState<ItemMasteryRow[]>([]);
  const [gain, setGain] = useState<LearningGainReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const since = new Date(Date.now() - TREND_WEEKS * MS_PER_WEEK).toISOString();
      const [masteryRes, attemptsRes, sessionsRes, streakRes, gainRes] =
        await Promise.all([
          familyService.studentMastery(studentId),
          familyService.studentAttempts(studentId, since),
          familyService.studentSessions(studentId),
          familyService.studentStreak(studentId),
          familyService.studentGain(studentId),
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

      // Resolve fc_card topics for the weak-topic breakdown (guardian-gated).
      let topicsById: Record<string, string | null> | undefined;
      const fcIds = masteryRows
        .filter((m) => m.item_type === "fc_card")
        .map((m) => m.item_id);
      if (fcIds.length > 0) {
        const topicsRes = await familyService.studentCardTopics(studentId, fcIds);
        if (cancelled) return;
        topicsById = topicsRes.data ?? {};
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
      setGain(buildGainReport(gainRes.data ?? []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, nonce]);

  return {
    analytics,
    mastery,
    gain,
    loading,
    error,
    reload: () => setNonce((n) => n + 1),
  };
}
