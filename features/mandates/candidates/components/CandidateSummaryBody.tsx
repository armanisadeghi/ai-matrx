"use client";

/**
 * The candidate summary body (Detail type `mandate_candidate`, PLAN §2.6).
 *
 * Recommendation first, then the runs as a compact list whose rows open the
 * pair window in place, then skips by reason (P17), then the decision:
 * Promote (asks which version when the pairs ran different ones — P13),
 * Put back (only inside the revert window), Discard. Decisions show only when
 * the server says this viewer holds the rung's rights (`can_decide`).
 */

import { useState } from "react";
import { ArrowUpCircle, ChevronRight, Undo2, XCircle } from "lucide-react";

import { Button } from "@ai-matrx/design-system";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BackendApiError } from "@/lib/api/errors";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { useOpenMandateWindowNext } from "@/features/overlays/openers/mandateWindowNext";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { storedMandateKey } from "@ai-matrx/agents/mandates";

import {
  discardCandidate,
  promoteCandidate,
  putBackCandidate,
  type LiveCandidate,
  type LiveCandidateRun,
  type LiveCandidateVersionChoice,
} from "../api";
import { useOpenCandidateRun } from "../openers";
import {
  CANDIDATE_STATUS_WORD,
  RECOMMENDATION_TONE,
  RECOMMENDATION_WORD,
  VERDICT_TONE,
  doorWord,
  attemptWord,
  runOutcomeWord,
  skipWord,
  discardConfirmation,
  promoteConfirmation,
  putBackConfirmation,
} from "../words";
import { CandidateHolderName } from "./CandidateHolderName";
import { Chip, NewTabLink, StateLine, detailPageHref } from "./parts";

export interface CandidateSummaryRow extends Record<string, unknown> {
  candidate: LiveCandidate;
  runs: LiveCandidateRun[];
}

function failMessage(error: unknown): string {
  if (error instanceof BackendApiError) return error.userMessage;
  return error instanceof Error ? error.message : String(error);
}

function isOpenForDecision(candidate: LiveCandidate): boolean {
  return candidate.status === "collecting" || candidate.status === "ready";
}

function canPutBack(candidate: LiveCandidate): boolean {
  if (candidate.status !== "promoted" || !candidate.put_back_until) return false;
  return new Date(candidate.put_back_until).getTime() > Date.now();
}

export function CandidateSummaryBody({ row }: { row: CandidateSummaryRow }) {
  const [candidate, setCandidate] = useState(row.candidate);
  // A heartbeat re-read (CandidateRecordBody) hands a newer candidate: take it.
  const [seen, setSeen] = useState(row.candidate);
  if (seen !== row.candidate) {
    setSeen(row.candidate);
    setCandidate(row.candidate);
  }
  const runs = [...row.runs].sort((a, b) => a.number - b.number);
  const openMandate = useOpenMandateWindowNext();
  const counts = candidate.counts;
  const skips = Object.entries(candidate.skips ?? {}).filter(([, n]) => n > 0);

  return (
    <div className="space-y-5" data-candidate-summary-body>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => openMandate({ initialMandateKey: storedMandateKey(candidate.mandate_key) })}
        >
          Open the mandate
        </Button>
        <NewTabLink href={detailPageHref("mandate_candidate", candidate.id)} />
      </div>

      <section className="space-y-2" data-candidate-recommendation>
        <div className="flex flex-wrap items-center gap-2">
          {candidate.recommendation ? (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-1 type-title",
                RECOMMENDATION_TONE[candidate.recommendation],
              )}
            >
              Recommended: {RECOMMENDATION_WORD[candidate.recommendation].toLowerCase()}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 type-title">
              No recommendation yet
            </span>
          )}
          <Chip>{CANDIDATE_STATUS_WORD[candidate.status]}</Chip>
          {candidate.stalled ? (
            <Chip className="bg-amber-500/15 text-amber-700 dark:text-amber-400">No runs lately</Chip>
          ) : null}
        </div>
        {candidate.recommendation_reason ? (
          <p className="type-body leading-relaxed">{candidate.recommendation_reason}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 type-secondary text-muted-foreground tabular-nums" data-candidate-counts>
          <span>
            <span className="font-semibold text-foreground">{counts.runs_in ?? 0}</span> of {counts.runs_wanted} in
          </span>
          {counts.runs_pending ? <span>{counts.runs_pending} running</span> : null}
          {counts.runs_stopped ? <span>{counts.runs_stopped} stopped</span> : null}
          {counts.runs_failed ? (
            <Chip className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{counts.runs_failed} didn&apos;t finish</Chip>
          ) : null}
        </div>
        <div className="type-secondary text-muted-foreground">
          <CandidateHolderName
            type={candidate.holder_type}
            id={candidate.holder_id}
            versionId={candidate.holder_version_id ?? null}
            name={candidate.holder_name}
          />
          {" replacing "}
          {candidate.baseline_holder_id && candidate.baseline_holder_type ? (
            <CandidateHolderName
              type={candidate.baseline_holder_type}
              id={candidate.baseline_holder_id}
              versionId={candidate.baseline_holder_version_id ?? null}
              name={candidate.baseline_holder_name ?? null}
            />
          ) : (
            <span className="font-medium text-foreground">nothing of its own</span>
          )}
        </div>
      </section>

      <Decisions candidate={candidate} runs={runs} onCandidate={setCandidate} />

      <section className="space-y-2" data-candidate-runs>
        <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">Runs</h4>
        {runs.length === 0 ? (
          <StateLine>No real run has come through yet.</StateLine>
        ) : (
          <RunsList runs={runs} />
        )}
      </section>

      {skips.length > 0 ? (
        <section className="space-y-2" data-candidate-skips>
          <h4 className="type-secondary font-semibold uppercase tracking-wide text-muted-foreground">
            Runs not used
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {skips.map(([reason, n]) => (
              <Chip key={reason}>
                {skipWord(reason)} · {n}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RunsList({ runs }: { runs: LiveCandidateRun[] }) {
  const openRun = useOpenCandidateRun();
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border">
      {runs.map((run) => {
        const tone =
          run.status === "completed" && run.verdict
            ? VERDICT_TONE[run.verdict]
            : run.status === "failed" || run.status === "timed_out"
              ? "bg-red-500/15 text-red-700 dark:text-red-400"
              : run.status === "stopped"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground";
        const liveMs = typeof run.live_metrics?.duration_ms === "number" ? run.live_metrics.duration_ms : null;
        const candMs =
          typeof run.candidate_metrics?.duration_ms === "number" ? run.candidate_metrics.duration_ms : null;
        return (
          <li key={run.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent pointer-coarse:py-3"
              onClick={() => openRun(run.id, { name: `Run ${run.number}`, siblings: runs.map((r) => r.id) })}
              data-candidate-run-row={run.id}
            >
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">#{run.number}</span>
              <Chip className={tone}>{runOutcomeWord(run)}</Chip>
              {attemptWord(run.attempts) ? (
                <span className="shrink-0 type-meta text-muted-foreground" title="Interrupted, then run again.">
                  {attemptWord(run.attempts)}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{doorWord(run.door)}</span>
              <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline" title="Live · candidate">
                {liveMs == null ? "—" : formatDurationMs(liveMs)} · {candMs == null ? "—" : formatDurationMs(candMs)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type Pending = null | "promote" | "put-back" | "discard";

function Decisions({
  candidate,
  runs,
  onCandidate,
}: {
  candidate: LiveCandidate;
  runs: LiveCandidateRun[];
  onCandidate: (candidate: LiveCandidate) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<LiveCandidateVersionChoice[] | null>(null);
  const [chosenVersion, setChosenVersion] = useState<string | null>(null);

  if (!candidate.can_decide) return null;
  const open = isOpenForDecision(candidate);
  const putBack = canPutBack(candidate);
  if (!open && !putBack) return null;

  const mandate = mandateDisplayName(storedMandateKey(candidate.mandate_key));
  const judged = runs.filter((r) => r.status === "completed" && r.verdict).length;
  const subject = {
    candidateName: candidate.holder_name,
    baselineName: candidate.baseline_holder_name ?? null,
    recommendation: candidate.recommendation,
    judged,
    mandateName: mandate,
  };
  const promoteWords = promoteConfirmation(subject);
  const promoteWarns = candidate.recommendation === "reject" || candidate.recommendation === "hold";
  const putBackWords = putBackConfirmation(subject);
  const discardWords = discardConfirmation(subject);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(failMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const doPromote = () =>
    run(async () => {
      const result = await promoteCandidate(candidate.id, versions ? chosenVersion : null);
      if (result.status === "needs_version") {
        setVersions(result.versions ?? []);
        setChosenVersion(null);
        return;
      }
      onCandidate(result.candidate);
      setVersions(null);
      setPending(null);
      toast.success(result.message);
    });

  return (
    <section className="space-y-2" data-candidate-decisions>
      <div className="flex flex-wrap gap-1.5">
        {open ? (
          <>
            <Button size="sm" className="h-8 gap-1" onClick={() => setPending("promote")} data-candidate-promote>
              <ArrowUpCircle className="h-4 w-4" />
              Promote
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setPending("discard")}
              data-candidate-discard
            >
              <XCircle className="h-4 w-4" />
              Discard
            </Button>
          </>
        ) : null}
        {putBack ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={() => setPending("put-back")}
            data-candidate-put-back
          >
            <Undo2 className="h-4 w-4" />
            Put back
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={pending === "promote"}
        onOpenChange={(next) => {
          if (!next) {
            setPending(null);
            setVersions(null);
          }
        }}
        title={versions ? "Which version goes live?" : promoteWords.title}
        description={versions ? "The runs used different versions. Pick the one you compared." : promoteWords.description}
        content={
          versions ? (
            <div className="space-y-1.5" role="radiogroup" aria-label="Version">
              {versions.map((v) => (
                <label
                  key={v.version_id ?? "latest"}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm",
                    chosenVersion === v.version_id && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name="candidate-version"
                    checked={chosenVersion === v.version_id}
                    onChange={() => setChosenVersion(v.version_id)}
                    disabled={!v.version_id}
                  />
                  <span className="min-w-0 flex-1 truncate">{v.label}</span>
                  <span className="shrink-0 type-secondary text-muted-foreground">
                    {v.runs} run{v.runs === 1 ? "" : "s"}
                  </span>
                </label>
              ))}
            </div>
          ) : undefined
        }
        confirmLabel={versions ? "Promote" : promoteWords.confirmLabel}
        variant={versions || !promoteWarns ? undefined : "destructive"}
        busy={busy}
        confirmDisabled={versions !== null && !chosenVersion}
        onConfirm={doPromote}
      />

      <ConfirmDialog
        open={pending === "discard"}
        onOpenChange={(next) => !next && setPending(null)}
        title={discardWords.title}
        description={discardWords.description}
        confirmLabel={discardWords.confirmLabel}
        variant="destructive"
        busy={busy}
        onConfirm={() =>
          run(async () => {
            onCandidate(await discardCandidate(candidate.id));
            setPending(null);
            toast.success("Candidate discarded.");
          })
        }
      />

      <ConfirmDialog
        open={pending === "put-back"}
        onOpenChange={(next) => !next && setPending(null)}
        title={putBackWords.title}
        description={putBackWords.description}
        confirmLabel={putBackWords.confirmLabel}
        busy={busy}
        onConfirm={() =>
          run(async () => {
            onCandidate(await putBackCandidate(candidate.id));
            setPending(null);
            toast.success("Put back.");
          })
        }
      />
    </section>
  );
}
