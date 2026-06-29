/**
 * features/skills/hooks/useSkill.ts
 *
 * Loader hook for a single skill row by UUID or business key. Subscribes
 * to the slice so cache updates (patches, stream events) flow through.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  makeSelectSkillById,
  selectSkillsById,
} from "../redux/skillsSelectors";
import { fetchSkillById } from "../redux/skillsThunks";
import type { SkillRow } from "../types";

export interface UseSkillArgs {
  /** UUID or skill_id business key. Both work — backend dispatches. */
  skillRef: string | null | undefined;
}

export interface UseSkillResult {
  skill: SkillRow | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function findInCacheBySkillId(
  byId: Record<string, SkillRow>,
  skillId: string,
): SkillRow | null {
  for (const id of Object.keys(byId)) {
    const row = byId[id];
    if (row.skillId === skillId) return row;
  }
  return null;
}

export function useSkill({ skillRef }: UseSkillArgs): UseSkillResult {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectSkillById = useMemo(makeSelectSkillById, []);
  // Look up by uuid first; if skillRef is a business key the cache lookup
  // is a no-op and the thunk does the work.
  const direct = useAppSelector((state) =>
    selectSkillById(state, skillRef ?? null),
  );
  const byId = useAppSelector(selectSkillsById);
  const skill = direct ?? (skillRef ? findInCacheBySkillId(byId, skillRef) : null);

  useEffect(() => {
    if (!skillRef) return undefined;
    // Skip if we already have the row in the cache; consumers can call
    // reload() if they need fresh data.
    if (skill) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await dispatch(fetchSkillById({ skillRef }));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load skill.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, skillRef, skill]);

  const reload = async () => {
    if (!skillRef) return;
    setLoading(true);
    setError(null);
    try {
      await dispatch(fetchSkillById({ skillRef }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load skill.");
    } finally {
      setLoading(false);
    }
  };

  return { skill, loading, error, reload };
}
