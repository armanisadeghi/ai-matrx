/**
 * Marketing URL keys — the human-readable address system for the agency-model
 * tree (`/marketing/[brandKey]/…`).
 *
 * Rules (Arman-ratified, 2026-08-28 — see docs/handoffs/marketing-agency-restructure.md):
 *   • Brand keys are GLOBALLY unique (the URL carries no org segment) —
 *     colliders get auto-suffixed at creation; the clean key is the norm.
 *   • Site keys are unique PER BRAND (the brand is in the path).
 *   • Every dynamic segment is dual-mode: UUID or key both resolve; the server
 *     layout 308s a UUID address to the key address so ONE canonical URL exists.
 *   • A brand key may never equal a static `/marketing` segment — the reserved
 *     list below MUST stay in lockstep with the array in
 *     `migrations/marketing_brand_site_url_slugs.sql`.
 *
 * Slug format/generation reuses the scope system's primitives — never a second
 * slugifier (`features/scopes/utils/slugify.ts`).
 */

import { isUuid, isValidSlug, toSlug } from "@/features/scopes/utils/slugify";

export { isUuid } from "@/features/scopes/utils/slugify";

/**
 * Static `/marketing/*` segments (current + planned agency plane + legacy
 * shims). A brand key equal to any of these would be shadowed by the static
 * route. Lockstep twin: the `reserved` array in
 * `migrations/marketing_brand_site_url_slugs.sql`.
 */
export const MARKETING_RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  "brands",
  "reports",
  "operations",
  "tools",
  "new",
  "admin",
  "ads",
  "analytics",
  "approvals",
  "audience",
  "automations",
  "backlink-valuation",
  "calendar",
  "capabilities",
  "changes",
  "competitors",
  "connections",
  "content",
  "content-plan",
  "content-studio",
  "cost",
  "discovery",
  "email",
  "growth-loop",
  "identity",
  "inbox",
  "initiatives",
  "intelligence",
  "keyword-intelligence",
  "keyword-research",
  "local",
  "locations",
  "marketing",
  "monitoring",
  "outreach",
  "pages",
  "planning",
  "pr",
  "properties",
  "ranks",
  "screenshots",
  "search-console",
  "seo",
  "settings",
  "sites",
  "snapshots",
  "social",
  "socials",
  "websites",
  "api",
  "s",
]);

/** Kebab key from a display name; never reserved, never shorter than 3 chars. */
export function toMarketingKey(name: string): string {
  let key = toSlug(name);
  if (!key) key = "brand";
  if (key.length < 3) key = `${key}-co`;
  key = key.slice(0, 50).replace(/-+$/, "");
  if (MARKETING_RESERVED_SEGMENTS.has(key)) {
    key = `${key}-co`.slice(0, 50).replace(/-+$/, "");
  }
  return key;
}

/** A valid, non-reserved marketing key (route segments validate with this). */
export function isValidMarketingKey(value: string): boolean {
  return (
    isValidSlug(value) &&
    value.length >= 3 &&
    value.length <= 50 &&
    !MARKETING_RESERVED_SEGMENTS.has(value)
  );
}

/**
 * The path segment for an entity — key when it has one, id otherwise. Same
 * preference as the scope system's `scopeSeg()`: builders always emit the
 * readable address; UUID addresses still resolve and 308 to it.
 */
export function marketingSeg(entity: {
  slug?: string | null;
  id: string;
}): string {
  return entity.slug && isValidMarketingKey(entity.slug) ? entity.slug : entity.id;
}

/**
 * True when a route param could be a brand/site key (as opposed to a UUID).
 * A param that is neither a UUID nor a plausible key is a 404, not a lookup.
 */
export function isPossibleMarketingKey(value: string): boolean {
  return !isUuid(value) && isValidSlug(value);
}
