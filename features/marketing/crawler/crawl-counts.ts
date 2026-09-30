import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

function statNumber(stats: Json, key: string): number {
  if (!isJsonRecord(stats)) return 0;
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * THE live "N fetched" count for a running crawl — the header badge and the
 * live feed read this one definition.
 *
 * `pages_fetched` counts pages whose capture is fully persisted (snapshot,
 * screenshots, storage); on a screenshot crawl it trails the network fetch by
 * minutes. `pages_downloaded` counts responses received and is written on every
 * progress heartbeat. Reading `pages_fetched` alone is how the header sat at
 * "0 fetched" while pages were landing (2026-09-14). Finished-run surfaces keep
 * showing `pages_fetched` as "Captured".
 */
export function liveFetchedCount(stats: Json): number {
  return Math.max(
    statNumber(stats, "pages_downloaded"),
    statNumber(stats, "pages_fetched"),
  );
}
