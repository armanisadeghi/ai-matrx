// features/mandates/feature-intelligence/hrefs.ts
//
// Where a feature's intelligence lives. A feature with its own intelligence
// page (research topics) keeps it there; every other feature uses the generic
// `/intelligence/<feature>`. `?mandate=<key>` focuses one job.

import type { IntelligenceContext } from "./types";

export function featureIntelligenceHref(
  feature: string,
  options: { mandateKey?: string | null; context?: IntelligenceContext } = {},
): string {
  const topicId = options.context?.topicId;
  const base =
    feature === "research" && topicId
      ? `/research/topics/${encodeURIComponent(topicId)}/intelligence`
      : `/intelligence/${encodeURIComponent(feature)}`;
  const params = new URLSearchParams();
  if (options.mandateKey) params.set("mandate", options.mandateKey);
  for (const [name, value] of Object.entries(options.context ?? {})) {
    if (value && !(feature === "research" && name === "topicId")) {
      params.set(name, value);
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** The feature a mandate key belongs to — its first segment. */
export function featureOfMandateKey(mandateKey: string): string {
  return mandateKey.split(".")[0] ?? mandateKey;
}
