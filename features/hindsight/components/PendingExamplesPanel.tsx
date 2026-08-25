"use client";

/**
 * PendingExamplesPanel — what the NEXT review would read, with the settle
 * window made visible.
 *
 * The 2026-08-19 blind test's worst failure: 3 of 4 reviews silently read the
 * PREVIOUS session because the 30-min settle cutoff excluded the target, and
 * nothing anywhere said so. This panel is the cure's UI half: it lists the
 * waiting runs (each openable — the Door Law), flags the ones "Review now"
 * will NOT read yet, and puts a "Review just this" door on every run — the
 * focused review that bypasses the settle window and never advances the
 * watermark.
 *
 * Shared by the admin console (`EnrollmentDetailPanel`) and the product
 * improvement workspace (`EnrollmentSidebar`) — one honesty surface, not two.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Eye, Repeat2 } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { describeBackendFailure } from "@/lib/api/errors";

import { getPendingExamples, triggerReplay } from "../api";
import { exampleDoor, type DoorAudience } from "../subject-doors";
import type { PendingExample, SubjectKind } from "../types";
import { DoorLink } from "./DoorLink";
import { fmtDate } from "./tokens";

/**
 * The server's focused-review door (`example_ids`) exists only for these
 * subject kinds (`fetch_focused_examples` refuses the rest BY NAME). Gating on
 * the EXAMPLE kind would be wrong: a tool enrollment's examples are
 * conversations, but focusing one is still refused.
 */
const FOCUSABLE_SUBJECT_KINDS: SubjectKind[] = ["agent", "orchestra", "workflow"];

/**
 * Which example kinds the replay endpoint can actually re-run. `ReplayRequest`
 * accepts a conversation OR a workflow run and nothing else — a
 * `wf_node_outcome` is a step INSIDE a run, not a re-issuable call, so it gets
 * no button rather than a button that 422s.
 */
const REPLAYABLE_EXAMPLE_KINDS = new Set(["conversation", "wf_run"]);

/** The kind-shaped source the server demands: exactly one of the two. */
function replaySourceFor(kind: string, id: string) {
  return kind === "wf_run"
    ? { source_wf_run_id: id }
    : { source_conversation_id: id };
}

export function PendingExamplesPanel({
  enrollmentId,
  subjectKind,
  audience,
  onReviewExample,
  reviewRunning,
  className,
}: {
  enrollmentId: string;
  subjectKind: SubjectKind;
  audience: DoorAudience;
  /** Runs the focused "review THIS conversation" door for one example id. */
  onReviewExample: (exampleId: string) => void;
  reviewRunning: boolean;
  className?: string;
}) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: ["hindsight", "pending-examples", enrollmentId],
    queryFn: () => getPendingExamples(enrollmentId),
    // "What's pending" tolerates a minute of staleness; the query does real
    // DB scans server-side and this panel mounts on every enrollment view.
    staleTime: 60_000,
  });

  // Replay re-runs a REAL recorded call and pays for it. Nothing in the UI
  // could start one before this — `triggerReplay` existed in the API client
  // with zero callers, so the replay judge was only ever reachable from
  // server-side queues.
  const replay = useMutation({
    mutationFn: ({ kind, id }: { kind: string; id: string }) =>
      triggerReplay(enrollmentId, replaySourceFor(kind, id)),
    onSuccess: (result) => {
      if (result.status === "failed") {
        toast.error(
          `Replay did not run: ${result.reason ?? "no reason given"}`,
        );
      } else if (result.verdict) {
        toast.success(`Replay judged: ${result.verdict}`);
      } else {
        toast.success("Replay queued.");
      }
      // The verdict lands on the enrollment's replay tables and its spend
      // counters — both are on the detail query, not this one.
      queryClient.invalidateQueries({ queryKey: ["hindsight", "enrollment"] });
      queryClient.invalidateQueries({ queryKey: ["hindsight", "costs"] });
    },
    onError: (err: Error) =>
      toast.error(describeBackendFailure(err).headline),
  });

  // A fetch failure must NOT render as "nothing pending, all settled" — that
  // silent blank is the exact blind spot this panel exists to close.
  if (pending.isError) {
    return (
      <p className={cn("text-xs text-destructive", className)}>
        Could not load what the next review would read — the settle-window
        warning is unavailable right now.
      </p>
    );
  }
  const data = pending.data;
  const examples: PendingExample[] = data?.examples ?? [];
  if (!data || examples.length === 0) return null;

  const unsettled = data.unsettled_count ?? 0;
  const focusable = FOCUSABLE_SUBJECT_KINDS.includes(subjectKind);

  return (
    <div className={cn("space-y-2", className)}>
      {unsettled > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {unsettled} of these run{unsettled === 1 ? " is" : "s are"} from
            the last {data.settle_minutes} minutes and still settling —{" "}
            <strong>
              &ldquo;Review now&rdquo; will not read{" "}
              {unsettled === 1 ? "it" : "them"}
            </strong>
            . Use &ldquo;Review just this&rdquo; to read one anyway.
          </span>
        </p>
      )}
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Waiting for the next review ({examples.length})
      </div>
      <div className="space-y-1">
        {examples.map((ex) => {
          const door = ex.id ? exampleDoor(ex.kind, ex.id, audience) : null;
          return (
            <div
              key={`${ex.kind}-${ex.id}`}
              className="min-w-0 space-y-2 rounded-md border border-border px-2 py-1.5"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {ex.kind} {ex.id.slice(0, 8)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtDate(ex.at)}
                </span>
                {!ex.settled && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    settling
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                {door && (
                  <DoorLink size="xs" door={door} className="max-w-full" />
                )}
                {focusable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 max-w-full px-2 text-[11px]"
                    disabled={reviewRunning}
                    onClick={() => onReviewExample(ex.id)}
                    title="Review exactly this run now — bypasses the settle window, never advances the queue"
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Review just this
                  </Button>
                )}
                {isAdmin && REPLAYABLE_EXAMPLE_KINDS.has(ex.kind) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 max-w-full px-2 text-[11px]"
                    disabled={replay.isPending}
                    data-testid="hindsight-replay-example"
                    title="Re-run this exact call against the candidate change and rank the result against what really happened. Spends real money."
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Replay this recorded call?",
                        description:
                          "It re-runs the original request on a private fork and pays for the run. The judge then ranks the result against what really happened.",
                        confirmLabel: "Replay",
                      });
                      if (ok) replay.mutate({ kind: ex.kind, id: ex.id });
                    }}
                  >
                    <Repeat2
                      className={cn(
                        "mr-1 h-3 w-3",
                        replay.isPending &&
                          replay.variables?.id === ex.id &&
                          "animate-spin",
                      )}
                    />
                    {replay.isPending && replay.variables?.id === ex.id
                      ? "Replaying…"
                      : "Replay"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
