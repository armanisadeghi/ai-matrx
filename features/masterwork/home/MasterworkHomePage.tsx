"use client";

// features/masterwork/home/MasterworkHomePage.tsx
//
// 🚨🚨 DO NOT DELETE THIS DIRECTORY. IT IS UNFINISHED WORK AWAITING ARMAN'S
// RULING — NOT DEAD CODE. 🚨🚨
//
// `features/masterwork/home/` (this file, `HowItsImprovingPanel.tsx`,
// `service.ts` — 1,022 lines) was DELETED on 2026-09-10 on the grounds that
// nothing rendered it, and RESTORED the same day from `810a4d299a` after an
// independent review found the deletion unlawful. THE UNFINISHED-WORK ALARM
// (`../../../../common-docs/policies/unfinished-work-alarm.md` § The ban):
// *"You may NEVER recommend deleting … a purpose-built artifact on the grounds
// that it is unreferenced or empty … ONLY after Arman has himself named it
// dead, in writing, first."* He never did.
//
// WHY IT IS NOT ROUTED, AND WHY AN AGENT MUST NOT ROUTE IT: Arman HIMSELF made
// `/masterwork` bounce signed-in Experts to `/masterwork/all` in his own
// commit `00602a2916` (2026-08-21) — *"'/masterwork' is the marketing page
// (authed bounce to /all on the canonical list template)"*. That is his
// routing decision in writing. Re-mounting this page there would reverse it on
// an agent's authority, which is the mirror of the deletion, not its repair.
// He named the ROUTE; he never named this page dead.
//
// WHAT IS ACTUALLY AT STAKE, for his ruling: `/masterwork/all` is a generic
// Rulebook entity list. It carries NONE of what this page carries — the review
// KPI strip, release state + quality trend per Masterwork, recent runs, the
// Approach start tiles, and the "How it's improving" Hindsight panel. That
// capability is currently unreachable, which is rung 2 of THE REACHABILITY
// LADDER: report the missing caller, never the missing value.
//
// STATUS: restored, compiling, and archive-lawful (it carries F10's
// `ArchivedDisclosure` split and the all-archived caption). Registered for
// Arman in `.matrx/ARMAN_TASKS.md` and in the archived-items-law register
// (`common-docs/projects/archived-items-law/STATUS.md`, row F10).
//
// The Masterwork HOME — the authed landing at /masterwork. Makes the depth
// of the system visible in the Expert's own terms: your Rulebooks (with
// review progress), the Masterworks built from them (release state + quality
// trend), recent work the system did for you, the Approaches to start from,
// and "How it's improving" (the honest Hindsight panel). Every named entity
// is a door (THE DOOR LAW); every count links to the list behind it.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Minus,
  Play,
  Plus,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import {
  computeKpis,
  masterworkFreshnessLine,
  type RulebookKpis,
} from "../components/detail/RulebookKpiStrip";
import {
  fetchDistillationApproaches,
  startableApproaches,
  type DistillationApproach,
} from "../browse/approaches";
import { ApproachCard } from "@/features/masterwork/browse/ApproachCard";
import { splitMasterworksByArchive } from "../service";
import {
  fetchMasterworkHome,
  type HomeMasterwork,
  type MasterworkHomeData,
} from "./service";
import { HowItsImprovingPanel } from "./HowItsImprovingPanel";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { MASTERWORK_RULEBOOK_SURFACE } from "../assists";
import { ArchivedDisclosure } from "@ai-matrx/design-system";
import { formatRelativeTime } from "@/utils/datetime";

function when(iso: string): string {
  return formatRelativeTime(iso, { style: "short" });
}

/** What the system was doing, in the Expert's words. */
const OPERATION_LABELS: Record<string, string> = {
  build: "Built a Masterwork",
  ingest: "Read a pasted source",
  ingest_file: "Read an uploaded source",
  audition: "Ran an Audition",
  checkup: "Ran a Final Checkup",
  clean_corpus: "Tidied your words",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  completed: "Finished",
  failed: "Didn't finish",
  errored: "Didn't finish",
  abandoned: "Didn't finish",
  cancelled: "Stopped",
  running: "Working now",
  pending: "Starting",
};

function SectionHeading({
  title,
  door,
}: {
  title: string;
  door?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {door ? (
        <Link
          href={door.href}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {door.label}
          <ChevronRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

function MiniProgress({ kpis }: { kpis: RulebookKpis }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {kpis.approved} approved
          {kpis.drafts > 0 ? ` · ${kpis.drafts} waiting on you` : ""}
        </span>
        <span className="tabular-nums">{kpis.progressPct}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            kpis.progressPct >= 100 && kpis.approved > 0
              ? "bg-emerald-500"
              : "bg-primary",
          )}
          style={{ width: `${Math.max(kpis.progressPct, 2)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * One Masterwork card on the home grid. Extracted so the ACTIVE grid and the
 * ArchivedDisclosure render the identical card (THE ARCHIVED-ITEMS LAW — the
 * reveal shows the real rows, never a lesser summary of them); a revealed card
 * says "Archived" on its face so the two halves are never confused.
 */
function HomeMasterworkCard({ masterwork: m }: { masterwork: HomeMasterwork }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={
            m.built_from_rulebook
              ? `/masterwork/${m.built_from_rulebook}/masterworks`
              : "/masterwork/all"
          }
          className="font-medium text-foreground hover:text-primary"
        >
          {m.name}
        </Link>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            m.is_archived
              ? "bg-muted text-muted-foreground"
              : m.released_at !== null
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          {m.is_archived
            ? "Archived"
            : m.released_at !== null
              ? "Released"
              : "Draft"}
        </span>
      </div>
      {m.rulebookName && m.built_from_rulebook ? (
        <Link
          href={`/masterwork/${m.built_from_rulebook}`}
          className="mt-0.5 w-fit text-xs text-muted-foreground hover:text-foreground"
        >
          From {m.rulebookName}
        </Link>
      ) : null}
      <div className="mt-auto flex items-center justify-between pt-3">
        <QualityTrend latest={m.qualityLatest} previous={m.qualityPrevious} />
        {m.released_at !== null && !m.is_archived ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/masterwork/encore/${m.id}`}>
              <Play className="mr-1 h-3.5 w-3.5" />
              Run
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QualityTrend({
  latest,
  previous,
}: {
  latest: number | null;
  previous: number | null;
}) {
  if (latest === null) return null;
  const delta = previous === null ? null : latest - previous;
  const Icon =
    delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const tone =
    delta === null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive";
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs tabular-nums", tone)}
      title="Quality score from the latest Audition"
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.round(latest)}
      {delta !== null && delta !== 0 ? (
        <span className="text-[10px]">
          ({delta > 0 ? "+" : ""}
          {Math.round(delta)})
        </span>
      ) : null}
    </span>
  );
}

export function MasterworkHomePage() {
  const [home, setHome] = useState<MasterworkHomeData | null>(null);
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showArchivedMasterworks, setShowArchivedMasterworks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMasterworkHome()
      .then((d) => {
        if (!cancelled) setHome(d);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load Masterwork.",
          );
      });
    // Approaches are enrichment — a failure never blanks the page, but it
    // screams (loud recovery) and the section simply doesn't render.
    fetchDistillationApproaches()
      .then((a) => {
        if (!cancelled) setApproaches(a);
      })
      .catch((err: unknown) => {
        console.error("[masterwork-home] Approach registry read failed", err);
        if (!cancelled) setApproaches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (home === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const hasRulebooks = home.rulebooks.length > 0;
  // THE ARCHIVED-ITEMS LAW (common-docs/policies/archived-items.md, Arman
  // 2026-09-09): the grid and every count on this page are the LIVE half; the
  // archived half is one click away, under the disclosure below the grid.
  const { active: activeMasterworks, archived: archivedMasterworks } =
    splitMasterworksByArchive(home.masterworks) as {
      active: HomeMasterwork[];
      archived: HomeMasterwork[];
    };
  const released = activeMasterworks.filter((m) => m.released_at !== null);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-10 sm:px-6">
      {/* The one-line promise + primary actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Your expertise, written down as rules you approve — then built into
          systems that work exactly your way.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/masterwork/new">
              <Plus className="mr-1 h-4 w-4" />
              New Rulebook
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/masterwork/encore">
              <Zap className="mr-1 h-4 w-4" />
              Encore
            </Link>
          </Button>
        </div>
      </div>

      {/* Start here — the Approach registry */}
      {approaches !== null && startableApproaches(approaches).length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <SectionHeading title="Start something new" />
            <Link
              href="/masterwork/approaches"
              className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              All ways
            </Link>
          </div>
          {/* ONE card component, three consumers (2026-08-20) — this grid used
              to hand-roll a plainer tile, so the same Approach looked like two
              different things depending on which page you were on. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {startableApproaches(approaches).map((a) => (
              <ApproachCard
                key={a.key}
                approach={a}
                href={`/masterwork/new?approach=${encodeURIComponent(a.key)}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* THE IMPROVEMENT BRAIN, VISIBLE FROM THE MODULE HOME
          (aidream/services/masterwork_assists/). Same rows as the Rulebook
          page's strip — one ledger, one slice, deciding in either place clears
          both — but UNFILTERED, so the one thing worth doing next across ALL
          your Rulebooks is on the landing page rather than behind a click into
          the right one. Before this, an Expert with three Rulebooks could only
          find the brain by guessing which Rulebook it had something to say
          about. Renders nothing when it has nothing to say. */}
      <AssistStrip surfaceName={MASTERWORK_RULEBOOK_SURFACE} />

      {/* Your Rulebooks */}
      <section className="space-y-2">
        <SectionHeading
          title={
            home.rulebookTotal > 0
              ? `Your Rulebooks (${home.rulebookTotal})`
              : "Your Rulebooks"
          }
          door={{ href: "/masterwork/all", label: "All Rulebooks" }}
        />
        {hasRulebooks ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.rulebooks.map((rb) => {
              const kpis = computeKpis(rb);
              return (
                <Link
                  key={rb.id}
                  href={`/masterwork/${rb.id}`}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {rb.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      v{rb.version}
                    </span>
                  </div>
                  {rb.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {rb.description}
                    </p>
                  ) : null}
                  <MiniProgress kpis={kpis} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              A Rulebook is your judgment, written down as rules you approve —
              one conversation is enough to start.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/masterwork/new">
                <Plus className="mr-1 h-4 w-4" />
                Start your first Rulebook
              </Link>
            </Button>
          </div>
        )}
      </section>

      {/* Your Masterworks */}
      {activeMasterworks.length > 0 || archivedMasterworks.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading
            title={`Your Masterworks (${activeMasterworks.length})`}
          />
          {/*
            🚨 A COUNT OF ZERO IS NOT A STATEMENT THAT NOTHING EXISTS (row F10
            repair, 2026-09-10). Every count on this page is the LIVE half, so
            with everything archived the heading reads "Your Masterworks (0)"
            over an empty grid — true, and read as "you have none". The
            canonical sentence for that state is `masterworkFreshnessLine`,
            the SAME exported function the Rulebook and lane KPI strips print,
            so this surface can never word it differently.
          */}
          {activeMasterworks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {masterworkFreshnessLine({
                built: 0,
                current: 0,
                released: 0,
                currentPct: 0,
                archived: archivedMasterworks.length,
              })}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeMasterworks.map((m) => (
              <HomeMasterworkCard key={m.id} masterwork={m} />
            ))}
          </div>
          {/* THE ARCHIVED-ITEMS LAW: hidden by default, one click to reveal,
              and the heading above counts only what is live. */}
          <ArchivedDisclosure
            count={archivedMasterworks.length}
            open={showArchivedMasterworks}
            onOpenChange={setShowArchivedMasterworks}
            label="Archived Masterworks"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {archivedMasterworks.map((m) => (
                <HomeMasterworkCard key={m.id} masterwork={m} />
              ))}
            </div>
          </ArchivedDisclosure>
          {released.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {released.length === 1
                ? "1 Masterwork is released — anyone you share it with can run it on "
                : `${released.length} Masterworks are released — anyone you share them with can run them on `}
              <Link
                href="/masterwork/encore"
                className="text-foreground hover:text-primary"
              >
                Encore
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Recent work */}
      {home.recentRuns.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading title="Recent work" />
          <div className="rounded-lg border border-border bg-card">
            {home.recentRuns.map((run, i) => (
              <Link
                key={run.id}
                href={`/masterwork/${run.rulebook_id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50",
                  i > 0 && "border-t border-border",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    run.status === "completed"
                      ? "bg-emerald-500"
                      : run.status === "running" || run.status === "pending"
                        ? "bg-primary"
                        : "bg-destructive",
                  )}
                />
                <span className="text-foreground">
                  {OPERATION_LABELS[run.operation] ?? run.operation}
                </span>
                {run.rulebookName ? (
                  <span className="truncate text-muted-foreground">
                    · {run.rulebookName}
                  </span>
                ) : null}
                {typeof run.quality_score === "number" ? (
                  <span className="tabular-nums text-muted-foreground">
                    · scored {Math.round(run.quality_score)}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {RUN_STATUS_LABELS[run.status] ?? run.status} ·{" "}
                  {when(run.created_at)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}


      {/* How it's improving — the honest Hindsight panel */}
      <HowItsImprovingPanel />

      {/* A door for the Operator side, always */}
      <p className="text-xs text-muted-foreground">
        Looking to run someone else&apos;s released Masterwork?{" "}
        <Link
          href="/masterwork/encore"
          className="inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
        >
          Open Encore
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
