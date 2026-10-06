// features/marketing/seo/ai-visibility/brand-lookup/lookup-args.ts — what the
// brand lookup sends to `seo_ai_visibility`. Pure, so every argument rule is
// tested without a server.
//
// A field left out is filled by the tool from the site (its domain, its
// confirmed competitors), so the screen sends a field ONLY when the person
// changed it. That keeps the screen's call identical to the one an agent makes
// with the same defaults, so a result either of them bought is reused free by
// the other.

import { normalizeDomainInput } from "../../domain-research/data";
import { SEO_AI_VISIBILITY_TOOL } from "./types";

export { SEO_AI_VISIBILITY_TOOL };

/** Comma- or newline-separated names/domains → trimmed, de-duplicated (case-insensitive). */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const value = raw.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a.map((v) => v.toLowerCase()));
  return b.every((v) => left.has(v.toLowerCase()));
}

/** The brand to send: null when it is (or normalizes to) the site's own domain. */
export function brandArgument(input: string, siteDomain: string | null): string | null {
  const value = input.trim();
  if (!value) return null;
  const site = normalizeDomainInput(siteDomain);
  if (site && normalizeDomainInput(value) === site) return null;
  return value;
}

export interface LookupInput {
  siteId: string;
  siteDomain: string | null;
  brand: string;
  /** null = the person has not touched the list: use the site's confirmed competitors. */
  competitors: string[] | null;
  /** The site's confirmed competitors, as read from `seo.competitor`; null while loading. */
  confirmed: string[] | null;
}

export function mentionsArgs(input: LookupInput): Record<string, unknown> {
  const brand = brandArgument(input.brand, input.siteDomain);
  return {
    action: "brand_mentions",
    site_id: input.siteId,
    ...(brand ? { brand } : {}),
  };
}

/**
 * The share-of-voice call, or null when it cannot run: the confirmed list is
 * still loading, or there is nobody to compare against (the tool would answer
 * "unavailable" — the screen says so without a call).
 */
export function shareOfVoiceArgs(input: LookupInput): Record<string, unknown> | null {
  if (input.competitors === null && input.confirmed === null) return null;
  const effective = input.competitors ?? input.confirmed ?? [];
  if (effective.length === 0) return null;
  const brand = brandArgument(input.brand, input.siteDomain);
  const useConfirmed =
    input.competitors === null || (input.confirmed !== null && sameSet(input.competitors, input.confirmed));
  return {
    action: "share_of_voice",
    site_id: input.siteId,
    ...(brand ? { brand } : {}),
    ...(useConfirmed ? {} : { competitors: effective }),
  };
}
