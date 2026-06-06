/**
 * Canonical URL builders for the scope system. Always prefer the human-readable
 * slug, falling back to the id when a row has no slug yet. Centralizing this kills
 * the hand-built template-literal hrefs that were scattered across the scope UI
 * and guarantees every link uses the same slug-or-id convention the routes resolve.
 */

interface Slugged {
  id: string;
  slug?: string | null;
}

/** Slug if present, else id — the segment the route resolver accepts either way. */
export function scopeSeg(entity: Slugged): string {
  return entity.slug || entity.id;
}

export function orgScopesHref(orgSlugOrId: string): string {
  return `/organizations/${orgSlugOrId}/scopes`;
}

export function scopeTypeHref(orgSlugOrId: string, type: Slugged): string {
  return `/organizations/${orgSlugOrId}/scopes/${scopeSeg(type)}`;
}

export function scopeHref(
  orgSlugOrId: string,
  type: Slugged,
  scope: Slugged,
): string {
  return `/organizations/${orgSlugOrId}/scopes/${scopeSeg(type)}/${scopeSeg(scope)}`;
}

export function scopeItemHref(
  orgSlugOrId: string,
  type: Slugged,
  scope: Slugged,
  item: Slugged,
): string {
  return `/organizations/${orgSlugOrId}/scopes/${scopeSeg(type)}/${scopeSeg(scope)}/${scopeSeg(item)}`;
}
