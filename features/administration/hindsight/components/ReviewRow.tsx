"use client";

/**
 * ReviewRow — one review pass, expandable into what the reviewer saw, the
 * exact real runs it read (each one openable), and the replay comparisons.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getReview } from "../api";
import { conversationHref, exampleDoor } from "../subject-doors";
import type { Review } from "../types";
import { DiscussPanel } from "./DiscussPanel";
import { DoorLink } from "./DoorLink";
import { ReplaysTable } from "./ReplaysTable";
import { fmtCost, fmtDate } from "./tokens";

export function ReviewRow({
  review,
  onChanged,
}: {
  review: Review;
  /** Guidance sent from the thread changes the FINDINGS — refetch on resolve. */
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery({
    queryKey: ["hindsight", "review", review.id],
    queryFn: () => getReview(review.id),
    enabled: expanded,
  });

  const completed = review.status === "completed";
  const examples = review.examples ?? [];

  return (
    <Card className="p-3">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Badge
          variant={completed ? "secondary" : "destructive"}
          className={cn(
            completed &&
              "border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {review.status}
        </Badge>
        <span className="text-sm">
          read {review.example_count} real{" "}
          {review.example_count === 1 ? "transcript" : "transcripts"}
        </span>
        <span className="text-xs text-muted-foreground">
          cost {fmtCost(review.total_cost)} to review
        </span>
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
          {fmtDate(review.created_at)}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {review.summary && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                What the reviewer saw
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{review.summary}</p>
            </div>
          )}
          {review.what_worked && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                What worked (keep it)
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {review.what_worked}
              </p>
            </div>
          )}

          {examples.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">
                The runs it read ({examples.length})
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {examples.map((ex, i) => {
                  const kind = ex.kind ?? "run";
                  const id = ex.id ?? "";
                  const door = id ? exampleDoor(kind, id) : null;
                  const label = `${kind} ${id.slice(0, 8)}`;
                  return door ? (
                    <DoorLink key={`${id}-${i}`} size="xs" door={{ ...door, label }} />
                  ) : (
                    <span
                      key={`${id}-${i}`}
                      className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {review.reviewer_conversation_id && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-muted-foreground">
                Reviewer&apos;s own run
              </span>
              <DoorLink
                size="xs"
                door={{
                  href: conversationHref(review.reviewer_conversation_id),
                  label: "Open reviewer transcript",
                  external: false,
                }}
              />
            </div>
          )}

          {review.error && (
            <div>
              <div className="text-xs font-medium uppercase text-red-600 dark:text-red-400">
                Why it failed
              </div>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                {JSON.stringify(review.error, null, 2)}
              </pre>
            </div>
          )}

          <DiscussPanel reviewId={review.id} onResolved={onChanged} />

          {detail.isLoading && <Skeleton className="h-16" />}
          {detail.data && (detail.data.replays ?? []).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Replays ({(detail.data.replays ?? []).length})
              </div>
              <ReplaysTable replays={detail.data.replays ?? []} />
            </div>
          )}
          {detail.data && (detail.data.replays ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              No replays were run for this review.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
