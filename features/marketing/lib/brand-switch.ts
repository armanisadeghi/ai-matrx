/**
 * Same-route client switching (Arman's rule, 2026-08-30): changing the brand
 * in the crumb keeps you on EXACTLY the same route for the new brand — as long
 * as it is a valid place to be.
 *
 * Brand-section paths are static per brand, so they carry over verbatim.
 * Entity-scoped segments (a site, a location, an initiative, a plan node)
 * belong to the OLD brand and would 404 or leak context on the new one, so the
 * path degrades to the nearest valid ancestor list for the target brand.
 * Query strings carry over minus entity-selection params (`site`, `location`,
 * `node`, `change`) for the same reason.
 */

const ENTITY_QUERY_PARAMS = ["site", "location", "node", "change"] as const;

/**
 * Longest-prefix rules mapping a path inside one brand to what survives a
 * brand switch. A rule keys on the section segments; `keep` is how many
 * segments of the ORIGINAL path survive (the rest was entity-scoped).
 */
const DEGRADE_RULES: readonly { prefix: string[]; keep: number }[] = [
  // site-scoped branches: keep the branch door only
  { prefix: ["websites"], keep: 1 },
  { prefix: ["seo"], keep: 1 },
  { prefix: ["content", "plan"], keep: 2 },
  { prefix: ["locations"], keep: 1 },
  { prefix: ["planning", "initiatives"], keep: 2 },
  { prefix: ["intelligence", "reputation"], keep: 2 },
];

/**
 * The same address on another brand. `pathnameWithinBrand` is everything after
 * `/marketing/<brandSeg>` (no leading slash needed), `search` the current query
 * string ("" or "?x=y").
 */
export function brandSwitchHref(
  targetSeg: string,
  pathname: string,
  search = "",
): string {
  const match = /^\/marketing\/[^/]+(?:\/(.*))?$/.exec(pathname);
  const segments = (match?.[1] ?? "").split("/").filter(Boolean);

  let kept = segments;
  for (const rule of DEGRADE_RULES) {
    if (
      segments.length > rule.keep &&
      rule.prefix.every((seg, index) => segments[index] === seg)
    ) {
      kept = segments.slice(0, rule.keep);
      break;
    }
  }

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of ENTITY_QUERY_PARAMS) params.delete(key);
  const query = params.toString();

  const base = `/marketing/${targetSeg}${kept.length ? `/${kept.join("/")}` : ""}`;
  return query ? `${base}?${query}` : base;
}
