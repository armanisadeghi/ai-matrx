"use client";

/**
 * ResponseFeedbackBar
 *
 * Multi-dimensional response evaluation widget rendered at the bottom of
 * each column's conversation, directly below the last completed
 * assistant response.
 *
 * Captures:
 *   - rating (thumbs)         — quick shorthand; auto-fills unrated metrics
 *   - overall (1-5)           — the headline score everyone scans first
 *   - rank (1..N)             — cross-column unique placement (no ties)
 *   - per-metric scores       — accuracy / relevance / completeness / etc
 *   - comment                 — free-form note
 *
 * Persistence: `saveFeedback` upserts by (user, conversation, request_id).
 * Rank uniqueness is also enforced at the DB level via a partial unique
 * index — we pre-clear the prior holder client-side, then save, so the
 * normal flow doesn't race the index.
 *
 * Visible only after the response has fully landed (status === "complete")
 * — rating a half-streamed answer is pointless.
 */

import { useEffect, useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Loader2,
  Star,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { makeSelectConversationRequests } from "@/features/agents/components/run-controls/panels/shared";
import { cn } from "@/lib/utils";
import {
  clearRankForOthers,
  fetchLatestFeedback,
  saveFeedback,
  type FeedbackRating,
} from "../service/responseFeedbackService";
import {
  selectActiveBattleSetId,
  selectBattleColumns,
} from "../redux/selectors";
import { setFeedbackRank, setFeedbackSnapshot } from "../redux/battleSlice";
import type { FeedbackSnapshot } from "../types";

interface Props {
  conversationId: string;
}

// =============================================================================
// Default metric set — what LLM responses are actually judged on
// =============================================================================

interface MetricDef {
  id: string;
  label: string;
  hint: string;
}

const DEFAULT_METRICS: MetricDef[] = [
  { id: "accuracy", label: "Accuracy", hint: "Are the facts / claims correct? Any hallucinations?" },
  { id: "relevance", label: "Relevance", hint: "Does the response actually answer the request?" },
  { id: "completeness", label: "Completeness", hint: "Are all parts of the request addressed, with no gaps?" },
  { id: "instruction_following", label: "Instruction following", hint: "Did the agent honor every explicit instruction (format, scope, tone)?" },
  { id: "reasoning", label: "Reasoning", hint: "Is the logical flow sound? Are conclusions justified?" },
  { id: "clarity", label: "Clarity", hint: "Is the writing clear, well-structured, and easy to scan?" },
  { id: "conciseness", label: "Conciseness", hint: "Right length for the task — no padding, no terseness that omits." },
];

const THUMBS_UP_DEFAULT_SCORE = 4;
const THUMBS_DOWN_DEFAULT_SCORE = 2;

type Scores = Record<string, number>;

// =============================================================================
// Helpers — read other columns' ranks for the rank picker
// =============================================================================

/**
 * Selector factory — returns the map { conversationId: rank } for every
 * column *other than* the current one. Used by the rank picker to grey
 * out ranks already taken elsewhere (UX hint; actual collision protection
 * is the DB unique index + the auto-clear thunk).
 */
function useOtherColumnRanks(currentConversationId: string): Record<string, number> {
  const columns = useAppSelector(selectBattleColumns);
  return useAppSelector((state: RootState) => {
    const out: Record<string, number> = {};
    for (const col of columns) {
      if (col.conversationId === currentConversationId) continue;
      const rank = state.agentBattle.feedbackRanks?.[col.conversationId];
      if (rank != null) out[col.conversationId] = rank;
    }
    return out;
  });
}

// =============================================================================
// Component
// =============================================================================

/**
 * Outer guard — does the minimum reads needed to decide whether the bar
 * should appear at all. If not, returns null with a stable hook count.
 * The inner component is mounted only once both the request id AND
 * isComplete are real, so its hook list is fixed-length across renders.
 */
export function ResponseFeedbackBar({ conversationId }: Props) {
  const requests = useAppSelector(makeSelectConversationRequests(conversationId));
  const lastRequest = requests[requests.length - 1] ?? null;
  const requestId = lastRequest?.requestId ?? null;
  const isComplete = lastRequest?.status === "complete";

  if (!requestId || !isComplete) return null;
  return (
    <ResponseFeedbackBarInner
      conversationId={conversationId}
      requestId={requestId}
    />
  );
}

interface InnerProps {
  conversationId: string;
  requestId: string;
}

function ResponseFeedbackBarInner({ conversationId, requestId }: InnerProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const setId = useAppSelector(selectActiveBattleSetId);
  const columns = useAppSelector(selectBattleColumns);

  const otherRanks = useOtherColumnRanks(conversationId);
  const takenRanksOnOthers = new Set(Object.values(otherRanks));

  const [rating, setRating] = useState<FeedbackRating>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedRequestId, setSavedRequestId] = useState<string | null>(null);

  // Hydrate from server when the request id changes (a new response landed).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchLatestFeedback(userId, conversationId)
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.request_id === requestId);
        if (match) {
          const matchScores =
            (match.metadata?.scores as Scores | undefined) ?? {};
          setRating(match.rating ?? null);
          setOverall(match.overall ?? null);
          setRank(match.rank ?? null);
          setScores(matchScores);
          setComment(match.comment ?? "");
          setSavedRequestId(requestId);
          dispatch(
            setFeedbackRank({
              conversationId,
              rank: match.rank ?? null,
            }),
          );
          dispatch(
            setFeedbackSnapshot({
              conversationId,
              snapshot: {
                rating: match.rating ?? null,
                overall: match.overall ?? null,
                rank: match.rank ?? null,
                scores: matchScores,
                comment: match.comment ?? null,
              },
            }),
          );
        } else {
          setRating(null);
          setOverall(null);
          setRank(null);
          setScores({});
          setComment("");
          setSavedRequestId(null);
          dispatch(setFeedbackRank({ conversationId, rank: null }));
          dispatch(setFeedbackSnapshot({ conversationId, snapshot: null }));
        }
      })
      .catch(() => {
        // silent — feedback bar shouldn't yell if the table is unreachable
      });
    return () => {
      cancelled = true;
    };
  }, [userId, conversationId, requestId, dispatch]);

  // Refresh local state when a sibling save event lands (e.g. someone
  // grabbed our rank → our row's rank was cleared in the DB).
  useEffect(() => {
    if (!userId) return;
    const handler = () => {
      fetchLatestFeedback(userId, conversationId)
        .then((rows) => {
          const match = rows.find((r) => r.request_id === requestId);
          if (match) {
            setRank(match.rank ?? null);
            setOverall(match.overall ?? null);
            dispatch(
              setFeedbackRank({
                conversationId,
                rank: match.rank ?? null,
              }),
            );
          }
        })
        .catch(() => {});
    };
    window.addEventListener("agent-battle:feedback-saved", handler);
    return () =>
      window.removeEventListener("agent-battle:feedback-saved", handler);
  }, [userId, conversationId, requestId, dispatch]);

  const persist = async (next: {
    rating: FeedbackRating;
    overall: number | null;
    rank: number | null;
    scores: Scores;
    comment: string;
  }) => {
    if (!userId || !conversationId || !requestId) return;
    setBusy(true);
    try {
      await saveFeedback({
        userId,
        conversationId,
        requestId,
        rating: next.rating,
        overall: next.overall,
        rank: next.rank,
        comment: next.comment.trim() ? next.comment.trim() : null,
        comparisonSetId: setId,
        metadata: { scores: next.scores },
      });
      setSavedRequestId(requestId);
      dispatch(setFeedbackRank({ conversationId, rank: next.rank }));
      const snapshot: FeedbackSnapshot = {
        rating: next.rating,
        overall: next.overall,
        rank: next.rank,
        scores: next.scores,
        comment: next.comment.trim() ? next.comment.trim() : null,
      };
      dispatch(setFeedbackSnapshot({ conversationId, snapshot }));
      // Tell siblings to refresh their rank readouts. We use a custom event
      // because the source of truth lives in the DB; siblings re-fetch on
      // notification rather than carrying a live Redux mirror of every
      // sibling's feedback row.
      window.dispatchEvent(
        new CustomEvent("agent-battle:feedback-saved", {
          detail: { conversationId, requestId, setId },
        }),
      );
    } catch (err) {
      toast.error(
        `Couldn't save feedback: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleThumbs = (next: "up" | "down") => {
    const newRating = rating === next ? null : next;
    setRating(newRating);
    const defaultScore =
      newRating === "up"
        ? THUMBS_UP_DEFAULT_SCORE
        : newRating === "down"
        ? THUMBS_DOWN_DEFAULT_SCORE
        : null;
    let nextScores = scores;
    let nextOverall = overall;
    if (defaultScore != null) {
      const filled: Scores = { ...scores };
      for (const m of DEFAULT_METRICS) {
        if (filled[m.id] == null) filled[m.id] = defaultScore;
      }
      nextScores = filled;
      setScores(filled);
      if (nextOverall == null) {
        nextOverall = defaultScore;
        setOverall(defaultScore);
      }
    }
    void persist({
      rating: newRating,
      overall: nextOverall,
      rank,
      scores: nextScores,
      comment,
    });
  };

  const handleScore = (metricId: string, value: number) => {
    const next = { ...scores };
    if (next[metricId] === value) {
      delete next[metricId];
    } else {
      next[metricId] = value;
    }
    setScores(next);
    void persist({ rating, overall, rank, scores: next, comment });
  };

  const handleOverall = (value: number) => {
    const nextOverall = overall === value ? null : value;
    setOverall(nextOverall);
    void persist({ rating, overall: nextOverall, rank, scores, comment });
  };

  const handleRank = async (value: number) => {
    // Toggle: clicking the rank already held clears it.
    if (rank === value) {
      setRank(null);
      void persist({ rating, overall, rank: null, scores, comment });
      return;
    }
    // Auto-swap: if any sibling holds this rank, clear it FIRST so the
    // DB unique index doesn't reject our save.
    if (setId) {
      try {
        const clearedConvs = await clearRankForOthers({
          userId: userId!,
          comparisonSetId: setId,
          rank: value,
          exceptConversationId: conversationId,
          exceptRequestId: requestId,
        });
        for (const cleared of clearedConvs) {
          dispatch(setFeedbackRank({ conversationId: cleared, rank: null }));
        }
        if (clearedConvs.length > 0) {
          // Notify the siblings that they lost their rank so they refresh.
          window.dispatchEvent(
            new CustomEvent("agent-battle:feedback-saved", {
              detail: { conversationId: clearedConvs[0], setId },
            }),
          );
        }
      } catch (err) {
        toast.error(
          `Couldn't claim rank ${value}: ${err instanceof Error ? err.message : err}`,
        );
        return;
      }
    }
    setRank(value);
    void persist({ rating, overall, rank: value, scores, comment });
  };

  const handleCommitComment = () => {
    void persist({ rating, overall, rank, scores, comment });
  };

  const configuredColumnCount = columns.filter((c) => c.agentId).length;

  return (
    <div className="border border-border rounded-md bg-card/50 mx-2 my-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/30">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Rate this response
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => handleThumbs("up")}
          className={cn(
            "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
            rating === "up"
              ? "bg-emerald-500/20 text-emerald-500"
              : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10",
          )}
          title="Quick approve (defaults every unrated metric to 4)"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleThumbs("down")}
          className={cn(
            "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
            rating === "down"
              ? "bg-rose-500/20 text-rose-500"
              : "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10",
          )}
          title="Quick reject (defaults every unrated metric to 2)"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          type="button"
          onClick={() => setCommentOpen((v) => !v)}
          className={cn(
            "h-6 px-1.5 rounded inline-flex items-center gap-1 text-[10px] transition-colors",
            commentOpen
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <MessageSquare className="w-3 h-3" />
          Note
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : savedRequestId === requestId ? (
          <span className="text-[10px] text-emerald-500/80">saved</span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">not saved</span>
        )}
      </div>

      {/* Headline row — Overall + Rank, prominent */}
      <div className="px-3 py-2 border-b border-border/40 bg-card/30">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-semibold text-foreground">
                Overall
              </span>
              <span className="text-[10px] text-muted-foreground/80 truncate">
                · the headline score
              </span>
            </div>
            <div className="mt-1 flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleOverall(n)}
                  title={`${n} / 5`}
                  className={cn(
                    "h-7 w-7 rounded inline-flex items-center justify-center transition-colors",
                    overall != null && n <= overall
                      ? "bg-amber-500/20 text-amber-500"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Star
                    className={cn(
                      "w-4 h-4",
                      overall != null && n <= overall && "fill-amber-500",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {configuredColumnCount > 1 && (
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 justify-end">
                <Trophy className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">
                  Rank
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                  · 1 = best
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 justify-end">
                {Array.from({ length: configuredColumnCount }, (_, i) => i + 1).map(
                  (n) => {
                    const takenElsewhere = takenRanksOnOthers.has(n);
                    const selected = rank === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void handleRank(n)}
                        title={
                          selected
                            ? `Clear rank ${n}`
                            : takenElsewhere
                            ? `Rank ${n} (currently on another column — will swap)`
                            : `Set rank ${n}`
                        }
                        className={cn(
                          "h-7 min-w-7 px-2 rounded inline-flex items-center justify-center text-[12px] font-mono font-semibold transition-colors border",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : takenElsewhere
                            ? "bg-muted/40 text-muted-foreground/50 border-dashed border-border line-through"
                            : "text-foreground border-border hover:bg-muted/50 hover:border-primary/50",
                        )}
                      >
                        {n}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-metric grid */}
      <div className="px-3 py-2 space-y-1">
        {DEFAULT_METRICS.map((metric) => (
          <MetricRow
            key={metric.id}
            metric={metric}
            value={scores[metric.id] ?? null}
            onChange={(v) => handleScore(metric.id, v)}
          />
        ))}
      </div>

      {/* Comment */}
      {commentOpen && (
        <div className="px-3 pb-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={handleCommitComment}
            placeholder="What was good / bad? Compare to other columns?"
            rows={2}
            className="w-full text-[11px] bg-background border border-border rounded px-2 py-1 text-foreground resize-y focus:outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// One metric row — label + 5 buttons
// =============================================================================

function MetricRow({
  metric,
  value,
  onChange,
}: {
  metric: MetricDef;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-foreground truncate">
            {metric.label}
          </span>
        </div>
        <p
          className="text-[10px] text-muted-foreground/70 truncate"
          title={metric.hint}
        >
          {metric.hint}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            title={`${n} / 5`}
            className={cn(
              "h-6 w-6 rounded inline-flex items-center justify-center text-[11px] font-mono transition-colors",
              value != null && n <= value
                ? "bg-amber-500/20 text-amber-500"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Star
              className={cn(
                "w-3 h-3",
                value != null && n <= value ? "fill-amber-500" : "",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
