// features/education/convert/lineage.ts
//
// The reverse side of `recordSourceLineage`: read every study artifact generated
// FROM a given origin entity (note / deck / assessment / file …). Drives the
// "generated from this" chips on any source surface (`GeneratedFromChips`).
//
// An artifact links back with role "source" where the artifact is the edge
// SOURCE and the origin is the TARGET — so on the origin the edge is INCOMING.
// Rich metadata (targetKind / href / detail) written by `recordSourceLineage`
// lets the chips render without re-deriving a route. Best-effort — a read
// failure returns [].

import { associationsService } from "@/features/scopes/service/associationsService";
import type { Json } from "@/types/database.types";
import type { TargetKind } from "./types";

/** One study artifact generated from an origin entity (reverse-lineage row). */
export interface GeneratedArtifact {
  /** The association edge id (stable key). */
  edgeId: string;
  targetKind: TargetKind | null;
  artifactType: string;
  artifactId: string;
  title: string;
  href: string;
  detail: string | null;
}

function metaString(meta: Json | undefined, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Every study artifact generated FROM this entity (incoming `source` edges).
 * `entityType` is any registered token (`note`, `fc_set`, `assessment`, `file`…).
 */
export async function listGeneratedFrom(
  entityType: string,
  entityId: string,
): Promise<GeneratedArtifact[]> {
  const res = await associationsService.listForEntity(entityType, entityId);
  if (!res.ok) return [];
  return res.data.edges
    .filter((e) => e.direction === "incoming" && e.role === "source")
    .map((e): GeneratedArtifact => {
      const kind = metaString(e.metadata, "targetKind") as TargetKind | null;
      return {
        edgeId: e.id,
        targetKind: kind,
        artifactType: e.otherType,
        artifactId: e.otherId,
        title: e.label ?? "Study artifact",
        href: metaString(e.metadata, "href") ?? hrefFallback(e.otherType, e.otherId),
        detail: metaString(e.metadata, "detail"),
      };
    });
}

/** Route fallback for an edge written before metadata carried the href. */
function hrefFallback(artifactType: string, artifactId: string): string {
  switch (artifactType) {
    case "fc_set":
      return `/education/flashcards/${artifactId}`;
    case "assessment":
      return `/education/quizzes/${artifactId}`;
    case "study_media":
      return `/education/media/${artifactId}`;
    case "note":
      return `/education/notes/${artifactId}`;
    default:
      return "/education";
  }
}
