/**
 * Where ↵ takes a hit — its own route, from the one door registry.
 *
 * The server's `href` wins (it knows things the client does not). Otherwise
 * the entity registry's `hrefFor` is the canonical address — the same one
 * every `EntityRef` link uses — except agents, whose real address depends on
 * their kind and is resolved server-side by `/agents/go/<id>` (see
 * components/official/entity-ref/useEntityHref.ts). A Segment opens its
 * Source. A hit with no door returns `null`, and the bar says so on the row
 * instead of rendering a link to nowhere (no dead ends).
 */

import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

export function hitHref(hit: KnowledgeHit): string | null {
  if (hit.href) return hit.href;
  if (hit.entity === "segment" && hit.segment?.source_id) {
    return `/knowledge/sources/${encodeURIComponent(hit.segment.source_id)}`;
  }
  const token = resolveEntityToken(hit.entity);
  if (token === "agent") return `/agents/go/${encodeURIComponent(hit.id)}`;
  return tryGetEntityInfo(token)?.hrefFor?.(hit.id) ?? null;
}

/** Absolute link for "Copy link". */
export function hitAbsoluteUrl(hit: KnowledgeHit): string | null {
  const href = hitHref(hit);
  if (!href) return null;
  if (typeof window === "undefined") return href;
  return new URL(href, window.location.origin).toString();
}
