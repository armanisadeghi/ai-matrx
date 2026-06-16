"use client";

/**
 * Auto-enriches an item-presentation card from the database.
 *
 * Fires the moment a recognized type + id are known (which, for a streamed
 * block, is the instant the `"type"` and `"id"` keys arrive) and fills in the
 * authoritative name/about/details. Stays graceful: a missing row, a soft
 * error, or an un-enrichable type all resolve without throwing.
 */

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/utils/supabase/client";

import { getItemConfig } from "./registry";
import type { EnrichedItem, EnrichmentStatus, ItemType } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useEnrichItem(
  type: ItemType | null | undefined,
  id: string | null | undefined,
): { status: EnrichmentStatus; data: EnrichedItem | null } {
  const [status, setStatus] = useState<EnrichmentStatus>("idle");
  const [data, setData] = useState<EnrichedItem | null>(null);
  // Guard against double-fetch + stale writes across re-renders / id changes.
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const { config, recognized } = getItemConfig(type);
    // Only fetch for recognized, enrichable types with a real UUID id.
    if (!recognized || !config.enrich || !id || !UUID_RE.test(id)) {
      return;
    }

    const key = `${type}:${id}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    let cancelled = false;
    setStatus("loading");

    config
      .enrich(supabase, id)
      .then((result) => {
        if (cancelled) return;
        if (result.notFound) {
          setStatus("not-found");
          setData(result);
        } else {
          setStatus("ready");
          setData(result);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Loud-ish but non-fatal: enrichment is an enhancement, the card still
        // renders the agent-provided fields.
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [type, id]);

  return { status, data };
}
