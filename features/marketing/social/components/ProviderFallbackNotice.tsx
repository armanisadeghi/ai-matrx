"use client";

/**
 * Provider-fallback state (UI-SPEC §1.2): a small "Backup source" chip when
 * (vendor name + reason only for a system admin seat — vendors are our business)
 * the primary provider was skipped; the reason is the tooltip. Renders nothing
 * when there was no fallback, and sits in a slot the caller reserves — it
 * never pushes content. A both-providers-failed state is the caller's error
 * label + Retry with the last good snapshot date (`DataFreshnessLine`).
 */

import { Badge } from "@ai-matrx/design-system/controls";
import { useSeesDollars } from "@/components/cost/useCostDisplay";

import type { SocialProviderTrace } from "../types";

const PROVIDER_NAMES: Record<string, string> = {
  scrapecreators: "ScrapeCreators",
  ensembledata: "EnsembleData",
  apify: "Apify",
};

export function providerName(provider: string): string {
  return PROVIDER_NAMES[provider.toLowerCase()] ?? provider;
}

/** True when the trace carries a fallback worth announcing. */
export function hasFallback(trace: Pick<SocialProviderTrace, "fallback_reason"> | null | undefined): boolean {
  return Boolean(trace?.fallback_reason);
}

export function ProviderFallbackNotice({
  trace,
}: {
  trace: Pick<SocialProviderTrace, "provider" | "fallback_reason"> | null | undefined;
}) {
  const seesVendor = useSeesDollars();
  if (!trace || !trace.fallback_reason) return null;
  return (
    <span title={seesVendor ? trace.fallback_reason : undefined} className="inline-flex">
      <Badge tone="warning">{seesVendor ? `via ${providerName(trace.provider)}` : "Backup source"}</Badge>
    </span>
  );
}
