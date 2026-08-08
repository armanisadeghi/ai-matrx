"use client";

import { useEffect, useMemo, useState } from "react";
import type { TranscriptSortKey } from "@/features/transcripts/components/TranscriptsSortMenu";
import {
  fetchActiveRecordingHubItems,
  fetchHubSessionItemsByIds,
} from "@/features/transcripts/service/transcriptsHubService";
import type {
  HubTreeNode,
  RecordingHubItem,
  TranscriptHubItem,
} from "@/features/transcripts/types/hub";
import { hubItemKey } from "@/features/transcripts/types/hub";
import { buildHubTree } from "@/features/transcripts/utils/hubGrouping";
import { scopeKey, type ListScope } from "@/lib/list-scope/types";

function mergeHubItems(
  base: TranscriptHubItem[],
  extra: TranscriptHubItem[],
): TranscriptHubItem[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map(hubItemKey));
  const merged = [...base];
  for (const item of extra) {
    const key = hubItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function useTranscriptsHubGrouping(
  items: TranscriptHubItem[],
  groupByParent: boolean,
  sortKey: TranscriptSortKey,
  scope: ListScope,
) {
  const requestedScopeKey = scopeKey(scope);
  const [recordingResult, setRecordingResult] = useState<{
    scopeKey: string;
    items: RecordingHubItem[];
  }>({ scopeKey: "", items: [] });
  const [parentResult, setParentResult] = useState<{
    scopeKey: string;
    items: TranscriptHubItem[];
  }>({ scopeKey: "", items: [] });

  const recordings =
    groupByParent && recordingResult.scopeKey === requestedScopeKey
      ? recordingResult.items
      : [];
  const hydratedParents =
    groupByParent && parentResult.scopeKey === requestedScopeKey
      ? parentResult.items
      : [];
  const loadingRecordings =
    groupByParent && recordingResult.scopeKey !== requestedScopeKey;

  useEffect(() => {
    if (!groupByParent) return undefined;

    let cancelled = false;

    void fetchActiveRecordingHubItems(scope).then((rows) => {
      if (cancelled) return;
      setRecordingResult({ scopeKey: requestedScopeKey, items: rows });
    });

    return () => {
      cancelled = true;
    };
  }, [groupByParent, requestedScopeKey, scope]);

  const missingParentIds = useMemo(() => {
    if (!groupByParent || recordings.length === 0) return [];
    const loadedKeys = new Set([
      ...items.map(hubItemKey),
      ...hydratedParents.map(hubItemKey),
    ]);
    const ids = new Set<string>();
    for (const recording of recordings) {
      const parentKey = `${recording.parentKind}-${recording.sessionId}`;
      if (!loadedKeys.has(parentKey)) ids.add(recording.sessionId);
    }
    return [...ids].sort();
  }, [groupByParent, items, recordings, hydratedParents]);

  const missingParentIdsKey = missingParentIds.join(",");

  useEffect(() => {
    if (!groupByParent || missingParentIds.length === 0) return undefined;

    let cancelled = false;
    void fetchHubSessionItemsByIds(missingParentIds, scope).then((parents) => {
      if (cancelled) return;
      setParentResult((prev) => ({
        scopeKey: requestedScopeKey,
        items:
          prev.scopeKey === requestedScopeKey
            ? mergeHubItems(prev.items, parents)
            : parents,
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [groupByParent, missingParentIdsKey, requestedScopeKey, scope]);

  const itemsWithParents = useMemo(
    () => mergeHubItems(items, hydratedParents),
    [items, hydratedParents],
  );

  const tree = useMemo(() => {
    if (!groupByParent) return null;
    return buildHubTree(itemsWithParents, recordings, sortKey);
  }, [groupByParent, itemsWithParents, recordings, sortKey]);

  return { tree, loadingRecordings };
}
