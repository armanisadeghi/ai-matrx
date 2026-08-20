"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ChatThread } from "@/features/messaging/components/ChatThread";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import {
  loadReviewQueueItem,
  recordHumanReviewAction,
} from "@/features/admin/agent-review/service";
import {
  EMPTY_REVIEW_REGISTRY,
  loadReviewRegistry,
  type ReviewRegistry,
} from "@/features/admin/agent-review/registry";
import {
  REVIEW_STATUS_LABELS,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";

const STAGES: Array<{ label: string; statuses: ReviewStatus[] }> = [
  { label: "Submitted", statuses: ["submitted"] },
  { label: "Agent review", statuses: ["agent_review"] },
  {
    label: "Changes",
    statuses: ["agent_changes_requested", "human_changes_requested"],
  },
  { label: "Ready for you", statuses: ["ready_for_human"] },
  { label: "Approved", statuses: ["approved"] },
  { label: "Archived", statuses: ["archived"] },
];

function classification(row: ReviewQueueRow, registry: ReviewRegistry) {
  const domain = registry.domainsById.get(row.domain_id)?.name ?? "Not assigned";
  const feature = row.feature_id
    ? registry.featuresById.get(row.feature_id)?.name ?? "Not assigned"
    : "Not assigned";
  return { domain, feature };
}

export default function AgentReviewWorkspace({ reviewId }: { reviewId: string }) {
  const user = useAppSelector(selectUser);
  const [row, setRow] = useState<ReviewQueueRow | null>(null);
  const [registry, setRegistry] = useState<ReviewRegistry>(EMPTY_REVIEW_REGISTRY);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [item, nextRegistry] = await Promise.all([
        loadReviewQueueItem(reviewId),
        loadReviewRegistry(),
      ]);
      setRow(item);
      setRegistry(nextRegistry);
      setError(item ? null : "Review item not found");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Review item failed to load");
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadReviewQueueItem(reviewId), loadReviewRegistry()])
      .then(([item, nextRegistry]) => {
        if (!active) return;
        setRow(item);
        setRegistry(nextRegistry);
        setError(item ? null : "Review item not found");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Review item failed to load");
        }
      });
    return () => {
      active = false;
    };
  }, [reviewId]);

  const currentStage = useMemo(
    () => STAGES.findIndex((stage) => row && stage.statuses.includes(row.status as ReviewStatus)),
    [row],
  );

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!row) return <div className="p-6 text-sm text-muted-foreground">Loading review…</div>;

  const names = classification(row, registry);
  const status = row.status as ReviewStatus;

  async function act(nextStatus: ReviewStatus, content: string) {
    if (!user?.id || !row) return;
    setSaving(true);
    try {
      await recordHumanReviewAction({ row, userId: user.id, content, status: nextStatus });
      setFeedback("");
      await refresh();
      toast.success(REVIEW_STATUS_LABELS[nextStatus]);
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Review action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={row.url} target="_blank">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open page
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/administration/users/agent-review">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> All reviews
            </Link>
          </Button>
        </div>
        <h1 className="mt-3 text-xl font-semibold">{row.title}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <div><dt className="text-muted-foreground">Current step</dt><dd>{REVIEW_STATUS_LABELS[status]}</dd></div>
          <div><dt className="text-muted-foreground">Domain</dt><dd>{names.domain}</dd></div>
          <div><dt className="text-muted-foreground">Feature</dt><dd>{names.feature}</dd></div>
          <div><dt className="text-muted-foreground">Repository</dt><dd>{row.repo_slug}</dd></div>
        </dl>
      </header>

      <nav aria-label="Review progress" className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {STAGES.map((stage, index) => (
            <div key={stage.label} className="contents">
              {index > 0 ? <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
              <div
                className={`flex-1 rounded-md border px-2 py-2 text-center text-sm ${
                  index === currentStage
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : index < currentStage
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "bg-muted/30 text-muted-foreground"
                }`}
              >
                {stage.label}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-h-0 border-r">
          {row.conversation_id ? (
            <ChatThread
              conversationId={row.conversation_id}
              userId={user?.id ?? undefined}
              displayName="Arman"
              className="h-full"
            />
          ) : (
            <div className="p-6 text-sm text-destructive">Conversation unavailable.</div>
          )}
        </section>

        <aside className="overflow-y-auto p-4">
          <h2 className="font-semibold">Your review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Messages stay in this thread across every repair and re-review round.
          </p>
          <ProTextarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Tell the agent exactly what should change…"
            className="mt-4 min-h-36"
          />
          <div className="mt-3 grid gap-2">
            <Button
              disabled={saving || !feedback.trim()}
              onClick={() => void act("human_changes_requested", feedback)}
            >
              Request changes
            </Button>
            <Button
              variant="outline"
              disabled={saving || status !== "ready_for_human"}
              onClick={() => void act("approved", feedback)}
            >
              <Check className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button
              variant="ghost"
              disabled={saving || status === "archived"}
              onClick={() =>
                void act(
                  "submitted",
                  feedback.trim() || "Run the agent review again from the beginning.",
                )
              }
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Run agent review again
            </Button>
            {status === "approved" ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => void act("archived", feedback)}
              >
                Archive completed review
              </Button>
            ) : null}
          </div>

          <div className="mt-6 border-t pt-4 text-sm">
            <div className="text-muted-foreground">Original target</div>
            <div className="mt-1 break-all">{row.url}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
