/**
 * Canonical site-slug vocabulary for `client_sites.slug`.
 *
 * A site's slug is its URL identifier — it is what `/c/{slug}` resolves
 * against on my-matrx before a domain is attached (see `pageUrls.ts`), so the
 * shape is a real contract, not a formatting preference.
 *
 * This module exists because the rule had been an inline regex chain inside
 * `app/(core)/cms/page.tsx`'s `handleNameChange`, with the prose duplicated in
 * the dialog's helper text. The CMS hub's `new_site_draft` write target has to
 * validate an agent-supplied slug against the SAME rule the user's own typing
 * derives, so the vocabulary was promoted here for the manifest, the write
 * handler, and the dialog to share one definition.
 *
 * `derive` and `isValid` are twins on purpose: `deriveCmsSiteSlug(anything)`
 * either returns "" or returns a string `isValidCmsSiteSlug` accepts.
 */

/**
 * A valid slug: lowercase alphanumeric segments joined by SINGLE hyphens, no
 * leading or trailing hyphen. Exactly the output shape of `deriveCmsSiteSlug`.
 */
export const CMS_SITE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Model/user-facing statement of the rule — the ONE wording. */
export const CMS_SITE_SLUG_RULE =
  "lowercase letters, numbers, and single hyphens between them (no spaces, no leading or trailing hyphen)";

/** True when `value` is a well-formed site slug. */
export function isValidCmsSiteSlug(value: string): boolean {
  return CMS_SITE_SLUG_PATTERN.test(value);
}

/**
 * Derive a slug from a site NAME — the auto-fill the Create New Site dialog
 * applies while the user types, until they edit the slug field themselves.
 *
 * Returns "" when the name has no slug-able characters at all (e.g. "☃"),
 * which callers must treat as "ask for an explicit slug" rather than as a
 * usable value.
 */
export function deriveCmsSiteSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A site's optional custom domain is a BARE HOSTNAME — `www.example.com`, not
 * `https://www.example.com/` — because my-matrx matches it against the request
 * host (`DOMAIN_ROUTING_DESIGN.md`). At least one dot, no scheme, no path, no
 * port, no whitespace.
 */
export const CMS_SITE_DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Model/user-facing statement of the domain rule — the ONE wording. */
export const CMS_SITE_DOMAIN_RULE =
  "a bare hostname such as www.example.com — no scheme, no path, no port";

/** True when `value` is a well-formed bare hostname. */
export function isValidCmsSiteDomain(value: string): boolean {
  return CMS_SITE_DOMAIN_PATTERN.test(value);
}
