"use client";

/**
 * AgentSamplesManager — browse, borrow, approve, and prune an agent's sample
 * inputs ("test cases", rows of agent.exemplar keyed by agent_id).
 *
 * Mounted in the agent builder (user view) and on the admin agent samples page.
 * Freshness is DERIVED from contract hashes at read time — see
 * features/agents/samples/service.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  BadgeCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  approveAgentSample,
  borrowSampleFromRun,
  deleteAgentSample,
  fetchAgentContractHead,
  fetchAgentSamples,
  fetchCandidateRuns,
  fetchRunFinalResponse,
  sampleFreshness,
  setAgentSampleStatus,
  type AgentContractHead,
  type AgentSampleRow,
  type CandidateRun,
  type SampleFreshness,
} from "@/features/agents/samples/service";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  // PostgrestError (the approve RPC's cap refusal rides this) is a plain
  // object — String() renders "[object Object]".
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

const FRESHNESS_LABEL: Record<SampleFreshness, string> = {
  fresh: "Matches current contract",
  "input-stale": "Inputs changed since capture",
  "output-stale": "Output shape changed since capture",
  "both-stale": "Inputs and output changed since capture",
  unknown: "Capture contract unknown",
};

function FreshnessBadge({ freshness }: { freshness: SampleFreshness }) {
  if (freshness === "fresh") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
      >
        Current
      </Badge>
    );
  }
  if (freshness === "unknown") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Unverified
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/40 text-amber-600 dark:text-amber-400"
      title={FRESHNESS_LABEL[freshness]}
    >
      Stale
    </Badge>
  );
}

function variablesPreview(variables: unknown): string {
  if (!variables || typeof variables !== "object") return "";
  const entries = Object.entries(variables as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      const text =
        typeof value === "string" ? value : JSON.stringify(value ?? "");
      return `${key}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`;
    })
    .join(" · ");
}

export interface AgentSamplesManagerProps {
  agentId: string;
  /** Called with the chosen sample when a host offers "use this sample now". */
  onUseSample?: (sample: AgentSampleRow) => void;
}

export function AgentSamplesManager({
  agentId,
  onUseSample,
}: AgentSamplesManagerProps) {
  const [samples, setSamples] = useState<AgentSampleRow[]>([]);
  const [head, setHead] = useState<AgentContractHead | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSampleRow | null>(null);

  const reload = useCallback(async () => {
    try {
      const [rows, headRow] = await Promise.all([
        fetchAgentSamples(agentId),
        fetchAgentContractHead(agentId),
      ]);
      setSamples(rows);
      setHead(headRow);
    } catch (error: unknown) {
      toast.error(`Couldn't load test cases: ${describeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setLoading(true);
      void reload();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [reload]);

  async function withPending(id: string, work: () => Promise<void>) {
    setPendingId(id);
    try {
      await work();
      await reload();
    } catch (error: unknown) {
      toast.error(describeError(error));
    } finally {
      setPendingId(null);
    }
  }

  const approved = useMemo(
    () => samples.filter((sample) => sample.status === "approved"),
    [samples],
  );
  const candidates = useMemo(
    () => samples.filter((sample) => sample.status === "candidate"),
    [samples],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading test cases…
      </div>
    );
  }

  function renderSample(sample: AgentSampleRow) {
    const freshness = sampleFreshness(sample, head);
    const busy = pendingId === sample.id;
    return (
      <div
        key={sample.id}
        className="rounded-md border border-border bg-card p-2.5 space-y-1.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {sample.label}
              </span>
              <FreshnessBadge freshness={freshness} />
              {sample.status === "approved" ? (
                <Badge className="bg-primary/10 text-primary" variant="outline">
                  Approved
                </Badge>
              ) : null}
            </div>
            {sample.user_input ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                “{sample.user_input}”
              </p>
            ) : null}
            {variablesPreview(sample.variables) ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {variablesPreview(sample.variables)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onUseSample ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                onClick={() => onUseSample(sample)}
              >
                Use
              </Button>
            ) : null}
            {sample.status !== "approved" ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Approve — counts against the per-agent cap"
                disabled={busy}
                onClick={() =>
                  void withPending(sample.id, async () => {
                    await approveAgentSample(sample.id);
                    toast.success("Test case approved.");
                  })
                }
              >
                <BadgeCheck className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Move back to candidates"
                disabled={busy}
                onClick={() =>
                  void withPending(sample.id, () =>
                    setAgentSampleStatus(sample.id, "candidate"),
                  )
                }
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {sample.source_conversation_id ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Open the run this was borrowed from"
                asChild
              >
                <Link
                  href={`/agents/${agentId}/run?conversationId=${sample.source_conversation_id}`}
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              title="Delete test case"
              disabled={busy}
              onClick={() => setDeleteTarget(sample)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Approved test cases
          </h3>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Refresh"
            onClick={() => void reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {approved.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None yet — approve a candidate below, or borrow one from a real run.
          </p>
        ) : (
          approved.map(renderSample)
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Candidates
        </h3>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No candidates. Runs of this agent can be borrowed below.
          </p>
        ) : (
          candidates.map(renderSample)
        )}
      </section>

      <BorrowFromRunsSection agentId={agentId} onBorrowed={reload} />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this test case?"
        description={
          deleteTarget
            ? `“${deleteTarget.label}” will be removed from this agent's samples.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) return;
          void withPending(target.id, async () => {
            await deleteAgentSample(target.id);
            toast.success("Test case deleted.");
          });
        }}
      />
    </div>
  );
}

function BorrowFromRunsSection({
  agentId,
  onBorrowed,
}: {
  agentId: string;
  onBorrowed: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<CandidateRun[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [finalById, setFinalById] = useState<Record<string, string | null>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRuns(await fetchCandidateRuns(agentId));
    } catch (error: unknown) {
      toast.error(`Couldn't load runs: ${describeError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(run: CandidateRun) {
    const next = expandedId === run.conversationId ? null : run.conversationId;
    setExpandedId(next);
    if (next && finalById[next] === undefined) {
      try {
        const final = await fetchRunFinalResponse(next);
        setFinalById((prev) => ({ ...prev, [next]: final }));
      } catch (error: unknown) {
        toast.error(
          `Couldn't load the run's response: ${describeError(error)}`,
        );
      }
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Borrow from real runs
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next && runs.length === 0) void load();
          }}
        >
          {open ? "Hide runs" : "Browse runs"}
        </Button>
      </div>
      {!open ? null : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading recent runs…
        </div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No runs of this agent are visible to you yet — run it once and the run
          appears here.
        </p>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run) => {
            const expanded = expandedId === run.conversationId;
            const final = finalById[run.conversationId];
            return (
              <div
                key={run.conversationId}
                className="rounded-md border border-border bg-card p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void toggleExpand(run)}
                  >
                    <div className="truncate text-sm">
                      {run.title || "Untitled run"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                      {run.sourceFeature ? ` · ${run.sourceFeature}` : ""}
                    </div>
                    {run.userInput ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        “{run.userInput}”
                      </p>
                    ) : null}
                    {variablesPreview(run.variables) ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {variablesPreview(run.variables)}
                      </p>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Open the full conversation"
                      asChild
                    >
                      <Link
                        href={`/agents/${agentId}/run?conversationId=${run.conversationId}`}
                        target="_blank"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      disabled={savingId === run.conversationId}
                      onClick={() => {
                        setSavingId(run.conversationId);
                        void (async () => {
                          try {
                            await borrowSampleFromRun({ agentId, run });
                            toast.success(
                              "Saved as a candidate test case — approve it to make it a sample.",
                            );
                            await onBorrowed();
                          } catch (error: unknown) {
                            toast.error(
                              `Couldn't save the test case: ${describeError(error)}`,
                            );
                          } finally {
                            setSavingId(null);
                          }
                        })();
                      }}
                    >
                      {savingId === run.conversationId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {expanded ? (
                  <div className="mt-2 rounded bg-muted/50 p-2">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Final response
                    </div>
                    {final === undefined ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : final ? (
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs">
                        {final}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This run has no assistant response.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
