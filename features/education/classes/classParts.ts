// features/education/classes/classParts.ts
//
// Pure rules for a class's content and its PARTS (units, lessons, sections).
//
// The model (no table, the ONE association system):
//   - a part is a scope under the per-org "Unit" scope type (CLASS_PART_SCOPE_TYPE_SLUG);
//   - part → class is a `scope → scope` edge with role `part_of` (Data Doctrine R7:
//     a tree is a self-relation; `context.scopes.parent_scope_id` is dead);
//   - content in a part carries two plain edges, content → part AND content → class,
//     so "everything in the class" never misses what sits in a unit.
// Removing is archiving: `assoc_remove` tombstones the edge, the record itself stays.

import type { ContainerLink } from "@ai-matrx/associations/react";
import { isRegisteredPair, registeredEdgeLabel } from "@ai-matrx/associations";
import { toSlug } from "@/features/scopes/utils/slugify";
import {
  ASSIGNMENT_EDGE_ROLE,
  CLASS_PART_EDGE_ROLE,
  CLASS_TEST_EDGE_KIND,
} from "./constants";

/** One part of a class, as the hub shows it. */
export interface ClassPart {
  id: string;
  name: string;
}

/**
 * A class's content: every incoming edge except its own parts (`scope` sources)
 * and assignment edges (the assignments panel reads those). Every token counts —
 * a web page, a transcript or a dataset added as a source is never dropped
 * because education did not curate its token.
 */
export function classContentLinks(
  links: readonly ContainerLink[],
): ContainerLink[] {
  return links.filter(
    (l) => l.token !== "scope" && l.role !== ASSIGNMENT_EDGE_ROLE,
  );
}

/**
 * The edge label to offer as a title hint, or null. A label the registry writes
 * for the pair (a Source filed under a scope is labelled "about") names the
 * RELATIONSHIP, never the item — showing it lists every web page as "about".
 */
export function titleHintFromEdgeLabel(
  token: string,
  label: string | null,
): string | null {
  if (!label) return null;
  return label === registeredEdgeLabel(token, "scope") ? null : label;
}

export function metadataOf(link: ContainerLink): { kind?: unknown; date?: unknown } {
  const m = link.metadata;
  return m && typeof m === "object" ? (m as { kind?: unknown; date?: unknown }) : {};
}

/** Is this class link a TEST (not a unit)? */
export function isTestLink(link: ContainerLink): boolean {
  return (
    link.token === "scope" &&
    link.role === CLASS_PART_EDGE_ROLE &&
    metadataOf(link).kind === CLASS_TEST_EDGE_KIND
  );
}

/** The ids of a class's parts — the sources of its incoming `part_of` edges. */
export function classPartIds(links: readonly ContainerLink[]): string[] {
  return links
    .filter(
      (l) =>
        l.token === "scope" &&
        l.role === CLASS_PART_EDGE_ROLE &&
        // A test joins its class by the same edge; it is not a unit.
        !isTestLink(l),
    )
    .map((l) => l.resourceId);
}

/** "Unit 1", "Unit 2", "Unit 10" — natural order, so numbered parts read right. */
export function sortParts<T extends { name: string }>(
  parts: readonly T[],
): T[] {
  return [...parts].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

/**
 * A slug for a new part scope. Slugs are unique per scope type and every class's
 * first part is called "Unit 1", so a short unique tail is always added.
 */
export function partScopeSlug(name: string, unique: string): string {
  const base = toSlug(name).slice(0, 48).replace(/-+$/g, "") || "part";
  const tail = toSlug(unique) || "x";
  return `${base}-${tail}`;
}

export type AttachableRef =
  { ok: true; token: string; id: string } | { ok: false; reason: string };

/** The server names a stored file `cld_file` in places; on an edge it is a `file`. */
const TOKEN_ALIASES: Readonly<Record<string, string>> = { cld_file: "file" };

/**
 * Can this picked Source be filed under a class (a `scope`)? Only when the
 * registry has the `<token> → scope` pair; anything else is refused BY NAME so
 * the person is told which pick was not added (never a silent skip).
 */
export function attachableSourceRef(
  ref: { resource_type: string; resource_id: string } | null | undefined,
  noun?: string,
): AttachableRef {
  if (!ref?.resource_id) {
    return {
      ok: false,
      reason: `${noun ?? "This source"} is still being added.`,
    };
  }
  const token = TOKEN_ALIASES[ref.resource_type] ?? ref.resource_type;
  if (!isRegisteredPair(token, "scope")) {
    return {
      ok: false,
      reason: `${noun ?? "This kind"} can't be filed under a class yet.`,
    };
  }
  return { ok: true, token, id: ref.resource_id };
}

/** One edge into a part, as `listForTargets('scope', partIds)` returns it. */
export interface PartEdge {
  targetId: string;
  sourceType: string;
  sourceId: string;
  role: string | null;
}

/** `${token}:${id}` — the same key the class's `attachedKeys` uses. */
export function itemKey(token: string, id: string): string {
  return `${token}:${id}`;
}

/**
 * Which items each part holds: plain (role-less) edges into the class's own
 * parts. Edges into other scopes and role-carrying edges (assignments) are not
 * membership.
 */
export function partMembership(
  edges: readonly PartEdge[],
  partIds: readonly string[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>(
    partIds.map((id) => [id, new Set<string>()]),
  );
  for (const e of edges) {
    if (e.role != null) continue;
    const bucket = out.get(e.targetId);
    if (bucket) bucket.add(itemKey(e.sourceType, e.sourceId));
  }
  return out;
}

/** One `attach_to` target of the landing door (`POST /sources/{id}/keep`). */
export interface SourceFilingTarget {
  entity_type: "scope";
  entity_id: string;
  label: null;
  signal: true;
}

/**
 * Where a Source picked in "Add sources" is filed by the server door: the
 * class, and the selected part too — both edges in one Keep, so "everything
 * in the class" never misses what sits in a unit. The label is the registry's
 * ("about"), never a display name.
 */
export function sourceFilingTargets(
  classId: string,
  partId: string | null,
): SourceFilingTarget[] {
  const ids = partId && partId !== classId ? [classId, partId] : [classId];
  return ids.map((id) => ({
    entity_type: "scope",
    entity_id: id,
    label: null,
    signal: true,
  }));
}

/**
 * The content groups a selected part (`?unit=<id>`) shows: only the items that
 * part holds, empty groups dropped. No part selected (`partKeys` null) → every
 * group unchanged. The owner hub and a member's view filter with the same rule.
 */
export function groupsInPart<
  I extends { token: string; entityId: string },
  G extends { items: readonly I[] },
>(groups: readonly G[], partKeys: ReadonlySet<string> | null): G[] {
  if (!partKeys) return [...groups];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => partKeys.has(itemKey(i.token, i.entityId))),
    }))
    .filter((g) => g.items.length > 0);
}
