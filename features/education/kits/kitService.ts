// features/education/kits/kitService.ts
//
// A STUDY KIT IS A REAL THING — reads for "everything I made from one piece of
// material".
//
// The kit already existed in the database and nowhere in the product: every
// artifact a kit run produces links a `source` association edge back to the ONE
// durable ingest anchor (`convert/recordSourceLineage.ts`), for all eight target
// kinds. What was missing was identity and a door — the artifacts scattered into
// six flat per-type lists and no surface ever asked "what else came from this?"
//
// So the kit needs NO new table and NO new column: the kit IS its source
// material, its id is the anchor id, and its name rides the edges (`sourceTitle`,
// written once per run by `onboard/kitTitle.ts`). Two kit runs over the same
// upload deliberately MERGE — "everything for that one thing" is the point.
//
// Both reads go through the registered association RPCs; nothing here queries
// `platform.associations` directly.

"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import { listGeneratedFrom, type GeneratedArtifact } from "@/features/education/convert/lineage";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { Json } from "@/types/database.types";

/** Artifact entity tokens a kit can contain (the converter's four writers). */
const KIT_ARTIFACT_TYPES = ["fc_set", "study_media", "assessment", "note"] as const;

/** How many of the learner's artifacts one kit-list read scans. */
const KIT_SCAN_LIMIT = 500;

export interface StudyKit {
  /** The anchor's entity token — `file` for every ingested kit. */
  sourceType: string;
  /** The anchor id. THIS is the kit id, and the URL segment. */
  sourceId: string;
  /** The kit's name (from the edges); falls back to an artifact title. */
  title: string;
  /** Everything made from this material, newest first. */
  artifacts: GeneratedArtifact[];
  /** When the kit was first generated. */
  createdAt: string;
}

/**
 * Drop the noise an anchor accumulates: `recordSourceLineage` is the only writer
 * that stamps `targetKind`, so anything without one is a different system's edge
 * on the same anchor — most importantly the PER-CARD `fc_card → file` edges a
 * deck writes, which would otherwise flood a kit with hundreds of rows.
 */
function kitMembers(rows: GeneratedArtifact[]): GeneratedArtifact[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => r.targetKind !== null)
    .filter((r) => {
      const key = `${r.artifactType}:${r.artifactId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The kit's display name: the name written on its edges, else its newest artifact. */
function kitName(members: GeneratedArtifact[]): string {
  const named = members.find((m) => m.sourceTitle && m.sourceTitle.trim());
  if (named?.sourceTitle) return named.sourceTitle;
  return members[0]?.title ?? "Study material";
}

/**
 * ONE kit: everything generated from this source. Returns null when the anchor
 * has no kit members (an unrelated file, or a bad id) so the surface can say so
 * honestly instead of rendering an empty shell.
 */
export async function readKit(
  sourceType: string,
  sourceId: string,
): Promise<StudyKit | null> {
  const rows = await listGeneratedFrom(sourceType, sourceId);
  const artifacts = kitMembers(rows);
  if (artifacts.length === 0) return null;
  return {
    sourceType,
    sourceId,
    title: kitName(artifacts),
    artifacts,
    createdAt: artifacts[artifacts.length - 1].createdAt,
  };
}

function metaString(meta: Json | undefined, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * EVERY kit the learner has, newest first.
 *
 * Built from what already exists rather than a new "kits" query: list the
 * learner's education artifacts (the canonical library RPC, which is already
 * access-scoped), then batch-resolve their origin edges — one
 * `assoc_for_sources` call per artifact type, never per artifact — and group by
 * anchor. An artifact with no origin edge simply belongs to no kit.
 */
export async function listKits(): Promise<StudyKit[]> {
  const page = await fetchEducationLibraryPage(
    {
      scope: { kind: "mine" },
      search: "",
      filters: {},
      page: 1,
    } as Parameters<typeof fetchEducationLibraryPage>[0],
    {
      sort: "created_at",
      direction: "desc",
      pageSize: KIT_SCAN_LIMIT,
    } as Parameters<typeof fetchEducationLibraryPage>[1],
  );

  const byType = new Map<string, string[]>();
  for (const row of page.rows) {
    const token = row.kind;
    if (!(KIT_ARTIFACT_TYPES as readonly string[]).includes(token)) continue;
    const list = byType.get(token) ?? [];
    list.push(row.id);
    byType.set(token, list);
  }

  const kits = new Map<string, StudyKit>();
  await Promise.all(
    [...byType.entries()].map(async ([token, ids]) => {
      const res = await associationsService.listForSources(token, ids);
      if (!res.ok) {
        console.error(`[kits] origin read failed for ${token}:`, res.error);
        return;
      }
      for (const edge of res.data.edges) {
        if (edge.role !== "source") continue;
        const targetKind = metaString(edge.metadata, "targetKind");
        if (!targetKind) continue; // not a converter artifact edge
        const key = `${edge.targetType}:${edge.targetId}`;
        const existing = kits.get(key);
        const member: GeneratedArtifact = {
          edgeId: edge.id,
          targetKind: targetKind as GeneratedArtifact["targetKind"],
          artifactType: token,
          artifactId: edge.sourceId,
          title: edge.label ?? "Study artifact",
          href: metaString(edge.metadata, "href") ?? "/education",
          detail: metaString(edge.metadata, "detail"),
          sourceTitle: metaString(edge.metadata, "sourceTitle"),
          createdAt: edge.createdAt,
        };
        if (existing) {
          existing.artifacts.push(member);
        } else {
          kits.set(key, {
            sourceType: edge.targetType,
            sourceId: edge.targetId,
            title: "",
            artifacts: [member],
            createdAt: member.createdAt,
          });
        }
      }
    }),
  );

  return [...kits.values()]
    .map((kit) => {
      const artifacts = kitMembers(kit.artifacts);
      return {
        ...kit,
        artifacts,
        title: kitName(artifacts),
        createdAt: artifacts[artifacts.length - 1]?.createdAt ?? kit.createdAt,
      };
    })
    .filter((kit) => kit.artifacts.length > 0)
    .sort((a, b) => b.artifacts[0].createdAt.localeCompare(a.artifacts[0].createdAt));
}

/** The kit hub route for an anchor. */
export function kitHref(sourceType: string, sourceId: string): string {
  return sourceType === "file"
    ? `/education/kits/${sourceId}`
    : `/education/kits/${sourceId}?from=${encodeURIComponent(sourceType)}`;
}
