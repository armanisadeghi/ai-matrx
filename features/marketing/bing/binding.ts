import type { BingSiteBinding } from "@/features/marketing/bing/types";

/**
 * Reads `site.integrations.marketing.providers.bing_webmaster`. Mirrors the
 * backend's `BingSiteBinding` shape exactly (`aidream/services/seo/
 * bing_webmaster.py::parse_bing_site_binding`) — three fields, no
 * `credential_authority` (that generic field belongs to the FE-only custom
 * provider schema, never to this aidream-owned binding).
 */
export function parseBingSiteBinding(integrations: unknown): BingSiteBinding | null {
  if (typeof integrations !== "object" || integrations === null) return null;
  const marketing = (integrations as Record<string, unknown>).marketing;
  if (typeof marketing !== "object" || marketing === null) return null;
  const providers = (marketing as Record<string, unknown>).providers;
  if (typeof providers !== "object" || providers === null) return null;
  const binding = (providers as Record<string, unknown>).bing_webmaster;
  if (typeof binding !== "object" || binding === null) return null;
  const { enabled, credential_ref, resource_ref } = binding as Record<string, unknown>;
  if (
    typeof enabled !== "boolean" ||
    typeof credential_ref !== "string" ||
    typeof resource_ref !== "string"
  ) {
    return null;
  }
  return { enabled, credential_ref, resource_ref };
}

export function siteHasActiveBingBinding(integrations: unknown): boolean {
  return parseBingSiteBinding(integrations)?.enabled === true;
}
