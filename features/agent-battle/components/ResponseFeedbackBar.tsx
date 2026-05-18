"use client";

/**
 * ResponseFeedbackBar
 *
 * Multi-metric LLM evaluation widget rendered at the bottom of each
 * column's conversation, directly below the latest assistant response.
 * Captures structured comparison data — the kind of thing an agentic
 * engineer or research scientist actually wants for evaluating how N
 * agents performed on the same task.
 *
 * Data model:
 *   - Each metric is a 1–5 rating (null = unrated). Stored inside
 *     `cmp_response_feedback.metadata.scores: { metric_id: number }`.
 *   - `rating` (up/down) is preserved for quick thumb-shorthand: thumbs
 *     up auto-fills 4s across all metrics; down auto-fills 2s. The user
 *     can then refine.
 *   - `comment` for free-form notes.
 *   - Custom user-defined metrics will be added later — for now we ship
 *     a strong default set covering the dimensions most papers + eval
 *     frameworks (HELM, MT-Bench, AlpacaEval, RAGAS) actually score on.
 *
 * Persistence: same `saveFeedback` upsert keyed on (user, conversation,
 * request_id) — partial updates supported.
 */

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { makeSelectConversationRequests } from "@/features/agents/components/run-controls/panels/shared";
import { cn } from "@/lib/utils";
import {
  fetchLatestFeedback,
  saveFeedback,
  type FeedbackRating,
} from "../service/responseFeedbackService";
import { selectActiveBattleSetId } from "../redux/selectors";

interface Props {
  conversationId: string;
}

// =============================================================================
// Default metric set — what LLM responses are actually judged on
// =============================================================================

interface MetricDef {
  id: string;
  label: string;
  /** Short tooltip explaining what to score on. */
  hint: string;
}

const DEFAULT_METRICS: MetricDef[] = [
  {
    id: "accuracy",
    label: "Accuracy",
    hint: "Are the facts / claims correct? Any hallucinations?",
  },
  {
    id: "relevance",
    label: "Relevance",
    hint: "Does the response actually answer the request?",
  },
  {
    id: "completeness",
    label: "Completeness",
    hint: "Are all parts of the request addressed, with no gaps?",
  },
  {
    id: "instruction_following",
    label: "Instruction following",
    hint: "Did the agent honor every explicit instruction (format, scope, tone)?",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    hint: "Is the logical flow sound? Are conclusions justified?",
  },
  {
    id: "clarity",
    label: "Clarity",
    hint: "Is the writing clear, well-structured, and easy to scan?",
  },
  {
    id: "conciseness",
    label: "Conciseness",
    hint: "Right length for the task — no padding, no terseness that omits.",
  },
];

const THUMBS_UP_DEFAULT_SCORE = 4;
const THUMBS_DOWN_DEFAULT_SCORE = 2;

type Scores = Record<string, number>;

// =============================================================================
// Component
// =============================================================================

export function ResponseFeedbackBar({ conversationId }: Props) {
  const userId = useAppSelector(selectUserId);
  const setId = useAppSelector(selectActiveBattleSetId);
  const requests = useAppSelector(makeSelectConversationRequests(conversationId));
  const lastRequest = requests[requests.length - 1] ?? null;
  const requestId = lastRequest?.requestId ?? null;
  const isComplete = lastRequest?.status === "complete";

  const [rating, setRating] = useState<FeedbackRating>(null);
  const [scores, setScores] = useState<Scores>({});
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedRequestId, setSavedRequestId] = useState<string | null>(null);

  // Hydrate from server when the request id changes (a new response landed).
  useEffect(() => {
    if (!userId || !conversationId || !isComplete || !requestId) {
      setRating(null);
      setScores({});
      setComment("");
      setSavedRequestId(null);
      return;
    }
    let cancelled = false;
    fetchLatestFeedback(userId, conversationId)
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.request_id === requestId);
        if (match) {
          setRating(match.rating ?? null);
          setScores(
            (match.metadata?.scores as Scores | undefined) ?? {},
          );
          setComment(match.comment ?? "");
          setSavedRequestId(requestId);
        } else {
          setRating(null);
          setScores({});
          setComment("");
          setSavedRequestId(null);
        }
      })
      .catch(() => {
        // silent — feedback bar shouldn't yell if the table is unreachable
      });
    return () => {
      cancelled = true;
    };
  }, [userId, conversationId, requestId, isComplete]);

  // Only render once the response has fully landed — rating a half-streamed
  // answer is pointless and visually noisy. The bar pops in at the moment
  // the stream completes (status === "complete").
  if (!requestId || !isComplete) {
    return null;
  }

  const persist = async (next: {
    rating: FeedbackRating;
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
        comment: next.comment.trim() ? next.comment.trim() : null,
        comparisonSetId: setId,
        metadata: { scores: next.scores },
      });
      setSavedRequestId(requestId);
    } catch (err) {
      toast.error(
        `Couldn't save feedback: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleThumbs = (next: "up" | "down") => {
    if (!isComplete) return;
    const newRating = rating === next ? null : next;
    setRating(newRating);
    // Auto-fill every UNRATED metric with the corresponding default — keep
    // user-set scores intact (don't overwrite their explicit numbers).
    const defaultScore =
      newRating === "up"
        ? THUMBS_UP_DEFAULT_SCORE
        : newRating === "down"
        ? THUMBS_DOWN_DEFAULT_SCORE
        : null;
    let nextScores = scores;
    if (defaultScore != null) {
      const filled: Scores = { ...scores };
      for (const m of DEFAULT_METRICS) {
        if (filled[m.id] == null) filled[m.id] = defaultScore;
      }
      nextScores = filled;
      setScores(filled);
    }
    void persist({ rating: newRating, scores: nextScores, comment });
  };

  const handleScore = (metricId: string, value: number) => {
    if (!isComplete) return;
    const next = { ...scores };
    if (next[metricId] === value) {
      delete next[metricId];
    } else {
      next[metricId] = value;
    }
    setScores(next);
    void persist({ rating, scores: next, comment });
  };

  const handleCommitComment = () => {
    if (!isComplete) return;
    void persist({ rating, scores, comment });
  };

  return (
    <div className="border border-border rounded-md bg-card/50 mx-2 my-3 shadow-sm">
      {/* Header — quick actions + status */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/30">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Rate this response
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => handleThumbs("up")}
          disabled={!isComplete}
          className={cn(
            "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
            rating === "up"
              ? "bg-emerald-500/20 text-emerald-500"
              : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10",
            !isComplete && "opacity-40 cursor-not-allowed",
          )}
          title={
            isComplete
              ? "Quick approve (defaults every unrated metric to 4)"
              : "Waiting for response"
          }
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleThumbs("down")}
          disabled={!isComplete}
          className={cn(
            "h-6 w-6 rounded inline-flex items-center justify-center transition-colors",
            rating === "down"
              ? "bg-rose-500/20 text-rose-500"
              : "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10",
            !isComplete && "opacity-40 cursor-not-allowed",
          )}
          title={
            isComplete
              ? "Quick reject (defaults every unrated metric to 2)"
              : "Waiting for response"
          }
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          type="button"
          onClick={() => setCommentOpen((v) => !v)}
          disabled={!isComplete}
          className={cn(
            "h-6 px-1.5 rounded inline-flex items-center gap-1 text-[10px] transition-colors",
            commentOpen
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            !isComplete && "opacity-40 cursor-not-allowed",
          )}
          title={isComplete ? "Add a note" : "Waiting for response"}
        >
          <MessageSquare className="w-3 h-3" />
          {comment.trim() ? "Note" : "Note"}
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

      {/* Metrics grid */}
      <div className="px-3 py-2 space-y-1">
        {DEFAULT_METRICS.map((metric) => (
          <MetricRow
            key={metric.id}
            metric={metric}
            value={scores[metric.id] ?? null}
            onChange={(v) => handleScore(metric.id, v)}
            disabled={!isComplete}
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
// One metric row — label + 5 buttons + clear
// =============================================================================

function MetricRow({
  metric,
  value,
  onChange,
  disabled,
}: {
  metric: MetricDef;
  value: number | null;
  onChange: (v: number) => void;
  disabled: boolean;
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
            disabled={disabled}
            title={`${n} / 5`}
            className={cn(
              "h-6 w-6 rounded inline-flex items-center justify-center text-[11px] font-mono transition-colors",
              value != null && n <= value
                ? "bg-amber-500/20 text-amber-500"
                : "text-muted-foreground hover:bg-muted/50",
              disabled && "opacity-40 cursor-not-allowed",
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
