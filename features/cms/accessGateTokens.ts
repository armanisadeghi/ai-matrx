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

/**
 * What to CALL this thing when a person is reading.
 *
 * These labels go straight into the sentences the Access Gate shows — "We
 * couldn't find this ___". They were the internal tokens dressed up ("CMS
 * site", which rendered as "we couldn't find this cms site"), which is the
 * exact thing this feature's own law forbids: a user must never be shown a
 * schema name or a token. Nobody outside this codebase has ever called their
 * website a "CMS site".
 *
 * Arman's vocabulary ruling (2026-08-20): what we build here is a WEBSITE
 * PLATFORM — a Shopify/WordPress replacement. So a `client_site` is a
 * **website** and a `client_page` is a **page**.
 */
export function cmsAccessGateLabel(token: CmsAccessGateToken): string {
  return token === "client_site" ? "website" : "page";
}
