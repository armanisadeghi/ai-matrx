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
import { ArrowUpRight, BrainCircuit, FileSearch, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import { readKit, type StudyKit } from "../kitService";

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

export function KitHub({
  sourceId,
  sourceType = "file",
}: {
  sourceId: string;
  sourceType?: string;
}) {
  const [kit, setKit] = useState<StudyKit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void readKit(sourceType, sourceId).then((result) => {
      if (!active) return;
      setKit(result);
      setLoading(false);
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
            {kit.sourceType === "file" && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/files/f/${kit.sourceId}`}>
                  <FileSearch className="h-4 w-4" />
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

        <div className="grid gap-2 sm:grid-cols-2">
          {ordered.map((artifact) => (
            <ArtifactCard key={artifact.edgeId} artifact={artifact} />
          ))}
        </div>
      </div>
    </>
  );
}
