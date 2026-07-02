"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectVersionsByParentAgentId,
} from "@/features/agents/redux/agent-definition/selectors";
import type { AgentVersionHistoryItem } from "@/features/agents/redux/agent-definition/thunks";
import { computeDiff } from "@/components/diff/engine/compute-diff";
import type { DiffResult } from "@/components/diff/engine/types";
import { AGENT_DIFF_OPTIONS } from "@/features/agents/components/diff/agent-diff-constants";

export interface EnrichedVersion extends AgentVersionHistoryItem {
  diffSummary?: DiffResult;
  snapshotLoaded: boolean;
}

interface SmartVersionFetchState {
  enrichedVersions: EnrichedVersion[];
  loading: boolean;
  progress: { fetched: number; total: number };
}

/**
 * Smart version fetcher that:
 * 1. Takes the already-loaded version history list
 * 2. Fetches the 10 newest snapshots
 * 3. Fetches the oldest snapshot
 * 4. Fetches every ~10th version in between
 * 5. Computes diff summaries between consecutive fetched versions
 */
export function useSmartVersionFetch(
  agentId: string,
  versions: AgentVersionHistoryItem[],
) {
  const dispatch = useAppDispatch();
  const snapshotRecords = useAppSelector((state) =>
    selectVersionsByParentAgentId(state, agentId),
  );
  const [state, setState] = useState<SmartVersionFetchState>({
    enrichedVersions: versions.map((v) => ({ ...v, snapshotLoaded: false })),
    loading: false,
    progress: { fetched: 0, total: 0 },
  });
  const fetchedRef = useRef(false);

  // Compute which versions to fetch using the smart algorithm
  const computeTargetVersions = useCallback((): number[] => {
    if (versions.length === 0) return [];

    // Sort newest first
    const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
    const targets = new Set<number>();

    // 1. Newest 10 (or all if fewer)
    const newestBatch = sorted.slice(0, 10);
    for (const v of newestBatch) targets.add(v.version_number);

    if (sorted.length <= 10) return [...targets];

    // 2. Always include the oldest
    targets.add(sorted[sorted.length - 1].version_number);

    // 3. Every ~10th version in between
    const remaining = sorted.slice(10, -1); // exclude newest 10 and oldest
    if (remaining.length > 0) {
      const step = Math.max(1, Math.floor(remaining.length / Math.ceil(remaining.length / 10)));
      for (let i = 0; i < remaining.length; i += step) {
        targets.add(remaining[i].version_number);
      }
    }

    return [...targets];
  }, [versions]);

  // Fetch snapshots for the computed target versions
  const fetchEnrichedHistory = useCallback(async () => {
    if (versions.length === 0 || fetchedRef.current) return;
    fetchedRef.current = true;

    const targets = computeTargetVersions();
    // Filter out already-loaded snapshots
    const toFetch = targets.filter(
      (vn) => !snapshotRecords.some((r) => r.version === vn),
    );

    setState((prev) => ({
      ...prev,
      loading: true,
      progress: { fetched: targets.length - toFetch.length, total: targets.length },
    }));

    // Fetch in batches of 3 to avoid overwhelming the API
    for (let i = 0; i < toFetch.length; i += 3) {
      const batch = toFetch.slice(i, i + 3);
      await Promise.all(
        batch.map((version) =>
          dispatch(fetchAgentVersionSnapshot({ agentId, version })).unwrap().catch(() => {}),
        ),
      );
      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          fetched: prev.progress.fetched + batch.length,
        },
      }));
    }

    setState((prev) => ({ ...prev, loading: false }));
  }, [agentId, versions, computeTargetVersions, dispatch, snapshotRecords]);

  // Recompute enriched versions whenever snapshots change
  useEffect(() => {
    const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);

    const enriched: EnrichedVersion[] = sorted.map((v, i) => {
      const snapshot = snapshotRecords.find((r) => r.version === v.version_number);
      const prevVersion = sorted[i + 1];
      const prevSnapshot = prevVersion
        ? snapshotRecords.find((r) => r.version === prevVersion.version_number)
        : undefined;

      let diffSummary: DiffResult | undefined;
      if (snapshot && prevSnapshot) {
        // MATRX-EXCEPTION: computeDiff is a generic structural-diff algorithm
        // that treats both sides as plain objects by design — it doesn't care
        // about AgentDefinitionRecord's concrete shape. `Record<string, unknown>`
        // has no index signature overlap with the record type, so TS requires
        // the two-step cast; both operands are real, already-typed records.
        diffSummary = computeDiff(
          prevSnapshot as unknown as Record<string, unknown>,
          snapshot as unknown as Record<string, unknown>,
          AGENT_DIFF_OPTIONS,
        );
      }

      return {
        ...v,
        snapshotLoaded: !!snapshot,
        diffSummary,
      };
    });

    setState((prev) => ({ ...prev, enrichedVersions: enriched }));
  }, [versions, snapshotRecords]);

  // Fill in specific missing versions (for the "load more" feature)
  const fetchGap = useCallback(
    async (versionNumbers: number[]) => {
      const toFetch = versionNumbers.filter(
        (vn) => !snapshotRecords.some((r) => r.version === vn),
      );
      await Promise.all(
        toFetch.map((version) =>
          dispatch(fetchAgentVersionSnapshot({ agentId, version })).unwrap().catch(() => {}),
        ),
      );
    },
    [agentId, dispatch, snapshotRecords],
  );

  return {
    enrichedVersions: state.enrichedVersions,
    loading: state.loading,
    progress: state.progress,
    fetchEnrichedHistory,
    fetchGap,
  };
}
