/**
 * Which page a floating social post panel belongs to. Pure.
 *
 * A post panel opened inside a brand's section carries that brand's route segment (`brandSeg`). It lives in the
 * overlay store and in `?panels=` (`social_post:<postId>:o-<org>_b-<brand>`), so without a rule it follows the
 * person into another brand's Studio or onto /board and reopens over the wrong client's data. The rule: a panel
 * with a brand belongs to that brand's pages (`/marketing/<brandSeg>/...`); when the route is anywhere else it
 * closes, and a link restored on another page does not open it. A panel with no brand (opened outside a brand,
 * e.g. from a board) belongs to no page in particular and stays.
 */

/** The brand route segment of a pathname (`/marketing/<seg>/...`), or null outside the marketing tree. */
export function brandSegOfPath(pathname: string | null | undefined): string | null {
  const parts = (pathname ?? "").split("?")[0].split("/").filter(Boolean);
  return parts[0] === "marketing" && parts[1] ? parts[1] : null;
}

/** True when a panel opened under `brandSeg` has no business being open on `pathname`. */
export function postPanelOutOfScope(args: { brandSeg: string | null | undefined; pathname: string | null | undefined }): boolean {
  const own = (args.brandSeg ?? "").trim().toLowerCase();
  if (!own) return false;
  return brandSegOfPath(args.pathname)?.toLowerCase() !== own;
}
