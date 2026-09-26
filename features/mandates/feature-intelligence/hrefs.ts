// features/mandates/feature-intelligence/hrefs.ts
//
// Where a job's intelligence lives. Pages are registry targets (`placement.ts`):
// `/intelligence/<registry feature id>`, `/intelligence/<domain>/unassigned`,
// or `/intelligence/unassigned`. A research topic keeps its own page. Callers
// may pass a code feature id (`podcast`, `marketing`) — it resolves to the
// target all its jobs land on, or to its Domain's section of the directory.
// `?mandate=<key>` focuses one job, and always wins: the key picks the page.

import { declaredPlacesFor } from "./registry";
import {
  NO_DOMAIN_TARGET,
  isTarget,
  legacyDestination,
  targetForKey,
} from "./placement";
import type { IntelligenceContext } from "./types";

/** The directory, opened at one Domain's section. */
export function intelligenceDomainHref(domain: string): string {
  return `/intelligence?domain=${encodeURIComponent(domain)}`;
}

function targetPath(target: string): string {
  if (target === NO_DOMAIN_TARGET) return "/intelligence/unassigned";
  return `/intelligence/${target.split("/").map(encodeURIComponent).join("/")}`;
}

/** A page id or a code feature id → where it opens. */
export function resolveIntelligenceSlug(
  slug: string,
): { target: string } | { domain: string } | null {
  if (isTarget(slug)) return { target: slug };
  return legacyDestination(slug, declaredPlacesFor(slug)?.extraPrefixes ?? []);
}

export function featureIntelligenceHref(
  featureSlug: string,
  options: { mandateKey?: string | null; context?: IntelligenceContext } = {},
): string {
  const resolved = options.mandateKey
    ? { target: targetForKey(options.mandateKey) }
    : resolveIntelligenceSlug(featureSlug);
  if (!resolved) return "/intelligence";
  if ("domain" in resolved) return intelligenceDomainHref(resolved.domain);
  const target = resolved.target;
  const topicId = options.context?.topicId;
  const base =
    target === "research" && topicId
      ? `/research/topics/${encodeURIComponent(topicId)}/intelligence`
      : targetPath(target);
  const params = new URLSearchParams();
  if (options.mandateKey) params.set("mandate", options.mandateKey);
  for (const [name, value] of Object.entries(options.context ?? {})) {
    if (value && !(target === "research" && name === "topicId")) {
      params.set(name, value);
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** The page (registry target) that shows a mandate key. */
export function featureOfMandateKey(mandateKey: string): string {
  return targetForKey(mandateKey);
}
