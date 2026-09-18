"use client";

/**
 * The outage source's live half. One cheap admin read per poll per open
 * super-admin tab; the server closes the row when calls succeed, so this is
 * also how fast the item disappears on its own.
 *
 * A FAILED POLL IS NOT AN OUTAGE (`loud: false`): the request already lands
 * once in the Error Inspector through `lib/python-client`'s
 * `capturePythonClientError`, and a loud card on a 60-second timer would be
 * the "complains constantly" failure in its purest form.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchOpenOutages, type OpenOutage } from "@/features/admin/system-errors/open-outages";
import { ATTENTION_POLL_MS } from "../poll";
import { muteItem, unmuteItem } from "../item-mute";
import type { AttentionSourceState } from "../types";
import {
  PROVIDER_OUTAGE_SOURCE_ID,
  PROVIDER_OUTAGE_SOURCE_LABEL,
  providerOutageItems,
  summarizeProviderOutages,
} from "./provider-outages";
import { OUTAGE_DETAILS_HREF } from "@/features/admin/system-errors/open-outages";

export const PROVIDER_OUTAGES_QUERY_KEY = ["admin-attention", "provider-outages"] as const;

export function useProviderOutageSource(enabled: boolean): AttentionSourceState {
  const query = useQuery<OpenOutage[]>({
    queryKey: PROVIDER_OUTAGES_QUERY_KEY,
    queryFn: fetchOpenOutages,
    enabled,
    refetchInterval: ATTENTION_POLL_MS,
    refetchOnWindowFocus: true,
    // A retry storm against a provider outage helps nobody.
    retry: false,
  });

  // The local store notifies its subscribers itself (`useLocalMutes`).
  const items = providerOutageItems(query.data ?? [], {
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
    id: PROVIDER_OUTAGE_SOURCE_ID,
    label: PROVIDER_OUTAGE_SOURCE_LABEL,
    items,
    status,
    error: query.error instanceof Error ? query.error.message : null,
    loud: false,
    summarize: summarizeProviderOutages,
    review: { href: OUTAGE_DETAILS_HREF, label: "See the recorded failures" },
    refetch: () => {
      void query.refetch();
    },
  };
}
