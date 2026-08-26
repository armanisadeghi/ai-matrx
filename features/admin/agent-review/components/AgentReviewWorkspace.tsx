"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ChatThread } from "@/features/messaging/components/ChatThread";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import {
  useSurfaceRuntimeRegistration,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME,
  createAdminAgentReviewItemScope,
} from "@/features/surfaces/manifests/admin-agent-review-item.manifest";
import { parseReviewMetadata } from "@/features/admin/agent-review/triage";
import { reviewTargetPageDisplay } from "@/features/admin/agent-review/target-page";
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
  const domain =
    registry.domainsById.get(row.domain_id)?.name ?? "Not assigned";
  const feature = row.feature_id
    ? (registry.featuresById.get(row.feature_id)?.name ?? "Not assigned")
    : "Not assigned";
  return { domain, feature };
}

export default function AgentReviewWorkspace({
  reviewId,
}: {
  reviewId: string;
}) {
  const router = useRouter();
  const user = useAppSelector(selectUser);
  const [row, setRow] = useState<ReviewQueueRow | null>(null);
  const [registry, setRegistry] = useState<ReviewRegistry>(
    EMPTY_REVIEW_REGISTRY,
  );
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
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Review item failed to load",
      );
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadReviewQueueItem(reviewId), loadReviewRegistry()])
      .then(([item, nextRegistry]) => {
        if (!active) return;
        setRow(item);
        setRegistry(nextRegistry);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Review item failed to load",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reviewId]);

  // The surface emits only once the row is loaded: this page has early
  // returns for loading and error, and an unregistered surface is honest
  // where a scope of empty strings would be a lie. `useSurfaceRuntimeRegistration`
  // (not a wrapping provider) is what survives those branch flips.
  useSurfaceRuntimeRegistration(
    row
      ? {
          surfaceName: ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME,
          isEditable: false,
          getScope: () => {
            const names = classification(row, registry);
            const triage = parseReviewMetadata(row.metadata);
            return createAdminAgentReviewItemScope({
              review_id: row.id,
              review_title: row.title,
              review_status: row.status as ReviewStatus,
              review_target_url: reviewTargetPageDisplay(row.url).fullHref,
              review_repo_slug: row.repo_slug,
              review_domain: names.domain,
              review_feature: names.feature,
              review_created_at: row.created_at,
              review_updated_at: row.updated_at,
              review_instructions: row.instructions,
              feedback_draft: feedback,
              can_act: row.status === "ready_for_human" && Boolean(user?.id),
              ...(row.feedback ? { review_feedback: row.feedback } : {}),
              ...(row.conversation_id
                ? { review_conversation_id: row.conversation_id }
                : {}),
              ...(triage.state === "ready" ? { review_triage: triage.triage } : {}),
            });
          },
        }
      : null,
  );

  // The draft target stages prose into the SAME buffer the human types into.
  // Nothing is saved and no status moves — Request changes / Approve / Run
  // agent review again stay human button presses.
  useSurfaceWriteHandlers(
    row ? ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME : null,
    {
      review_feedback_draft: (value: unknown) => {
        if (typeof value !== "string") {
          throw new Error(
            "review_feedback_draft expects the full replacement text as a plain string.",
          );
        }
        setFeedback(value);
      },
    },
  );

  const currentStage = useMemo(
    () =>
      STAGES.findIndex(
        (stage) => row && stage.statuses.includes(row.status as ReviewStatus),
      ),
    [row],
  );

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!row)
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading review…</div>
    );

  const names = classification(row, registry);
  const status = row.status as ReviewStatus;

  async function act(nextStatus: ReviewStatus, content: string) {
    if (!user?.id || !row) return;
    setSaving(true);
    try {
      await recordHumanReviewAction({
        row,
        userId: user.id,
        content,
        status: nextStatus,
      });
      setFeedback("");
      await refresh();
      toast.success(REVIEW_STATUS_LABELS[nextStatus]);
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Review action failed",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            aria-label="Back to reviews"
            title="Back to reviews"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="relative min-w-0 flex-1 overflow-hidden">
            <h1 className="truncate pr-8 text-lg font-semibold" title={row.title}>
              {row.title}
            </h1>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-background"
            />
          </div>

          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href={row.url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open page
            </Link>
          </Button>
        </div>

        <nav
          aria-label="Review classification"
          className="mt-1.5 flex min-w-0 items-center gap-1 text-xs"
        >
          <span className="min-w-0 truncate font-medium">{row.repo_slug}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{names.domain}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{names.feature}</span>
        </nav>
      </header>

      <nav aria-label="Review progress" className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {STAGES.map((stage, index) => (
            <div key={stage.label} className="contents">
              {index > 0 ? (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null}
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
              messageBubbleClassName="max-w-[80%] md:max-w-[80%]"
            />
          ) : (
            <div className="p-6 text-sm text-destructive">
              Conversation unavailable.
            </div>
          )}
        </section>

        <aside className="overflow-y-auto p-4">
          <h2 className="font-semibold">Your review</h2>
          <ProTextarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Tell the agent exactly what should change…"
            className="mt-4 min-h-36"
          />
          <div className="mt-3 grid gap-2">
            <Button
              disabled={
                saving || status !== "ready_for_human" || !feedback.trim()
              }
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
                  feedback.trim() ||
                    "Run the agent review again from the beginning.",
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

          <div className="mt-6 border-t pt-4">
            <h2 className="font-semibold">Original target</h2>
            <div className="mt-1 break-all text-sm">{row.url}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
