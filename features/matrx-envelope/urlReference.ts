/**
 * URL reference fences — `UrlRefItem { url, label? }` (not RecordRef).
 *
 * The one reference type with no Matrx-owned id — a plain external link.
 * Never resolved server-side (there's nothing to look up); the chip displays
 * the URL itself (or its label) and opens it directly in a new tab.
 */

import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";

export interface UrlReferenceArgs {
  url: string;
  label?: string;
}

/** Build the canonical ```matrx``` fence for one external URL reference. */
export function buildUrlReferenceFence(args: UrlReferenceArgs): string {
  const item: Record<string, string> = { url: args.url };
  const label = args.label?.trim();
  if (label) item.label = label;
  return buildReferenceFence({
    type: "url",
    items: [item as ReferenceItem],
  });
}

/** Build one fence carrying N external URL references. */
export function buildMultiUrlReferenceFence(
  urls: ReadonlyArray<UrlReferenceArgs>,
): string {
  if (urls.length === 0) return "";
  if (urls.length === 1) return buildUrlReferenceFence(urls[0]!);
  const items = urls.map((u) => {
    const item: Record<string, string> = { url: u.url };
    const label = u.label?.trim();
    if (label) item.label = label;
    return item as ReferenceItem;
  });
  return buildReferenceFence({ type: "url", items });
}
