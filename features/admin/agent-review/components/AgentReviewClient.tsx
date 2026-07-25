"use client";

// Agent Review Queue — the ONE place agents drop anything they built that
// Arman must go see/test. Reads/writes agent.review_queue directly via
// supabase-js (super-admin RLS). Agents insert rows via the Supabase MCP and
// read feedback back the same way. See ../FEATURE.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  ExternalLink,
  Archive,
  CheckCircle2,
  Undo2,
  MessageSquareWarning,
  ClipboardCheck,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  REVIEW_STATUS_LABELS,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";

const STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  changes_requested: "bg-red-500/15 text-red-600 dark:text-red-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  archived: "bg-muted text-muted-foreground",
};

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function rowHumanText(row: ReviewQueueRow): string {
  return [
    `Review item: ${row.title}`,
    `URL: ${row.url}`,
    `Status: ${REVIEW_STATUS_LABELS[row.status as ReviewStatus] ?? row.status}`,
    `Source: ${row.source}`,
    `Instructions: ${row.instructions}`,
    row.feedback ? `Feedback: ${row.feedback}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function ReviewItemCard({
  row,
  onChanged,
}: {
  row: ReviewQueueRow;
  onChanged: () => void;
}) {
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    async (patch: Partial<ReviewQueueRow>, successMessage: string) => {
      setSaving(true);
      try {
        const supabase = createClient();
        const { error } = await supabase
          .schema("agent")
          .from("review_queue")
          .update(patch)
          .eq("id", row.id);
        if (error) throw new Error(error.message);
        toast.success(successMessage);
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      } finally {
        setSaving(false);
      }
    },
    [row.id, onChanged],
  );

  const saveFeedback = (status?: ReviewStatus) => {
    const trimmed = feedback.trim();
    void update(
      {
        feedback: trimmed || null,
        feedback_at: trimmed ? new Date().toISOString() : null,
        ...(status ? { status } : {}),
      },
      status
        ? `Saved — ${REVIEW_STATUS_LABELS[status]}`
        : "Feedback saved",
    );
  };

  const status = row.status as ReviewStatus;
  const isArchived = status === "archived";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <Badge className={STATUS_BADGE_CLASS[status] ?? ""}>
          {REVIEW_STATUS_LABELS[status] ?? status}
        </Badge>
        <span className="font-medium text-sm text-foreground truncate">{row.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {row.source} · {ageLabel(row.created_at)}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <CopyButtons
            size="icon"
            label={`Review item ${row.title}`}
            human={() => rowHumanText({ ...row, feedback: feedback.trim() || row.feedback })}
            agent={() => ({
              kind: "agent-review-item",
              location: "Admin — Agent Review Queue",
              description:
                "One item from agent.review_queue awaiting/holding human review feedback. Act on the feedback, then UPDATE the row (set status back to 'pending' for re-review, or 'archived' once fully handled).",
              data: { ...row, feedback: feedback.trim() || row.feedback },
            })}
          />
          <Button asChild variant="outline" size="sm" className="h-7 gap-1">
            <a href={row.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.instructions}</p>

      {!isArchived && (
        <div className="space-y-1.5">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Your feedback for the agent…"
            className="min-h-16 text-sm"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              disabled={saving}
              onClick={() => saveFeedback()}
            >
              Save feedback
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-red-600 dark:text-red-400"
              disabled={saving}
              onClick={() => saveFeedback("changes_requested")}
            >
              <MessageSquareWarning className="h-3.5 w-3.5" />
              Request changes
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-emerald-600 dark:text-emerald-400"
              disabled={saving}
              onClick={() => saveFeedback("approved")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-muted-foreground"
              disabled={saving}
              onClick={() => void update({ status: "archived" }, "Archived")}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
            {row.feedback_at && (
              <span className="text-xs text-muted-foreground ml-auto">
                feedback {ageLabel(row.feedback_at)}
              </span>
            )}
          </div>
        </div>
      )}

      {isArchived && (
        <div className="flex items-center gap-2">
          {row.feedback && (
            <p className="text-xs text-muted-foreground truncate">“{row.feedback}”</p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 ml-auto"
            disabled={saving}
            onClick={() => void update({ status: "pending" }, "Restored to queue")}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Restore
          </Button>
        </div>
      )}
    </div>
  );
}

const SECTION_ORDER: { status: ReviewStatus; heading: string }[] = [
  { status: "pending", heading: "Needs your review" },
  { status: "changes_requested", heading: "Waiting on agents — changes requested" },
  { status: "approved", heading: "Approved — waiting on agents to wrap up" },
];

export default function AgentReviewClient() {
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: qError } = await supabase
        .schema("agent")
        .from("review_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (qError) throw new Error(qError.message);
      setRows(data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review queue");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const byStatus = new Map<string, ReviewQueueRow[]>();
    for (const row of rows ?? []) {
      const list = byStatus.get(row.status) ?? [];
      list.push(row);
      byStatus.set(row.status, list);
    }
    return byStatus;
  }, [rows]);

  const archived = grouped.get("archived") ?? [];

  // The queue grows without bound, so the page MUST own a scroll container:
  // `.shell-main` is a fixed-height, overflow-hidden box, so a plain
  // `max-w-4xl` page simply clipped everything below the fold and no amount of
  // scrolling reached it. Same shape as the other admin clients (header
  // pinned, list scrolls) — see SharedKnowledgeAdminClient.
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 pt-4 pb-3">
        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">Agent Review Queue</h1>
        <span className="text-xs text-muted-foreground">
          Everything agents built that needs your eyes
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1"
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 px-4 pb-8">

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {rows === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {rows !== null &&
        SECTION_ORDER.map(({ status, heading }) => {
          const items = grouped.get(status) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={status} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                {heading} ({items.length})
              </h2>
              {items.map((row) => (
                <ReviewItemCard key={row.id} row={row} onChanged={() => void load()} />
              ))}
            </section>
          );
        })}

      {rows !== null &&
        rows.filter((r) => r.status !== "archived").length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Queue is clear — nothing waiting for review.
          </div>
        )}

      {rows !== null && archived.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((row) => (
              <ReviewItemCard key={row.id} row={row} onChanged={() => void load()} />
            ))}
        </section>
      )}
        </div>
      </div>
    </div>
  );
}
