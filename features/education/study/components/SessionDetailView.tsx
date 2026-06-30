"use client";

// features/education/study/components/SessionDetailView.tsx
//
// Mode-agnostic study-session DETAIL: the session header + aggregate, the
// full-session recording, the holistic review, and the per-attempt ledger (result,
// score, the learner's transcribed answer, and the response audio playback). Loads
// via studyService.getSession. An optional `labelResolver` lets a mode (e.g.
// flashcards) supply human labels for item_ids (the card front) without coupling
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
  GraduationCap,
  Mic,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import type { SessionWithAttempts, StudyAttemptRow } from "../types";
import { SessionAudio } from "./SessionAudio";

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
  correct: { label: "Correct", icon: CheckCircle2, classes: "text-green-600 dark:text-green-400" },
  partial: { label: "Partial", icon: AlertTriangle, classes: "text-amber-600 dark:text-amber-400" },
  incorrect: { label: "Missed", icon: XCircle, classes: "text-red-600 dark:text-red-400" },
};

/** Pull the optional feedback / missing[] the grader stashed in the score jsonb. */
function readScoreExtras(score: unknown): { feedback?: string; missing?: string[] } {
  if (!score || typeof score !== "object") return {};
  const s = score as Record<string, unknown>;
  return {
    feedback: typeof s.feedback === "string" ? s.feedback : undefined,
    missing: Array.isArray(s.missing)
      ? s.missing.filter((m): m is string => typeof m === "string")
      : undefined,
  };
}

function reviewSummary(review: unknown): string | null {
  if (!review) return null;
  if (typeof review === "string") return review;
  if (typeof review === "object" && review !== null) {
    const r = review as Record<string, unknown>;
    if (typeof r.summary === "string") return r.summary;
  }
  return null;
}

export function SessionDetailView({
  sessionId,
  backHref,
  labelResolver,
}: {
  sessionId: string;
  backHref?: string;
  labelResolver?: (data: SessionWithAttempts) => Promise<Record<string, string>>;
}) {
  const router = useRouter();
  const [data, setData] = useState<SessionWithAttempts | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
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

  const session = data?.session;
  const modeLabel = session?.mode
    ? (MODE_LABEL[session.mode] ?? session.mode.replace(/_/g, " "))
    : "Session";
  const review = reviewSummary(session?.session_review);

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
            <p className="text-sm text-foreground">Couldn&apos;t load this session</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {error ?? "It may have been deleted."}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-foreground">{modeLabel} session</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {session.created_at
                  ? new Date(session.created_at).toLocaleString()
                  : ""}
                {" · "}
                {data.attempts.length}{" "}
                {data.attempts.length === 1 ? "answer" : "answers"}
                {" · "}
                <span className="capitalize">{session.status ?? "unknown"}</span>
              </p>
            </div>

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
            {review && (
              <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
                  <GraduationCap className="h-4 w-4" />
                  Coach&apos;s review
                </div>
                <p className="text-sm leading-relaxed text-blue-900/90 dark:text-blue-200/90">
                  {review}
                </p>
              </section>
            )}

            {/* Attempt ledger */}
            <h2 className="mb-2 text-sm font-medium text-foreground">Answers</h2>
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

function AttemptRow({
  attempt,
  index,
  label,
}: {
  attempt: StudyAttemptRow;
  index: number;
  label?: string;
}) {
  const meta = attempt.result ? RESULT_META[attempt.result] : null;
  const extras = readScoreExtras(attempt.score);
  const scorePct =
    attempt.score_value != null ? Math.round(Number(attempt.score_value) * 100) : null;

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {label ?? `Answer ${index + 1}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meta && (
            <span className={cn("inline-flex items-center gap-1 text-xs", meta.classes)}>
              <meta.icon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
          )}
          {scorePct != null && (
            <span className="text-xs tabular-nums text-muted-foreground">{scorePct}%</span>
          )}
        </div>
      </div>

      {attempt.response_transcript && (
        <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-foreground">
          <span className="text-muted-foreground">You said: </span>
          {attempt.response_transcript}
        </p>
      )}

      {extras.feedback && (
        <p className="mt-1.5 text-xs text-muted-foreground">{extras.feedback}</p>
      )}

      {extras.missing && extras.missing.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          Missing: {extras.missing.join(", ")}
        </p>
      )}

      {attempt.response_audio_file_id && (
        <div className="mt-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Mic className="h-3 w-3" />
            Your answer
          </div>
          <SessionAudio fileId={attempt.response_audio_file_id} />
        </div>
      )}
    </li>
  );
}
