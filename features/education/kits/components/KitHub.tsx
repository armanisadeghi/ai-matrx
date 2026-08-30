"use client";

// features/education/kits/components/KitHub.tsx
//
// A study kit is a PATH through one piece of material, not a directory of eight
// copies of its title. The page therefore names the learning MODE first, keeps
// every claim tied to that mode's real library/study-spine evidence, and gives
// the learner one inviting next move.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  FileSearch,
  Flag,
  Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { GeneratedArtifact } from "@/features/education/convert/lineage";
import type { TargetKind } from "@/features/education/convert/types";
import {
  artifactDuration,
  artifactTile,
} from "@/features/education/library/artifactVisuals";
import { StudyProgressBar } from "@/features/education/library/components/StudyProgressBar";
import type { LibraryRowStats } from "@/features/education/library/types";
import { relativeTime } from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import { peekHref } from "@/features/organizations/peek/peekHref";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import {
  kitArtifactKey,
  readKit,
  readKitArtifactStats,
  type KitArtifactStats,
  type StudyKit,
} from "../kitService";
import { MakeMoreFromKit } from "./MakeMoreFromKit";

interface StudyStage {
  number: string;
  title: string;
  description: string;
  kinds: TargetKind[];
}

const STUDY_PATH: StudyStage[] = [
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

const FORMAT_PROMISE: Record<TargetKind, string> = {
  deck: "Build recall one card at a time.",
  quiz: "Run a quick check and find the gaps.",
  practice_test: "Test your readiness across the whole topic.",
  summary: "Start with the most important ideas.",
  notes: "Review the key terms and details.",
  mind_map: "See how the ideas connect.",
  memory_aid: "Make the hardest details easier to remember.",
  audio: "Keep learning away from the screen.",
};

const TRACKED_KINDS = new Set<TargetKind>(["deck", "quiz", "practice_test"]);

function unitCount(kind: TargetKind, count: number | null): string | null {
  const unit = TARGET_PRESENTATION[kind].unit;
  if (!unit || count == null) return null;
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}

function artifactActionHref(artifact: GeneratedArtifact): string {
  return artifact.targetKind === "deck"
    ? `${artifact.href}/study`
    : artifact.href;
}

function ArtifactCard({
  artifact,
  stats,
  statsLoading,
  statsFailed,
}: {
  artifact: GeneratedArtifact;
  stats?: LibraryRowStats;
  statsLoading: boolean;
  statsFailed: boolean;
}) {
  const kind = artifact.targetKind;
  if (!kind) return null;
  const look = TARGET_PRESENTATION[kind];
  const Icon = look.icon;
  const count = unitCount(kind, stats?.itemCount ?? null);
  const duration = artifactDuration(stats?.durationSeconds ?? null);
  const hasTrackedProgress = stats?.hasProgress ?? false;
  const showProgressUnavailable = statsFailed && TRACKED_KINDS.has(kind);

  return (
    <Link
      href={artifactActionHref(artifact)}
      className={cn(
        "group flex min-h-48 flex-col rounded-2xl border border-border bg-card p-4 transition-[border-color,transform,background-color] hover:-translate-y-0.5 hover:bg-accent/30",
        look.hoverBorder,
      )}
      aria-label={`${look.verb} ${look.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            artifactTile(look),
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        {stats?.dueCount ? (
          <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-warning/10 px-2.5 text-xs font-semibold text-warning">
            <CalendarClock className="h-3.5 w-3.5" />
            {stats.dueCount} due
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <h3 className="text-lg font-semibold text-foreground">{look.label}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {FORMAT_PROMISE[kind]}
        </p>
      </div>

      <div className="mt-4 min-h-12">
        {statsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : hasTrackedProgress && stats ? (
          <>
            <StudyProgressBar
              studied={stats.studiedCount}
              total={stats.itemCount}
              accuracy={stats.accuracy}
              className="mb-2"
            />
            <p className="text-xs font-medium text-foreground">
              {stats.itemCount != null
                ? `${stats.studiedCount} of ${stats.itemCount} practiced`
                : `${stats.studiedCount} practiced`}
              {stats.accuracy != null &&
                ` · ${Math.round(stats.accuracy * 100)}% correct`}
            </p>
            {stats.lastStudiedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last studied {relativeTime(stats.lastStudiedAt)}
              </p>
            )}
          </>
        ) : showProgressUnavailable ? (
          <p className="text-xs text-warning">
            Progress is unavailable right now.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {duration ?? count ?? artifact.detail ?? "Ready when you are"}
          </p>
        )}
      </div>

      <span
        className={cn(
          "mt-auto inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg px-3 text-sm font-semibold transition-colors group-hover:brightness-110",
          artifactTile(look),
        )}
      >
        {hasTrackedProgress ? `Continue ${look.label}` : look.verb}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function KitLoading() {
  return (
    <>
      <EducationToolHeader title="Study kit" />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-10">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    </>
  );
}

export function KitHub({
  sourceId,
  sourceType = "file",
  addTarget,
}: {
  sourceId: string;
  sourceType?: string;
  /** `?add=<kind>` — the format the learner came here to add (the home's nudge). */
  addTarget?: TargetKind;
}) {
  const [kit, setKit] = useState<StudyKit | null>(null);
  const [stats, setStats] = useState<KitArtifactStats>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (refreshKey === 0) setLoading(true);
    setLoadError(false);
    setStatsLoading(true);
    setStatsFailed(false);

    void (async () => {
      try {
        const result = await readKit(sourceType, sourceId);
        if (!active) return;
        setKit(result);
        setLoading(false);
        if (!result) {
          setStats({});
          setStatsLoading(false);
          return;
        }

        try {
          const nextStats = await readKitArtifactStats(result.artifacts);
          if (!active) return;
          setStats(nextStats);
        } catch (error) {
          console.error("[kits] artifact progress read failed:", error);
          if (!active) return;
          setStats({});
          setStatsFailed(true);
        } finally {
          if (active) setStatsLoading(false);
        }
      } catch (error) {
        console.error("[kits] kit read failed:", error);
        if (!active) return;
        setLoading(false);
        setStatsLoading(false);
        setLoadError(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [sourceId, sourceType, refreshKey]);

  if (loading) return <KitLoading />;

  if (loadError) {
    return (
      <>
        <EducationToolHeader title="Study kit" />
        <div className="mx-auto w-full max-w-3xl px-4 pb-10">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
            <BrainCircuit className="h-8 w-8 text-warning" />
            <div>
              <h2 className="font-semibold text-foreground">
                This study kit could not be loaded
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your material is still safe. Try the read again.
              </p>
            </div>
            <Button onClick={() => setRefreshKey((key) => key + 1)}>
              Try again
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (!kit) {
    return (
      <>
        <EducationToolHeader title="Study kit" />
        <div className="mx-auto w-full max-w-3xl px-4 pb-10">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
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

  const originToken = resolveEntityToken(kit.sourceType);
  const materialHref =
    originToken === "file"
      ? `/files/f/${kit.sourceId}`
      : (peekHref(originToken, kit.sourceId) ?? null);
  const MaterialIcon = tryGetEntityInfo(originToken)?.Icon ?? FileSearch;

  const ordered = STUDY_PATH.flatMap((stage) =>
    stage.kinds.flatMap((kind) =>
      kit.artifacts.filter((artifact) => artifact.targetKind === kind),
    ),
  );
  const knownIds = new Set(ordered.map((artifact) => artifact.edgeId));
  ordered.push(
    ...kit.artifacts.filter((artifact) => !knownIds.has(artifact.edgeId)),
  );

  const itemTotal = ordered.reduce(
    (sum, artifact) => sum + (stats[kitArtifactKey(artifact)]?.itemCount ?? 0),
    0,
  );
  const practicedTotal = ordered.reduce(
    (sum, artifact) =>
      sum + (stats[kitArtifactKey(artifact)]?.studiedCount ?? 0),
    0,
  );
  const dueTotal = ordered.reduce(
    (sum, artifact) => sum + (stats[kitArtifactKey(artifact)]?.dueCount ?? 0),
    0,
  );
  const challenge =
    ordered.find(
      (artifact) => (stats[kitArtifactKey(artifact)]?.dueCount ?? 0) > 0,
    ) ??
    ordered.find((artifact) => {
      const artifactStats = stats[kitArtifactKey(artifact)];
      return (
        artifact.targetKind != null &&
        TRACKED_KINDS.has(artifact.targetKind) &&
        !artifactStats?.hasProgress
      );
    }) ??
    ordered[0];
  const challengeKind = challenge?.targetKind ?? null;
  const challengeLook = challengeKind
    ? TARGET_PRESENTATION[challengeKind]
    : null;
  const challengeStats = challenge
    ? stats[kitArtifactKey(challenge)]
    : undefined;

  return (
    <>
      <EducationToolHeader title={kit.title} />
      <main className="mx-auto w-full max-w-6xl space-y-7 px-4 pb-10">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          {materialHref && (
            <Button asChild variant="outline" className="min-h-10 gap-1.5">
              <Link href={materialHref}>
                <MaterialIcon className="h-4 w-4" />
                Material
              </Link>
            </Button>
          )}
          <MakeMoreFromKit
            sourceType={kit.sourceType}
            sourceId={kit.sourceId}
            kitTitle={kit.title}
            addTarget={addTarget}
            onConverted={() => setRefreshKey((key) => key + 1)}
          />
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card-textured p-5 sm:p-7">
          <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Route className="h-3.5 w-3.5" />
                Your study path
              </div>
              <h1 className="mt-4 max-w-2xl text-[clamp(1.75rem,1.4rem+1.5vw,2.75rem)] font-semibold leading-tight text-foreground">
                Pick a way in. Build toward what you can prove.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Start with the big picture, strengthen recall, then test what
                sticks. Every result below comes from this study aid—not from a
                made-up kit score.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
                  {ordered.length} study aids
                </span>
                {!statsLoading && itemTotal > 0 && (
                  <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
                    {itemTotal} practice items
                  </span>
                )}
                {!statsLoading && practicedTotal > 0 && (
                  <span className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
                    {practicedTotal} practiced
                  </span>
                )}
                {!statsLoading && dueTotal > 0 && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning">
                    {dueTotal} due now
                  </span>
                )}
              </div>
            </div>

            {challenge && challengeLook && (
              <div className="rounded-2xl border border-glass-edge bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass sm:p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Flag className="h-4 w-4" />
                  Next challenge
                </div>
                <p className="mt-3 text-xl font-semibold text-foreground">
                  {challengeStats?.dueCount
                    ? `Clear ${challengeStats.dueCount} due ${challengeStats.dueCount === 1 ? "item" : "items"}`
                    : challengeStats?.hasProgress
                      ? `Continue ${challengeLook.label}`
                      : `Try ${challengeLook.label}`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {challengeStats?.dueCount
                    ? `A focused ${challengeLook.label.toLowerCase()} review is ready.`
                    : challengeKind
                      ? FORMAT_PROMISE[challengeKind]
                      : "Choose a study aid to begin."}
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-4 min-h-11 w-full gap-1.5"
                >
                  <Link href={artifactActionHref(challenge)}>
                    {challengeStats?.hasProgress
                      ? "Continue"
                      : challengeLook.verb}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="study-path-heading">
          <div className="mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h2
              id="study-path-heading"
              className="text-lg font-semibold text-foreground"
            >
              Choose your route
            </h2>
          </div>
          <div className="grid gap-7 lg:grid-cols-3 lg:gap-5">
            {STUDY_PATH.map((stage) => {
              const stageArtifacts = stage.kinds.flatMap((kind) =>
                ordered.filter((artifact) => artifact.targetKind === kind),
              );
              if (stageArtifacts.length === 0) return null;
              return (
                <div key={stage.number} className="min-w-0">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {stage.number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {stage.title}
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {stageArtifacts.map((artifact) => (
                      <ArtifactCard
                        key={artifact.edgeId}
                        artifact={artifact}
                        stats={stats[kitArtifactKey(artifact)]}
                        statsLoading={statsLoading}
                        statsFailed={statsFailed}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
