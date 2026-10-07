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

import { formatDurationSeconds } from "@ai-matrx/kit/format";
import { associationsService } from "@/features/scopes/service/associationsService";
import { withTransientRetry } from "@/lib/db/transientRetry";
import {
  listGeneratedFrom,
  type GeneratedArtifact,
} from "@/features/education/convert/lineage";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import {
  libraryRowStats,
  type LibraryRowStats,
} from "@/features/education/library/types";
import { studyMediaService } from "@/features/education/media/service";
import { educationLibraryHref, type EducationLibraryRow } from "@/features/education/library/types";
import { targetKindForSubtype } from "@/features/education/library/artifactVisuals";
import { getFileMetadata } from "@/features/files/api/files";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import type { TargetKind } from "@/features/education/convert/types";
import type { AssociationTargetType } from "@/features/scopes/types";
import type { Json } from "@/types/database.types";
import {
  KIT_TOKEN,
  addKitSource,
  archiveKitScope,
  createKitScope,
  edgeKitId,
  kitSourcesFromEdges,
  readKitScope,
  renameKitScope,
  type KitSource,
} from "./kitScope";

/** Artifact entity tokens a kit can contain (the converter's four writers). */
const KIT_ARTIFACT_TYPES = [
  "fc_set",
  "study_media",
  "assessment",
  "note",
] as const;

/** Entity types that can already be the anchor for a source-backed kit. */
export const MANUAL_KIT_SOURCE_TYPES = [
  "file",
  "note",
  "processed_document",
  "fc_set",
  "assessment",
  "conversation",
  "scope",
] as const;

export type ManualKitSourceType = (typeof MANUAL_KIT_SOURCE_TYPES)[number];

export function isManualKitSourceType(value: string): value is ManualKitSourceType {
  return (MANUAL_KIT_SOURCE_TYPES as readonly string[]).includes(value);
}

/** Page size for the artifact scan. PostgREST caps a bare select at 1000, so
 *  this stays well under it and the read PAGES to exhaustion instead. */
const KIT_SCAN_PAGE = 500;

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
  /**
   * The material the kit holds. A `scope` kit lists every Source filed under
   * it; an older single-anchor kit holds exactly its anchor.
   */
  sources: KitSource[];
  /** A `scope` kit's organization (where its new Sources and aids are filed). */
  organizationId?: string;
}

/** Keyed by the artifact's real entity identity, never by its display order. */
export type KitArtifactStats = Record<string, LibraryRowStats>;

export function kitArtifactKey(
  artifact: Pick<GeneratedArtifact, "artifactType" | "artifactId">,
): string {
  return `${artifact.artifactType}:${artifact.artifactId}`;
}

/** A deterministic concurrency token for the association-backed kit membership. */
export function kitMembershipFingerprint(kit: Pick<StudyKit, "artifacts">): string {
  return kit.artifacts
    .map((artifact) => `${artifact.edgeId}:${artifact.createdAt}:${artifact.membershipRole ?? "source"}:${artifact.sourceTitle ?? ""}:${artifact.kitHidden ? "hidden" : "shown"}`)
    .sort()
    .join("|");
}

export function requireFreshKitMembership(kit: StudyKit, expectedFingerprint: string): void {
  if (kitMembershipFingerprint(kit) !== expectedFingerprint) {
    throw new Error("This kit changed since it was reviewed. Reload it before making changes.");
  }
}

/**
 * Read the SAME per-artifact facts the canonical Education Library shows.
 *
 * The kit used to fetch a flashcard-only mastery rollup and present it as the
 * mastery of the whole kit. This exact-id read keeps each format's evidence on
 * its own artifact instead: coverage / accuracy / due work for decks and
 * assessments, and duration for media. No second KPI model is created here.
 *
 * We try the access scopes in their normal precedence because a kit can be
 * assembled from owned, shared, or public material. The RPC's `id` filter is
 * load-bearing: without it this route would scan a learner's entire library to
 * find eight rows.
 */
export async function readKitArtifactStats(
  artifacts: GeneratedArtifact[],
): Promise<KitArtifactStats> {
  const remaining = new Map(
    artifacts.map((artifact) => [kitArtifactKey(artifact), artifact]),
  );
  const result: KitArtifactStats = {};

  for (const scope of ["mine", "shared", "public"] as const) {
    if (remaining.size === 0) break;
    const ids = [...new Set([...remaining.values()].map((a) => a.artifactId))];
    const page = await fetchEducationLibraryPage(
      {
        ...DEFAULT_ENTITY_LIST_QUERY,
        scope: { kind: scope },
        filters: { id: { kind: "select", values: ids } },
      },
      {
        sort: "updated",
        direction: "desc",
        favoritesFirst: false,
        pageSize: Math.max(1, ids.length),
      },
    );

    for (const row of page.rows) {
      const key = `${row.kind}:${row.id}`;
      if (!remaining.has(key)) continue;
      result[key] = libraryRowStats(row);
      remaining.delete(key);
    }
  }

  return result;
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
    // An edge stamped `kitId` belongs to that multi-source kit (`kitScope.ts`),
    // never to the anchor it also points at.
    .filter((r) => r.targetKind !== null && !r.kitHidden && !edgeKitId(r.edgeMetadata))
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
  row: {
    status: string | null;
    media_kind: string;
    duration_seconds: number | null;
  },
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
      // Collapsed onto the kit formatter (2026-09-12). Coarse voice: a listen
      // length is glanceable and coarse already speaks the " min" this built
      // by hand — and it stops a 90-minute kit reading as "90 min".
      return `${formatDurationSeconds(secs, { style: "coarse" })} listen`;
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
  if (sourceType === KIT_TOKEN) return readScopeKit(sourceId);
  // A kit page is an authoritative read. The shared lineage strip is
  // deliberately best-effort, but turning its transport/auth failure into []
  // here makes a populated kit lie that nothing has been made yet.
  const rows = await listGeneratedFrom(sourceType, sourceId, {
    failureMode: "throw",
  });
  const manual = await manualMembers(sourceType, sourceId);
  const artifacts = await refreshMediaMembers(kitMembers([...rows, ...manual]));
  if (artifacts.length === 0) {
    // A promoted kit (`promoteAnchorKit`): every edge now names its kit — the
    // anchor's old link opens that kit instead of an empty page.
    const movedTo = [...rows, ...manual].map((r) => edgeKitId(r.edgeMetadata)).find(Boolean);
    return movedTo ? readScopeKit(movedTo) : null;
  }
  const title = kitName(artifacts);
  return {
    sourceType,
    sourceId,
    title,
    artifacts,
    createdAt: artifacts[artifacts.length - 1].createdAt,
    sources: [anchorSource(sourceType, sourceId, title, artifacts[artifacts.length - 1].createdAt)],
  };
}

/** An older kit's one anchor, shown as its first (and only) Source. */
function anchorSource(sourceType: string, sourceId: string, title: string, createdAt: string): KitSource {
  return {
    edgeId: `anchor:${sourceType}:${sourceId}`,
    type: sourceType,
    id: sourceId,
    title,
    href: sourceType === "file" ? `/files/f/${sourceId}` : null,
    createdAt,
  };
}

/**
 * A multi-source kit (`kitScope.ts`): the scope row names it, its incoming
 * `kitSource` edges are its Sources and its flagged `member` edges its aids.
 * A kit with Sources and no aids yet is still a kit.
 */
async function readScopeKit(kitId: string): Promise<StudyKit | null> {
  const scope = await readKitScope(kitId);
  if (!scope) return null;
  const result = await associationsService.listForEntity(KIT_TOKEN, kitId);
  if (!result.ok) throw new Error("Could not read this study kit.");
  const sources = kitSourcesFromEdges(result.data.edges);
  const artifacts = await refreshMediaMembers(kitMembers(await memberRows(result.data.edges)));
  return {
    sourceType: KIT_TOKEN,
    sourceId: kitId,
    title: scope.name,
    artifacts,
    createdAt: sources[0]?.createdAt ?? artifacts[artifacts.length - 1]?.createdAt ?? new Date(0).toISOString(),
    sources,
    organizationId: scope.organizationId,
  };
}

function metaString(meta: Json | undefined, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function metaBoolean(meta: Json | undefined, key: string): boolean {
  return !!meta && typeof meta === "object" && !Array.isArray(meta) && (meta as Record<string, unknown>)[key] === true;
}

async function manualMembers(sourceType: string, sourceId: string): Promise<GeneratedArtifact[]> {
  const result = await associationsService.listForEntity(sourceType, sourceId);
  if (!result.ok) throw new Error("Could not read manual kit members.");
  return memberRows(result.data.edges);
}

type EntityEdge = Extract<Awaited<ReturnType<typeof associationsService.listForEntity>>, { ok: true }>["data"]["edges"][number];

async function memberRows(allEdges: readonly EntityEdge[]): Promise<GeneratedArtifact[]> {
  const edges = allEdges.filter((edge) => edge.direction === "incoming" && edge.role === "member" && metaBoolean(edge.metadata, "educationKit"));
  const titles = new Map<string, string>();
  const wanted = new Set(edges.map((edge) => `${edge.otherType}:${edge.otherId}`));
  for (let page = 1; wanted.size; page += 1) {
    const library = await fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, page }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: KIT_SCAN_PAGE });
    for (const row of library.rows) if (wanted.delete(`${row.kind}:${row.id}`)) titles.set(`${row.kind}:${row.id}`, row.title);
    if (library.rows.length < KIT_SCAN_PAGE || page * KIT_SCAN_PAGE >= library.total) break;
  }
  return edges.map((edge) => ({ edgeId: edge.id, targetKind: metaString(edge.metadata, "targetKind") as TargetKind | null, artifactType: edge.otherType, artifactId: edge.otherId, title: titles.get(`${edge.otherType}:${edge.otherId}`) ?? edge.label ?? "Unavailable study aid", href: metaString(edge.metadata, "href") ?? "/education", detail: metaString(edge.metadata, "detail"), sourceTitle: metaString(edge.metadata, "kitTitle"), createdAt: edge.createdAt, membershipRole: "member" as const, edgeMetadata: edge.metadata }));
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
  for (let pageNo = 1; ; pageNo++) {
    // A shared preview/production server under concurrent agent-walk load
    // occasionally cancels one PostgREST call in this scan (57014/08006-class
    // conditions); one bad page used to fail the whole kits list with no
    // retry, which is exactly the flakiness a person sees as "reload and it
    // sometimes works." Read-only scan → safe to retry (repeatable default).
    const page = await withTransientRetry(
      "education.listKits: library page",
      () =>
        fetchEducationLibraryPage(
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
        ),
    );
    for (const row of page.rows) {
      const token = row.kind;
      if (!(KIT_ARTIFACT_TYPES as readonly string[]).includes(token)) continue;
      const list = byType.get(token) ?? [];
      list.push(row.id);
      byType.set(token, list);
    }
    // A short page or reaching the canonical total is the last page. The total
    // guard also prevents a malformed full final page from causing an endless
    // scan, without imposing an arbitrary library-size ceiling.
    if (
      page.rows.length < KIT_SCAN_PAGE ||
      pageNo * KIT_SCAN_PAGE >= page.total
    )
      break;
  }

  const kits = new Map<string, StudyKit>();
  await Promise.all(
    [...byType.entries()].map(async ([token, ids]) => {
      // Same transient-condition class as the library page scan above: four
      // of these run concurrently (one per artifact type), so a single
      // transient failure under load used to poison the whole kits list.
      const res = await withTransientRetry(
        `education.listKits: assoc_for_sources(${token})`,
        () => associationsService.listForSources(token, ids),
      );
      if (!res.ok) {
        throw new Error(
          `Could not read ${token} origins while building your study kits. Try again.`,
          { cause: res.error },
        );
      }
      for (const edge of res.data.edges) {
        if (edge.role !== "source" && !(edge.role === "member" && metaBoolean(edge.metadata, "educationKit"))) continue;
        const targetKind = metaString(edge.metadata, "targetKind");
        if (!targetKind) continue; // not a converter artifact edge
        // Lineage of a multi-source kit: the aid is listed under its kit (its
        // `member` edge), never again under each Source it was read from.
        if (edgeKitId(edge.metadata)) continue;
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
          sourceTitle: metaString(edge.metadata, edge.role === "member" ? "kitTitle" : "sourceTitle"),
          createdAt: edge.createdAt,
          membershipRole: edge.role === "member" ? "member" : "source",
          kitHidden: metaBoolean(edge.metadata, "kitHidden"),
          edgeMetadata: edge.metadata,
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
            sources: [],
          });
        }
      }
    }),
  );

  return [...kits.values()]
    .map((kit) => {
      const artifacts = kitMembers(kit.artifacts);
      const title = kitName(artifacts);
      const createdAt = artifacts[artifacts.length - 1]?.createdAt ?? kit.createdAt;
      return {
        ...kit,
        artifacts,
        title,
        createdAt,
        // A scope kit's Sources are read on its own page; an anchor kit holds its anchor.
        sources: kit.sourceType === KIT_TOKEN ? [] : [anchorSource(kit.sourceType, kit.sourceId, title, createdAt)],
      };
    })
    .filter((kit) => kit.artifacts.length > 0)
    .sort((a, b) =>
      b.artifacts[0].createdAt.localeCompare(a.artifacts[0].createdAt),
    );
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

function writableTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("A study kit needs a title.");
  return title;
}

/**
 * A kit name belongs to its membership edges. Re-saving the same canonical
 * edge updates its display metadata without touching either endpoint.
 */
async function currentKitOrThrow(kit: StudyKit, expectedFingerprint: string): Promise<StudyKit> {
  const current = await readKit(kit.sourceType, kit.sourceId);
  if (!current) {
    throw new Error("This kit changed since it was reviewed. Reload it before making changes.");
  }
  requireFreshKitMembership(current, expectedFingerprint);
  return current;
}

export async function renameKit(kit: StudyKit, title: string, expectedFingerprint = kitMembershipFingerprint(kit)): Promise<void> {
  const sourceTitle = writableTitle(title);
  const current = await currentKitOrThrow(kit, expectedFingerprint);
  if (kit.sourceType === KIT_TOKEN) await renameKitScope(kit.sourceId, sourceTitle);
  let completed = 0;
  for (const artifact of current.artifacts) {
    const result = await associationsService.add({
      sourceType: artifact.artifactType,
      sourceId: artifact.artifactId,
      targetType: kit.sourceType as AssociationTargetType,
      targetId: kit.sourceId,
      role: artifact.membershipRole ?? "source",
      metadata: {
        ...(artifact.edgeMetadata && typeof artifact.edgeMetadata === "object" && !Array.isArray(artifact.edgeMetadata) ? artifact.edgeMetadata : {}),
        ...(artifact.membershipRole === "member" ? { educationKit: true, kitTitle: sourceTitle } : { sourceTitle }),
      },
    });
    if (!result.ok) throw new Error(`Renamed ${completed} of ${current.artifacts.length} study aids. The remaining aids were not changed; reload the kit and try again.`);
    completed += 1;
  }
}

/** Detach one aid from this kit. Its saved artifact remains available elsewhere. */
export async function removeKitMember(
  kit: StudyKit,
  artifact: Pick<GeneratedArtifact, "artifactType" | "artifactId" | "membershipRole" | "edgeMetadata">,
): Promise<void> {
  if (artifact.membershipRole === "source") {
    const result = await associationsService.add({ sourceType: artifact.artifactType, sourceId: artifact.artifactId, targetType: kit.sourceType as AssociationTargetType, targetId: kit.sourceId, role: "source", metadata: { ...(artifact.edgeMetadata && typeof artifact.edgeMetadata === "object" && !Array.isArray(artifact.edgeMetadata) ? artifact.edgeMetadata : {}), kitHidden: true } });
    if (!result.ok) throw new Error("Could not hide this generated study aid from the kit.");
    return;
  }
  const result = await associationsService.remove({
    sourceType: artifact.artifactType,
    sourceId: artifact.artifactId,
    targetType: kit.sourceType,
    targetId: kit.sourceId,
    role: artifact.membershipRole ?? "source",
  });
  if (!result.ok) throw new Error("Could not remove this study aid from the kit.");
}

export async function removeKitMemberVersioned(kit: StudyKit, artifact: GeneratedArtifact, expectedFingerprint: string): Promise<void> {
  const current = await currentKitOrThrow(kit, expectedFingerprint);
  const fresh = current.artifacts.find((item) => item.artifactType === artifact.artifactType && item.artifactId === artifact.artifactId);
  if (!fresh) throw new Error("This study aid is no longer in the kit.");
  await removeKitMember(current, fresh);
}

export async function removeKitMembersVersioned(
  kit: StudyKit,
  refs: readonly { kind: string; id: string }[],
  expectedFingerprint: string,
): Promise<void> {
  if (!refs.length) throw new Error("Choose at least one study aid to remove.");
  const keys = refs.map((ref) => `${ref.kind}:${ref.id}`);
  if (new Set(keys).size !== keys.length) throw new Error("Each study aid may be removed only once.");
  const current = await currentKitOrThrow(kit, expectedFingerprint);
  const artifacts = refs.map((ref) => current.artifacts.find((item) => item.artifactType === ref.kind && item.artifactId === ref.id));
  if (artifacts.some((artifact) => !artifact)) throw new Error("One requested aid is no longer in this kit. Nothing was changed.");
  let completed = 0;
  for (const artifact of artifacts as GeneratedArtifact[]) {
    try { await removeKitMember(current, artifact); completed += 1; }
    catch { throw new Error(`Removed ${completed} of ${artifacts.length} study aids. The remaining aids still belong to this kit; reload and try again.`); }
  }
}

/**
 * Delete this association-backed kit by removing all of its membership edges.
 * The source material and every saved study aid remain intact.
 */
export async function deleteKit(kit: StudyKit, expectedFingerprint = kitMembershipFingerprint(kit)): Promise<void> {
  const current = await currentKitOrThrow(kit, expectedFingerprint);
  let completed = 0;
  for (const artifact of current.artifacts) {
    try {
      await removeKitMember(current, artifact);
      completed += 1;
    } catch {
      throw new Error(`Removed ${completed} of ${current.artifacts.length} study aids from this kit. The remaining aids still belong to it; reload the kit and try again.`);
    }
  }
  if (kit.sourceType === KIT_TOKEN) await archiveKitScope(kit.sourceId);
}

/**
 * Give an older single-anchor kit its own identity so it can hold more
 * Sources. Nothing is deleted: a kit scope is made under the kit's name, the
 * anchor is filed as its first Source, every aid gets a `member` edge into the
 * new kit, and each old anchor edge is stamped `kitId` so the anchor's reads
 * hand it over (its old link opens the new kit). Returns the new kit's id.
 */
export async function promoteAnchorKit(kit: StudyKit, orgId: string): Promise<string> {
  if (kit.sourceType === KIT_TOKEN) return kit.sourceId;
  const scope = await createKitScope(orgId, kit.title);
  await addKitSource(scope, { type: kit.sourceType, id: kit.sourceId, title: kit.title });
  for (const artifact of kit.artifacts) {
    const old = artifact.edgeMetadata && typeof artifact.edgeMetadata === "object" && !Array.isArray(artifact.edgeMetadata)
      ? (artifact.edgeMetadata as Record<string, unknown>)
      : {};
    const joined = await associationsService.add({
      sourceType: artifact.artifactType,
      sourceId: artifact.artifactId,
      targetType: KIT_TOKEN,
      targetId: scope.id,
      orgId,
      role: "member",
      label: artifact.title,
      metadata: { educationKit: true, targetKind: artifact.targetKind, href: artifact.href, detail: artifact.detail, kitTitle: kit.title },
    });
    if (!joined.ok) throw new Error("Could not move every study aid into the kit. Try again.");
    const handed = await associationsService.add({
      sourceType: artifact.artifactType,
      sourceId: artifact.artifactId,
      targetType: kit.sourceType as AssociationTargetType,
      targetId: kit.sourceId,
      role: artifact.membershipRole ?? "source",
      metadata: { ...old, kitId: scope.id },
    });
    if (!handed.ok) throw new Error("Could not move every study aid into the kit. Try again.");
  }
  return scope.id;
}

/** Attach existing library aids to a source-backed kit without a new record type. */
export async function createManualKit(input: {
  sourceId: string;
  sourceType?: ManualKitSourceType;
  title: string;
  artifacts: readonly EducationLibraryRow[];
  allowExisting?: boolean;
  expectedFingerprint?: string;
}): Promise<void> {
  let sourceTitle = writableTitle(input.title);
  const sourceType = input.sourceType ?? "file";
  if (!input.sourceId) throw new Error("Choose the saved source for this kit.");
  if (!input.artifacts.length) throw new Error("Choose at least one saved study aid.");
  const existing = await readKit(sourceType, input.sourceId);
  if (!existing && sourceType !== "file") {
    throw new Error("Only a saved file can start a new manual study kit. Open an existing kit to add saved aids.");
  }
  if (sourceType === "file") await getFileMetadata(input.sourceId);
  if (existing && !input.allowExisting) throw new Error(`This source already has a study kit. Open ${kitHref(sourceType, input.sourceId)} to add or manage its aids.`);
  if (input.allowExisting) {
    if (!existing) throw new Error("This kit is no longer available. Reload before adding saved aids.");
    if (!input.expectedFingerprint) throw new Error("This kit is still loading. Wait for its membership revision before adding aids.");
    requireFreshKitMembership(existing, input.expectedFingerprint);
    sourceTitle = existing.title;
  }
  const wanted = new Set(input.artifacts.map((artifact) => `${artifact.kind}:${artifact.id}`));
  const fresh: EducationLibraryRow[] = [];
  for (let page = 1; wanted.size; page += 1) {
    const result = await fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, page }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: KIT_SCAN_PAGE });
    for (const row of result.rows) if (wanted.delete(`${row.kind}:${row.id}`)) fresh.push(row);
    if (result.rows.length < KIT_SCAN_PAGE || page * KIT_SCAN_PAGE >= result.total) break;
  }
  if (wanted.size) throw new Error("One or more selected study aids are no longer available in your library. Reload and choose again.");
  let completed = 0;
  for (const artifact of fresh) {
    const targetKind = targetKindForSubtype(artifact.subtype);
    if (!targetKind) throw new Error(`"${artifact.title}" is not a study aid that can join a kit.`);
    const result = await associationsService.add({
      sourceType: artifact.kind,
      sourceId: artifact.id,
      targetType: sourceType,
      targetId: input.sourceId,
      // Manual grouping is membership, never generated-from provenance.
      metadata: { educationKit: true, targetKind, href: educationLibraryHref(artifact), kitTitle: sourceTitle },
      role: "member",
    });
    if (!result.ok) throw new Error(`Added ${completed} of ${input.artifacts.length} study aids. The remaining aids were not added; try again from the kit page.`);
    completed += 1;
  }
}

/**
 * A new kit from several picked Sources (the same model as a kit made at
 * /education/start): its own record, each Source filed under it, then any saved
 * aids the person chose. Returns the kit's id.
 */
export async function createMultiSourceKit(input: {
  orgId: string;
  title: string;
  sources: readonly { type: string; id: string; title: string }[];
  artifacts: readonly EducationLibraryRow[];
}): Promise<string> {
  const title = writableTitle(input.title);
  if (!input.sources.length) throw new Error("Pick the material for this kit first.");
  const scope = await createKitScope(input.orgId, title);
  for (const source of input.sources) await addKitSource(scope, source);
  if (input.artifacts.length) {
    const made = await readKit(KIT_TOKEN, scope.id);
    if (!made) throw new Error("The kit was made but could not be read back. Open it from Study kits.");
    await createManualKit({
      sourceId: scope.id,
      sourceType: KIT_TOKEN,
      title,
      artifacts: input.artifacts,
      allowExisting: true,
      expectedFingerprint: kitMembershipFingerprint(made),
    });
  }
  return scope.id;
}
