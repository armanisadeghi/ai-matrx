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
) {
  const [recordings, setRecordings] = useState<RecordingHubItem[]>([]);
  const [hydratedParents, setHydratedParents] = useState<TranscriptHubItem[]>(
    [],
  );
  const [loadingRecordings, setLoadingRecordings] = useState(false);

  useEffect(() => {
    if (!groupByParent) {
      setRecordings([]);
      setHydratedParents([]);
      setLoadingRecordings(false);
      return;
    }

    let cancelled = false;
    setLoadingRecordings(true);

    void fetchActiveRecordingHubItems().then((rows) => {
      if (cancelled) return;
      setRecordings(rows);
      setLoadingRecordings(false);
    });

    return () => {
      cancelled = true;
    };
  }, [groupByParent]);

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
    if (!groupByParent || missingParentIds.length === 0) return;

    let cancelled = false;
    void fetchHubSessionItemsByIds(missingParentIds).then((parents) => {
      if (cancelled) return;
      setHydratedParents((prev) => mergeHubItems(prev, parents));
    });

    return () => {
      cancelled = true;
    };
  }, [groupByParent, missingParentIdsKey]);

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
