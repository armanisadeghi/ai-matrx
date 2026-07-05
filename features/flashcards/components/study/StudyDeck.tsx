// features/flashcards/components/study/StudyDeck.tsx
//
// The shared, presentational flashcard STUDY DECK — the keyboard-driven flip +
// grade UI, progress bar, dot strip, and completion summary. It owns NO data
// loading: it takes a study-result shape (cards, currentIndex, flip/next/grade,
// progress, …) so ANY driver renders identically. Consumers:
//   - StudySurface        → useFlashcardStudy (one set)
//   - ReviewDueSurface    → useDueReview (cross-set FSRS due queue)
// Every grade still funnels through the driver's `grade` (→ study spine); this
// component just advances the UI. Extracted from StudySurface so the two surfaces
// don't fork the ~200 lines of study UI.
//
// Keyboard: Space/Enter = flip · ←/→ = navigate · 1/2/3 = grade.
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Trophy,
  HelpCircle,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import FlashcardMobileView from "@/components/mardown-display/blocks/flashcards/FlashcardMobileView";
import {
  studyResultsByIndex,
  toFlashcardMobileCardsFromStudy,
} from "@/components/mardown-display/blocks/flashcards/flashcard-mobile-bridge";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { studyService } from "@/features/education/study/service/studyService";
import type { ItemMasteryRow } from "@/features/education/study/types";
import type { CardWithDetails } from "../../data/types";
import type { ReviewResult } from "../../types";
import { FlashcardGradeButtonRow } from "./FlashcardGradeButton";
import { helpLive, type HelpLiveResult } from "../../data/tutor/helpLive";
import {
  reviewSession,
  type ReviewSessionResult,
} from "../../data/tutor/reviewSession";
import { microCoach } from "../../data/tutor/microCoach";
import {
  buildRecentSessionContext,
  buildReviewAggregate,
  buildReviewAttempts,
} from "../../data/tutor/learnerContext";

const FC_CARD_ITEM_TYPE = "fc_card";
/** Below this many graded cards, an end-of-session AI review is more noise
 *  than signal (nothing systematic to say about 1-2 cards) — skip it. */
const MIN_CARDS_FOR_REVIEW = 3;

export interface StudyDeckProgress {
  done: number;
  total: number;
  correct: number;
}

export interface StudyDeckProps {
  loading: boolean;
  error: string | null;
  cards: CardWithDetails[];
  currentIndex: number;
  isFlipped: boolean;
  resultsByCard: Record<string, ReviewResult | undefined>;
  grading: boolean;
  progress: StudyDeckProgress;
  flip: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  grade: (result: ReviewResult) => void | Promise<unknown>;
  /** Copy for the empty (no-cards) state. */
  emptyTitle?: string;
  emptyBody?: string;
  /** Copy for the error state title. */
  errorTitle?: string;
  /** Completion summary copy + the primary "done" action. */
  completionTitle?: string;
  completionSubtitle?: string;
  /** "Study again" — omit to hide the restart button. */
  onRestart?: () => void;
  /** The primary completion action (e.g. Back to set / Back to flashcards). */
  completionPrimary?: {
    label: string;
    icon: typeof BookOpen;
    onClick: () => void;
  };
  /** When set, each card gets a compact voice-quiz mic icon (top-right on the card). */
  voiceTestForCard?: (card: CardWithDetails) => {
    cardId: string;
    spokenFrontFileId?: string | null;
  };
  /**
   * Phase 4 (AI tutor) — per-card mastery, feeding the "Ask AI" panel's real
   * learner context (struggled topics, live retrievability) instead of a
   * stub. Omit to disable the struggled-topics signal (context still works,
   * just thinner).
   */
  masteryByCard?: Record<string, ItemMasteryRow | undefined>;
  /**
   * Phase 4 — the open `study_session.id` this deck's attempts are tagged
   * with. When set + enough cards were graded, the deck automatically runs
   * the end-of-session AI review (`fc_review_batch`) on completion and
   * writes `study_session.session_review` — the SAME persistence every
   * session-history surface (CoachReviewPanel, SessionScorecard) already
   * reads, so review "just works" for classic/adaptive/weak-area sessions
   * with zero per-surface code. Omit to skip the review lane entirely.
   */
  sessionId?: string | null;
  /** Set false to hide the "Ask AI" affordance even when a help agent is configured. */
  enableTutor?: boolean;
}

export function StudyDeck(props: StudyDeckProps) {
  const {
    loading,
    error,
    cards,
    currentIndex,
    isFlipped,
    resultsByCard,
    grading,
    progress,
    flip,
    next,
    prev,
    goTo,
    grade,
    emptyTitle = "No cards to study",
    emptyBody = "There are no cards here yet.",
    errorTitle = "Couldn't load",
    completionTitle = "Session complete",
    completionSubtitle,
    onRestart,
    completionPrimary,
    voiceTestForCard,
    masteryByCard = {},
    sessionId = null,
    enableTutor = true,
  } = props;

  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const [mobileDismissed, setMobileDismissed] = useState(false);

  // Completion once every card has a result this load (state so the user can
  // re-enter from the summary). Gated on `progress.total` rather than
  // `cards.length` — Phase 1B's Learn mode drains `cards` to empty exactly
  // when the LAST card is mastered (working-queue removal), so `cards.length`
  // alone can't distinguish "just finished" from "never had any cards".
  const [completed, setCompleted] = useState(false);
  // `completed` is a one-way latch (see `restart` below), not a pure
  // derivation of progress — it must survive a "Study again" reset where
  // progress itself doesn't change, so a synchronizing effect is correct
  // here, not a render-time derivation.
  useEffect(() => {
    if (progress.total > 0 && progress.done >= progress.total) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompleted(true);
    }
  }, [progress.done, progress.total]);

  // ── Phase 4: "Ask AI" live help ─────────────────────────────────────────
  const current = cards[currentIndex];
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [help, setHelp] = useState<HelpLiveResult | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpAsked, setHelpAsked] = useState(false);
  const cardShownAtRef = useRef<number>(0);
  useEffect(() => {
    cardShownAtRef.current = Date.now();
    setHelp(null);
    setHelpAsked(false);
    setAskOpen(false);
    setQuestion("");
  }, [current?.id]);

  const askAi = async (): Promise<void> => {
    if (!current) return;
    setHelpLoading(true);
    setHelp(null);
    setHelpAsked(true);
    try {
      const recent = buildRecentSessionContext(
        cards,
        resultsByCard,
        masteryByCard,
      );
      const [dueRes, historyRes] = await Promise.all([
        studyService.listDue(FC_CARD_ITEM_TYPE, 200),
        studyService.listAttemptsForItem(FC_CARD_ITEM_TYPE, current.id, 5),
      ]);
      const result = await dispatch(
        helpLive({
          front: current.front,
          back: current.back,
          question: question.trim() || undefined,
          sessionScore:
            progress.done > 0 ? progress.correct / progress.done : null,
          recentCorrect: recent.recentCorrect,
          recentWrong: recent.recentWrong,
          struggledTopics: recent.struggledTopics,
          dueCount: dueRes.data?.length ?? 0,
          timeOnCardMs: Date.now() - cardShownAtRef.current,
          cardHistory: historyRes.data ?? [],
        }),
      );
      setHelp(result);
    } finally {
      setHelpLoading(false);
    }
  };

  // ── Phase 4: end-of-session AI review (fc_review_batch), auto-run once ──
  const [review, setReview] = useState<ReviewSessionResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const reviewFiredRef = useRef(false);
  useEffect(() => {
    if (
      !completed ||
      !sessionId ||
      reviewFiredRef.current ||
      progress.done < MIN_CARDS_FOR_REVIEW
    ) {
      return;
    }
    reviewFiredRef.current = true;
    setReviewLoading(true);
    const attempts = buildReviewAttempts(cards, resultsByCard, masteryByCard);
    const aggregate = buildReviewAggregate(attempts, progress.total);
    void dispatch(reviewSession({ sessionId, attempts, aggregate }))
      .then((result) => setReview(result))
      .finally(() => setReviewLoading(false));
  }, [completed, sessionId]);

  useEffect(() => {
    if (loading || error || cards.length === 0 || completed || isMobile)
      return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (
        !grading &&
        (e.key === "1" || e.key === "2" || e.key === "3")
      ) {
        e.preventDefault();
        const map: Record<string, ReviewResult> = {
          "1": "incorrect",
          "2": "partial",
          "3": "correct",
        };
        void grade(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    loading,
    error,
    cards.length,
    completed,
    grading,
    flip,
    next,
    prev,
    grade,
    isMobile,
  ]);

  const restart = () => {
    setCompleted(false);
    setMobileDismissed(false);
    onRestart?.();
  };

  const handleGrade = (result: ReviewResult): void => {
    if (grading) return;
    const card = current;
    void Promise.resolve(grade(result)).then(() => {
      // Phase 4 stretch: cheap-model per-card micro-coaching. Fire-and-forget
      // (never blocks advancing to the next card) and cleanly no-ops until a
      // fc_micro_coach agent is authored (features/flashcards/data/agents.ts).
      if (!card) return;
      void dispatch(
        microCoach({ front: card.front, back: card.back, result }),
      ).then((tip) => {
        if (tip) toast.info(tip, { duration: 8000 });
      });
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-textured">
        <MatrxMiniLoader />
      </div>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{errorTitle}</p>
          <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        </div>
      </Shell>
    );
  }

  // Checked BEFORE the empty-queue state below: Learn mode drains `cards` to
  // empty exactly when the last card is mastered, so a completed session
  // must win over "no cards" (which only applies when it never started).
  if (completed) {
    const accuracy =
      progress.done > 0
        ? Math.round((progress.correct / progress.done) * 100)
        : 0;
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {completionTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {completionSubtitle ?? `You studied all ${progress.total} cards.`}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center">
            <Stat label="Studied" value={`${progress.done}`} />
            <Stat
              label="Correct"
              value={`${progress.correct}`}
              accent="green"
            />
            <Stat label="Accuracy" value={`${accuracy}%`} />
          </div>

          {(reviewLoading || review) && (
            <div className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5" />
                AI review
              </div>
              {reviewLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reviewing your session…
                </div>
              ) : (
                <p className="text-foreground">{review?.summary}</p>
              )}
            </div>
          )}

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            {onRestart && (
              <Button variant="outline" className="flex-1" onClick={restart}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Study again
              </Button>
            )}
            {completionPrimary && (
              <Button className="flex-1" onClick={completionPrimary.onClick}>
                <completionPrimary.icon className="mr-1.5 h-4 w-4" />
                {completionPrimary.label}
              </Button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (cards.length === 0) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{emptyBody}</p>
        </div>
      </Shell>
    );
  }

  if (isMobile && !mobileDismissed) {
    return (
      <FlashcardMobileView
        mode="study"
        cards={toFlashcardMobileCardsFromStudy(cards)}
        controlledIndex={currentIndex}
        onIndexChange={goTo}
        controlledFlipped={isFlipped}
        onFlipToggle={flip}
        onGrade={handleGrade}
        resultsByIndex={studyResultsByIndex(cards, resultsByCard)}
        grading={grading}
        onClose={() => setMobileDismissed(true)}
      />
    );
  }

  const positionPct =
    cards.length > 0
      ? Math.round(((currentIndex + 1) / cards.length) * 100)
      : 0;

  return (
    <Shell>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            Card {currentIndex + 1} / {cards.length}
          </span>
          <span className="inline-flex items-center gap-3">
            <span>
              {progress.done}/{progress.total} studied
            </span>
            {progress.correct > 0 && (
              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {progress.correct}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${positionPct}%` }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-2xl">
        <FlashcardItem
          key={`fc-card-${current.id}`}
          front={current.front}
          back={current.back}
          index={currentIndex}
          layoutMode="list"
          flipped={isFlipped}
          onFlipToggle={flip}
          lastResult={resultsByCard[current.id] ?? null}
          voiceTest={voiceTestForCard?.(current)}
        />

        <div className="mt-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={prev}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs"
              onClick={next}
              disabled={currentIndex === cards.length - 1}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <FlashcardGradeButtonRow
            onGrade={handleGrade}
            disabled={grading}
            className="w-full"
          />

          {enableTutor && (
            <AskAiPanel
              open={askOpen}
              question={question}
              onQuestionChange={setQuestion}
              onToggle={() => setAskOpen((o) => !o)}
              onAsk={() => void askAi()}
              loading={helpLoading}
              result={help}
              unavailable={helpAsked && !helpLoading && !help}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {cards.map((card, i) => (
            <button
              key={`dot-${card.id}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === currentIndex
                  ? "bg-primary"
                  : resultsByCard[card.id] === "correct"
                    ? "bg-green-500/70"
                    : resultsByCard[card.id]
                      ? "bg-amber-500/70"
                      : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** Phase 4 — the "Ask AI" live-help affordance: a toggle button that expands
 *  into an optional question + the tutor's answer. Shared by every driver
 *  through <StudyDeck/> (classic set study, adaptive due review, weak-area
 *  drill); Fast Fire keeps its own timer-driven variant (FastFireLiveCard). */
function AskAiPanel({
  open,
  question,
  onQuestionChange,
  onToggle,
  onAsk,
  loading,
  result,
  unavailable,
}: {
  open: boolean;
  question: string;
  onQuestionChange: (value: string) => void;
  onToggle: () => void;
  onAsk: () => void;
  loading: boolean;
  result: HelpLiveResult | null;
  unavailable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={onToggle}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <HelpCircle className="h-3.5 w-3.5" />
        )}
        Ask AI for help
      </Button>

      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <Textarea
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder="Optional: what specifically is confusing? (Leave blank for a general hint.)"
            className="min-h-[52px] resize-none text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="self-end gap-1.5 text-xs"
            onClick={onAsk}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GraduationCap className="h-3.5 w-3.5" />
            )}
            Ask
          </Button>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <p>{result.answer}</p>
          {result.followups.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs opacity-80">
              {result.followups.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {unavailable && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          AI help isn&apos;t available right now.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green";
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2">
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "green"
            ? "text-green-600 dark:text-green-400"
            : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** Shared focused-session frame: single scroll area below the shell header. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background">
      <div className="mx-auto max-w-3xl px-2 pb-safe pt-14 sm:px-6">
        {children}
      </div>
    </div>
  );
}
