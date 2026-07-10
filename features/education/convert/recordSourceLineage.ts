// features/education/convert/recordSourceLineage.ts
//
// THE one canonical writer of a converter source-lineage edge. Every generated
// study artifact links a `source` association edge back to where it came from —
// the durable ingest anchor FILE (P9 kit) OR the origin ENTITY (note→deck,
// deck→quiz, assessment→deck; the entity-sourced convert). This replaces the
// near-identical block the generators used to duplicate inline (deck / summary /
// mind_map / notes / audio), and the quiz / practice_test generators now use it
// too — one implementation, never a per-generator copy.
//
// Direction mirrors every converter edge: artifact --source--> origin (the
// artifact is the edge SOURCE, role "source"). Rich metadata (targetKind / href /
// detail) rides the edge so a reverse-lineage strip ("generated from this") can
// render without re-deriving a route (see `lineage.ts` / `GeneratedFromChips`).

import { associationsService } from "@/features/scopes/service/associationsService";
import type { AssociationTargetType } from "@/features/scopes/types";
import type { ConvertResult, ConvertSource } from "./types";

/**
 * Resolve the lineage anchor a converted artifact links back to. The durable
 * ingest file wins (uniform P9 lineage); otherwise the origin entity itself
 * (entity-sourced conversions). `null` when the source has no anchor (e.g. a raw
 * topic) — nothing to link.
 */
function resolveAnchor(
  source: ConvertSource,
): { type: AssociationTargetType; id: string } | null {
  if (source.ref?.fileId) return { type: "file", id: source.ref.fileId };
  if (source.ref?.entityType && source.ref.entityId) {
    // The entity token is validated at the chokepoint (normalizeEntityToken +
    // checkToken against the live registry); the cast only satisfies the
    // curated compile-time target union.
    return {
      type: source.ref.entityType as AssociationTargetType,
      id: source.ref.entityId,
    };
  }
  return null;
}

/**
 * Link a just-created artifact back to its source. Best-effort + LOUD on failure
 * (a converted artifact with no lineage is a defect we surface, not swallow); the
 * association RPC is idempotent (ON CONFLICT) so a re-run is safe.
 */
export async function recordSourceLineage(
  result: ConvertResult,
  source: ConvertSource,
  orgId: string | undefined,
): Promise<void> {
  const anchor = resolveAnchor(source);
  if (!anchor) return;

  const edge = await associationsService.add({
    sourceType: result.resourceType,
    sourceId: result.artifactId,
    targetType: anchor.type,
    targetId: anchor.id,
    role: "source",
    orgId,
    label: result.title,
    metadata: {
      targetKind: result.targetKind,
      href: result.href,
      detail: result.detail ?? null,
    },
  });
  if (!edge.ok) {
    console.error(
      `[convert/lineage] source edge failed (${result.targetKind} → ${anchor.type}):`,
      edge.error,
    );
  }
}
