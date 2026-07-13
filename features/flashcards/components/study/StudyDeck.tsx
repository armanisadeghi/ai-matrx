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
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { CardTrustFooter } from "@/features/education/trust/components/CardTrustFooter";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { RefusalNotice } from "@/features/education/trust/components/RefusalNotice";
import { FlashcardGradeButtonRow } from "./FlashcardGradeButton";
import { FlashcardConfidenceRow } from "./FlashcardConfidenceRow";
import { MatchingCardPlayer } from "./MatchingCardPlayer";
import {
  asConfidence,
  confidenceToResult,
  type Confidence,
} from "@/lib/srs/fsrs";
import {
  asCardKind,
  CARD_KIND,
  matchingPairs,
  studyFaces,
} from "../../utils/cardVariants";
import {
  helpLive,
  type HelpLiveResult,
} from "@/features/education/tutor/lanes/helpLive";
import {
  reviewSession,
  type ReviewSessionResult,
} from "@/features/education/tutor/lanes/reviewSession";
import { microCoach } from "@/features/education/tutor/lanes/microCoach";
import {
  buildRecentSessionContext,
  buildReviewAggregate,
  buildReviewAttempts,
} from "@/features/education/tutor/lanes/learnerContext";
import { AskTutorButton } from "@/features/education/tutor/components/AskTutorButton";

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
  grade: (
    result: ReviewResult,
    extra?: { confidence?: number },
  ) => void | Promise<unknown>;
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
  /**
   * Offer the one-tap 1–5 confidence rating (the default, Brainscape-style) with
   * a toggle down to the simple Again/Partial/Correct row. Set false to force the
   * 3-way row only (e.g. a surface where fine confidence adds no signal). The
   * learner's last choice persists across sessions.
   */
  enableConfidence?: boolean;
}

const GRADE_STYLE_KEY = "fc-grade-style";
type GradeStyle = "confidence" | "simple";

function readGradeStyle(): GradeStyle {
  if (typeof window === "undefined") return "confidence";
  return window.localStorage.getItem(GRADE_STYLE_KEY) === "simple"
    ? "simple"
    : "confidence";
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
    enableConfidence = true,
  } = props;

  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const [mobileDismissed, setMobileDismissed] = useState(false);

  // Grade style — 1–5 confidence (default) vs. the simple 3-way row. Persisted
  // across sessions so a learner's preference sticks. Ignored when the surface
  // disables confidence (`enableConfidence = false` → always simple).
  const [gradeStyle, setGradeStyle] = useState<GradeStyle>(readGradeStyle);
  const useConfidence = enableConfidence && gradeStyle === "confidence";
  const toggleGradeStyle = (): void => {
    setGradeStyle((prev) => {
      const nextStyle: GradeStyle =
        prev === "confidence" ? "simple" : "confidence";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(GRADE_STYLE_KEY, nextStyle);
      }
      return nextStyle;
    });
  };

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
  // Declared here (before keyboard effect) — matching cards skip grade hotkeys.
  const currentKind = asCardKind(current?.card_kind);
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
        currentKind !== CARD_KIND.matching &&
        useConfidence &&
        /^[1-5]$/.test(e.key)
      ) {
        // 1–5 confidence taps — the confidence value drives both the FSRS
        // grade and the coarse result recorded to the ledger.
        e.preventDefault();
        const confidence = asConfidence(Number(e.key));
        if (confidence != null) {
          void handleGrade(confidenceToResult(confidence), confidence);
        }
      } else if (
        !grading &&
        currentKind !== CARD_KIND.matching &&
        !useConfidence &&
        (e.key === "1" || e.key === "2" || e.key === "3")
      ) {
        e.preventDefault();
        const map: Record<string, ReviewResult> = {
          "1": "incorrect",
          "2": "partial",
          "3": "correct",
        };
        void handleGrade(map[e.key]);
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
    useConfidence,
    currentKind,
  ]);

  const restart = () => {
    setCompleted(false);
    setMobileDismissed(false);
    onRestart?.();
  };

  /**
   * Resolves `true` when the grade write went through, `false` when it failed
   * (a reporting driver like useFlashcardStudy resolves null on a failed write
   * and toasts loudly). MatchingCardPlayer consumes the boolean to offer a
   * retry instead of silently latching a lost grade; flip callers may
   * fire-and-forget (`void handleGrade(...)`).
   */
  const handleGrade = (
    result: ReviewResult,
    confidence?: Confidence,
  ): Promise<boolean> => {
    if (grading) return Promise.resolve(false);
    const card = current;
    return Promise.resolve(
      grade(result, confidence != null ? { confidence } : undefined),
    ).then((outcome) => {
      // Void-returning drivers resolve undefined and count as success.
      const ok = outcome !== null;
      // Phase 4 stretch: cheap-model per-card micro-coaching. Fire-and-forget
      // (never blocks advancing to the next card) and cleanly no-ops until a
      // fc_micro_coach agent is authored (features/flashcards/data/agents.ts).
      if (ok && card) {
        void dispatch(
          microCoach({ front: card.front, back: card.back, result }),
        ).then((tip) => {
          if (tip) toast.info(tip, { duration: 8000 });
        });
      }
      return ok;
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

  // Card variant — matching branches to its own player; cloze/basic flip, with
  // cloze rendering its blanked/revealed faces (studyFaces) instead of raw markup.
  const cardFaces = studyFaces(current);

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
        {currentKind === CARD_KIND.matching ? (
          // Matching variant — a tap-to-match mini-game that self-grades on
          // completion through the deck's canonical grade path (no flip, no
          // manual grade row).
          <MatchingCardPlayer
            key={`fc-match-${current.id}`}
            cardId={current.id}
            prompt={current.front}
            pairs={matchingPairs(current)}
            disabled={grading}
            onComplete={(result) => handleGrade(result)}
          />
        ) : (
          <>
            <FlashcardItem
              key={`fc-card-${current.id}`}
              front={cardFaces.front}
              back={cardFaces.back}
              index={currentIndex}
              layoutMode="list"
              flipped={isFlipped}
              onFlipToggle={flip}
              lastResult={resultsByCard[current.id] ?? null}
              voiceTest={voiceTestForCard?.(current)}
            />

            {/* P0 Trust — once the answer is revealed, show where it came from:
                citations (tap → exact passage), the confidence badge, and the
                "Verify against source" action. Renders nothing for hand-made cards. */}
            {isFlipped && (
              <CardTrustFooter
                trust={coerceTrustEnvelope(current.metadata)}
                front={current.front}
                back={current.back ?? ""}
                className="mt-2"
              />
            )}
          </>
        )}

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

          {/* Matching cards self-grade on completion — no manual grade row. */}
          {currentKind === CARD_KIND.matching ? null : useConfidence ? (
            <div className="flex flex-col gap-1">
              <FlashcardConfidenceRow
                onRate={(confidence) =>
                  handleGrade(confidenceToResult(confidence), confidence)
                }
                disabled={grading}
                className="w-full"
              />
              {enableConfidence && (
                <button
                  type="button"
                  onClick={toggleGradeStyle}
                  className="self-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Use simple grading
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <FlashcardGradeButtonRow
                onGrade={handleGrade}
                disabled={grading}
                className="w-full"
              />
              {enableConfidence && (
                <button
                  type="button"
                  onClick={toggleGradeStyle}
                  className="self-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Use 1–5 confidence rating
                </button>
              )}
            </div>
          )}

          {enableTutor && (
            <div className="flex flex-col gap-2">
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
              {/* P2 AskTutor — escalate from the one-shot nudge above into the
                  full memory-carrying tutor, pre-loaded with THIS card. */}
              {current && (
                <AskTutorButton
                  seed={{
                    title: "This flashcard the learner is studying",
                    material: `Front: "${current.front}"\nBack: "${current.back}"${
                      current.topic ? `\nTopic: ${current.topic}` : ""
                    }`,
                  }}
                  label="Open full tutor"
                  variant="ghost"
                  className="w-full"
                />
              )}
            </div>
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

      {result && result.trust?.confidence === "not_in_material" ? (
        <RefusalNotice message={result.answer} />
      ) : (
        result && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {result.trust && (
              <div className="mb-1.5 flex items-center gap-2">
                <ConfidenceBadge confidence={result.trust.confidence} />
              </div>
            )}
            <p>{result.answer}</p>
            {result.followups.length > 0 && (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs opacity-80">
                {result.followups.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {result.trust && result.trust.citations.length > 0 && (
              <div className="mt-1.5">
                <SourceCitations trust={result.trust} label="Sources" />
              </div>
            )}
          </div>
        )
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
