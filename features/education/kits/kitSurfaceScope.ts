// features/education/kits/kitSurfaceScope.ts
//
// The kit hub's study-path ordering, its next-challenge pick, and the
// `matrx-user/education-kits` detail scope built from them. Pure — the page
// and the surface scope share ONE ordering, and the scope is testable.

import { educationEntityStudyHref } from "@/features/education/data/entityRoutes";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { TargetKind } from "@/features/education/convert/types";
import type { EducationLibraryRow, LibraryRowStats } from "@/features/education/library/types";
import { createEducationKitsScope } from "@/features/surfaces/manifests/education-kits.manifest";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import { KIT_MEMBER_CANDIDATE_LIMIT } from "./kitWrites";
import type { KitCoverage } from "./outline/coverage";
import { kitArtifactKey, kitMembershipFingerprint, type KitArtifactStats, type StudyKit } from "./kitService";

export interface StudyStage {
  number: string;
  title: string;
  description: string;
  kinds: TargetKind[];
}

export const STUDY_PATH: StudyStage[] = [
  {
    number: "01",
    title: "Understand it",
    description: "Get the big picture before you start testing yourself.",
    kinds: ["summary", "notes", "mind_map"],
  },
  {
    number: "02",
    title: "Make it stick",
    description: "Turn recognition into recall with active review.",
    kinds: ["deck", "memory_aid", "audio"],
  },
  {
    number: "03",
    title: "Prove you know it",
    description: "Find the gaps, then come back stronger.",
    kinds: ["quiz", "practice_test"],
  },
];


export const TRACKED_KINDS = new Set<TargetKind>(["deck", "quiz", "practice_test"]);

export function artifactActionHref(artifact: GeneratedArtifact): string {
  if (artifact.targetKind === "notes") {
    return educationEntityStudyHref("note", artifact.artifactId) ?? artifact.href;
  }
  return artifact.targetKind === "deck"
    ? `${artifact.href}/study`
    : artifact.href;
}


/** The kit's aids in study-path order; anything off the path goes last. */
export function orderKitArtifacts(kit: StudyKit): GeneratedArtifact[] {
  const ordered = STUDY_PATH.flatMap((stage) =>
    stage.kinds.flatMap((kind) =>
      kit.artifacts.filter((artifact) => artifact.targetKind === kind),
    ),
  );
  const knownIds = new Set(ordered.map((artifact) => artifact.edgeId));
  ordered.push(
    ...kit.artifacts.filter((artifact) => !knownIds.has(artifact.edgeId)),
  );
  return ordered;
}

/** What the page recommends next, and why. */
export function pickChallenge(
  ordered: GeneratedArtifact[],
  stats: KitArtifactStats,
): { artifact: GeneratedArtifact; reason: "due" | "not_started" | "first" } | null {
  const due = ordered.find(
    (artifact) => (stats[kitArtifactKey(artifact)]?.dueCount ?? 0) > 0,
  );
  if (due) return { artifact: due, reason: "due" };
  const notStarted = ordered.find((artifact) => {
    const artifactStats = stats[kitArtifactKey(artifact)];
    return (
      artifact.targetKind != null &&
      TRACKED_KINDS.has(artifact.targetKind) &&
      !artifactStats?.hasProgress
    );
  });
  if (notStarted) return { artifact: notStarted, reason: "not_started" };
  return ordered[0] ? { artifact: ordered[0], reason: "first" } : null;
}

export type KitOutlineStatus = "none" | "building" | "ready" | "stale";

/** What the agent is told about the outline: not built, being built, current, or older than the Sources. */
export function kitOutlineStatus(input: {
  sectionCount: number | null;
  building: boolean;
  stale: boolean;
}): KitOutlineStatus {
  if (input.building) return "building";
  if (!input.sectionCount) return "none";
  return input.stale ? "stale" : "ready";
}

/** Section titles in order with what each already holds — what `section_titles` may name. */
export function kitOutlineEntries(
  sections: readonly { id: string; title: string }[] | null,
  coverage: KitCoverage | null,
): { title: string; cards: number; questions: number }[] {
  return (sections ?? []).map((section) => {
    const row = coverage?.rows.find((r) => r.sectionId === section.id);
    return { title: section.title, cards: row?.cards ?? 0, questions: row?.questions ?? 0 };
  });
}

/** Surface `matrx-user/education-kits` (detail view) from render state. */
export function buildKitDetailScope(input: {
  sourceId: string;
  sourceType: string;
  kit: StudyKit | null;
  loading: boolean;
  loadError: boolean;
  stats: KitArtifactStats;
  statsLoading: boolean;
  statsFailed: boolean;
  /** Saved aids the person could add (bounded); absent until read. Aids already in the kit are left out here. */
  memberCandidates?: readonly EducationLibraryRow[];
  /** The kit's Outline (sections null until read) and whether a build is running. */
  outline?: {
    sections: readonly { id: string; title: string }[] | null;
    coverage: KitCoverage | null;
    building: boolean;
    stale: boolean;
  };
}): SurfaceScopePayload {
  const { kit, stats, statsLoading, statsFailed } = input;
  const status = input.loading
    ? "loading"
    : input.loadError
      ? "error"
      : kit
        ? "ready"
        : "empty";
  const base = {
    view: "detail" as const,
    kit_status: status as "loading" | "ready" | "empty" | "error",
    kit_source_id: input.sourceId,
    kit_source_type: kit?.sourceType ?? input.sourceType,
  };
  if (!kit || status !== "ready") return createEducationKitsScope(base);
  const ordered = orderKitArtifacts(kit);
  const statsReady = !statsLoading && !statsFailed;
  const sum = (pick: (s: LibraryRowStats) => number | null) =>
    ordered.reduce(
      (total, artifact) => total + (pick(stats[kitArtifactKey(artifact)] ?? ({} as LibraryRowStats)) ?? 0),
      0,
    );
  const challenge = pickChallenge(ordered, stats);
  return createEducationKitsScope({
    ...base,
    kit_title: kit.title,
    kit_membership_fingerprint: kitMembershipFingerprint(kit),
    kit_created_at: kit.createdAt,
    ...(input.memberCandidates
      ? {
          kit_member_candidates: input.memberCandidates
            .filter((row) => !kit.artifacts.some((artifact) => artifact.artifactType === row.kind && artifact.artifactId === row.id))
            .slice(0, KIT_MEMBER_CANDIDATE_LIMIT)
            .map((row) => ({ id: row.id, title: row.title, kind: row.kind, subtype: row.subtype })),
        }
      : {}),
    ...(input.outline
      ? {
          outline_status: kitOutlineStatus({
            sectionCount: input.outline.sections?.length ?? null,
            building: input.outline.building,
            stale: input.outline.stale,
          }),
          ...(input.outline.sections?.length
            ? { outline: kitOutlineEntries(input.outline.sections, input.outline.coverage) }
            : {}),
        }
      : {}),
    study_aids: ordered.map((artifact) => {
      const s = statsReady ? stats[kitArtifactKey(artifact)] : undefined;
      return {
        kind: artifact.targetKind,
        title: artifact.title,
        artifact_type: artifact.artifactType,
        artifact_id: artifact.artifactId,
        href: artifactActionHref(artifact),
        item_count: s?.itemCount ?? null,
        studied_count: s?.studiedCount ?? 0,
        accuracy_pct: s?.accuracy != null ? Math.round(s.accuracy * 100) : null,
        due_count: s?.dueCount ?? 0,
        last_studied_at: s?.lastStudiedAt ?? null,
        duration_seconds: s?.durationSeconds ?? null,
      };
    }),
    kit_totals: {
      study_aids: ordered.length,
      ...(statsReady
        ? {
            practice_items: sum((s) => s.itemCount),
            practiced: sum((s) => s.studiedCount),
            due_now: sum((s) => s.dueCount),
          }
        : {}),
    },
    progress_status: statsLoading ? "loading" : statsFailed ? "unavailable" : "ready",
    ...(challenge
      ? {
          next_challenge: {
            kind: challenge.artifact.targetKind,
            title: challenge.artifact.title,
            href: artifactActionHref(challenge.artifact),
            reason: challenge.reason,
          },
        }
      : {}),
  });
}
