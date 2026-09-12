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
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  MetricNavigation,
  type MetricNavigationItem,
} from "@/components/navigation/MetricNavigation";
import { EDU_TOOL_NAV } from "../lib/education-nav";
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
      s.availability.library.state === "ready" &&
      s.availability.kits.state === "ready" &&
      s.availability.mastery.state === "ready" &&
      s.library.total === 0 &&
      s.kits.total === 0 &&
      !s.study.hasStudied
        ? 1000
        : null,
    render: () => <StartHereBlock key="start-here" />,
  },
  {
    id: "study-today",
    // A plan for today, work due, an active streak, or a goal — anything that
    // means "you are mid-effort" outranks everything else on the page.
    signal: (s) => {
      if (
        s.availability.plan.state !== "ready" ||
        s.availability.mastery.state !== "ready" ||
        s.availability.goals.state !== "ready" ||
        s.availability.streak.state !== "ready"
      ) {
        return null;
      }
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
    signal: (s) =>
      s.availability.kits.state === "ready" && s.kits.recent.length > 0
        ? 800
        : null,
    render: (s) => (
      <KitsBlock key="kits" kits={s.kits.recent} total={s.kits.total} />
    ),
  },
  {
    id: "due-by-mode",
    // Only once there is enough banked work that choosing between modes is a
    // real decision — below that it just restates Study Today.
    signal: (s) =>
      s.availability.mastery.state === "ready" &&
      s.study.totalDue + s.study.totalWeak >= 5
        ? 700
        : null,
    render: (s) => <DueByModeBlock key="due-by-mode" snapshot={s} />,
  },
  {
    id: "recent",
    signal: (s) =>
      s.availability.library.state === "ready" && s.library.recent.length > 0
        ? 600
        : null,
    render: (s) => <RecentBlock key="recent" snapshot={s} />,
  },
];

/**
 * The complete tool registry. `EDU_TOOLS` remains the source of truth while
 * `EDU_TOOL_NAV` supplies the shell-safe icon projection guarded for parity.
 */
function toolNavigation(snapshot: EducationSnapshot): MetricNavigationItem[] {
  const toolBySlug = new Map(EDU_TOOLS.map((tool) => [tool.slug, tool]));
  return EDU_TOOL_NAV.map((entry) => {
    const tool = toolBySlug.get(entry.slug);
    const isLibrary = entry.slug === "flashcards";
    const isKits = entry.slug === "kits";
    const laneState = isLibrary
      ? snapshot.availability.library.state
      : isKits
        ? snapshot.availability.kits.state
        : "ready";
    const value = isLibrary
      ? snapshot.library.byKind.fc_set
      : isKits
        ? snapshot.kits.total
        : undefined;
    return {
      key: entry.slug,
      label: entry.label,
      href: eduHref(entry.slug),
      iconName: entry.iconName,
      description:
        value === undefined
          ? entry.description
          : isLibrary
            ? "Flashcard artifacts you own"
            : "Study kits you own",
      ...(value !== undefined ? { value, state: laneState } : {}),
      availability:
        tool?.status === "coming-soon" || tool?.status === "planned"
          ? "coming-soon"
          : "ready",
    };
  });
}

function AvailabilityNotice({
  snapshot,
  onRetry,
}: {
  snapshot: EducationSnapshot;
  onRetry: () => void;
}) {
  const unavailable = Object.entries(snapshot.availability)
    .filter(([, status]) => status.state === "unavailable")
    .map(([lane]) => lane);
  if (unavailable.length === 0) return null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">
        {unavailable.join(", ")} data couldn&apos;t load. Counts and empty
        states are hidden until it is available.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
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
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [reloadKey]);

  const blocks = snapshot
    ? BLOCKS.map((block) => ({ block, signal: block.signal(snapshot) }))
        .filter(
          (entry): entry is { block: HomeBlock; signal: number } =>
            entry.signal !== null,
        )
        .sort((a, b) => b.signal - a.signal)
    : [];

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
            <MetricNavigation
              label="Education tools"
              items={toolNavigation(snapshot)}
            />
            <AvailabilityNotice
              snapshot={snapshot}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
            {blocks.map(({ block }) => block.render(snapshot))}
          </>
        )}
      </div>
    </main>
  );
}
