/**
 * features/skills/hooks/useSkills.ts
 *
 * Canonical "give me the skills list" hook. Drop-in replacement for the
 * legacy `useSkills` in `features/agent-connections/hooks/useSkills.ts`:
 * same return shape, new data source (/api/skills via the Python backend
 * instead of Supabase direct reads). Subscribes to the stream-event
 * `lastIngestAt` and reloads + toasts when sandbox auto-discovery fires.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { fetchSkills } from "../redux/skillsThunks";
import {
  makeSelectSkillsByType,
  selectIngestLastReport,
  selectSkillsCount,
  selectSkillsError,
  selectSkillsGroupedByType,
  selectSkillsLastIngestAt,
  selectSkillsStatus,
} from "../redux/skillsSelectors";
import type { SkillRow, SkillType } from "../types";

export interface UseSkillsArgs {
  /** Filter list to only these types. Empty/undefined = all. */
  types?: readonly SkillType[];
  /** Restrict to skills associated with this ctx_project. */
  projectId?: string;
  /** Public-only filter — skips system + own. */
  isPublicOnly?: boolean;
  /** When true, suppresses the auto-fetch on mount; useful when a parent
   *  hook owns the loading lifecycle. */
  skipAutoFetch?: boolean;
}

export interface UseSkillsResult {
  skills: SkillRow[];
  grouped: Record<string, SkillRow[]>;
  count: number;
  loading: boolean;
  error: string | null;
  /** Force a fresh fetch (e.g. after admin actions). */
  reload: () => Promise<void>;
}

export function useSkills(args: UseSkillsArgs = {}): UseSkillsResult {
  const dispatch = useAppDispatch();

  const status = useAppSelector(selectSkillsStatus);
  const error = useAppSelector(selectSkillsError);
  const lastIngestAt = useAppSelector(selectSkillsLastIngestAt);
  const lastReport = useAppSelector(selectIngestLastReport);
  const count = useAppSelector(selectSkillsCount);
  const grouped = useAppSelector(selectSkillsGroupedByType);

  const selectSkillsByType = useMemo(makeSelectSkillsByType, []);
  const skillsByType = useAppSelector((state) =>
    selectSkillsByType(state, args.types),
  );

  // Memoize args to stable identity so the effect doesn't refire on every render.
  const argsKey = useMemo(
    () =>
      JSON.stringify({
        types: args.types ?? null,
        projectId: args.projectId ?? null,
        isPublicOnly: args.isPublicOnly ?? false,
      }),
    [args.isPublicOnly, args.projectId, args.types],
  );

  // Initial load + reload when the filter args change.
  useEffect(() => {
    if (args.skipAutoFetch) return;
    if (status === "loading") return;
    void dispatch(
      fetchSkills({
        projectId: args.projectId,
        isPublicOnly: args.isPublicOnly,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey, args.skipAutoFetch]);

  // Stream-event reload — when a `skills.ingested` event fires, lastIngestAt
  // bumps; refetch + toast. seenAtRef stops us from re-firing on every render.
  const seenAtRef = useRef(0);
  useEffect(() => {
    if (!lastIngestAt || lastIngestAt === seenAtRef.current) return;
    seenAtRef.current = lastIngestAt;
    // Skip on the first render (lastIngestAt was set by initial state).
    if (status === "idle") return;

    void dispatch(fetchSkills({ projectId: args.projectId }));

    const created = lastReport?.created ?? 0;
    const updated = lastReport?.updated ?? 0;
    const total = created + updated;
    if (total > 0) {
      const parts: string[] = [];
      if (created) parts.push(`${created} new`);
      if (updated) parts.push(`${updated} updated`);
      toast.success(`Discovered ${parts.join(", ")} skill${total === 1 ? "" : "s"}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIngestAt]);

  const reload = async () => {
    await dispatch(
      fetchSkills({
        projectId: args.projectId,
        isPublicOnly: args.isPublicOnly,
      }),
    );
  };

  return {
    skills: skillsByType,
    grouped,
    count,
    loading: status === "loading",
    error,
    reload,
  };
}
