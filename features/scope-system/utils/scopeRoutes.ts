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

export function orgHref(orgSlugOrId: string): string {
  return `/organizations/${orgSlugOrId}`;
}

export function orgScopesHref(orgSlugOrId: string): string {
  return `${orgHref(orgSlugOrId)}/scopes`;
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

/**
 * THE DOOR LAW door for a scope you only know the ID of.
 *
 * The canonical scope page needs org + type in the path, but almost every
 * surface that NAMES a scope (assigned-scope chips, association cards, the
 * scopes hub, agent context) holds only its id — which is why those names were
 * plain text. `/scopes/s/[scopeId]` is a server resolver that looks up the
 * scope's org + type and redirects to `scopeHref`, so an id is enough.
 *
 * Prefer `scopeHref` when the surface already knows org + type (one less hop).
 * Pass this to `<EntityRef token="scope" href={scopeShortHref(id)} …/>` —
 * `scope` has no registry `hrefFor` yet (see docs/handoffs/no-dead-ends-sweep.md).
 */
export function scopeShortHref(scopeId: string): string {
  return `/scopes/s/${scopeId}`;
}

/** The VALUE page: a context item's value for one scope (item × scope cell). */
export function scopeItemHref(
  orgSlugOrId: string,
  type: Slugged,
  scope: Slugged,
  item: Slugged,
): string {
  return `/organizations/${orgSlugOrId}/scopes/${scopeSeg(type)}/${scopeSeg(scope)}/${scopeSeg(item)}`;
}

// ── Manage (full-page edit) routes ───────────────────────────────────────────

export function scopeTypeEditHref(orgSlugOrId: string, type: Slugged): string {
  return `${scopeTypeHref(orgSlugOrId, type)}/edit`;
}

export function scopeEditHref(
  orgSlugOrId: string,
  type: Slugged,
  scope: Slugged,
): string {
  return `${scopeHref(orgSlugOrId, type, scope)}/edit`;
}

// ── Context-item (the THING, defined on a type) routes ───────────────────────

/** Collection Hub: all context items defined on a scope type. */
export function contextItemsHref(orgSlugOrId: string, type: Slugged): string {
  return `/organizations/${orgSlugOrId}/scopes/${scopeSeg(type)}/context-items`;
}

/** Item Hub: a context item's own page (settings + its value across every scope). */
export function contextItemHref(
  orgSlugOrId: string,
  type: Slugged,
  item: Slugged,
): string {
  return `${contextItemsHref(orgSlugOrId, type)}/${scopeSeg(item)}`;
}

/** Item Manage: full-page edit of a context item's own settings. */
export function contextItemEditHref(
  orgSlugOrId: string,
  type: Slugged,
  item: Slugged,
): string {
  return `${contextItemHref(orgSlugOrId, type, item)}/edit`;
}

/** One scope's items + values, as a dedicated page. */
export function scopeContextItemsHref(
  orgSlugOrId: string,
  type: Slugged,
  scope: Slugged,
): string {
  return `${scopeHref(orgSlugOrId, type, scope)}/context-items`;
}
