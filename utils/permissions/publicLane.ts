/**
 * THE PUBLIC LANE — the ONE list of resource types that have a real
 * anonymous, indexable page at `/p/e/[resourceType]/[id]`.
 *
 * Why this module exists: the list used to live as a private const inside the
 * server loader, so the SHARE UI could not know whether flipping a resource to
 * `visibility='public'` actually produced a reachable page. It therefore told
 * every owner "anyone with the link can access this" — for a brand, a site, a
 * workflow, anything — while no such link existed. A share surface that claims
 * access it cannot deliver is a defect (features/sharing/FEATURE.md: "a share
 * surface that can't act must say why").
 *
 * Being public is a DATA state (the `pub_read` RLS policy). Having a public
 * PAGE is a product decision, made here. A type joins this lane only when it
 * has a public renderer and genuinely belongs in the SEO/community lane — a
 * public `dm_conversation` or `wc_claim` must never auto-publish to an indexed
 * page. For everything else, anonymous access is the share-link lane
 * (`platform.share_links` → `/s/[token]`, noindex).
 */

/** Types served by the indexable public lane. Add only with a public renderer. */
export const PUBLIC_LANE_TYPES: ReadonlySet<string> = new Set([
  "fc_set",
  "note",
  "message_template",
]);

/** Does `visibility='public'` give this type a reachable anonymous page? */
export function hasPublicPage(resourceType: string): boolean {
  return PUBLIC_LANE_TYPES.has(resourceType);
}

/**
 * The absolute public URL for a type in the lane, or null when the type has no
 * public page. Never fabricate a URL for a type outside the lane — that is the
 * exact lie this module was created to kill.
 */
export function publicResourceUrl(
  resourceType: string,
  id: string,
): string | null {
  if (!hasPublicPage(resourceType)) return null;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/p/e/${resourceType}/${id}`;
}
