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
import { peekHref } from "@/features/organizations/peek/peekHref";
import { resolveEntityToken } from "@/features/scopes/registry/entityRegistry";
import { educationEntityHref } from "@/features/education/data/entityRoutes";
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

/** The ORIGIN an artifact was generated from (its one outgoing `source` edge). */
export interface ArtifactOrigin {
  edgeId: string;
  /** Canonical entity token of the origin ("file", "note", "fc_set"...). */
  entityType: string;
  entityId: string;
  /** The origin's own route, when the entity registry knows one. */
  href: string | undefined;
}

/**
 * What this artifact was MADE FROM. The reverse of `listGeneratedFrom`, and the
 * half that was missing: every artifact page could show the things generated
 * FROM it, and none could show the student's own uploaded material it came out
 * of. A deck that cannot name its source reads as something the system invented
 * (THE DOOR LAW — common-docs/policies/no-dead-ends.md).
 */
export async function readArtifactOrigin(
  entityType: string,
  entityId: string,
): Promise<ArtifactOrigin | null> {
  const res = await associationsService.listForEntity(entityType, entityId);
  if (!res.ok) return null;
  const edge = res.data.edges.find(
    (e) => e.direction === "outgoing" && e.role === "source",
  );
  if (!edge) return null;
  const token = resolveEntityToken(edge.otherType);
  return {
    edgeId: edge.id,
    entityType: token,
    entityId: edge.otherId,
    href: peekHref(token, edge.otherId),
  };
}

/** Route fallback for an edge written before metadata carried the href. */
function hrefFallback(artifactType: string, artifactId: string): string {
  // Reuse the canonical education token→route map (features/education/data/
  // entityRoutes.ts) — one source of truth for /education hrefs.
  return educationEntityHref(artifactType, artifactId) ?? "/education";
}
