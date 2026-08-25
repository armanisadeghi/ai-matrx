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
import { studyMediaService } from "@/features/education/media/service";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import type { TargetKind } from "@/features/education/convert/types";
import type { Json } from "@/types/database.types";

/** Artifact entity tokens a kit can contain (the converter's four writers). */
const KIT_ARTIFACT_TYPES = ["fc_set", "study_media", "assessment", "note"] as const;

/** Page size for the artifact scan. PostgREST caps a bare select at 1000, so
 *  this stays well under it and the read PAGES to exhaustion instead. */
const KIT_SCAN_PAGE = 500;

/** Hard stop so a pathological library cannot spin forever (25k artifacts). */
const KIT_SCAN_MAX_PAGES = 50;

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

/**
 * The kit's display name.
 *
 * A kit named at generation time carries `sourceTitle` on every edge — use it.
 * Kits generated BEFORE naming existed have no `sourceTitle`, and their members
 * were each titled independently, so the fallback picks the most human of them
 * rather than whichever happens to be newest. That matters in practice: a
 * pre-naming kit typically holds eight artifacts called `MatterandMeasurements`
 * and one called "Matter and Measurements" — the raw filename wins on
 * frequency and on recency, and loses on being readable, which is the only
 * axis a learner cares about.
 *
 * Display only. Nothing is rewritten; the artifacts keep their own titles.
 */
function kitName(members: GeneratedArtifact[]): string {
  const named = members.find((m) => m.sourceTitle && m.sourceTitle.trim());
  if (named?.sourceTitle) return named.sourceTitle;

  const counts = new Map<string, number>();
  for (const m of members) {
    const t = m.title?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return "Study material";

  const readable = (t: string) => (/\s/.test(t) ? 1 : 0);
  return [...counts.entries()].sort((a, b) => {
    // Readable first, then the one most artifacts agree on, then the shortest
    // (a longer variant is usually a subtitle of the same thing).
    const r = readable(b[0]) - readable(a[0]);
    if (r !== 0) return r;
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].length - b[0].length;
  })[0][0];
}

/**
 * 🚨 EDGE METADATA IS FROZEN AT CREATION TIME — refresh what can still change.
 *
 * `recordSourceLineage` writes `title`/`detail` once, when the artifact is
 * created. For audio that moment is the START of a long TTS render, so the edge
 * permanently says "Starting — audio is still being produced" and the kit would
 * keep claiming that hours after the recording finished and became playable.
 * Every kit built with the default targets contains audio, so this is not an
 * edge case — it is the common path, and it is the exact class of shipped lie a
 * behavioural test cannot see (STATE.md §4.1 item 7).
 *
 * So `study_media` members are re-read from the table and their title/detail
 * replaced with what is true now. One query per kit, only when it has media.
 */
function liveDetail(
  row: { status: string | null; media_kind: string; duration_seconds: number | null },
  frozen: string | null,
): string | null {
  if (row.status === "generating") return "Still being produced";
  if (row.status === "error") return "Didn't finish — open it to try again";
  // FINISHED. The frozen detail of an artifact that STARTS pending is a
  // start-state message ("Starting — audio is still being produced"), so it is
  // a lie the moment the render completes — replace it with something true.
  // A detail written at completion (a summary's "42 key points") never changes
  // and is kept.
  if (row.media_kind === "audio") {
    const secs = row.duration_seconds;
    if (secs != null && secs > 0) {
      const mins = Math.max(1, Math.round(secs / 60));
      return `${mins} min listen`;
    }
    return "Ready to play";
  }
  return frozen;
}

async function refreshMediaMembers(
  members: GeneratedArtifact[],
): Promise<GeneratedArtifact[]> {
  const mediaIds = members
    .filter((m) => m.artifactType === "study_media")
    .map((m) => m.artifactId);
  if (mediaIds.length === 0) return members;

  const res = await studyMediaService.listByIds(mediaIds);
  if (!res.data) return members; // best-effort: the frozen copy is still a name
  const live = new Map(res.data.map((row) => [row.id, row]));

  return members.map((m) => {
    const row = live.get(m.artifactId);
    if (!row) return m;
    return {
      ...m,
      title: row.title?.trim() ? row.title : m.title,
      detail: liveDetail(row, m.detail),
    };
  });
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
  const artifacts = await refreshMediaMembers(kitMembers(rows));
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
  // Real query/sort objects built from the canonical default — never a cast.
  // `archived`/`deep`/`favoritesFirst` are required fields, and forcing them
  // through with `as` would silently change meaning the day the RPC starts
  // honouring them.
  const byType = new Map<string, string[]>();
  for (let pageNo = 1; pageNo <= KIT_SCAN_MAX_PAGES; pageNo++) {
    const page = await fetchEducationLibraryPage(
      {
        ...DEFAULT_ENTITY_LIST_QUERY,
        scope: { kind: "mine" },
        page: pageNo,
      },
      {
        sort: "created_at",
        direction: "desc",
        favoritesFirst: false,
        pageSize: KIT_SCAN_PAGE,
      },
    );
    for (const row of page.rows) {
      const token = row.kind;
      if (!(KIT_ARTIFACT_TYPES as readonly string[]).includes(token)) continue;
      const list = byType.get(token) ?? [];
      list.push(row.id);
      byType.set(token, list);
    }
    // A short page is the last page. Without this loop a learner past the first
    // page lost their OLDER kits from this index while their direct links kept
    // working — an index that quietly lies about being "every kit".
    if (page.rows.length < KIT_SCAN_PAGE) break;
    if (pageNo === KIT_SCAN_MAX_PAGES) {
      console.warn(
        `[kits] artifact scan hit ${KIT_SCAN_MAX_PAGES} pages; older kits may be missing from the index.`,
      );
    }
  }

  const kits = new Map<string, StudyKit>();
  await Promise.all(
    [...byType.entries()].map(async ([token, ids]) => {
      const res = await associationsService.listForSources(token, ids);
      if (!res.ok) {
        // Per-type best-effort, matching the codebase convention — but say what
        // it costs: one failed type drops THAT artifact kind from every kit in
        // this list, and the page still renders as though it were complete.
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

/**
 * "Add THIS format to THIS material" — the kit hub with its convert surface
 * open on one target (`MakeMoreFromKit`). This is the route the education
 * home's one nudge chip needed and could not have: linking a missing format at
 * the generic `/education/start` ingest asked the learner to re-upload the same
 * document and built a second, disconnected kit.
 *
 * It is deliberately the KIT's route with a parameter, not a page of its own:
 * the learner lands on the thing the chip is about, sees what it already has,
 * and the picker is the ONE canonical convert dialog.
 */
export function kitAddHref(
  sourceType: string,
  sourceId: string,
  target: TargetKind,
): string {
  const base = kitHref(sourceType, sourceId);
  return `${base}${base.includes("?") ? "&" : "?"}add=${target}`;
}
