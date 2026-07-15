// features/education/classes/hooks/useClassProgress.ts
//
// Class ANALYTICS reads (teacher tools). Two gated entry points, both re-checked
// server-side:
//   * useClassProgressOverview(classId) — OWNER only: the roster × assignment grid
//     + class-wide rollup (edu_class_progress_overview). The owner check is the
//     RPC's, never the client.
//   * useMyClassProgress(classId) — a MEMBER's OWN completion of the class's
//     assignments (edu_class_student_progress(class, self)). A member may always
//     read their own progress; enrolment is the consent that also lets the OWNER
//     read it — and only scoped to THIS class's assignments.
//
// The teacher NEVER reads a student's full study spine here — every row is scoped
// to the class's assignments (mirrors the guardian gated-read privacy model, but
// tighter: guardian sees the whole spine; a teacher sees only class assignments).

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  getClassProgressOverview,
  getClassStudentProgress,
} from "../service";
import type { AssignmentProgress, ClassProgressOverview } from "../types";

export interface UseClassProgressOverviewReturn {
  overview: ClassProgressOverview | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** OWNER-only class progress grid. `enabled=false` (non-owner) skips the read. */
export function useClassProgressOverview(
  classId: string | null,
  enabled = true,
): UseClassProgressOverviewReturn {
  const [overview, setOverview] = useState<ClassProgressOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!classId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      setOverview(await getClassProgressOverview(classId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load class progress.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [classId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { overview, loading, error, reload };
}

export interface UseMyClassProgressReturn {
  progress: AssignmentProgress[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** A member's OWN per-assignment completion for the class. */
export function useMyClassProgress(
  classId: string | null,
  enabled = true,
): UseMyClassProgressReturn {
  const userId = useAppSelector(selectUserId);
  const [progress, setProgress] = useState<AssignmentProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!classId || !userId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      setProgress(await getClassStudentProgress(classId, userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your progress.");
      setProgress([]);
    } finally {
      setLoading(false);
    }
  }, [classId, userId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { progress, loading, error, reload };
}
