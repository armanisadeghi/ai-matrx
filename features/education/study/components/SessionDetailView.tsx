"use client";

// features/education/study/components/SessionDetailView.tsx
//
// Mode-agnostic study-session DETAIL: the session header + aggregate, the
// full-session recording, the holistic review, and the per-attempt ledger (the
// question, its correct answer, the learner's transcribed response, result,
// score, and response audio playback). Loads via studyService.getSession. An
// optional `labelResolver` lets a mode (e.g. flashcards) supply the human
// question/answer text for item_ids (e.g. the card front/back) without coupling
// this generic component to that mode's content service.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Radio,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import type { SessionWithAttempts, StudyAttemptRow } from "../types";
import { SessionAudio } from "./SessionAudio";
import { CoachReviewPanel } from "./CoachReviewPanel";
import { AbandonedSessionRestart } from "./AbandonedSessionRestart";
import { SessionScorecard } from "./SessionScorecard";
import { ScoreOverrideDialog } from "./ScoreOverrideDialog";
import {
  isAwaitingCoachReview,
  parseSessionReview,
} from "../utils/parseSessionReview";
import { readGradeScore } from "../utils/gradeScore";

const MODE_LABEL: Record<string, string> = {
  fast_fire: "Fast Fire",
  classic_review: "Study",
  flashcards: "Study",
  quiz: "Quiz",
  practice_test: "Practice Test",
  adaptive: "Adaptive",
};

const RESULT_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    classes: "text-green-600 dark:text-green-400",
  },
  partial: {
    label: "Partial",
    icon: AlertTriangle,
    classes: "text-amber-600 dark:text-amber-400",
  },
  incorrect: {
    label: "Missed",
    icon: XCircle,
    classes: "text-red-600 dark:text-red-400",
  },
};

/** Bold, color-coded badge classes for the score pill — score is the headline metric. */
function scoreBadgeClasses(pct: number): string {
  if (pct >= 80) {
    return "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300";
  }
  if (pct >= 50) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
  }
  return "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300";
}

const EXPLANATION_TRUNCATE_LENGTH = 280;

/** Human-readable question + correct-answer text for one item_id, supplied by the mode adapter. */
export interface ItemLabel {
  question: string;
  answer?: string;
}

export function SessionDetailView({
  sessionId,
  backHref,
  labelResolver,
}: {
  sessionId: string;
  backHref?: string;
  labelResolver?: (
    data: SessionWithAttempts,
  ) => Promise<Record<string, ItemLabel>>;
}) {
  const router = useRouter();
  const [data, setData] = useState<SessionWithAttempts | null>(null);
  const [labels, setLabels] = useState<Record<string, ItemLabel>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await studyService.getSession(sessionId);
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error ?? "Session not found");
        setData(null);
        setLoading(false);
        return;
      }
      setData(res.data);
      setError(null);
      setLoading(false);
      if (labelResolver) {
        try {
          const resolved = await labelResolver(res.data);
          if (!cancelled) setLabels(resolved);
        } catch {
          /* labels are a nicety — never block the view */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, labelResolver]);

  // FastFire's holistic review is fire-and-forget after complete — if the learner
  // opens this page before the agent finishes, poll until session_review lands.
  useEffect(() => {
    if (!data?.session) return undefined;
    const { session } = data;
    if (
      !isAwaitingCoachReview(
        session.mode,
        session.status,
        session.session_review,
      )
    ) {
      return undefined;
    }

    let cancelled = false;
    const poll = async (): Promise<void> => {
      const res = await studyService.getSession(sessionId);
      if (cancelled || !res.data) return;
      setData(res.data);
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 3000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [
    sessionId,
    data?.session?.id,
    data?.session?.mode,
    data?.session?.status,
    data?.session?.session_review,
  ]);

  // Patches one attempt in place after a manual score override — the
  // ledger row it came from (study_override_attempt) is already durable;
  // this just reflects it without a full session refetch.
  const handleAttemptOverridden = (updated: StudyAttemptRow) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            attempts: prev.attempts.map((a) =>
              a.id === updated.id ? updated : a,
            ),
          }
        : prev,
    );
  };

  const session = data?.session;
  const modeLabel = session?.mode
    ? (MODE_LABEL[session.mode] ?? session.mode.replace(/_/g, " "))
    : "Session";
  const coachReview = parseSessionReview(session?.session_review);
  const coachReviewPending = isAwaitingCoachReview(
    session?.mode,
    session?.status,
    session?.session_review,
  );

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        {loading ? (
          <>
            <Skeleton className="h-16 w-full rounded-xl" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </>
        ) : error || !session ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">
              Couldn&apos;t load this session
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {error ?? "It may have been deleted."}
            </p>
          </div>
        ) : session.status === "abandoned" ? (
          <>
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-foreground">
                {modeLabel} session
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {session.created_at
                  ? new Date(session.created_at).toLocaleString()
                  : ""}
                {" · "}
                <span className="capitalize">Abandoned</span>
              </p>
            </div>
            <AbandonedSessionRestart
              session={session}
              listHref={backHref ?? "/education/flashcards/sessions"}
            />
          </>
        ) : (
          <>
            {/* Header */}
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-foreground">
                {modeLabel} session
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {session.created_at
                  ? new Date(session.created_at).toLocaleString()
                  : ""}
                {" · "}
                {data.attempts.length}{" "}
                {data.attempts.length === 1 ? "answer" : "answers"}
                {" · "}
                <span className="capitalize">
                  {session.status ?? "unknown"}
                </span>
              </p>
            </div>

            {/* Scorecard — gamified rollup of the attempt ledger */}
            <SessionScorecard session={session} attempts={data.attempts} />

            {/* Full-session recording */}
            {session.session_audio_file_id && (
              <section className="mb-4 rounded-xl border border-border bg-card p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Radio className="h-4 w-4 text-primary" />
                  Full session recording
                </div>
                <SessionAudio fileId={session.session_audio_file_id} />
              </section>
            )}

            {/* Holistic review */}
            <CoachReviewPanel
              review={coachReview}
              pending={coachReviewPending}
            />

            {/* Attempt ledger */}
            <h2 className="mb-2 text-sm font-medium text-foreground">
              Answers
            </h2>
            {data.attempts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-xs text-muted-foreground">
                No answers were recorded in this session.
              </div>
            ) : (
              <ol className="space-y-2">
                {data.attempts.map((a, i) => (
                  <AttemptRow
                    key={a.id}
                    attempt={a}
                    index={i}
                    label={labels[a.item_id]}
                    onOverridden={handleAttemptOverridden}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Originally X" hint for the edited badge's tooltip — the audit trail a parent can check. */
function originalGradeHint(attempt: StudyAttemptRow): string | undefined {
  if (!attempt.is_manually_edited) return undefined;
  const originalMeta = attempt.original_result
    ? RESULT_META[attempt.original_result]
    : null;
  const originalPct =
    attempt.original_score_value != null
      ? Math.round(Number(attempt.original_score_value) * 100)
      : null;
  const parts = [
    originalMeta?.label,
    originalPct != null ? `${originalPct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return parts ? `Originally graded: ${parts}` : "Manually edited";
}

function AttemptRow({
  attempt,
  index,
  label,
  onOverridden,
}: {
  attempt: StudyAttemptRow;
  index: number;
  label?: ItemLabel;
  onOverridden: (updated: StudyAttemptRow) => void;
}) {
  const meta = attempt.result ? RESULT_META[attempt.result] : null;
  const extras = readGradeScore(attempt.score);
  const scorePct =
    attempt.score_value != null
      ? Math.round(Number(attempt.score_value) * 100)
      : null;
  const [explanationExpanded, setExplanationExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const feedback = extras.feedback;
  const feedbackIsLong =
    !!feedback && feedback.length > EXPLANATION_TRUNCATE_LENGTH;
  const feedbackShown =
    feedback && feedbackIsLong && !explanationExpanded
      ? `${feedback.slice(0, EXPLANATION_TRUNCATE_LENGTH).trimEnd()}…`
      : feedback;

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header bar: item index, result, and score — visually separated from the content below */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            Item {index + 1}
          </span>
          {attempt.is_manually_edited && (
            <span
              className="text-[11px] italic text-muted-foreground"
              title={originalGradeHint(attempt)}
            >
              (edited)
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meta && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium",
                meta.classes,
              )}
            >
              <meta.icon className="h-4 w-4" />
              {meta.label}
            </span>
          )}
          {scorePct != null && (
            <span
              className={cn(
                "inline-flex min-w-[3.25rem] items-center justify-center rounded-lg px-2.5 py-1 text-base font-bold tabular-nums shadow-sm",
                scoreBadgeClasses(scorePct),
              )}
            >
              {scorePct}%
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setEditOpen(true)}
            aria-label="Edit your score"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScoreOverrideDialog
        attempt={attempt}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={({ attempt: updated }) => onOverridden(updated)}
      />

      {/* Each section is its own row, separated by dividers instead of floating spacing */}
      <div className="divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Question
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {label?.question ?? `Item ${index + 1}`}
          </p>
        </div>

        {label?.answer && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Correct answer
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {label.answer}
            </p>
          </div>
        )}

        {(attempt.response_transcript || attempt.response_audio_file_id) && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your answer
              </p>
              {attempt.response_audio_file_id && (
                <SessionAudio
                  fileId={attempt.response_audio_file_id}
                  className="h-8 w-48 shrink-0"
                />
              )}
            </div>
            {attempt.response_transcript && (
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                {attempt.response_transcript}
              </p>
            )}
          </div>
        )}

        {feedback && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Explanation
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {feedbackShown}
            </p>
            {feedbackIsLong && (
              <button
                type="button"
                onClick={() => setExplanationExpanded((v) => !v)}
                className="mt-1 text-xs font-semibold text-primary hover:underline"
              >
                {explanationExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}

        {extras.misconception && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Watch out for
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-600 dark:text-amber-400">
              {extras.misconception}
            </p>
          </div>
        )}

        {extras.missing && extras.missing.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Missing
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-600 dark:text-amber-400">
              {extras.missing.join(", ")}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}
