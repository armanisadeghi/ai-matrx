import type { SearchResultItem } from "@/features/scraper/types/scraper-api";
import { getDomain } from "@/features/scraper/utils/scraper-floating-helpers";

/**
 * Adapt the scraper service's flat search rows into the canonical search kind.
 * Rendering remains owned by `web_search_results`; this boundary only names
 * the provider-neutral fields the scraper response can actually supply.
 */
export function scraperSearchItemsToKindValue(
  query: string,
  items: SearchResultItem[],
): Record<string, unknown> {
  const source = items.find((item) => item.source?.trim())?.source ?? "brave";

  return {
    __kind: "web_search_results",
    source,
    query: query.trim(),
    total_results: items.length,
    results: items.map((item, index) => {
      const url = item.url?.trim() ?? "";
      return {
        __kind: "web_result",
        source: item.source?.trim() || source,
        position: item.rank ?? index + 1,
        title: item.title?.trim() || url || `Result ${index + 1}`,
        url,
        site_name: url ? getDomain(url) : "",
        displayed_url: url,
        snippet: item.snippet ?? item.description ?? null,
        thumbnail: item.thumbnail ?? null,
        age_text: item.age ?? null,
      };
    }),
  };
}
