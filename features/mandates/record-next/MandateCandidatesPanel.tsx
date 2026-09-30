"use client";

// features/mandates/record-next/MandateCandidatesPanel.tsx
//
// THE CANDIDATES TAB (Mandate Candidates, PLAN §2.6 / P13 / P17 / P18) — a
// non-protected tab BESIDE the ten (the `runs` precedent; UI-REGISTER
// "Suggestions go beside them"). Arman, 2026-09-28: the point is to "take away
// the fear of 'what if'" — set a candidate, watch real results come in, then
// promote or remove it.
//
//   · Set candidate            → the one SetCandidateDialog (rung = this seat)
//   · the active candidate     → what it is vs what runs now, runs in / wanted,
//                                the derived recommendation (P8), Promote /
//                                Put back / Discard (shown only when the server
//                                says this viewer holds the rung's rights)
//   · its pairs                → MatrxDataTable; a row opens the pair window
//                                (F3's `useOpenCandidateRun`), in place
//   · skips + uncovered doors  → P17: nothing sits silently at "0 of 3"
//   · history                  → past candidates; a row opens its summary
//                                (F3's `useOpenCandidateSummary`)
//
// Every read and write is aidream's live-candidate doors
// (features/mandates/candidate-dialog/api.ts); counts are the server's derived
// counts, never recomputed here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Undo2, Trash2, ArrowUpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Cost } from "@/components/cost/Cost";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import {
  COVERED_DOORS,
  candidateFailureSentence,
  discardLiveCandidate,
  fetchLiveCandidate,
  fetchLiveCandidates,
  promoteLiveCandidate,
  putBackLiveCandidate,
  type LiveCandidate,
  type LiveCandidatePromoteResult,
  type LiveCandidateRun,
  type LiveCandidatesResponse,
} from "@/features/mandates/candidate-dialog/api";
import { SetCandidateDialog } from "@/features/mandates/candidate-dialog/SetCandidateDialog";
import {
  RUNG_LABEL,
  doorLabel,
  skipLabel,
  type CandidateRungChoice,
} from "@/features/mandates/candidate-dialog/target";
import {
  useOpenCandidateRun,
  useOpenCandidateSummary,
} from "@/features/mandates/candidates/openers";
import { announceCandidatesChanged, onCandidatesChanged } from "./useCandidateCount";

const VERDICT_TONE: Record<string, string> = {
  better: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  same: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  worse: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  regressed: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const RECOMMENDATION_TONE: Record<string, string> = {
  promote: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  hold: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  reject: "border-red-500/40 text-red-700 dark:text-red-400",
};

const STATUS_WORD: Record<LiveCandidate["status"], string> = {
  collecting: "Collecting",
  ready: "All in",
  promoted: "Promoted",
  discarded: "Discarded",
  cancelled: "Cancelled",
};

const STOP_MATCH_WORD: Record<string, string> = {
  same_call: "same call as live",
  same_tool_different_args: "same tool, other args",
  different_tool: "different tool",
  live_made_no_call: "live made no call",
};

export interface MandateCandidatesPanelProps {
  mandateKey: AnyMandateKey;
  mandateName: string;
  outputKind?: string | null;
  /** The rung this seat is viewing — the dialog's default. */
  rung: CandidateRungChoice;
  /** A seat that may look but not change. */
  readOnly?: boolean;
}

export function MandateCandidatesPanel({
  mandateKey,
  mandateName,
  outputKind = null,
  rung,
  readOnly = false,
}: MandateCandidatesPanelProps) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<LiveCandidatesResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Pairs are held with the candidate they belong to, so a switch of active
  // candidate never shows the previous one's pairs (no reset-in-effect).
  const [pairs, setPairs] = useState<{
    candidateId: string;
    runs: LiveCandidateRun[] | null;
    failure: string | null;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reads, setReads] = useState(0);

  const reload = useCallback(() => {
    setFailure(null);
    setReads((n) => n + 1);
  }, []);
  useEffect(() => onCandidatesChanged(mandateKey, reload), [mandateKey, reload]);

  useEffect(() => {
    let cancelled = false;
    fetchLiveCandidates(dispatch, mandateKey).then(
      (answer) => {
        if (cancelled) return;
        setFailure(null);
        setState(answer);
      },
      (error: unknown) => {
        if (!cancelled) setFailure(candidateFailureSentence(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey, reads]);

  const active = state?.active ?? null;
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetchLiveCandidate(dispatch, activeId).then(
      (detail) => {
        if (!cancelled) setPairs({ candidateId: activeId, runs: detail.runs ?? [], failure: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setPairs({ candidateId: activeId, runs: null, failure: candidateFailureSentence(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, activeId, reads]);
  const current = pairs && pairs.candidateId === activeId ? pairs : null;
  const runs = current?.runs ?? null;
  const runsFailure = current?.failure ?? null;

  const changed = useCallback(() => announceCandidatesChanged(mandateKey), [mandateKey]);

  if (failure) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-sm text-destructive">
          {failure} <ErrorAlchemyMenu error={failure} />
        </p>
        <Button variant="outline" size="sm" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading candidates
      </div>
    );
  }

  const others = (state.open ?? []).filter((c) => c.id !== activeId);
  const uncovered = Object.entries(state.forecast.doors ?? {}).filter(
    ([door]) => !COVERED_DOORS.includes(door),
  );

  return (
    <div className="space-y-4" data-testid="mandate-candidates-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {active ? null : "No candidate is collecting. Set one to try a change on real runs first."}
        </div>
        {readOnly ? null : (
          <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {active ? "New candidate" : "Set candidate"}
          </Button>
        )}
      </div>

      {active ? (
        <CandidateCard candidate={active} onChanged={changed} />
      ) : null}

      {active ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold">Pairs</h3>
          {runsFailure ? (
            <p className="text-xs text-destructive">
              {runsFailure} <ErrorAlchemyMenu error={runsFailure} />
            </p>
          ) : (
            <PairsTable runs={runs} />
          )}
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold">Also open at other levels</h3>
          {others.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} compact onChanged={changed} />
          ))}
        </section>
      ) : null}

      <CoverageFacts active={active} uncovered={uncovered} windowDays={state.forecast.window_days} />

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold">History</h3>
        <HistoryTable history={state.history ?? []} onChanged={changed} />
      </section>

      {dialogOpen ? (
        <SetCandidateDialog
          mandateKey={mandateKey}
          mandateName={mandateName}
          outputKind={outputKind}
          rung={rung}
          onClose={() => setDialogOpen(false)}
          onSet={changed}
        />
      ) : null}
    </div>
  );
}

/** What the candidate is, what runs now, how far it got, and the decision. */
function CandidateCard({
  candidate,
  compact = false,
  onChanged,
}: {
  candidate: LiveCandidate;
  compact?: boolean;
  onChanged: () => void;
}) {
  const counts = countsOf(candidate);
  const viewerId = useAppSelector(selectUserId);
  const bad = counts.runs_failed > 0 || (counts.verdicts?.regressed ?? 0) > 0;
  return (
    <div
      data-testid="candidate-card"
      className={cn(
        "space-y-2 rounded-md border bg-card p-3",
        bad ? "border-destructive/50" : candidate.stalled ? "border-amber-500/50" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <HolderName type={candidate.holder_type} id={candidate.holder_id} name={candidate.holder_name} />
        <span className="text-xs text-muted-foreground">instead of</span>
        {candidate.baseline_holder_id && candidate.baseline_holder_type ? (
          <HolderName
            type={candidate.baseline_holder_type}
            id={candidate.baseline_holder_id}
            name={candidate.baseline_holder_name ?? null}
          />
        ) : (
          <span className="text-xs text-muted-foreground">nothing</span>
        )}
        <Badge variant="outline" className="text-[11px]">
          {RUNG_LABEL[candidate.rung]}
        </Badge>
        <Badge variant="secondary" className="text-[11px]">
          {STATUS_WORD[candidate.status]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span
          data-testid="candidate-runs-in"
          className={cn("font-semibold tabular-nums", bad && "text-destructive")}
        >
          {counts.runs_in} of {counts.runs_wanted} in
        </span>
        {counts.runs_pending > 0 ? (
          <span className="text-muted-foreground">{counts.runs_pending} running</span>
        ) : null}
        {counts.runs_failed > 0 ? (
          <span className="font-medium">{counts.runs_failed} failed</span>
        ) : null}
        {counts.runs_stopped > 0 ? (
          <span className="text-muted-foreground">{counts.runs_stopped} stopped at a write</span>
        ) : null}
        {(["better", "same", "worse", "regressed"] as const)
          .filter((v) => (counts.verdicts?.[v] ?? 0) > 0)
          .map((v) => (
            <span key={v} className={cn("rounded px-1", VERDICT_TONE[v])}>
              {counts.verdicts?.[v]} {v}
            </span>
          ))}
        {candidate.stalled ? (
          <span className="text-amber-700 dark:text-amber-400">No new run lately</span>
        ) : null}
        {!compact ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            Set by
            {candidate.set_by === viewerId ? (
              <span className="text-foreground">you</span>
            ) : (
              <MatrxUuidCell value={candidate.set_by} token="user" label="Set by" />
            )}
            {formatRelativeTime(candidate.created_at)}
          </span>
        ) : null}
      </div>

      {candidate.recommendation ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className={cn("capitalize", RECOMMENDATION_TONE[candidate.recommendation])}
          >
            {candidate.recommendation}
          </Badge>
          {candidate.recommendation_reason ? (
            <span className="text-muted-foreground">{candidate.recommendation_reason}</span>
          ) : null}
        </div>
      ) : null}

      <DecisionButtons candidate={candidate} onChanged={onChanged} />
    </div>
  );
}

/** The server's derived counts with every optional number read as 0. */
function countsOf(candidate: LiveCandidate) {
  const c = candidate.counts;
  return {
    runs_wanted: c.runs_wanted,
    runs_in: c.runs_in ?? 0,
    runs_failed: c.runs_failed ?? 0,
    runs_stopped: c.runs_stopped ?? 0,
    runs_pending: c.runs_pending ?? 0,
    verdicts: c.verdicts ?? {},
  };
}

function HolderName({
  type,
  id,
  name,
}: {
  type: "agent" | "workflow";
  id: string;
  name: string | null;
}) {
  return (
    <EntityRef
      token={type === "workflow" ? "workflow" : "agent"}
      id={id}
      name={name}
      showIcon={false}
      className="min-w-0 font-medium"
    />
  );
}

/** Promote / Put back / Discard — only when the server says this viewer decides. */
function DecisionButtons({
  candidate,
  onChanged,
}: {
  candidate: LiveCandidate;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [versions, setVersions] = useState<LiveCandidatePromoteResult["versions"] | null>(null);
  // Read once per mount — the Put back window is hours long.
  const [now] = useState(() => Date.now());

  if (!candidate.can_decide) return null;
  const open = candidate.status === "collecting" || candidate.status === "ready";
  const canPutBack =
    candidate.status === "promoted" &&
    Boolean(candidate.put_back_until) &&
    new Date(candidate.put_back_until as string).getTime() > now;
  if (!open && !canPutBack) return null;

  const act = async (what: string, call: () => Promise<unknown>) => {
    setBusy(what);
    setRefusal(null);
    try {
      await call();
      onChanged();
    } catch (error: unknown) {
      setRefusal(candidateFailureSentence(error));
    } finally {
      setBusy(null);
    }
  };

  const promote = (versionId?: string) =>
    act("promote", async () => {
      const result = await promoteLiveCandidate(dispatch, candidate.id, {
        version_id: versionId ?? null,
      });
      if (result.status === "needs_version") {
        // P13: pairs ran different versions — nothing was written; pick one.
        setVersions(result.versions);
        return;
      }
      setVersions(null);
      toast.success(result.message);
    });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {open ? (
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={busy !== null}
            onClick={() => void promote()}
            title="Make it what runs here. Put back stays available for a while."
          >
            {busy === "promote" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpCircle className="h-3 w-3" />}
            Promote
          </Button>
        ) : null}
        {canPutBack ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busy !== null}
            onClick={() =>
              void act("put-back", async () => {
                await putBackLiveCandidate(dispatch, candidate.id);
                toast.success("Put back — what ran before runs again.");
              })
            }
            title={`Restore what ran before, until ${new Date(candidate.put_back_until as string).toLocaleString()}.`}
          >
            {busy === "put-back" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            Put back
          </Button>
        ) : null}
        {open ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            disabled={busy !== null}
            onClick={() =>
              void act("discard", async () => {
                await discardLiveCandidate(dispatch, candidate.id);
                toast.success("Candidate discarded.");
              })
            }
          >
            {busy === "discard" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Discard
          </Button>
        ) : null}
      </div>
      {versions && versions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Pairs ran different versions. Promote:</span>
          {versions.map((choice) => (
            <Button
              key={choice.version_id ?? "latest"}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy !== null}
              onClick={() => void promote(choice.version_id ?? undefined)}
            >
              {choice.label} · {choice.runs} run{choice.runs === 1 ? "" : "s"}
            </Button>
          ))}
        </div>
      ) : null}
      {refusal ? (
        <p className="text-xs text-destructive">
          {refusal} <ErrorAlchemyMenu error={refusal} />
        </p>
      ) : null}
    </div>
  );
}

function PairsTable({ runs }: { runs: LiveCandidateRun[] | null }) {
  const openRun = useOpenCandidateRun();
  const columns = useMemo<MatrxColumnDef<LiveCandidateRun>[]>(
    () => [
      {
        id: "number",
        header: "#",
        width: 44,
        filter: false,
        accessorFn: (run) => run.number,
        cell: (run) => <span className="tabular-nums">{run.number}</span>,
      },
      {
        id: "status",
        header: "Outcome",
        width: 150,
        filter: "select",
        accessorFn: (run) => run.status,
        cell: (run) => <PairOutcome run={run} />,
      },
      {
        id: "door",
        header: "Door",
        width: 120,
        filter: "select",
        accessorFn: (run) => doorLabel(run.door),
        cell: (run) => <span className="text-xs">{doorLabel(run.door)}</span>,
      },
      {
        id: "stop",
        header: "Stopped at",
        width: 170,
        filter: false,
        accessorFn: (run) => run.stop_match ?? "",
        cell: (run) =>
          run.status === "stopped" ? (
            <span className="text-xs">
              {stoppedTool(run) ?? "a write"}
              {run.stop_match ? (
                <span className="text-muted-foreground"> · {STOP_MATCH_WORD[run.stop_match] ?? run.stop_match}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "cost",
        header: "Cost (live → candidate)",
        width: 170,
        filter: false,
        sortable: false,
        cell: (run) => (
          <span className="text-xs">
            <Cost usd={metric(run.live_metrics, "cost_usd")} short /> →{" "}
            <Cost usd={metric(run.candidate_metrics, "cost_usd")} short />
          </span>
        ),
      },
      {
        id: "created",
        header: "When",
        width: 110,
        filter: false,
        accessorFn: (run) => run.created_at,
        cell: (run) => <span className="text-xs text-muted-foreground">{formatRelativeTime(run.created_at)}</span>,
      },
    ],
    [],
  );
  if (runs === null) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Reading pairs
      </p>
    );
  }
  return (
    <MatrxDataTable<LiveCandidateRun>
      tableId="mandates/candidate-pairs"
      data={runs}
      columns={columns}
      getRowId={(run) => run.id}
      defaultSort={{ id: "number", direction: "asc" }}
      pageSize={10}
      // A row opens its Detail record (F3), never the table's own inspector.
      detail={{ enabled: false }}
      onRowOpen={(run) => openRun(run.id, { name: `Pair ${run.number}`, siblings: runs.map((r) => r.id) })}
      getRowHref={(run) => `/detail/mandate_candidate_run/${run.id}`}
      emptyState={{ title: "No pairs yet — the next real run brings one" }}
    />
  );
}

function PairOutcome({ run }: { run: LiveCandidateRun }) {
  if (run.status === "queued" || run.status === "running") {
    return (
      <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {run.status}
      </Badge>
    );
  }
  if (run.status === "failed" || run.status === "timed_out") {
    return (
      <span className="inline-flex items-center gap-0.5">
        <Badge variant="outline" className="border-destructive/50 text-[11px] text-destructive" title={run.candidate_error_code ?? undefined}>
          {run.status === "failed" ? "failed" : "timed out"}
        </Badge>
        <ErrorAlchemyMenu error={run.candidate_error_code ?? run.status} />
      </span>
    );
  }
  if (run.status === "stopped") {
    return <Badge variant="outline" className="text-[11px]">stopped</Badge>;
  }
  return run.verdict ? (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", VERDICT_TONE[run.verdict])}>
      {run.verdict}
    </span>
  ) : (
    <Badge variant="outline" className="text-[11px] text-muted-foreground" title={run.judge_error_code ?? undefined}>
      not judged
    </Badge>
  );
}

function stoppedTool(run: LiveCandidateRun): string | null {
  const stopped = (run.tool_dispositions ?? []).find((d) => d.disposition === "stopped");
  return stopped?.tool ?? null;
}

function metric(metrics: LiveCandidateRun["live_metrics"], key: string): number | null {
  const value = metrics?.[key];
  return typeof value === "number" ? value : null;
}

/** P17 — why runs did not feed it, and what this job runs through that never can. */
function CoverageFacts({
  active,
  uncovered,
  windowDays,
}: {
  active: LiveCandidate | null;
  uncovered: [string, number][];
  windowDays: number;
}) {
  const skips = Object.entries(active?.skips ?? {}).filter(([, n]) => n > 0);
  if (skips.length === 0 && uncovered.length === 0) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-2" data-testid="candidate-coverage">
      {skips.length > 0 ? (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold">Runs it skipped</h3>
          <ul className="space-y-0.5 text-xs">
            {skips.map(([reason, n]) => (
              <li key={reason} className="flex justify-between gap-2">
                <span>{skipLabel(reason)}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {uncovered.length > 0 ? (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold" title={`This job's runs in the last ${windowDays} days`}>
            Doors a candidate never sees
          </h3>
          <ul className="space-y-0.5 text-xs">
            {uncovered.map(([door, n]) => (
              <li key={door} className="flex justify-between gap-2">
                <span>{doorLabel(door)}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function HistoryTable({
  history,
  onChanged,
}: {
  history: LiveCandidate[];
  onChanged: () => void;
}) {
  const openSummary = useOpenCandidateSummary();
  const columns = useMemo<MatrxColumnDef<LiveCandidate>[]>(
    () => [
      {
        id: "holder",
        header: "Candidate",
        width: 220,
        filter: "text",
        accessorFn: (c) => c.holder_name,
        cell: (c) => <span className="block truncate text-xs font-medium">{c.holder_name}</span>,
      },
      {
        id: "status",
        header: "Ended",
        width: 110,
        filter: "select",
        accessorFn: (c) => STATUS_WORD[c.status],
        cell: (c) => <Badge variant="outline" className="text-[11px]">{STATUS_WORD[c.status]}</Badge>,
      },
      {
        id: "runs",
        header: "Runs in",
        width: 80,
        filter: false,
        accessorFn: (c) => c.counts.runs_in ?? 0,
        cell: (c) => (
          <span className="text-xs tabular-nums">
            {c.counts.runs_in ?? 0}/{c.counts.runs_wanted}
          </span>
        ),
      },
      {
        id: "recommendation",
        header: "Review said",
        width: 110,
        filter: "select",
        accessorFn: (c) => c.recommendation ?? "",
        cell: (c) =>
          c.recommendation ? (
            <Badge variant="outline" className={cn("text-[11px] capitalize", RECOMMENDATION_TONE[c.recommendation])}>
              {c.recommendation}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "rung",
        header: "Level",
        width: 110,
        filter: "select",
        accessorFn: (c) => RUNG_LABEL[c.rung],
        cell: (c) => <span className="text-xs">{RUNG_LABEL[c.rung]}</span>,
      },
      {
        id: "decided",
        header: "When",
        width: 110,
        filter: false,
        accessorFn: (c) => c.decided_at ?? c.updated_at,
        cell: (c) => (
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(c.decided_at ?? c.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        width: 110,
        filter: false,
        sortable: false,
        cell: (c) => (
          <div onClick={(event) => event.stopPropagation()}>
            <DecisionButtons candidate={c} onChanged={onChanged} />
          </div>
        ),
      },
    ],
    [onChanged],
  );
  return (
    <MatrxDataTable<LiveCandidate>
      tableId="mandates/candidate-history"
      data={history}
      columns={columns}
      getRowId={(c) => c.id}
      defaultSort={{ id: "decided", direction: "desc" }}
      pageSize={10}
      // A row opens its Detail record (F3), never the table's own inspector.
      detail={{ enabled: false }}
      onRowOpen={(c) => openSummary(c.id, { name: c.holder_name, siblings: history.map((h) => h.id) })}
      getRowHref={(c) => `/detail/mandate_candidate/${c.id}`}
      emptyState={{ title: "No past candidates" }}
    />
  );
}
