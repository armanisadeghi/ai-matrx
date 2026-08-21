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

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Radio,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useLiveRunStatus } from "@/features/agents/components/live-run/useLiveRunStatus";
import { useLiveRunHandle } from "@/features/agents/hooks/useLiveRunHandle";
import { LiveRunWindowController } from "@/features/overlays/openers/liveRunWindow";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
import { reviewSession } from "@/features/education/tutor/lanes/reviewSession";
import {
  buildReviewAggregate,
  type ReviewAttempt,
} from "@/features/education/tutor/lanes/learnerContext";
import { studyService } from "../service/studyService";
import {
  REVIEW_RUN_LABEL,
  studyReviewWindowId,
  watchableReviewRun,
} from "../reviewRun";
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
import { sessionModeLabel } from "../modes";

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
  const dispatch = useAppDispatch();
  const [data, setData] = useState<SessionWithAttempts | null>(null);
  const [labels, setLabels] = useState<Record<string, ItemLabel>>({});
  const [loading, setLoading] = useState(true);
  // The raw failure, never a sentence — the gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * The review run this page is watching. Latched when a session row arrives
   * carrying a live run (or when the learner starts one here) and deliberately
   * never cleared — the window outlives the run, per THE FLOATING LAW.
   */
  const [watchedConversationId, setWatchedConversationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await studyService.getSession(sessionId);
      if (cancelled) return;
      if (res.error || !res.data) {
        setLoadError(res.error ?? null);
        setData(null);
        setLoading(false);
        return;
      }
      setData(res.data);
      // Latch the in-flight review run at the moment the row arrives, never in
      // an effect body — and NEVER unlatch: dropping it when the review lands
      // would close the window at the instant its content finished arriving.
      const liveRun = watchableReviewRun(res.data.session);
      if (liveRun) setWatchedConversationId(liveRun.conversationId);
      setLoadError(null);
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
  }, [sessionId, labelResolver, reloadKey]);

  // ── THE COACH REVIEW, REATTACHED (never polled) ─────────────────────────
  // The holistic review is launched fire-and-forget when a session completes,
  // so the learner can land here while it is still writing. The run stamped its
  // identity on the session row, so this page REATTACHES to it and floats it
  // (THE FLOATING LAW) instead of polling the row for a result.
  const liveReviewRun = watchableReviewRun(data?.session);
  const liveReviewConversationId = liveReviewRun?.conversationId ?? null;

  // A cold load has no client-side stream for this conversation — a dropped
  // socket is not a failed run, so ask the runtime spine what the server is
  // still doing and follow it to terminal. Stands down on its own when a live
  // stream already owns the conversation in this tab.
  const reattachedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!liveReviewConversationId) return undefined;
    if (reattachedRef.current === liveReviewConversationId) return undefined;
    reattachedRef.current = liveReviewConversationId;
    let cancelled = false;
    void dispatch(
      reconnectServerOperation({
        conversationId: liveReviewConversationId,
        source: "cold-load",
      }),
    ).then(async () => {
      // Terminal (or nothing to follow) — the review row is the content truth.
      const res = await studyService.getSession(sessionId);
      if (!cancelled && res.data) setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [liveReviewConversationId, sessionId, dispatch]);

  // When the run this tab IS streaming goes terminal, read the row once. This
  // replaces the poll entirely: the stream itself says when to look.
  const reviewRunStatus = useLiveRunStatus(watchedConversationId);
  const reviewWasActiveRef = useRef(false);
  useEffect(() => {
    if (reviewRunStatus.isActive) {
      reviewWasActiveRef.current = true;
      return undefined;
    }
    if (!reviewWasActiveRef.current) return undefined;
    reviewWasActiveRef.current = false;
    let cancelled = false;
    void (async () => {
      const res = await studyService.getSession(sessionId);
      if (!cancelled && res.data) setData(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewRunStatus.isActive, sessionId]);

  /** Run the review now — the door when no run is live and none produced one. */
  const reviewRunHandle = useLiveRunHandle();
  const [generatingReview, setGeneratingReview] = useState(false);
  const runCoachReview = () => {
    if (!data || generatingReview) return;
    setGeneratingReview(true);
    const attempts: ReviewAttempt[] = data.attempts.map((a, i) => ({
      front: labels[a.item_id]?.question ?? `Item ${i + 1}`,
      result: (a.result as ReviewAttempt["result"]) ?? null,
      score: a.score_value != null ? Number(a.score_value) : null,
      transcript: a.response_transcript ?? "",
    }));
    void dispatch(
      reviewSession({
        sessionId,
        attempts,
        aggregate: buildReviewAggregate(attempts, data.attempts.length),
        // THIS page owns the window for a run it started, so the lane doesn't
        // float a second one. The handle owns the conversation's lifetime, so
        // the finished output survives to be read.
        onConversationCreated: (conversationId) => {
          reviewRunHandle.claim(conversationId);
          setWatchedConversationId(conversationId);
        },
      }),
    )
      .then(async () => {
        const res = await studyService.getSession(sessionId);
        if (res.data) setData(res.data);
      })
      .finally(() => setGeneratingReview(false));
  };

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
  const modeLabel = sessionModeLabel(session?.mode);
  const coachReview = parseSessionReview(session?.session_review);
  const coachReviewPending = isAwaitingCoachReview(
    session?.mode,
    session?.status,
    session?.session_review,
  );

  return (
    <div className="min-h-full w-full bg-textured">
      {/* The review floats — never a live block above the learner's ledger.
          Sizing is the window's own; a per-surface override would only be
          right after watching this kind render badly in the default box. */}
      {watchedConversationId && (
        <LiveRunWindowController
          instanceId={studyReviewWindowId(sessionId)}
          conversationId={watchedConversationId}
          label={REVIEW_RUN_LABEL}
        />
      )}
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
        ) : !session ? (
          // "It may have been deleted" was a guess. Zero rows is equally a
          // denial, a stale link, or an expired session — the gate asks.
          <AccessGate
            token="study_session"
            id={sessionId}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            fallbackHref={backHref ?? "/education"}
            fallbackLabel={backHref ? "Back to sessions" : "Education"}
          />
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

            {/* Holistic review — watched, never polled for */}
            <CoachReviewPanel
              review={coachReview}
              pending={coachReviewPending}
              watching={Boolean(watchedConversationId) && !coachReview}
              onGenerate={
                // Only when there is something to review AND nothing is live —
                // an offer that would quietly no-op is its own dead end.
                coachReviewPending &&
                !liveReviewConversationId &&
                data.attempts.length > 0
                  ? runCoachReview
                  : undefined
              }
              generating={generatingReview}
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
