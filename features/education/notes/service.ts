// features/education/notes/service.ts
//
// Smart Notes (P4) helpers — the LINEAGE layer between a note and the study
// artifacts converted from it. Note storage/editing itself is 100% features/notes
// (NotesAPI) + the converter contract (features/education/convert); this file only
// owns the note↔artifact `source` edges + reverse-lineage reads, using the ONE
// canonical association system (associationsService → platform.associations).
//
// Direction mirrors the converter generators (artifact --source--> origin): the
// generated artifact is the SOURCE, the note is the TARGET, role="source". So on
// the note the edge is INCOMING — "these artifacts were generated FROM me".

import { associationsService } from "@/features/scopes/service/associationsService";
import type { ConvertResult, TargetKind } from "@/features/education/convert/types";
import type { Json } from "@/types/database.types";

/** One study artifact generated from a note (reverse-lineage row for the chips). */
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
 * Link a just-converted artifact back to the note it came from. Idempotent (the
 * association RPC is ON CONFLICT). Rich metadata (kind, href, detail) rides the
 * edge so the "generated from this" chips render without re-deriving a route.
 */
export async function linkArtifactToNote(
  result: ConvertResult,
  noteId: string,
  orgId: string | undefined,
): Promise<boolean> {
  const edge = await associationsService.add({
    sourceType: result.resourceType,
    sourceId: result.artifactId,
    targetType: "note",
    targetId: noteId,
    role: "source",
    orgId,
    label: result.title,
    metadata: {
      targetKind: result.targetKind,
      href: result.href,
      detail: result.detail ?? null,
    },
  });
  if (!edge.ok) console.error("[edu-notes] lineage edge failed:", edge.error);
  return edge.ok;
}

/**
 * Every study artifact generated FROM this note (incoming `source` edges). Drives
 * the "generated from this" chips. Best-effort — a read failure returns [].
 */
export async function listGeneratedFromNote(
  noteId: string,
): Promise<GeneratedArtifact[]> {
  const res = await associationsService.listForEntity("note", noteId);
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
    case "study_media":
      return `/education/media/${artifactId}`;
    case "note":
      return `/education/notes/${artifactId}`;
    default:
      return "/education";
  }
}
