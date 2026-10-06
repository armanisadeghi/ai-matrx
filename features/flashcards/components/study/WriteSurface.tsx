// features/flashcards/components/study/WriteSurface.tsx
//
// Phase 1B (Write mode) — free-typed recall graded against the card's back
// text. Types an answer → auto-graded via normalized Levenshtein similarity
// (features/flashcards/utils/textSimilarity.ts) → the user confirms or
// overrides the suggested grade (Enter accepts it; 1/2/3 pick one), then
// it's recorded through useFlashcardStudy's canonical
// `grade()` with responseKind='typed' + the typed transcript persisted.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Input } from "@ai-matrx/design-system/controls";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFlashcardStudy } from "../../data/useFlashcardStudy";
import { useFlashcardStudySurface } from "./useFlashcardStudySurface";
import { StudyDeckHeader } from "./StudyDeckHeader";
import { gradeTypedAnswer, type TypedGrade } from "../../utils/textSimilarity";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import {
  gradeTypedSemantic,
  type TypedGradeVerdict,
} from "../../data/gradeTypedSemantic";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { ReviewResult } from "../../types";
import CardFaceBlock from "@/components/mardown-display/blocks/flashcards/CardFaceBlock";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { studyFaces } from "../../utils/cardVariants";
import { clampRoundSize, roundSizeChoices } from "../../data/roundSize";
import {
  ROUND_PAGE_CLASS,
  RoundComplete,
  RoundProgress,
  RoundSizeMenu,
} from "./round-controls";

const EDU_BASE = "/education/flashcards";
/** Cards per Write round until the learner picks — typing is slower than
 *  tapping, so a shorter round than Test's. */
export const DEFAULT_WRITE_CARD_COUNT = 10;
const WRITE_CARD_COUNT_SETTING = "userPreferences.flashcard.writeCardCount";

/** The three grades in key order: 1 = Again, 2 = Partial, 3 = Correct. */
const GRADE_ORDER: ReviewResult[] = ["incorrect", "partial", "correct"];

const GRADE_UI: Record<
  ReviewResult,
  {
    verdict: string;
    button: string;
    icon: typeof XCircle;
    banner: string;
    chosen: string;
  }
> = {
  correct: {
    verdict: "Correct",
    button: "Correct",
    icon: CheckCircle2,
    banner:
      "border-green-500/50 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200",
    chosen:
      "border-green-600 bg-green-600 text-white hover:bg-green-600/90 dark:border-green-500 dark:bg-green-600",
  },
  partial: {
    verdict: "Almost",
    button: "Partial",
    icon: AlertCircle,
    banner:
      "border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    chosen:
      "border-amber-500 bg-amber-500 text-white hover:bg-amber-500/90 dark:border-amber-500 dark:bg-amber-600",
  },
  incorrect: {
    verdict: "Not quite",
    button: "Again",
    icon: XCircle,
    banner:
      "border-red-500/50 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
    chosen:
      "border-red-600 bg-red-600 text-white hover:bg-red-600/90 dark:border-red-500 dark:bg-red-600",
  },
};

export function WriteSurface({ setId }: { setId: string }) {
  useFlashcardMandates(["gradeTypedAnswer"]);
  const router = useRouter();

  // The round: a shuffled subset at the learner's saved size (durable user
  // preference), or only the cards missed last round. A new `key` re-deals.
  const [savedCount, setSavedCount] = useSetting<number>(
    WRITE_CARD_COUNT_SETTING,
  );
  // The size is fixed when a round is dealt, so a preference that arrives
  // late never reshuffles the cards under the learner. Any size >= the deck
  // deals every card (pickRound).
  const sizeFor = (saved: unknown): number =>
    clampRoundSize(saved, Number.MAX_SAFE_INTEGER, DEFAULT_WRITE_CARD_COUNT);
  const [round, setRound] = useState<{
    key: number;
    size: number;
    cardIds: string[] | null;
  }>(() => ({ key: 0, size: sizeFor(savedCount), cardIds: null }));

  // The session files under the deck's own organization (see the hook).
  const study = useFlashcardStudy({
    setId,
    withSession: true,
    mode: "write",
    round,
  });
  const title = study.set?.name ?? "Write";
  const deckSize = study.deckSize ?? study.cards.length;
  const current = study.cards[study.currentIndex];
  const faces = current ? studyFaces(current) : null;
  // The LIVE current-card id, for the async verdict guard below. A closure
  // capture is useless there — it would compare the captured id to itself
  // (adversarial finding F1): the ref is what the component sees NOW.
  const currentIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentIdRef.current = current?.id ?? null;
  }, [current?.id]);

  const dispatch = useAppDispatch();
  const [typed, setTyped] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // In write mode the answer shows once the typed answer is submitted.
  useFlashcardStudySurface({ setId, study, mode: "write the answer", backSeen: submitted || study.isFlipped });
  const [autoGrade, setAutoGrade] = useState<TypedGrade | null>(null);
  // WP3 gap 14 — the grade-on-meaning verdict (flashcards.grade_typed_answer
  // mandate). The Levenshtein suggestion shows instantly; this upgrades it.
  const [verdict, setVerdict] = useState<TypedGradeVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  // The chosen grader ran but cannot answer this job (mandate_output_unusable)
  // — said in one muted line, never a block: the spelling suggestion stands.
  const [unusable, setUnusable] = useState<string | null>(null);
  // COPPA, non-blocking by design: the semantic upgrade is fire-and-forget
  // inside the study loop, so an await here would stall every submit. A
  // blocked learner keeps the instant string-distance grade and a full study
  // session — we simply don't call the grader that would be refused.
  const coppa = useAiComplianceGate();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped("");
    setSubmitted(false);
    setAutoGrade(null);
    setVerdict(null);
    setVerdictLoading(false);
    setUnusable(null);
  }, [current?.id]);

  // Derived, not latched: a new round resets the grades, which un-completes it.
  const completed =
    study.progress.total > 0 && study.progress.done >= study.progress.total;
  const missedIds = Object.entries(study.resultsByCard)
    .filter(([, r]) => r !== undefined && r !== "correct")
    .map(([id]) => id);

  const sizeChoices = roundSizeChoices(deckSize);
  // The saved size as this deck deals it (a missed-cards retake is shorter).
  const dealtSize = clampRoundSize(
    savedCount,
    deckSize,
    DEFAULT_WRITE_CARD_COUNT,
  );
  const changeSize = (count: number): void => {
    setSavedCount(count);
    setRound((r) => ({ key: r.key + 1, size: sizeFor(count), cardIds: null }));
  };

  const submitAnswer = (answer: string): void => {
    if (!current || !faces || submitted) return;
    setTyped(answer);
    setAutoGrade(gradeTypedAnswer(answer, faces.back));
    setSubmitted(true);
    // A previous card's late verdict must never survive into this submit
    // (F1): clear before dispatching, and gate the arrival on the LIVE card
    // id via the ref — a closure capture would compare the id to itself.
    setVerdict(null);
    setUnusable(null);

    // Grade on MEANING (gap 14): the mandate-bound grader judges the typed
    // answer semantically; when it lands (1-3s) it replaces the string-distance
    // suggestion. Fire-and-forget — the learner is never blocked, and the
    // live-id guard drops a verdict that arrives after they moved on.
    const cardId = current.id;
    if (answer.trim().length > 0 && !coppa.blocked) {
      setVerdictLoading(true);
      void dispatch(
        gradeTypedSemantic({
          question: faces.front,
          expectedAnswer: faces.back,
          learnerAnswer: answer,
        }),
      ).then((v) => {
        setVerdictLoading(false);
        if (!v || cardId !== currentIdRef.current) return;
        if (v.kind === "verdict") setVerdict(v.verdict);
        else setUnusable(v.sentence);
      });
    }
  };

  const confirmGrade = async (result: ReviewResult): Promise<void> => {
    if (study.grading) return;
    await study.grade(result, {
      responseKind: "typed",
      responseTranscript: typed,
    });
  };

  // The suggestion the learner confirms: the meaning verdict when it landed,
  // else the spelling match.
  const suggested: ReviewResult | null = verdict?.result ?? autoGrade;

  // Keyboard after checking: Enter accepts the suggestion, 1/2/3 pick a grade.
  useEffect(() => {
    if (!submitted) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']",
        )
      ) {
        return;
      }
      if (e.key === "Enter" && suggested) {
        e.preventDefault();
        void confirmGrade(suggested);
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= GRADE_ORDER.length) {
        e.preventDefault();
        void confirmGrade(GRADE_ORDER[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={`Write · ${title}`}
          backHref={`${EDU_BASE}/${setId}`}
          actions={
            <RoundSizeMenu
              dealt={dealtSize}
              deckSize={deckSize}
              choices={sizeChoices}
              noun="Cards"
              onChange={changeSize}
            />
          }
        />
      </PageHeader>
      <div className="h-full overflow-y-auto overscroll-contain bg-textured">
        <div className={ROUND_PAGE_CLASS}>
          {study.loading ? (
            <div className="flex h-64 items-center justify-center">
              <MatrxMiniLoader />
            </div>
          ) : study.error ? (
            // Denied / deleted / never existed / signed-out all read as the
            // same failed load — the gate asks the platform which one it is.
            // Offline, the hook's "this deck isn't downloaded" sentence is the
            // honest one, so it stays as the fault rendering.
            <AccessGate
              token="fc_set"
              id={setId}
              error={study.error}
              renderFault={
                typeof navigator !== "undefined" && navigator.onLine === false
                  ? (fault) => (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-16 text-center">
                        <AlertCircle className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">
                          Couldn&apos;t load this deck
                          <ErrorAlchemyMenu />
                        </p>
                        <p className="max-w-md text-xs text-muted-foreground">
                          {String(fault)}
                        </p>
                      </div>
                    )
                  : undefined
              }
              fallbackHref={EDU_BASE}
              fallbackLabel="Flashcards"
            />
          ) : study.cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No cards yet
              </p>
            </div>
          ) : completed ? (
            <RoundComplete
              title="Round complete"
              correct={study.progress.correct}
              total={study.progress.total}
              missed={missedIds.length}
              deckSize={deckSize}
              sizeChoices={sizeChoices}
              dealt={dealtSize}
              onSizeChange={changeSize}
              onRetake={() =>
                setRound((r) => ({
                  key: r.key + 1,
                  size: sizeFor(savedCount),
                  cardIds: null,
                }))
              }
              onRetakeMissed={() =>
                setRound((r) => ({ ...r, key: r.key + 1, cardIds: missedIds }))
              }
              onBack={() => router.push(`${EDU_BASE}/${setId}`)}
            />
          ) : current && faces ? (
            <>
              <RoundProgress
                position={study.currentIndex + 1}
                total={study.cards.length}
                correct={study.progress.correct}
              />

              <div className="flex min-h-32 flex-col justify-center rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:min-h-48 sm:px-8">
                <CardFaceBlock
                  content={faces.front}
                  size="card"
                  align="center"
                />
              </div>

              {!submitted ? (
                <form
                  className="mt-3 flex flex-col gap-2 sm:mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (typed.trim().length > 0) submitAnswer(typed);
                  }}
                >
                  <Input
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Type the answer"
                    aria-label="Your answer"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="quiet"
                      className="flex-1 sm:flex-none"
                      onClick={() => submitAnswer("")}
                    >
                      Don&apos;t know
                    </Button>
                    <Button
                      iconEnd={<ArrowRight />}
                      variant="primary"
                      type="submit"
                      className="flex-1"
                      disabled={typed.trim().length === 0}
                    >
                      Check
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 flex flex-col gap-3 sm:mt-4">
                  {suggested ? (
                    <Verdict
                      grade={suggested}
                      onMeaning={verdict !== null}
                      reason={verdict?.reason ?? null}
                      pending={verdictLoading}
                    />
                  ) : null}

                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                      Answer
                    </div>
                    <CardFaceBlock content={faces.back} align="start" />
                    <div className="mt-2.5 border-t border-border pt-2.5">
                      <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                        You
                      </div>
                      <p
                        className={cn(
                          "break-words text-sm",
                          typed ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {typed || "—"}
                      </p>
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-3 gap-2"
                    role="group"
                    aria-label="Grade"
                  >
                    {GRADE_ORDER.map((r, i) => {
                      const ui = GRADE_UI[r];
                      const Icon = ui.icon;
                      const isSuggested = suggested === r;
                      return (
                        <Button
                          icon={<Icon />}
                          key={r}
                          type="button"
                          variant="outline"
                          disabled={study.grading}
                          onClick={() => void confirmGrade(r)}
                          aria-keyshortcuts={String(i + 1)}
                          className={cn("min-w-0", isSuggested && ui.chosen)}
                        >
                          <span className="truncate">{ui.button}</span>
                        </Button>
                      );
                    })}
                  </div>

                  {unusable ? (
                    <p className="text-xs text-muted-foreground">
                      Graded on spelling — {unusable}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** The suggested grade as one banner: what it is, and whether it was judged
 *  on meaning (the agent) or on spelling (instant). The learner confirms. */
function Verdict({
  grade,
  onMeaning,
  reason,
  pending,
}: {
  grade: ReviewResult;
  onMeaning: boolean;
  reason: string | null;
  pending: boolean;
}) {
  const ui = GRADE_UI[grade];
  const Icon = ui.icon;
  return (
    <div className={cn("rounded-xl border px-4 py-3", ui.banner)}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" />
        <span className="text-base font-semibold">{ui.verdict}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium opacity-75">
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : onMeaning ? (
            <AGENT_ICON className="h-3 w-3" />
          ) : null}
          {onMeaning ? "By meaning" : pending ? "Checking meaning" : "By spelling"}
        </span>
      </div>
      {reason ? <p className="mt-1 text-sm opacity-90">{reason}</p> : null}
    </div>
  );
}
