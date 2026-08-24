"use client";

// features/education/kits/components/KitHub.tsx
//
// THE KIT — one page, one subject, everything made from it.
//
// A kit run produces up to eight artifacts and then scattered them into six flat
// per-type lists, so the one thing the learner actually has — "my chemistry
// chapter" — existed nowhere in the product. This is that place: they came here
// with ONE piece of material, so they get ONE page for it.
//
// It reads the lineage that kit runs already write (no kit table, no new
// column); the kit's id IS its source material's id.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  FileSearch,
  GraduationCap,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import { peekHref } from "@/features/organizations/peek/peekHref";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import { readKit, type StudyKit } from "../kitService";
import {
  kitStudyAction,
  readKitStudyState,
  type KitStudyState,
} from "../kitStudy";

/** Study-first ordering: what you practise with, then what you read, then audio. */
const KIND_ORDER: Record<string, number> = {
  deck: 0,
  quiz: 1,
  practice_test: 2,
  summary: 3,
  notes: 4,
  mind_map: 5,
  memory_aid: 6,
  audio: 7,
};

function ArtifactCard({ artifact }: { artifact: GeneratedArtifact }) {
  const look = artifact.targetKind
    ? TARGET_PRESENTATION[artifact.targetKind]
    : null;
  const Icon = look?.icon ?? Layers;
  return (
    <Link
      href={artifact.href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${look?.chip ?? "bg-muted"}`}
      >
        <Icon className={`h-4.5 w-4.5 ${look?.fg ?? "text-muted-foreground"}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate">{artifact.title}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        {artifact.detail && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {artifact.detail}
          </span>
        )}
      </span>
    </Link>
  );
}

/** The kit's primary action — resolved once, not twice. */
function StudyActionButton({ study }: { study: KitStudyState }) {
  const { href, label } = kitStudyAction(study);
  return (
    // Full-width on phone: the primary action must not compete with the stats
    // for a 375px row ("mobile is the product, not a port").
    <Button asChild size="lg" className="w-full gap-1.5 sm:w-auto">
      <Link href={href}>
        <GraduationCap className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}

export function KitHub({
  sourceId,
  sourceType = "file",
}: {
  sourceId: string;
  sourceType?: string;
}) {
  const [kit, setKit] = useState<StudyKit | null>(null);
  const [study, setStudy] = useState<KitStudyState | null>(null);
  // Separate from `study` so "still reading" and "this kit has no deck to
  // study" are distinguishable — they render differently, and collapsing them
  // is what makes a bar pop in and shove the page down after paint.
  const [studyLoading, setStudyLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setStudy(null);
    setStudyLoading(true);
    void readKit(sourceType, sourceId).then(async (result) => {
      if (!active) return;
      setKit(result);
      setLoading(false);
      // The study bar is a SECOND, slower read (deck cards + mastery). It lands
      // after the kit renders rather than holding the whole page behind it.
      if (!result) {
        setStudyLoading(false);
        return;
      }
      const setIds = result.artifacts
        .filter((a) => a.artifactType === "fc_set")
        .map((a) => a.artifactId);
      const state = await readKitStudyState(setIds);
      if (!active) return;
      setStudy(state);
      setStudyLoading(false);
    });
    return () => {
      active = false;
    };
  }, [sourceId, sourceType]);

  if (loading) {
    return (
      <>
        <EducationToolHeader title="Study kit" />
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pb-8">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </>
    );
  }

  // Honest empty state: this anchor exists but nothing was ever made from it.
  if (!kit) {
    return (
      <>
        <EducationToolHeader title="Study kit" />
        <div className="mx-auto w-full max-w-3xl px-4 pb-8">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <BrainCircuit className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing has been made from this material yet.
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/education/start">
                <BrainCircuit className="h-4 w-4" />
                Create a study kit
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  // The origin's own route + icon, for any anchor kind the registry knows.
  const originToken = resolveEntityToken(kit.sourceType);
  const materialHref =
    originToken === "file"
      ? `/files/f/${kit.sourceId}`
      : (peekHref(originToken, kit.sourceId) ?? null);
  const MaterialIcon = tryGetEntityInfo(originToken)?.Icon ?? FileSearch;

  const ordered = [...kit.artifacts].sort(
    (a, b) =>
      (KIND_ORDER[a.targetKind ?? ""] ?? 99) -
      (KIND_ORDER[b.targetKind ?? ""] ?? 99),
  );

  return (
    <>
      <EducationToolHeader title={kit.title} />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "thing" : "things"} made
            from this material — everything for it lives here.
          </p>
          <div className="flex items-center gap-2">
            {/* THE DOOR LAW: the material opens whatever it IS. A kit anchored
                on a note or a deck (note→deck, deck→quiz) is as real as a file
                kit, and omitting the button for those left the learner with no
                way back to what the kit was made from. Resolved through the
                canonical entity registry, exactly like `MadeFromSource`. */}
            {materialHref && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={materialHref}>
                  <MaterialIcon className="h-4 w-4" />
                  The material
                </Link>
              </Button>
            )}
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/education/start">
                <BrainCircuit className="h-4 w-4" />
                Make more from it
              </Link>
            </Button>
          </div>
        </div>

        {/* STUDY FIRST — the kit exists to be studied, so where the learner
            stands and their next tap sit above the contents, not below.
            The slot RESERVES its height while the (slower) spine read lands, so
            the artifact grid never jumps down after paint. */}
        {studyLoading && <Skeleton className="h-[104px] w-full rounded-xl" />}
        {!studyLoading && study && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {study.masteryPct}%
                </span>
                <span className="text-sm text-muted-foreground">mastered</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.min(100, study.masteryPct)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {study.studiedCount} of {study.cardCount} cards studied
                {study.dueCount > 0 && ` · ${study.dueCount} due for review`}
              </p>
            </div>
            <StudyActionButton study={study} />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {ordered.map((artifact) => (
            <ArtifactCard key={artifact.edgeId} artifact={artifact} />
          ))}
        </div>
      </div>
    </>
  );
}
