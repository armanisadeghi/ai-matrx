"use client";

/**
 * "Analyze all pages" — queue AI keyword analysis for a whole site through the
 * half-price Batch lane, and show honestly where that work is.
 *
 * Nothing about this lane is instant: the provider answers in minutes to hours.
 * So the control never pretends to wait. It confirms what will happen, queues,
 * says what was queued, and keeps a compact live count (waiting / delivering /
 * analyzed / failed) read from batch.work_item, refreshed every minute while
 * anything is still moving.
 *
 * Doc: features/marketing/components/pages/FEATURE.md § Analyze all pages
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import {
  fetchPageAnalysisQueue,
  submitPageAnalysisBatch,
  type PageAnalysisBatchSummary,
  type PageAnalysisQueueState,
} from "@/features/marketing/data/page-analysis-batch";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const QUEUE_REFRESH_MS = 60_000;

function queueKey(siteId: string) {
  return ["marketing", "page-analysis-batch-queue", siteId] as const;
}

/**
 * aidream 1c3fcb5fa added `more_pages_waiting` to BatchSubmitSummary. The generated
 * types cannot be regenerated today (`pnpm sync-types` stops at the entity-token
 * vocabulary step: @ai-matrx/associations lags platform.entity_types by two
 * tokens), so the field is read through this one narrow runtime check. Replace
 * with `summary.more_pages_waiting` once api-types.ts carries it.
 */
function morePagesWaiting(summary: PageAnalysisBatchSummary): boolean {
  return (summary as Record<string, unknown>).more_pages_waiting === true;
}

function describeSubmission(summary: PageAnalysisBatchSummary): {
  title: string;
  description: string;
} {
  const skipped: string[] = [];
  if (summary.skipped_unchanged) {
    skipped.push(`${summary.skipped_unchanged} unchanged since their last analysis`);
  }
  if (summary.skipped_no_content) {
    skipped.push(`${summary.skipped_no_content} with no readable content`);
  }
  if (summary.errors?.length) {
    skipped.push(`${summary.errors.length} could not be prepared`);
  }
  const more = morePagesWaiting(summary)
    ?" More pages are waiting: press Analyze all pages again to queue the next ones."
    : "";

  if (summary.enqueued > 0) {
    return {
      title: `Queued ${summary.enqueued} page${summary.enqueued === 1 ? "" : "s"} for analysis`,
      description:
        "Runs on the batch lane at about half the live price. Results usually arrive within the hour and appear on each page's analysis." +
        (skipped.length ? ` Skipped: ${skipped.join(", ")}.` : "") +
        more,
    };
  }
  if (summary.requested === 0) {
    return {
      title: "Nothing to queue",
      description:
        "Every crawled page is already analyzed for its current content or is waiting in the queue. Crawl more pages to analyze them.",
    };
  }
  return {
    title: "Nothing new to queue",
    description: `${skipped.join(", ") || "No page needed a new analysis"}.${more}`,
  };
}

function QueueLine({ state }: { state: PageAnalysisQueueState }) {
  const total = state.waiting + state.delivering + state.analyzed + state.failed;
  if (total === 0) return null;
  const parts: string[] = [];
  if (state.waiting) parts.push(`${state.waiting} waiting`);
  if (state.delivering) parts.push(`${state.delivering} arriving`);
  parts.push(`${state.analyzed} analyzed`);
  if (state.failed) parts.push(`${state.failed} failed`);
  return (
    <span
      className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline"
      title={
        state.lastQueuedAt
          ? `Batch page analysis for this site. Last queued ${formatCompactDate(state.lastQueuedAt)}. Refreshes every minute while work is moving.`
          : "Batch page analysis for this site."
      }
    >
      Analysis: {parts.join(" · ")}
    </span>
  );
}

export function AnalyzeAllPagesControl({
  siteId,
  organizationId,
}: {
  siteId: string;
  organizationId: string;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const queue = useQuery({
    queryKey: queueKey(siteId),
    queryFn: ({ signal }) => fetchPageAnalysisQueue(siteId, signal),
    enabled: Boolean(siteId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.waiting + data.delivering > 0 ? QUEUE_REFRESH_MS : false;
    },
  });

  const submit = useMutation({
    mutationFn: () => submitPageAnalysisBatch(dispatch, siteId, organizationId),
    onSuccess: (summary) => {
      setConfirming(false);
      const { title, description } = describeSubmission(summary);
      if (summary.enqueued > 0) toast.success(title, { description });
      else toast.info(title, { description });
      void queryClient.invalidateQueries({ queryKey: queueKey(siteId) });
    },
    onError: (error) => {
      setConfirming(false);
      toast.error("Could not queue page analysis", {
        description: extractErrorMessage(error),
      });
    },
  });

  return (
    <>
      {queue.data ? <QueueLine state={queue.data} /> : null}
      {queue.isError ? (
        <span
          className="hidden text-xs text-destructive md:inline"
          title={extractErrorMessage(queue.error)}
        >
          Analysis queue status unavailable
          <ErrorAlchemyMenu />
        </span>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setConfirming(true)}
        disabled={submit.isPending}
      >
        <ScanSearch className="h-3.5 w-3.5" />
        {submit.isPending ? "Queuing analysis…" : "Analyze all pages"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && !submit.isPending && setConfirming(false)}
        title="Analyze all pages?"
        description="Queues AI keyword analysis for up to 200 crawled pages that still need it; pages unchanged since their last analysis are skipped and cost nothing. It runs on the batch lane at about half the live price, so nothing appears instantly: results usually arrive within the hour (at most about 10 hours) and land on each page. Large sites queue 200 pages at a time; press again to queue the next ones."
        confirmLabel="Queue analysis"
        busy={submit.isPending}
        onConfirm={() => submit.mutate()}
      />
    </>
  );
}
