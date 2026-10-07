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

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Trophy,
  Award,
  HelpCircle,
  Loader2,
  GraduationCap,
  Expand,
  Flame,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  STUDY_TOOLBAR_ROW,
  STUDY_TOOL_BODY,
  STUDY_TOOL_BUTTON,
  STUDY_TOOL_BUTTON_ACTIVE,
} from "@/features/education/study/components/studyToolbar";
import { Button } from "@/components/ui/button";
import { TextCopySplit } from "@/components/agent-copy/TextCopySplit";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import { getCardImages } from "./cardImages";
import { VoiceTestButton } from "@/features/flashcards/fast-fire/voice-test/VoiceTestButton";
import FlashcardMobileView from "@/components/mardown-display/blocks/flashcards/FlashcardMobileView";
import {
  studyResultsByIndex,
  toFlashcardMobileCardsFromStudy,
} from "@/components/mardown-display/blocks/flashcards/flashcard-mobile-bridge";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { studyService } from "@/features/education/study/service/studyService";
import {
  gameService,
  type EngagementSnapshot,
} from "@/features/education/engage/data/gameService";
import { BADGES, isBadgeKey } from "@/features/education/engage/engine/badges";
import { coppaService } from "@/features/education/compliance/coppaService";
import type { AgeBand } from "@/features/education/compliance/types";
import type {
  ItemMasteryRow,
  SessionAiJournal,
} from "@/features/education/study/types";
import type { CardWithDetails } from "../../data/types";
import type { ReviewResult } from "../../types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { CardTrustFooter } from "@/features/education/trust/components/CardTrustFooter";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { LiveHelpAnswerBlock } from "@/features/education/tutor/components/LiveHelpAnswerBlock";
import { FlashcardGradeButtonRow } from "./FlashcardGradeButton";
import { FlashcardConfidenceRow } from "./FlashcardConfidenceRow";
import { FlashcardStudySidebar } from "./study-deck-parts";
import { MatchingCardPlayer } from "./MatchingCardPlayer";
import { CardAudioHelp } from "./CardAudioHelp";
import {
  DeckMasteryBar,
  MasteryTierPill,
} from "@/features/education/study/components/MasteryDisplay";

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
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { BatchReviewBlock } from "@/features/education/study/components/BatchReviewBlock";
import { useFloatingRunWindow } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import {
  buildRecentSessionContext,
  buildRemainingCardFronts,
  buildReviewAggregate,
  buildReviewAttempts,
} from "@/features/education/tutor/lanes/learnerContext";
import { AskTutorButton } from "@/features/education/tutor/components/AskTutorButton";
import { MemoryAidButton } from "@/features/education/memory/components/MemoryAidButton";
import { CardDetailLayers } from "./CardDetailLayers";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// One-at-a-time on user action — the enhance dialog (its agents, preview flow,
// entitlement chrome) loads only when the learner actually asks to improve a
// card (in-gate lazy, per the code-splitting rules).
const EnhanceSetDialog = lazy(() =>
  import("../set-detail/EnhanceSetDialog").then((m) => ({
    default: m.EnhanceSetDialog,
  })),
);

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
  /**
   * The set the cards belong to. Enables the per-card "Improve this card"
   * affordance (enrich / deepen via EnhanceSetDialog) — omit on cross-set
   * drivers (due review, weak-area drill), where a single owning set doesn't
   * exist and the affordance hides.
   */
  setId?: string | null;
  /** Refetch after an enrich/deepen persisted, so new layers show this session. */
  onCardsChanged?: () => void;
  /** Set false to hide the "Ask AI" affordance even when a help agent is configured. */
  enableTutor?: boolean;
  /**
   * VISION §11 proactive memory aids — an opt-in, per-card "Give me a memory aid"
   * affordance (mnemonic / analogy / association for the current card). Nothing
   * fires until the learner taps it, so it never disrupts the study flow. Set
   * false to hide it entirely.
   */
  enableMemoryAids?: boolean;
  /**
   * Offer the one-tap 1–5 confidence rating (the default, Brainscape-style) with
   * a toggle down to the simple Again/Partial/Correct row. Set false to force the
   * 3-way row only (e.g. a surface where fine confidence adds no signal). The
   * learner's last choice persists across sessions.
   */
  enableConfidence?: boolean;
  /**
   * Progress lives on THIS DEVICE (the public deck page — a guest, or anyone
   * studying a deck they do not own). The deck then makes no per-learner
   * reads (streak/points snapshot, due list, attempt history) and does not
   * fire the unrequested per-grade AI coach; every AI action the learner
   * ASKS for (Ask AI, tutor, memory aid) still goes to the server as usual.
   */
  deviceOnly?: boolean;
  /**
   * Leave the sitting. On a phone the full-screen deck's close button calls
   * this instead of dropping to the desktop layout (a host that opened the
   * deck as a layer closes the layer).
   */
  onExit?: () => void;
}

/**
 * The phone's grade bar is a page-owned bottom dock: publish how far its top
 * sits above the viewport bottom as --page-bottom-dock-h, so the assists
 * launcher rests above it instead of covering the "5" button (the same
 * contract the note editor's dock uses; read by AssistsDock).
 */
function publishBottomDock(el: HTMLDivElement | null): (() => void) | void {
  if (!el || typeof ResizeObserver === "undefined") return;
  const root = document.documentElement;
  const update = () => {
    const fromBottom = window.innerHeight - el.getBoundingClientRect().top;
    root.style.setProperty(
      "--page-bottom-dock-h",
      `${Math.max(0, Math.round(fromBottom + 8))}px`,
    );
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(el);
  return () => {
    observer.disconnect();
    root.style.removeProperty("--page-bottom-dock-h");
  };
}

const GRADE_STYLE_KEY = "fc-grade-style";
type GradeStyle = "confidence" | "simple";

function readGradeStyle(): GradeStyle {
  if (typeof window === "undefined") return "confidence";
  try {
    return window.localStorage.getItem(GRADE_STYLE_KEY) === "simple"
      ? "simple"
      : "confidence";
  } catch {
    return "confidence";
  }
}

export function StudyDeck(props: StudyDeckProps) {
  useFlashcardMandates(["helpLive", "reviewBatch", "microCoach"]);
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
    setId = null,
    onCardsChanged,
    enableTutor = true,
    enableMemoryAids = true,
    enableConfidence = true,
    deviceOnly = false,
    onExit,
  } = props;

  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const [mobileDismissed, setMobileDismissed] = useState(false);

  // Grade style — 1–5 confidence (default) vs. the simple 3-way row. Persisted
  // across sessions so a learner's preference sticks. Ignored when the surface
  // disables confidence (`enableConfidence = false` → always simple).
  const [gradeStyle, setGradeStyle] = useState<GradeStyle>(readGradeStyle);
  const useConfidence = enableConfidence && gradeStyle === "confidence";

  // VISION §2 (WP3 gap 7) — pre-flip confidence: the Brainscape "predict
  // before you peek" signal. In confidence mode the 1–5 row appears BEFORE
  // the flip; rating stores the prediction and reveals the back, then the
  // 3-way row records what actually happened (prediction + result both feed
  // `grade()` → FSRS). Flipping without predicting falls back to grading by
  // confidence post-flip (the pre-gap-7 behavior).
  const [preFlipConfidence, setPreFlipConfidence] = useState<Confidence | null>(
    null,
  );
  const handlePredict = (confidence: Confidence): void => {
    setPreFlipConfidence(confidence);
    if (!isFlipped) flip();
  };
  const chooseGradeStyle = (nextStyle: GradeStyle): void => {
    setGradeStyle(nextStyle);
    try {
      window.localStorage.setItem(GRADE_STYLE_KEY, nextStyle);
    } catch {
      // Private mode / blocked storage: the choice still holds this session.
    }
  };

  // Completion once every card has a result this load (state so the user can
  // re-enter from the summary). Gated on `progress.total` rather than
  // `cards.length` — Phase 1B's Learn mode drains `cards` to empty exactly
  // when the LAST card is mastered (working-queue removal), so `cards.length`
  // alone can't distinguish "just finished" from "never had any cards".
  const [completed, setCompleted] = useState(false);

  // VISION §13 — the streak the session just earned, read once on completion
  // (the DB trigger writes it on session insert, so it already counts today).
  const [engagement, setEngagement] = useState<EngagementSnapshot | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  useEffect(() => {
    // On-device study has no learner record to read a streak or age band from.
    if (!completed || deviceOnly) return undefined;
    let cancelled = false;
    void Promise.all([
      gameService.getEngagementSnapshot(sessionId),
      coppaService.getGate(),
    ]).then(([engagementResult, gateResult]) => {
      if (cancelled) return;
      if (!engagementResult.error) setEngagement(engagementResult.data ?? null);
      if (!gateResult.error) setAgeBand(gateResult.data?.ageBand ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [completed, sessionId, deviceOnly]);
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

  // VISION §11 — is the learner struggling on THIS card right now? Either the
  // spine already flagged it (FSRS lapses across sessions) or they just got it
  // wrong in this session. Drives the proactive memory-aid offer.
  const strugglingOnCurrent = current
    ? (masteryByCard?.[current.id]?.struggle_flag ?? false) ||
      resultsByCard[current.id] === "incorrect"
    : false;
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  // "Improve this card" — the set-level enhance dialog scoped to the card in
  // view. Only offered when the driver knows the owning set (setId).
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  // THE FLOATING LAW: the tutor's answer and the end-of-session review both
  // STREAM in the floating LiveRunWindow — the card the learner is studying
  // never moves, and neither run is ever a bare spinner. (microCoach stays
  // headless on purpose: nothing waits on it, it has no loading state, and its
  // one-line tip arrives as a toast.)
  const helpWindow = useFloatingRunWindow({ instanceId: "fc-help-live" });
  const reviewWindow = useFloatingRunWindow({
    instanceId: "fc-session-review",
  });
  const [help, setHelp] = useState<HelpLiveResult | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpAsked, setHelpAsked] = useState(false);
  const [helpUnusable, setHelpUnusable] = useState<string | null>(null);
  const cardShownAtRef = useRef<number>(0);

  // D151 — the session's AI journal (`study_session.metadata.ai`). The tutor
  // answers and coaching tips this session paid for are written there on
  // arrival by the lanes themselves; reading them back is what makes coming
  // BACK to a card show the answer instead of an empty panel.
  const [journal, setJournal] = useState<SessionAiJournal>({});
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void studyService.getSession(sessionId).then((res) => {
      if (cancelled || !res.data?.session) return;
      setJournal(studyService.readSessionJournal(res.data.session));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /** The newest journalled tutor answer for a card, or null. */
  const storedHelpFor = (cardId: string): HelpLiveResult | null => {
    const rows = journal.helpAnswers ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].cardId !== cardId) continue;
      return {
        answer: rows[i].answer,
        hintLevel: rows[i].hintLevel as HelpLiveResult["hintLevel"],
        followups: rows[i].followups,
        trust: coerceTrustEnvelope(rows[i].trust),
      };
    }
    return null;
  };

  /** The newest journalled coaching tip for a card, or null. */
  const storedTipFor = (cardId: string): string | null => {
    const rows = journal.coachTips ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].cardId === cardId) return rows[i].tip;
    }
    return null;
  };

  useEffect(() => {
    cardShownAtRef.current = Date.now();
    setHelp(null);
    setHelpAsked(false);
    setAskOpen(false);
    setQuestion("");
    setPreFlipConfidence(null);
  }, [current?.id]);

  // What the panel actually shows: this card's live answer, else the one this
  // session already paid for.
  const shownHelp = help ?? (current ? storedHelpFor(current.id) : null);
  const shownTip = current ? storedTipFor(current.id) : null;
  // COPPA. `ensureAllowed()` blocks the EXPLICIT ask (the learner clicked and
  // is waiting); the per-card coach below reads the reactive `blocked` flag
  // instead — an await inside the grade loop would stall advancing to the next
  // card, and a blocked learner should still get their full study session,
  // just without the AI extras.
  const coppa = useAiComplianceGate();

  const askAi = async (): Promise<void> => {
    if (!current) return;
    if (!(await coppa.ensureAllowed())) return;
    setHelpLoading(true);
    setHelp(null);
    setHelpAsked(true);
    setHelpUnusable(null);
    try {
      const recent = buildRecentSessionContext(
        cards,
        resultsByCard,
        masteryByCard,
      );
      // On-device study has no due list or attempt history on the server.
      const [dueRes, historyRes] = deviceOnly
        ? [{ data: null }, { data: null }]
        : await Promise.all([
            studyService.listDue(FC_CARD_ITEM_TYPE, 200),
            studyService.listAttemptsForItem(FC_CARD_ITEM_TYPE, current.id, 5),
          ]);
      // Float FIRST, before the launch — the answer is written in front of the
      // learner, not behind a spinner on the Ask button.
      const live = helpWindow.start("Your tutor is answering");
      const result = await dispatch(
        helpLive({
          onConversationCreated: live.bind,
          front: current.front,
          back: current.back,
          // D151 — the lane journals the answer on arrival against this session.
          cardId: current.id,
          sessionId,
          question: question.trim() || undefined,
          sessionScore:
            progress.done > 0 ? progress.correct / progress.done : null,
          recentCorrect: recent.recentCorrect,
          recentWrong: recent.recentWrong,
          struggledTopics: recent.struggledTopics,
          dueCount: dueRes.data?.length ?? 0,
          timeOnCardMs: Date.now() - cardShownAtRef.current,
          cardHistory: historyRes.data ?? [],
          onUnusable: setHelpUnusable,
        }),
      );
      live.settle("Your tutor could not answer.");
      setHelp(result);
      // Mirror it into the local journal so navigating away and back shows the
      // answer immediately, without a refetch.
      if (result) {
        setJournal((prev) => ({
          ...prev,
          helpAnswers: [
            ...(prev.helpAnswers ?? []),
            {
              cardId: current.id,
              question: question.trim(),
              answer: result.answer,
              hintLevel: result.hintLevel,
              followups: result.followups,
              trust: result.trust,
              at: new Date().toISOString(),
            },
          ],
        }));
      }
    } finally {
      setHelpLoading(false);
    }
  };

  // ── Phase 4: end-of-session AI review (fc_review_batch), auto-run once ──
  const [review, setReview] = useState<ReviewSessionResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const reviewFiredRef = useRef(false);
  // The micro-coach's "cannot answer this job" sentence is said once per session.
  const coachUnusableSaidRef = useRef(false);
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
    const live = reviewWindow.start("Reviewing your session");
    void dispatch(
      reviewSession({
        sessionId,
        attempts,
        aggregate,
        // What the learner never reached (a stopped-early session) — the
        // reviewer can say what is still ahead.
        remainingCards: buildRemainingCardFronts(cards, resultsByCard),
        onConversationCreated: live.bind,
        onUnusable: (sentence) => {
          toast.warning(`Couldn't write your session review — ${sentence}`, {
            duration: 10000,
          });
        },
      }),
    )
      .then((result) => setReview(result))
      .finally(() => {
        live.settle("Your session review could not start.");
        setReviewLoading(false);
      });
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
        // The card itself (FlashcardItem) already flips on Enter/Space when
        // it has focus — firing this global shortcut too would double-toggle
        // and cancel out, so Enter would silently appear to do nothing.
        // Only step in here when focus is elsewhere (e.g. after tabbing to
        // a grade button, or when nothing on the card is focused).
        if (target?.closest("[data-flashcard-card]")) return;
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
        !isFlipped &&
        /^[1-5]$/.test(e.key)
      ) {
        // Pre-flip 1–5 = the prediction (gap 7): store it and reveal the back.
        e.preventDefault();
        const confidence = asConfidence(Number(e.key));
        if (confidence != null) handlePredict(confidence);
      } else if (
        !grading &&
        currentKind !== CARD_KIND.matching &&
        useConfidence &&
        isFlipped &&
        preFlipConfidence != null &&
        /^[1-3]$/.test(e.key)
      ) {
        // Post-flip with a prediction on record: 1–3 grades the outcome.
        e.preventDefault();
        const map: Record<string, ReviewResult> = {
          "1": "incorrect",
          "2": "partial",
          "3": "correct",
        };
        void handleGrade(map[e.key], preFlipConfidence);
      } else if (
        !grading &&
        currentKind !== CARD_KIND.matching &&
        useConfidence &&
        isFlipped &&
        preFlipConfidence == null &&
        /^[1-5]$/.test(e.key)
      ) {
        // Flipped without predicting — 1–5 grades by confidence directly.
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
    isFlipped,
    preFlipConfidence,
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
      // (never blocks advancing to the next card); resolves through the
      // flashcards.micro_coach mandate (features/flashcards/data/mandates.ts).
      // Not on device-only study: the coach is unrequested AI on every grade.
      if (ok && card && !coppa.blocked && !deviceOnly) {
        void dispatch(
          microCoach({
            front: card.front,
            back: card.back,
            result,
            // D151 — the tip is journalled on the session by the lane itself,
            // so it survives the card advance that the toast never did.
            cardId: card.id,
            sessionId,
          }),
        ).then((outcome) => {
          if (!outcome) return;
          if (outcome.kind === "unusable") {
            // Said ONCE per session — this lane fires on every card, and the
            // chosen coach will not change mid-session.
            if (coachUnusableSaidRef.current) return;
            coachUnusableSaidRef.current = true;
            toast.warning(`Couldn't coach this card — ${outcome.sentence}`, { duration: 10000 });
            return;
          }
          const tip = outcome.tip;
          toast.info(tip, { duration: 8000 });
          setJournal((prev) => ({
            ...prev,
            coachTips: [
              ...(prev.coachTips ?? []),
              {
                cardId: card.id,
                result,
                tip,
                at: new Date().toISOString(),
              },
            ],
          }));
        });
      }
      return ok;
    });
  };

  // ── Shared pieces (desktop + phone render the SAME controls) ──────────────

  /** ONE caption slot over ONE 44px row, whichever grading style is on. */
  const gradeCaption = !useConfidence
    ? "How did it go?"
    : !isFlipped
      ? "How well do you know it?"
      : preFlipConfidence != null
        ? `Predicted ${preFlipConfidence}/5 · How did it go?`
        : "How well did you know it?";

  const renderGradeControl = (): ReactNode =>
    currentKind === CARD_KIND.matching ? null : (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {gradeCaption}
        </span>
        {useConfidence ? (
          !isFlipped ? (
            // Predict BEFORE the flip (gap 7): rating reveals the back and the
            // prediction rides along to the final grade.
            <FlashcardConfidenceRow
              onRate={handlePredict}
              disabled={grading}
              label={null}
              className="w-full"
            />
          ) : preFlipConfidence != null ? (
            // The answer is showing and a prediction exists: record the outcome.
            <FlashcardGradeButtonRow
              size="large"
              onGrade={(r) => void handleGrade(r, preFlipConfidence)}
              disabled={grading}
              className="w-full"
            />
          ) : (
            // Flipped without predicting — grade by confidence directly.
            <FlashcardConfidenceRow
              onRate={(confidence) =>
                void handleGrade(confidenceToResult(confidence), confidence)
              }
              disabled={grading}
              label={null}
              className="w-full"
            />
          )
        ) : (
          <FlashcardGradeButtonRow
            size="large"
            onGrade={(r) => void handleGrade(r)}
            disabled={grading}
            className="w-full"
          />
        )}
      </div>
    );

  /** Grading style + the keyboard map — one quiet menu, not a text link. */
  const renderOptionsMenu = (): ReactNode =>
    enableConfidence ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={<SlidersHorizontal />}
            type="button"
            variant="quiet"
            className={STUDY_TOOL_BUTTON}
            title="Study options"
            aria-label="Study options"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Grading
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={gradeStyle}
            onValueChange={(value) =>
              chooseGradeStyle(value === "simple" ? "simple" : "confidence")
            }
          >
            <DropdownMenuRadioItem value="confidence">
              1–5 confidence
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="simple">
              Again · Partial · Correct
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {!isMobile && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                Space flip · ← → move · {useConfidence ? "1–5" : "1–3"} grade
              </DropdownMenuLabel>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  /**
   * The card's whole toolbox as ONE wrapping row of compact tools; each tool's
   * expanded body drops onto its own line beneath the row (studyToolbar.ts).
   */
  const renderToolRow = (card: CardWithDetails): ReactNode => {
    const isMatching = currentKind === CARD_KIND.matching;
    const voiceTest = voiceTestForCard?.(card);
    return (
      <div className={STUDY_TOOLBAR_ROW}>
        {/* 🚨 The enrichment the learner already paid for, RENDERED, plus the
            in-place "explain more" that adds to it. Closed by default so it
            never spoils the answer. */}
        <CardDetailLayers
          key={`layers-${card.id}`}
          card={card}
          canEnrich={Boolean(setId)}
          onEnriched={() => onCardsChanged?.()}
          variant="toolbar"
        />

        {/* VISION §2/§4 — audio help is always on the table: hear the card or
            talk it through with the realtime voice tutor. Matching cards skip
            it (no single question/answer to narrate). */}
        {!isMatching && (
          <CardAudioHelp
            key={`audio-${card.id}`}
            cardId={card.id}
            front={card.front}
            back={card.back ?? ""}
            topic={card.topic}
            revealed={isFlipped}
            variant="toolbar"
            spokenFrontFileId={
              voiceTest?.spokenFrontFileId ??
              card.details?.find(
                (d) => d.kind === "spoken_front" && d.audio_file_id,
              )?.audio_file_id ??
              null
            }
          />
        )}

        {/* The phone's card has no corner mic, so the voice quiz sits here. */}
        {isMobile && voiceTest && card.back != null && (
          <VoiceTestButton
            card={{ id: voiceTest.cardId, front: card.front, back: card.back }}
            spokenFrontFileId={voiceTest.spokenFrontFileId}
            label="Quiz me"
            variant="ghost"
            className={STUDY_TOOL_BUTTON}
          />
        )}

        {enableTutor && (
          <>
            <AskAiPanel
              open={askOpen}
              question={question}
              onQuestionChange={setQuestion}
              onToggle={() => setAskOpen((o) => !o)}
              onAsk={() => void askAi()}
              loading={helpLoading}
              result={shownHelp}
              tip={shownTip}
              unavailable={helpAsked && !helpLoading && !help}
              unavailableReason={helpUnusable}
            />
            {/* P2 AskTutor — escalate into the full memory-carrying tutor,
                pre-loaded with THIS card. */}
            <AskTutorButton
              seed={{
                title: "This flashcard the learner is studying",
                material: `Front: "${card.front}"\nBack: "${card.back}"${
                  card.topic ? `\nTopic: ${card.topic}` : ""
                }`,
              }}
              label="Tutor"
              variant="ghost"
              className={STUDY_TOOL_BUTTON}
            />
          </>
        )}

        <coppa.Gate />

        {/* VISION §11 — a stored aid renders on sight, and a struggling card
            gets a reasoned offer instead of a quiet button. */}
        {enableMemoryAids && !isMatching && (
          <MemoryAidButton
            key={`memory-${card.id}`}
            cardId={card.id}
            front={card.front}
            back={card.back ?? ""}
            topic={card.topic}
            existingDetails={card.details}
            struggling={strugglingOnCurrent}
            variant="toolbar"
          />
        )}

        {/* VISION §1 — deepen THIS card without leaving the session. Only when
            the driver knows the owning set (cross-set drivers omit setId). */}
        {setId && (
          <Button
            icon={<Expand />}
            type="button"
            variant="quiet"
            className={cn(STUDY_TOOL_BUTTON, enhanceOpen && STUDY_TOOL_BUTTON_ACTIVE)}
            onClick={() => setEnhanceOpen(true)}
            title="Split into sub-cards"
            aria-label="Split into sub-cards"
          >
            Split
          </Button>
        )}

        {/* The split Copy: one click copies this card (front then back) as markdown, the chevron offers plain. */}
        <TextCopySplit
          size="xs"
          label="Copy card"
          text={() => `**Front**\n\n${card.front}\n\n**Back**\n\n${card.back ?? ""}`}
        />

        {renderOptionsMenu()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-textured">
        <MatrxMiniLoader />
      </div>
    );
  }

  // A set-scoped driver (study / learn) failed to open ITS set: denied,
  // deleted, never existed, or signed out all read as the same failed load, so
  // the access gate asks the platform which one it is. Cross-set drivers (due
  // review, weak-area drill) omit setId and keep the plain error below. The one
  // honest sentence the gate cannot say — "you're offline and this deck isn't
  // downloaded" — stays as the fault rendering while the device is offline.
  if (error && setId) {
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <Shell>
        <AccessGate
          token="fc_set"
          id={setId}
          error={error}
          renderFault={
            offline
              ? (fault) => (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {errorTitle}
                    </p>
                    <p className="max-w-md text-xs text-muted-foreground">
                      {String(fault)}
                    </p>
                  </div>
                )
              : undefined
          }
          fallbackHref="/education/flashcards"
          fallbackLabel="Flashcards"
        />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{errorTitle} <ErrorAlchemyMenu /></p>
          <p className="max-w-md text-xs text-muted-foreground">{error} <ErrorAlchemyMenu /></p>
        </div>
      </Shell>
    );
  }

  // Checked BEFORE the empty-queue state below: Learn mode drains `cards` to
  // empty exactly when the last card is mastered, so a completed session
  // must win over "no cards" (which only applies when it never started).
  if (completed) {
    const isYoungerLearner = ageBand === "under_13";
    const accuracy =
      progress.done > 0
        ? Math.round((progress.correct / progress.done) * 100)
        : 0;
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {completionTitle}
            </h2>
            {/* The stats row below already says how many — no default line. */}
            {completionSubtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {completionSubtitle}
              </p>
            )}
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

          {/* VISION §13 — the session that EARNS the streak says so. The row is
              written by the education.bump_study_streak() trigger on session
              insert, so by completion it already counts this session. Healthy
              by design: it celebrates, it never guilts. */}
          {engagement && engagement.current_streak > 0 && (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
              <Flame className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-medium text-foreground">
                {engagement.current_streak} day
                {engagement.current_streak === 1 ? "" : "s"} in a row
              </span>
              {engagement.longest_streak > engagement.current_streak && (
                <span className="text-muted-foreground">
                  · best {engagement.longest_streak}
                </span>
              )}
            </div>
          )}

          {engagement && (
            <div className="grid w-full grid-cols-2 gap-2 text-left text-xs">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                  <Trophy className="h-3.5 w-3.5 text-primary" />
                  {engagement.session_points.toLocaleString()}{" "}
                  {isYoungerLearner ? "bright points!" : "learning points"}
                </div>
                <p className="text-muted-foreground">
                  {isYoungerLearner ? "Nice work!" : "This session"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                  <Award className="h-3.5 w-3.5 text-primary" />
                  {engagement.badges_earned}{" "}
                  {isYoungerLearner ? "sticker" : "badge"}
                  {engagement.badges_earned === 1 ? "" : "s"}
                </div>
                {isBadgeKey(engagement.next_badge_key) &&
                engagement.next_badge_target > 0 ? (
                  <p className="text-muted-foreground">
                    {isYoungerLearner
                      ? "Next sticker"
                      : BADGES[engagement.next_badge_key].label}
                    : {engagement.next_badge_progress}/
                    {engagement.next_badge_target}
                  </p>
                ) : (
                  <p className="text-muted-foreground">All earned</p>
                )}
              </div>
              {/* Leagues are opt-in: the tile shows only for someone in one. */}
              {engagement.league_opted_in && engagement.league_rank > 0 && (
                <div className="col-span-2 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="font-medium text-foreground">
                    {isYoungerLearner ? "Your learning team" : "Private league"}
                    : #{engagement.league_rank} of {engagement.league_size} · +
                    {Number(engagement.league_mastery_gain).toFixed(1)} mastery
                  </p>
                </div>
              )}
            </div>
          )}

          {/* The settled review renders through the kind's component — the
              same `batch_review` the floating window streamed. A summary-only
              paragraph here used to drop strengths, weaknesses and the score. */}
          {reviewLoading && !review && (
            <div className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reviewing your session…
            </div>
          )}
          {review && <BatchReviewBlock review={review} />}

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            {onRestart && (
              <Button icon={<RotateCcw />} variant="outline" className="flex-1" onClick={restart}>
                Study again
              </Button>
            )}
            {completionPrimary && (
              <Button variant="primary" className="flex-1" onClick={completionPrimary.onClick}>
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
    // IC-4 parity — the phone gets the SAME affordances as desktop, rendered
    // by the same canonical components, injected into the mobile deck's slots
    // (never re-implemented inside FlashcardMobileView).
    // Grade controls: the identical caption + row the desktop renders, on a
    // real themed surface so semantic tokens read over the dark deck.
    const mobileBottomBar =
      currentKind === CARD_KIND.matching ? null : (
        <div
          ref={publishBottomDock}
          className="rounded-2xl border border-border bg-background p-2 shadow-xl"
        >
          {renderGradeControl()}
        </div>
      );

    // The card's full toolbox (same tool row as desktop) plus the mastery
    // list — IC-4 §4: the desktop rail's phone form is this drawer.
    const mobileTools = current ? (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-2.5">
        {isFlipped && (
          <CardTrustFooter
            trust={coerceTrustEnvelope(current.metadata)}
            front={current.front}
            back={current.back ?? ""}
            cardId={current.id}
            cardMetadata={current.metadata}
          />
        )}

        {renderToolRow(current)}

        {Object.keys(masteryByCard).length > 0 && (
          <DeckMasteryBar
            masteries={cards.map((c) => masteryByCard[c.id])}
            className="px-1"
          />
        )}

        <div className="flex max-h-[38dvh] flex-col overflow-hidden rounded-lg border border-border">
          <FlashcardStudySidebar
            cards={cards}
            currentIndex={currentIndex}
            resultsByCard={resultsByCard}
            masteryByCard={masteryByCard}
            onGoTo={goTo}
          />
        </div>
      </div>
    ) : null;

    // The revealed answer's sources — the SAME strip desktop shows under the
    // card, so a citation is reachable on a phone without opening the drawer.
    const mobileTrust = current ? coerceTrustEnvelope(current.metadata) : null;
    const mobileSources =
      isFlipped && mobileTrust && (mobileTrust.citations ?? []).length > 0 ? (
        <div className="rounded-2xl border border-border bg-background p-2 shadow-xl">
          <SourceCitations trust={mobileTrust} />
        </div>
      ) : null;

    return (
      <>
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
          onClose={() => (onExit ? onExit() : setMobileDismissed(true))}
          bottomBar={mobileBottomBar}
          toolsPanel={mobileTools}
          answerStrip={mobileSources}
        />
        {/* Same canonical enhance flow as desktop — mounted on first open. */}
        {setId && current && enhanceOpen && (
          <Suspense fallback={null}>
            <EnhanceSetDialog
              open={enhanceOpen}
              onOpenChange={setEnhanceOpen}
              setId={setId}
              cards={[current]}
              modes={["deepen"]}
              onChanged={() => onCardsChanged?.()}
            />
          </Suspense>
        )}
      </>
    );
  }

  const sessionPct =
    progress.total > 0
      ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100)
      : 0;
  const hasMastery = Object.keys(masteryByCard).length > 0;
  // Deck mastery on the canonical tier scale — what the grades DO, visible
  // while studying. Self-hides when no mastery loaded.
  const deckMastery = (className: string): ReactNode =>
    hasMastery ? (
      <DeckMasteryBar
        masteries={cards.map((c) => masteryByCard[c.id])}
        className={className}
      />
    ) : null;

  // Card variant — matching branches to its own player; cloze/basic flip, with
  // cloze rendering its blanked/revealed faces (studyFaces) instead of raw markup.
  const cardFaces = studyFaces(current);

  return (
    <Shell>
      {/* ONE status strip: this session's progress bar, then position + the
          card's tier. (Two stacked bars with two different "studied" counts
          used to sit here; deck mastery now heads the card list.) */}
      <div className="mb-3 flex flex-col gap-2">
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          title={`${progress.done} of ${progress.total} graded`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${sessionPct}%` }}
          />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="font-medium tabular-nums text-foreground">
              {currentIndex + 1} / {cards.length}
            </span>
            {/* VISION §16 — the current card's real mastery standing. */}
            {current && masteryByCard[current.id] !== undefined && (
              <MasteryTierPill mastery={masteryByCard[current.id]} />
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-3">
            {progress.correct > 0 && (
              <span
                className="inline-flex items-center gap-1 tabular-nums text-green-600 dark:text-green-400"
                title="Correct this session"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {progress.correct}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-start justify-center gap-4">
        {/* VISION §16 (WP3 gap 9) — the mastery sidebar beside the deck on
            wide screens; the same component the study window panel mounts. */}
        <aside className="sticky top-[calc(var(--shell-header-h)+0.75rem)] hidden w-60 shrink-0 xl:block">
          <div className="flex max-h-[70dvh] flex-col overflow-hidden rounded-lg border border-border bg-card px-1 py-1">
            {deckMastery("border-b border-border px-2 pb-2 pt-1.5")}
            <FlashcardStudySidebar
              cards={cards}
              currentIndex={currentIndex}
              resultsByCard={resultsByCard}
              masteryByCard={masteryByCard}
              onGoTo={goTo}
            />
          </div>
        </aside>

        <div className="min-w-0 max-w-2xl flex-1 lg:max-w-3xl xl:max-w-4xl">
          {currentKind === CARD_KIND.matching ? (
            // Matching variant — a tap-to-match mini-game that self-grades on
            // completion through the deck's canonical grade path.
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
              {/* The card face is a selection surface: dragging across its text gets the one selection toolbar (Copy first). */}
              <NonEditableContextMenu sourceFeature="system">
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
                frontImage={getCardImages(current).front}
                backImage={getCardImages(current).back}
                heightClassName="h-[clamp(15rem,46dvh,32rem)]"
              />
              </NonEditableContextMenu>

              {/* P0 Trust — once the answer is revealed, show where it came
                  from. Renders nothing for hand-made cards. */}
              {isFlipped && (
                <CardTrustFooter
                  trust={coerceTrustEnvelope(current.metadata)}
                  front={current.front}
                  back={current.back ?? ""}
                  cardId={current.id}
                  cardMetadata={current.metadata}
                  className="mt-2"
                />
              )}
            </>
          )}

          {/* THE action bar: previous · grade · next, one 44px line (on a
              narrow screen the grade row takes the full width, arrows below). */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2 sm:flex-nowrap">
            <Button
              icon={<ChevronLeft />}
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={prev}
              disabled={currentIndex === 0}
              aria-label="Previous card"
              title="Previous (←)"
            />
            <div className="order-first min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
              {currentKind === CARD_KIND.matching ? (
                // Matching cards self-grade on completion — no grade row.
                <div className="hidden h-11 sm:block" />
              ) : (
                renderGradeControl()
              )}
            </div>
            <Button
              icon={<ChevronRight />}
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={next}
              disabled={currentIndex === cards.length - 1}
              aria-label="Next card"
              title="Next (→)"
            />
          </div>

          {current && <div className="mt-3">{renderToolRow(current)}</div>}

          {/* Below xl the sidebar is hidden — deck mastery and the dot strip
              are its stand-in. */}
          {deckMastery("mt-5 xl:hidden")}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 xl:hidden">
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
      </div>

      {/* The canonical enhance flow (enrich layers / deepen into sub-cards),
          scoped to the card in view — the SAME dialog set detail mounts, so
          previews, entitlement metering, and pending-enhancement durability
          are one implementation. Mounted only after the first open. */}
      {setId && current && enhanceOpen && (
        <Suspense fallback={null}>
          <EnhanceSetDialog
            open={enhanceOpen}
            onOpenChange={setEnhanceOpen}
            setId={setId}
            cards={[current]}
            modes={["deepen"]}
            onChanged={() => onCardsChanged?.()}
          />
        </Suspense>
      )}
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
  tip,
  unavailable,
  unavailableReason,
}: {
  open: boolean;
  question: string;
  onQuestionChange: (value: string) => void;
  onToggle: () => void;
  onAsk: () => void;
  loading: boolean;
  result: HelpLiveResult | null;
  /** The coaching tip this session already produced for this card (D151). */
  tip: string | null;
  unavailable: boolean;
  /** The chosen tutor ran but cannot answer this job — the plain sentence. */
  unavailableReason?: string | null;
}) {
  // Toolbar shape (studyToolbar.ts): the trigger joins the host's tool row,
  // every body drops onto its own line beneath it.
  return (
    <div className="contents">
      <Button
        icon={loading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <HelpCircle />
        )}
        type="button"
        variant="quiet"
        className={cn(STUDY_TOOL_BUTTON, open && STUDY_TOOL_BUTTON_ACTIVE)}
        onClick={onToggle}
        aria-expanded={open}
        title="Ask AI for help with this card"
      >
        Ask AI
      </Button>

      {open && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5",
            STUDY_TOOL_BODY,
          )}
        >
          <ProTextarea
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder="What's confusing? (optional)"
            className="min-h-[52px] resize-none text-xs"
          />
          <Button
            icon={loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <GraduationCap />
            )}
            variant="primary"
            type="button"
            className="self-end"
            onClick={onAsk}
            disabled={loading}
          >
            Ask
          </Button>
        </div>
      )}

      {/* The `live_help_answer` kind component — answer, hint level,
          followups, citations; refusal-gated inside. */}
      {result && (
        <div className={STUDY_TOOL_BODY}>
          <LiveHelpAnswerBlock result={result} />
        </div>
      )}
      {/* D151 — the per-card coaching tip this session paid for stays with
          its card. */}
      {tip && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
            STUDY_TOOL_BODY,
          )}
        >
          <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground">{tip}</span>
        </div>
      )}
      {unavailable && (
        <div
          className={cn(
            "rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
            STUDY_TOOL_BODY,
          )}
        >
          {unavailableReason
            ? `Couldn't get help — ${unavailableReason}`
            : "AI help isn't available right now."}
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

/** Shared focused-session frame: single scroll area below the shell header.
 *  Widths scale with the viewport — a laptop has the room, so the card gets
 *  it (the old `max-w-3xl` left the deck floating small in the middle of a
 *  wide screen). */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background">
      <div className="matrx-touch-targets mx-auto max-w-3xl px-3 pb-safe pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6 sm:pb-8 lg:max-w-4xl xl:max-w-5xl">
        {children}
      </div>
    </div>
  );
}
