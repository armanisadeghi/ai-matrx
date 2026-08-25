"use client";

// features/education/home/EducationHome.tsx
//
// THE Education home — the one place a learner lands, sees everything they
// have, and knows what to do next.
//
// It did not exist. `/education` was the marketing pitch (signed-in learners
// got it too, unlike every other module, which bounces them into the app), and
// `/education/overview` was a static grid of five links with zero user data —
// a nav menu wearing a workspace's name. `constants.ts` even said so:
// "Points at the hub for now; retarget when the primary study workspace ships."
// This is that workspace.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COMPOSITION RULE
//
// The page is not three layouts for three maturities. It is ONE ordered list of
// blocks; each declares `signal(snapshot)` and returns null to render nothing.
// Maturity therefore emerges from what the learner owns instead of being
// branched on, which is what keeps day 0 uncluttered and day 300 dense without
// a single account-maturity branch in the tree.
//
// Two rules make it feel designed rather than accumulated:
//   1. WHATEVER THEY HAVE IS THE HERO. One kit and no history → the page is
//      that kit. A plan with work due → Study Today leads. Nothing at all →
//      the ingest is the whole page.
//   2. EXACTLY ONE NUDGE, and it is about their own material (see nudges.ts).
//      A grid of features they are not using reads as pressure, not invitation.
//
// Adding a block is an entry in BLOCKS below. Never a new page variant.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EDU_TOOLS } from "../data/tools";
import { eduHref } from "../constants";
import { EducationHubSurface } from "../components/landing/EducationHubSurface";
import { setStudyTodaySnapshot } from "../study/dashboard/studyTodaySnapshot";
import { DueByModeBlock } from "./blocks/DueByModeBlock";
import { KitsBlock } from "./blocks/KitsBlock";
import { RecentBlock } from "./blocks/RecentBlock";
import { StartHereBlock } from "./blocks/StartHereBlock";
import { StudyTodayBlock } from "./blocks/StudyTodayBlock";
import { loadEducationSnapshot } from "./snapshot";
import type { EducationSnapshot, HomeBlock } from "./types";

/**
 * The blocks, with the signal that earns each one its place.
 *
 * Signal values are a priority scale, not a count — they are chosen so that a
 * learner's own commitments (plan, due work) always outrank browsing surfaces,
 * and so a single kit can carry the page when there is nothing else.
 */
const BLOCKS: HomeBlock[] = [
  {
    id: "start-here",
    // Only when the account is genuinely empty. The moment a learner owns one
    // artifact this disappears — the permanent home for creating is the header
    // and the "Create kit" action, not a hero that never goes away.
    signal: (s) =>
      s.library.total === 0 && s.kits.total === 0 && !s.study.hasStudied
        ? 1000
        : null,
    render: () => <StartHereBlock key="start-here" />,
  },
  {
    id: "study-today",
    // A plan for today, work due, an active streak, or a goal — anything that
    // means "you are mid-effort" outranks everything else on the page.
    signal: (s) => {
      const hasCommitment =
        s.study.todayBlocks.length > 0 ||
        s.study.isRestDay ||
        s.study.totalDue > 0 ||
        s.study.totalWeak > 0 ||
        s.study.streakDays > 0 ||
        s.study.goals.length > 0;
      return hasCommitment ? 900 : null;
    },
    render: (s) => <StudyTodayBlock key="study-today" snapshot={s} />,
  },
  {
    id: "kits",
    // The hero for a sparse account: one kit and no study history still fills
    // the page with something that is unmistakably theirs.
    signal: (s) => (s.kits.recent.length > 0 ? 800 : null),
    render: (s) => (
      <KitsBlock key="kits" kits={s.kits.recent} total={s.kits.total} />
    ),
  },
  {
    id: "due-by-mode",
    // Only once there is enough banked work that choosing between modes is a
    // real decision — below that it just restates Study Today.
    signal: (s) =>
      s.study.totalDue + s.study.totalWeak >= 5 ? 700 : null,
    render: (s) => <DueByModeBlock key="due-by-mode" snapshot={s} />,
  },
  {
    id: "recent",
    signal: (s) => (s.library.recent.length > 0 ? 600 : null),
    render: (s) => <RecentBlock key="recent" snapshot={s} />,
  },
];

/**
 * The study tools, shown only once the learner has something to point them at.
 *
 * A brand-new account gets three doors (StartHereBlock), not sixteen tools: a
 * first-time learner cannot evaluate sixteen options, and showing them all is
 * how a first session ends in a closed tab. Data-driven off `EDU_TOOLS` — the
 * same registry the marketing hub reads — so a newly shipped tool appears here
 * the moment its entry flips to `live`, and never from a second hand-kept list.
 */
function ToolsStrip() {
  const live = EDU_TOOLS.filter((tool) => tool.status === "live");
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Every way to study</h2>
        <Link
          href="/education/start"
          className="inline-flex items-center gap-1 text-xs text-primary"
        >
          Create a kit
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {live.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.slug}
              href={eduHref(tool.slug)}
              className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {tool.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {tool.tagline}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}

export function EducationHome() {
  const [snapshot, setSnapshot] = useState<EducationSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadEducationSnapshot().then((next) => {
      if (cancelled) return;
      setSnapshot(next);
      // Publish for the surface emitter below, which reads it at agent-trigger
      // time rather than re-fetching the study spine. Null when the learner has
      // no study signal, so the surface honestly reports
      // `study_snapshot_available: false` instead of inventing zeros.
      const hasSignal =
        next.nextActions.length > 0 ||
        !!next.study.plan ||
        next.study.streakDays > 0 ||
        next.study.goals.length > 0;
      setStudyTodaySnapshot(
        hasSignal
          ? {
              has_active_plan: !!next.study.plan,
              is_rest_day: next.study.isRestDay,
              streak_days: next.study.streakDays,
              next_actions: next.nextActions.map((a) => ({
                key: a.key,
                label: a.label,
                why: a.why,
                minutes: a.minutes,
                href: a.href,
              })),
              total_minutes: next.nextActions.reduce(
                (sum, a) => sum + (a.minutes ?? 0),
                0,
              ),
            }
          : null,
      );
    });
    return () => {
      cancelled = true;
      setStudyTodaySnapshot(null);
    };
  }, []);

  const blocks = snapshot
    ? BLOCKS.map((block) => ({ block, signal: block.signal(snapshot) }))
        .filter((entry): entry is { block: HomeBlock; signal: number } =>
          entry.signal !== null,
        )
        .sort((a, b) => b.signal - a.signal)
    : [];

  // Sixteen tools are noise on an empty account and useful on a full one — the
  // same rule every block follows, applied to the strip.
  const showTools =
    !!snapshot && (snapshot.library.total > 0 || snapshot.kits.total > 0);

  return (
    <main className="h-full overflow-y-auto bg-textured pb-safe">
      {/* Render-free: registers this route's live surface scope for the
          AppShell Agents chrome (matrx-user/education). */}
      <EducationHubSurface />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        {!snapshot ? (
          <HomeSkeleton />
        ) : (
          <>
            {blocks.map(({ block }) => block.render(snapshot))}
            {showTools && <ToolsStrip />}
          </>
        )}
      </div>
    </main>
  );
}
