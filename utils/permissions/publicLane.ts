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

/**
 * THE PUBLIC COLUMN LANE — for every type in the lane, the EXACT columns the
 * anonymous viewer reads from its base row.
 *
 * Why names and not `select("*")` (DD-186): a signed-out visitor may read only
 * the columns a relation declares to `anon`, and these tables no longer answer
 * `*` to the publishable key. `workbench.notes` and `agent.message_template`
 * both carry `created_by`, `updated_by`, `organization_id`, `metadata` and
 * `version`, which are nobody's business on an indexed public page — the loader
 * already refused to render them, but PostgREST was serving them to the browser
 * anyway, one HTTP round trip before the projection threw them away.
 *
 * `visibility` is in every list on purpose: the loader re-checks it in JS after
 * the read, and PostgREST cannot even filter on a column the role cannot select.
 *
 * Adding a type here means checking its columns against
 * matrx-frontend `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE`; asking
 * for a column `anon` cannot read returns 42501 for the whole request, which
 * `pnpm check:anon-column-surface` is there to catch before a user does.
 *
 * `fc_set` is absent by design — it never takes this path. Its whole read is a
 * SECURITY DEFINER RPC (`get_public_flashcard_set`) that projects its own
 * columns server-side.
 */
export const PUBLIC_LANE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  fc_set: [],
  note: ["id", "label", "content", "tags", "created_at", "updated_at", "visibility"],
  message_template: [
    "id", "label", "content", "role", "tags", "created_at", "updated_at", "visibility",
  ],
};

/** Types served by the indexable public lane. Add only with a public renderer. */
export const PUBLIC_LANE_TYPES: ReadonlySet<string> = new Set(
  Object.keys(PUBLIC_LANE_COLUMNS),
);

/**
 * The columns the anonymous viewer may ask PostgREST for, as a `select` string.
 * Never falls back to `"*"`: a type in the lane with no declared columns is a
 * programming error, and returning `"*"` would quietly re-open the surface this
 * register exists to close.
 */
export function publicLaneSelect(resourceType: string): string {
  const columns = PUBLIC_LANE_COLUMNS[resourceType];
  if (!columns?.length) {
    throw new Error(
      `[matrx] publicLaneSelect("${resourceType}"): the public lane declares no ` +
        `columns for this type. Add them to PUBLIC_LANE_COLUMNS in ` +
        `utils/permissions/publicLane.ts — a signed-out read must name its ` +
        `columns (DD-186), and "*" is refused by the grant.`,
    );
  }
  return columns.join(",");
}

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
