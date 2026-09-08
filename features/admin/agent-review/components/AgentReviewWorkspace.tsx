"use client";

import { useEffect, useState } from "react";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MediumComponentLoading } from "@/components/matrx/LoadingComponents";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
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
  const getReviewScope = row
    ? () => {
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
          can_act: row.status === "ready_for_human" && Boolean(user?.id),
          ...(feedback ? { feedback_draft: feedback } : {}),
          ...(row.feedback ? { review_feedback: row.feedback } : {}),
          ...(row.conversation_id
            ? { review_conversation_id: row.conversation_id }
            : {}),
          ...(triage.state === "ready" ? { review_triage: triage.triage } : {}),
        });
      }
    : null;

  useSurfaceRuntimeRegistration(
    row && getReviewScope
      ? {
          surfaceName: ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME,
          isEditable: false,
          getScope: getReviewScope,
        }
      : null,
  );

  // The draft target stages prose into the SAME buffer the human types into.
  // Nothing is saved and no status moves — Request changes / Approve / Run
  // agent review again stay human button presses.
  useSurfaceWriteHandlers(row ? ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME : null, {
    review_feedback_draft: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error(
          "review_feedback_draft expects the full replacement text as a plain string.",
        );
      }
      setFeedback(value);
    },
  });

  const currentStage = STAGES.findIndex(
    (stage) => row && stage.statuses.includes(row.status as ReviewStatus),
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-card p-5">
          <h1 className="font-semibold text-destructive">
            Review failed to load
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!row)
    return (
      <div className="h-full" aria-label="Loading review">
        <MediumComponentLoading />
      </div>
    );

  const names = classification(row, registry);
  const status = row.status as ReviewStatus;
  const target = reviewTargetPageDisplay(row.url);

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
      <header className="shrink-0 border-b bg-card px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 shrink-0 sm:h-9 sm:w-9"
            aria-label="Back to reviews"
            title="Back to reviews"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-base font-semibold sm:text-lg"
              title={row.title}
            >
              {row.title}
            </h1>
          </div>

          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-11 shrink-0 sm:h-9"
          >
            <AppLink href={row.url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Open page
            </AppLink>
          </Button>
        </div>

        <nav
          aria-label="Review classification"
          className="mt-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
        >
          <span className="min-w-0 truncate">{row.repo_slug}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{names.domain}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{names.feature}</span>
        </nav>
      </header>

      <nav
        aria-label="Review progress"
        className="shrink-0 overflow-x-auto border-b bg-background px-4 py-2.5 lg:px-6"
      >
        <ol className="flex min-w-max items-center">
          {STAGES.map((stage, index) => (
            <li key={stage.label} className="flex items-center">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`mx-2 h-px w-5 sm:w-8 ${
                    index <= currentStage ? "bg-primary/60" : "bg-border"
                  }`}
                />
              ) : null}
              <span
                aria-current={index === currentStage ? "step" : undefined}
                className={`flex items-center gap-1.5 text-xs ${
                  index === currentStage
                    ? "font-semibold text-foreground"
                    : index < currentStage
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {index < currentStage ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${
                      index === currentStage
                        ? "bg-primary ring-4 ring-primary/15"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                )}
                {stage.label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
        <section className="flex min-h-[32rem] flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-4 py-2.5">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Review discussion</h2>
              <p className="text-xs text-muted-foreground">
                Agent activity and your replies stay together here.
              </p>
            </div>
          </div>
          {row.conversation_id ? (
            <ConversationPane
              conversationId={row.conversation_id}
              className="min-h-0 flex-1"
              surfaceName={ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME}
              showHeader={false}
              showAi={false}
              {...(getReviewScope
                ? { getApplicationScope: getReviewScope }
                : {})}
            />
          ) : (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This review has no discussion thread. Return to the queue and ask
              the filing agent to repair the review record.
            </div>
          )}
        </section>

        <aside className="bg-muted/15 p-4 lg:overflow-y-auto lg:p-5">
          <h2 className="font-semibold">Your decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a note for the agent, then choose what should happen next.
          </p>
          <ProTextarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Tell the agent exactly what should change…"
            aria-label="Review decision note"
            autoGrow
            minHeight={144}
            maxHeight={320}
            enableTextStats={false}
            surfaceName={ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME}
            {...(getReviewScope ? { getApplicationScope: getReviewScope } : {})}
            wrapperClassName="mt-4 w-full"
          />
          <div className="mt-3 grid gap-2">
            <Button
              className="h-11 sm:h-9"
              disabled={
                saving || status !== "ready_for_human" || !feedback.trim()
              }
              onClick={() => void act("human_changes_requested", feedback)}
            >
              Request changes
            </Button>
            <Button
              className="h-11 sm:h-9"
              variant="outline"
              disabled={saving || status !== "ready_for_human"}
              onClick={() => void act("approved", feedback)}
            >
              <Check className="mr-1.5 h-4 w-4" /> Approve
            </Button>
            <Button
              className="h-11 sm:h-9"
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
                className="h-11 sm:h-9"
                variant="secondary"
                disabled={saving}
                onClick={() => void act("archived", feedback)}
              >
                Archive completed review
              </Button>
            ) : null}
          </div>

          <div className="mt-6 border-t pt-4">
            <h2 className="text-sm font-semibold">Original target</h2>
            <AppLink
              href={target.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 flex items-start gap-1.5 break-all text-sm text-primary hover:underline"
              title={target.fullHref}
            >
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {target.label}
            </AppLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
