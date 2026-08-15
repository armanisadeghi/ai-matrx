/**
 * CMS entities registered in the standalone CMS project's
 * `platform.entity_types` table and resolved by the shared Access Gate.
 *
 * They deliberately do not enter Main's generated entity registry: their rows
 * do not exist in Main, so pretending they had a Main table would create a
 * broken route/query contract. The Access Gate delegates these two tokens to
 * the authenticated `/api/cms/access-context` boundary instead.
 */
export const CMS_ACCESS_GATE_TOKENS = ["client_site", "client_page"] as const;

export type CmsAccessGateToken = (typeof CMS_ACCESS_GATE_TOKENS)[number];

/** Inline setting action used by the owning org to admit the requester. */
export const CMS_SITE_MEMBER_ADD_ACTION = "cms_site_access.add_member";

/** Stable dedupe key: one pending membership ask per caller/site. */
export function cmsSiteAccessRequestKey(siteId: string): string {
  return `cms_site_access:${siteId}`;
}

export function isCmsAccessGateToken(
  value: string,
): value is CmsAccessGateToken {
  return CMS_ACCESS_GATE_TOKENS.some((token) => token === value);
}

export function cmsAccessGateLabel(token: CmsAccessGateToken): string {
  return token === "client_site" ? "CMS site" : "CMS page";
}
