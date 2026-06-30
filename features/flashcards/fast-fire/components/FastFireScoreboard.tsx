// features/flashcards/fast-fire/components/FastFireScoreboard.tsx
//
// The end-of-session scoreboard + review (REQUIREMENTS §2.5/§2.6/§8). Shows the
// final rollup, the per-card list with grade chips, and review playback of each
// card's spoken feedback — filterable All / Correct / Needs work. The holistic
// "professor" review (fc_review_batch) renders when it resolves (optional lane).
//
// Grades keep catching up here after the drill completes (fire-and-forget) — they
// stream in via Redux, so the board updates live with no extra wiring. Review
// playback is driven by `audioPlayer` STATE (hard-requirement #5).
//
// React Compiler is on: no manual memo.

"use client";

import {
  Trophy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Layers,
  GraduationCap,
  MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFastFireScoreboard,
  selectFastFireConfig,
  selectFastFireSessionReview,
  selectReviewRows,
  selectReviewFilter,
  selectPlayingCardId,
  selectPendingGradeCount,
} from "../redux/fastFire.selectors";
import {
  playCard,
  stopPlayback,
  setReviewFilter,
  type ReviewFilter,
  type GradeResult,
} from "../redux/fastFireSlice";
import { FastFireReviewPlayer } from "./FastFireReviewPlayer";

const RESULT_META: Record<
  GradeResult,
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    classes:
      "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  },
  partial: {
    label: "Partial",
    icon: AlertCircle,
    classes:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  incorrect: {
    label: "Missed",
    icon: XCircle,
    classes:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

const FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "correct", label: "Correct" },
  { id: "incorrect", label: "Needs work" },
];

export function FastFireScoreboard({
  onRestart,
  onExit,
}: {
  onRestart: () => void;
  onExit: () => void;
}) {
  const dispatch = useAppDispatch();
  const board = useAppSelector(selectFastFireScoreboard);
  const config = useAppSelector(selectFastFireConfig);
  const review = useAppSelector(selectFastFireSessionReview);
  const rows = useAppSelector(selectReviewRows);
  const filter = useAppSelector(selectReviewFilter);
  const playingCardId = useAppSelector(selectPlayingCardId);
  const pending = useAppSelector(selectPendingGradeCount);

  return (
    <div className="min-h-full w-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8 pb-safe">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Session complete
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {config.setName ?? "FastFire"} · {board.total} cards
            </p>
          </div>
        </div>

        {/* Rollup */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Correct" value={`${board.correct}`} accent="green" />
          <Stat label="Partial" value={`${board.partial}`} accent="amber" />
          <Stat label="Missed" value={`${board.incorrect}`} accent="red" />
          <Stat
            label="Accuracy"
            value={board.accuracyPct === null ? "—" : `${board.accuracyPct}%`}
          />
        </div>

        {pending > 0 && (
          <div className="mb-4 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Still grading {pending} card{pending === 1 ? "" : "s"} in the
            background…
          </div>
        )}

        {/* Professor review (optional lane) */}
        {review && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
              <GraduationCap className="h-4 w-4" />
              Coach&apos;s review
            </div>
            <p className="text-sm leading-relaxed text-blue-900/90 dark:text-blue-200/90">
              {review}
            </p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="mb-3 flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => dispatch(setReviewFilter({ filter: f.id }))}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "bg-orange-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Per-card review list */}
        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card px-3 py-8 text-center text-xs text-muted-foreground">
              No cards match this filter.
            </div>
          )}
          {rows.map(({ card, grade }) => {
            const result = grade?.result;
            const meta = result ? RESULT_META[result] : null;
            const isPlaying = playingCardId === card.id;
            const hasAudio = !!grade?.responseAudioFileId;
            return (
              <div
                key={card.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {card.front}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {card.back}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {grade?.status === "pending" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {grade?.status === "skipped" && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        <MicOff className="h-3 w-3" />
                        Recorded
                      </span>
                    )}
                    {meta && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                          meta.classes,
                        )}
                      >
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                        {grade?.score !== null && grade?.score !== undefined && (
                          <span className="tabular-nums opacity-70">
                            {Math.round(grade.score * 100)}%
                          </span>
                        )}
                      </span>
                    )}
                    {hasAudio && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          dispatch(
                            isPlaying
                              ? stopPlayback()
                              : playCard({ cardId: card.id }),
                          )
                        }
                        aria-label={isPlaying ? "Stop" : "Play your answer"}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Grader feedback + playback */}
                {grade?.feedback && (
                  <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                    {grade.feedback}
                  </p>
                )}
                {isPlaying && (
                  <FastFireReviewPlayer
                    fileId={grade?.responseAudioFileId ?? null}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={onRestart}>
            <RotateCcw className="h-4 w-4" />
            Run again
          </Button>
          <Button className="flex-1 gap-1.5" onClick={onExit}>
            <Layers className="h-4 w-4" />
            Back to flashcards
          </Button>
        </div>
      </div>
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
  accent?: "green" | "amber" | "red";
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2 text-center">
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "green"
            ? "text-green-600 dark:text-green-400"
            : accent === "amber"
              ? "text-amber-600 dark:text-amber-400"
              : accent === "red"
                ? "text-red-600 dark:text-red-400"
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
