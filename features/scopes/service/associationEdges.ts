// features/scopes/service/associationEdges.ts
//
// THE canonical classifier for `platform.associations` edges: is an edge
// CONTENT ("this container holds that resource") or STRUCTURE (membership,
// context tagging, org attachment)?
//
// Every surface that lists "what's attached to X" must use this ONE predicate.
// The old pattern — each consumer keeping its own whitelist of allowed source
// tokens — silently dropped every newly registered entity type (a flashcard
// set attached to a war-room thread simply never rendered). An EXCLUSION list
// inverts that: any registered token is content unless it is structural, so a
// new token participates everywhere with zero code changes.
//
// Structural edges are:
//   • container-membership edges (`thread → war_room`, marked
//     `metadata.membership: true`) — the thread is IN the room, not held BY it;
//   • scope / scope_type edges — context tagging, owned by the scopes system;
//   • organization edges — org attachment, owned by iam/memberships;
//   • container tokens themselves (`thread`, `war_room`) appearing as a
//     source — a container is never another container's content.

import type { Json } from "@/types/database.types";

/** Source tokens that are structure, never container content. */
export const NON_CONTENT_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "thread",
  "war_room",
  "scope",
  "scope_type",
  "organization",
]);

/** True when edge metadata marks a container-membership edge. */
export function isMembershipMetadata(
  metadata: Json | null | undefined,
): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, Json>).membership === true
  );
}

/**
 * True when an edge into a container represents CONTENT the container holds.
 * `sourceType` is the edge's raw `source_type` token; `metadata` the edge's
 * jsonb (pass it when available so membership edges are excluded even if a
 * structural token is ever missed).
 */
export function isContentSourceEdge(
  sourceType: string,
  metadata?: Json | null,
): boolean {
  if (NON_CONTENT_SOURCE_TYPES.has(sourceType)) return false;
  if (isMembershipMetadata(metadata)) return false;
  return true;
}
