"use client";

// features/flashcards/components/set-detail/DeckProgressView.tsx
//
// The deck's Progress screen (/education/flashcards/[setId]/sessions — the
// deck page's "Progress" button). Redesign 2026-10-01: a learner opens this to
// see how they are doing and what to practise next, so it leads with mastery,
// then the streak and session numbers, then scores over time, then the cards
// that need practice with one "Practice these" button, then every session.
//
// Every number is read, never invented:
//   - mastery: item_mastery per card (studyService.getMasteryBulk) through the
//     shared MasteryDisplay vocabulary (masteryTier);
//   - streak: education.study_streak (studyService.getStreak) — it counts days
//     with ANY study session, so it is the learner's streak, not this deck's;
//   - sessions + scores: study_session rows for this deck and their attempt
//     rollups (sessionListScorePct, the same score the session rows show);
//   - "Needs practice": rankDeckPractice — the same rule the deck-scoped
//     weak-area drill (`weak-areas?set=`) opens, so the list and the drill agree.
// The session list itself is the shared SessionsBrowser (embedded), which keeps
// open / delete and the education-sessions agent surface.
//
// Model: Duolingo's progress tab + Brainscape's deck mastery — one glance says
// "how well do I know this deck", one tap says "practise the weak ones".
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CheckCircle2, Play, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScoreRing, Skeleton } from "@ai-matrx/design-system";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { SessionsBrowser } from "@/features/education/study/components/SessionsBrowser";
import {
  DeckMasteryBar,
  MasteryTierPill,
  computeMasteryDistribution,
} from "@/features/education/study/components/MasteryDisplay";
import { studyService } from "@/features/education/study/service/studyService";
import { sessionListScorePct } from "@/features/education/study/utils/sessionListDisplay";
import { sessionModeLabel } from "@/features/education/study/modes";
import type {
  ItemMasteryRow,
  SessionAttemptSummary,
  StudySessionRow,
  StudyStreakRow,
} from "@/features/education/study/types";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import { displayTitle } from "@ai-matrx/rich-content/markdown-core/plain-title";
import { fcService } from "../../data/fcService";
import { rankDeckPractice } from "../../data/deckPractice";
import { studyFaces } from "../../utils/cardVariants";
import { getCardImages } from "../study/cardImages";
import type { CardWithDetails, SetWithCards } from "../../data/types";

const EDU_BASE = "/education/flashcards";
/** How many weak cards the list shows; the drill takes up to 20. */
const PRACTICE_PREVIEW = 5;
/** Trailing sessions the score chart draws. */
const CHART_SESSIONS = 12;

const scoreChartConfig = {
  score: { label: "Score", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

interface DeckProgressData {
  deck: SetWithCards;
  mastery: Record<string, ItemMasteryRow | undefined>;
  sessions: StudySessionRow[];
  attempts: Record<string, SessionAttemptSummary>;
  streak: StudyStreakRow | null;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DeckProgressView({ setId }: { setId: string }) {
  const [data, setData] = useState<DeckProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openCardWindow = useOpenFlashcardItemWindow();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const deckRes = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!deckRes.data) {
        setError(deckRes.error ?? "unavailable");
        return;
      }
      const deck = deckRes.data;
      const [masteryRes, sessionsRes, streakRes] = await Promise.all([
        deck.cards.length > 0
          ? studyService.getMasteryBulk(
              deck.cards.map((c) => ({ itemType: "fc_card", itemId: c.id })),
            )
          : Promise.resolve({ data: [] as ItemMasteryRow[], error: null }),
        studyService.listSessions({ setId }),
        studyService.getStreak(),
      ]);
      if (cancelled) return;
      const sessions = sessionsRes.data ?? [];
      const attemptsRes = await studyService.getAttemptSummariesForSessions(
        sessions.map((s) => s.id),
      );
      if (cancelled) return;
      const mastery: Record<string, ItemMasteryRow | undefined> = {};
      for (const m of masteryRes.data ?? []) mastery[m.item_id] = m;
      setData({
        deck,
        mastery,
        sessions,
        attempts: attemptsRes.data ?? {},
        streak: streakRes.data ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const deckHref = `${EDU_BASE}/${setId}`;
  const name = data ? displayTitle(data.deck.set.name) : "Progress";

  const openCard = (card: CardWithDetails) => {
    const faces = studyFaces(card);
    const images = getCardImages(card);
    openCardWindow({
      front: faces ? faces.front : card.front,
      back: faces ? faces.back : card.back,
      title: name,
      frontImage: images.front ?? null,
      backImage: images.back ?? null,
    });
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      <EducationToolHeader
        title={name}
        backHref={deckHref}
        backLabel="Back to deck"
        actions={[
          {
            icon: "Play",
            label: "Study",
            href: `${deckHref}/study`,
            primary: true,
          },
        ]}
      />
      <div className="matrx-touch-targets mx-auto max-w-4xl px-3 pb-safe pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6 sm:pb-10 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
        {error ? (
          <AccessGate
            token="fc_set"
            id={setId}
            fallbackHref={EDU_BASE}
            fallbackLabel="All flashcards"
          />
        ) : !data ? (
          <div className="space-y-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        ) : (
          <DeckProgressBody
            data={data}
            setId={setId}
            deckHref={deckHref}
            onOpenCard={openCard}
          />
        )}
      </div>
    </div>
  );
}

function DeckProgressBody({
  data,
  setId,
  deckHref,
  onOpenCard,
}: {
  data: DeckProgressData;
  setId: string;
  deckHref: string;
  onOpenCard: (card: CardWithDetails) => void;
}) {
  const now = new Date();
  const { deck, mastery, sessions, attempts, streak } = data;
  const cards = deck.cards;
  const masteryList = cards.map((c) => mastery[c.id]);
  const dist = computeMasteryDistribution(masteryList);
  const masteredPct = dist.total > 0 ? Math.round(dist.masteredPct * 100) : null;

  // Sessions that hold study (answers given). Opened-and-left sessions are
  // not study — the list hides them too (`hideEmpty`).
  const studied = sessions.filter((s) => (attempts[s.id]?.total ?? 0) > 0);
  const scored = studied
    .map((s) => ({ session: s, score: sessionListScorePct(attempts[s.id]) }))
    .filter((r): r is { session: StudySessionRow; score: number } => r.score !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : null;
  const chartData = scored
    .slice(0, CHART_SESSIONS)
    .reverse()
    .map((r) => ({
      id: r.session.id,
      label: shortDate(r.session.created_at),
      score: r.score,
      mode: sessionModeLabel(r.session.mode),
      answers: attempts[r.session.id]?.total ?? 0,
    }));

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const practice = rankDeckPractice(
    masteryList.filter((m): m is ItemMasteryRow => !!m),
    now,
  ).filter((m) => cardById.has(m.item_id));
  const preview = practice.slice(0, PRACTICE_PREVIEW);

  const nothingYet = dist.studied === 0 && studied.length === 0;

  if (nothingYet) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <Target className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold text-foreground">
          No progress yet
        </p>
        <p className="text-sm text-muted-foreground">
          Study this deck once to start tracking it.
        </p>
        <Button variant="primary" asChild className="mt-1">
          <Link href={`${deckHref}/study`}>
            <Play className="mr-1.5 h-4 w-4 fill-current" />
            Study
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Mastery hero */}
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:gap-6 sm:p-5">
        <ScoreRing
          pct={masteredPct}
          size={80}
          strokeWidth={8}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-base font-semibold text-foreground">
            {dist.counts.mastered} of {dist.total} mastered
          </p>
          <DeckMasteryBar masteries={masteryList} showHeadline={false} />
        </div>
      </section>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile
          label="Day streak"
          value={streak ? streak.current_streak : 0}
          hint={streak ? `Best ${streak.longest_streak}` : undefined}
          title="Days in a row you studied anything."
        />
        <KpiTile label="Sessions" value={studied.length} />
        <KpiTile
          label="Cards studied"
          value={`${dist.studied}/${dist.total}`}
        />
        <KpiTile
          label="Avg score"
          value={avgScore === null ? null : `${avgScore}%`}
          title="Average score across this deck's sessions."
        />
      </div>

      {/* Needs practice */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Needs practice
            {practice.length > 0 && (
              <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                {practice.length}
              </span>
            )}
          </h2>
          {practice.length > 0 && (
            <Button variant="primary" asChild>
              <Link
                href={`${EDU_BASE}/weak-areas?set=${setId}`}
                data-progress-action="practice"
              >
                <Target className="mr-1.5 h-4 w-4" />
                Practice these
              </Link>
            </Button>
          )}
        </div>
        {preview.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            {dist.studied > 0
              ? "Every card you've studied is going well."
              : "Study a few cards to see which need practice."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {preview.map((m) => {
              const card = cardById.get(m.item_id);
              if (!card) return null;
              return (
                <li key={m.item_id}>
                  <button
                    type="button"
                    onClick={() => onOpenCard(card)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 text-sm text-foreground">
                      <CardFaceContent
                        content={card.front}
                        variant="inline"
                        className="line-clamp-1"
                      />
                    </span>
                    {/* A card just missed can still read high recall (FSRS
                        resets on review), so a flagged card says how often
                        it was missed instead of a "Mastered" pill that
                        contradicts the list it sits in. */}
                    {m.struggle_flag && (m.lapses ?? 0) > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        Missed {m.lapses}×
                      </span>
                    ) : (
                      <MasteryTierPill mastery={m} className="shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Scores over time */}
      {chartData.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Session scores
          </h2>
          <ChartContainer
            config={scoreChartConfig}
            className="aspect-auto h-44 w-full"
          >
            <BarChart data={chartData} margin={{ left: 0, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="id"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(id: string) => {
                  // A date labels only the first session of its day, so a
                  // busy day reads once instead of "Oct 2" five times.
                  const i = chartData.findIndex((d) => d.id === id);
                  if (i < 0) return "";
                  return i > 0 && chartData[i - 1].label === chartData[i].label
                    ? ""
                    : chartData[i].label;
                }}
                interval={0}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(v: number) => `${v}%`}
                width={36}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => {
                      const row = item?.payload as
                        | { mode?: string; label?: string; answers?: number }
                        | undefined;
                      return `${row?.label ?? ""} · ${row?.mode ?? ""} · ${value}% of ${row?.answers ?? 0}`;
                    }}
                  />
                }
              />
              <Bar
                dataKey="score"
                fill="var(--color-score)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ChartContainer>
        </section>
      )}

      {/* Every session */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-foreground">
          Sessions
        </h2>
        <SessionsBrowser
          setId={setId}
          title="Sessions"
          detailBasePath={`${EDU_BASE}/sessions`}
          hideEmpty
          embedded
        />
      </section>
    </div>
  );
}
