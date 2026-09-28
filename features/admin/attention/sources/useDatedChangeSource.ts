"use client";

/**
 * The dated-change source's live half: one super-admin read per poll
 * (`platform.dated_changes_for_attention`, drift computed by the read itself). A failed read is
 * LOUD — a refused price change would be invisible until it works, and silence reads as healthy.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDatedChanges, type DatedChange } from "@/features/admin/dated-changes/service";
import { DATED_CHANGES_PAGE_HREF } from "@/features/admin/dated-changes/describe";
import { ATTENTION_POLL_MS } from "../poll";
import { muteItem, unmuteItem } from "../item-mute";
import type { AttentionSourceState } from "../types";
import {
  DATED_CHANGE_SOURCE_ID,
  DATED_CHANGE_SOURCE_LABEL,
  datedChangeItems,
  summarizeDatedChanges,
} from "./dated-changes";

export const DATED_CHANGES_QUERY_KEY = ["admin-attention", "dated-changes"] as const;

export function useDatedChangeSource(enabled: boolean): AttentionSourceState {
  const queryClient = useQueryClient();
  const query = useQuery<DatedChange[]>({
    queryKey: DATED_CHANGES_QUERY_KEY,
    queryFn: () => fetchDatedChanges(false),
    enabled,
    refetchInterval: ATTENTION_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const items = datedChangeItems(query.data ?? [], {
    muteLocally: (key, ms) => muteItem(key, ms),
    unmuteLocally: (key) => unmuteItem(key),
  });

  const status: AttentionSourceState["status"] = !enabled
    ? "idle"
    : query.isError
      ? "failed"
      : query.data === undefined
        ? "loading"
        : "ok";

  return {
    id: DATED_CHANGE_SOURCE_ID,
    label: DATED_CHANGE_SOURCE_LABEL,
    items,
    status,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    loud: true,
    summarize: summarizeDatedChanges,
    review: { href: DATED_CHANGES_PAGE_HREF, label: "All dated changes" },
    refetch: () => {
      void queryClient.invalidateQueries({ queryKey: DATED_CHANGES_QUERY_KEY });
    },
  };
}
