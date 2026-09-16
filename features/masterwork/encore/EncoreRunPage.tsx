"use client";

// features/masterwork/encore/EncoreRunPage.tsx
//
// The Encore run experience for ONE released Masterwork: what it does, who
// is behind it, the input box, the live streamed run, the result, and this
// Operator's own recent runs. The run machinery is the canonical
// TryMasterworkBox (typed run start + adoptForeignStream +
// followWorkflowRunStream + refresh rejoin) — never a second renderer.
//
// Operator copy only (THE MISMATCH RULE): no "workflow", no "compile", no
// version numbers. The Expert-facing doors (Rulebook, Studio) render only
// for viewers who can actually open them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, SquareArrowOutUpRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { runHref } from "@/features/workflow-runtime/run-doors";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import { AuditionProof } from "./AuditionProof";
import { getBenchProof, UNAVAILABLE, type BenchProofState } from "./benchProof";
import { ExpertSignOff } from "../review/ExpertSignOff";
import { MASTERWORK_RUN_SUBJECT_TYPE } from "../review/signature";
import { RunTheBench } from "./RunTheBench";
import {
  getEncoreMasterwork,
  listMyEncoreRuns,
  type EncoreMasterwork,
  type EncoreRun,
} from "./service";

function runWhen(run: EncoreRun): string {
  return formatRelativeTime(run.created_at, { style: "short" });
}

const RUN_STATUS_STYLES: Record<string, string> = {
  completed: "bg-primary",
  failed: "bg-destructive",
  errored: "bg-destructive",
  abandoned: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  completed: "Finished",
  failed: "Didn't finish",
  errored: "Didn't finish",
  abandoned: "Didn't finish",
  cancelled: "Stopped",
  running: "Working",
  pending: "Starting",
};

export function EncoreRunPage({ masterworkId }: { masterworkId: string }) {
  const userId = useAppSelector(selectUserId);
  const [masterwork, setMasterwork] = useState<EncoreMasterwork | null>(null);
  const [runs, setRuns] = useState<EncoreRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // THE PROOF is a separate question from the quick check, and it is asked out
  // loud: the panel shows the bench verdict, or says plainly there is none.
  const [bench, setBench] = useState<BenchProofState>({ status: "loading" });

  const refreshRuns = useCallback(() => {
    listMyEncoreRuns(masterworkId)
      .then(setRuns)
      .catch(() => undefined); // History is enrichment — never blanks the page.
  }, [masterworkId]);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const m = await getEncoreMasterwork(masterworkId);
        if (isCancelled()) return;
        setMasterwork(m);
        setError(null);
      } catch (err) {
        // NEVER swallow this — the error is what tells AccessGate whether the
        // Operator is denied, signed out, or looking at a real fault.
        if (!isCancelled()) setError(err);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [masterworkId],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  // The Bench is asked for by RULEBOOK, so it can only be asked once the
  // Masterwork has loaded. A viewer who cannot read the Rulebook gets the
  // "can't tell from here" sentence rather than a false "no proof".
  const rulebookId = masterwork?.rulebook?.id ?? null;
  const refreshBench = useCallback(() => {
    if (!rulebookId) return;
    void getBenchProof(rulebookId).then(setBench);
  }, [rulebookId]);
  useEffect(() => {
    let cancelled = false;
    if (!rulebookId) {
      setBench(UNAVAILABLE);
      return;
    }
    setBench({ status: "loading" });
    void getBenchProof(rulebookId).then((state) => {
      if (!cancelled) setBench(state);
    });
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoadingSpinner />
        <span>Loading Masterwork…</span>
      </div>
    );
  }
  if (error || !masterwork) {
    // NEVER hand-write "isn't here or no access" copy. Under RLS an empty read
    // means four different things (denied · deleted · never existed · signed
    // out); AccessGate resolves the TRUE state. A Masterwork is a
    // workflow.definition row, so the workflow token resolves it.
    return (
      <AccessGate
        token="workflow"
        id={masterworkId}
        error={error}
        onRetry={() => void load(() => false)}
        fallbackHref="/masterwork/encore"
        fallbackLabel="Back to Encore"
      />
    );
  }

  const ownsRulebook =
    masterwork.rulebook !== null &&
    userId !== null &&
    masterwork.rulebook.created_by === userId;

  if (masterwork.released_at === null) {
    // A draft never runs from Encore — the Expert finishes it in the Studio.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This one isn&apos;t ready to run yet — the expert behind it
          hasn&apos;t released it.
        </p>
        {ownsRulebook && masterwork.rulebook ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/masterwork/${masterwork.rulebook.id}/masterworks`}>
              <Wrench className="mr-1 h-4 w-4" />
              Open in Studio
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/masterwork/encore">Back to Encore</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              {masterwork.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {masterwork.rulebook ? (
                <Link
                  href={`/masterwork/${masterwork.rulebook.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  By {masterwork.rulebook.expert}
                </Link>
              ) : null}
              {masterwork.rule_count !== null ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  {masterwork.rule_count} rules
                </Badge>
              ) : null}
              <span
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                title={`Last updated ${formatAbsoluteDate(masterwork.updated_at)}`}
              >
                <Clock3 className="h-3 w-3" />
                {formatRelativeTime(masterwork.updated_at)}
              </span>
            </div>
          </div>
          {ownsRulebook && masterwork.rulebook ? (
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Open in Studio"
            >
              <Link
                href={`/masterwork/${masterwork.rulebook.id}/masterworks`}
                aria-label="Open in Studio"
              >
                <Wrench className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
        {masterwork.deliverable ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            <span className="text-foreground">Creates: </span>
            {masterwork.deliverable}
          </p>
        ) : null}
        <AuditionProof
          variant="panel"
          score={masterwork.auditionScore}
          verdict={masterwork.auditionVerdict}
          auditionedAt={masterwork.auditionedAt}
          bench={bench}
        />
        {/* THE PROOF HAS A DOOR. It sits beside the quick check because that
            is the comparison being made: one is a two-arm check, the other is
            the six-arm trial that can establish a win. When the server cannot
            start one here, this renders its reason — never a dead button. */}
        {rulebookId ? (
          <RunTheBench
            rulebookId={rulebookId}
            bench={bench}
            onVerdict={refreshBench}
          />
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <TryMasterworkBox
            masterworkId={masterwork.id}
            masterworkKind={masterwork.masterwork_kind}
            submitLabel={masterwork.submit_label}
            fieldLabels={
              masterwork.masterwork_kind === "edit"
                ? ["Your text", "Key facts"]
                : undefined
            }
            onRunFinished={refreshRuns}
          />
        </div>

        {runs.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your recent runs
            </h3>
            <div className="mt-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  // PHONE: the sign-off buttons are ~230px wide, so on a 390px
                  // screen a single flex row squeezed the run's own line down to
                  // one character per line ("F / i / n / i ..."). The row stacks
                  // below `sm` and the link keeps its words intact.
                  className="flex flex-col items-start gap-1 rounded px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
                >
                  {/* THE DOOR IS IN THIS APP (wall W36): an Operator's finished
                      run is read at its own permalink here, never in the
                      author's Studio on another host. */}
                  <Link
                    href={runHref(run.id)}
                    className="group flex w-full min-w-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground sm:w-auto sm:flex-1"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        RUN_STATUS_STYLES[run.status] ??
                          "bg-muted-foreground/50",
                      )}
                    />
                    <span>{RUN_STATUS_LABELS[run.status] ?? run.status}</span>
                    <span>· {runWhen(run)}</span>
                    <SquareArrowOutUpRight className="ml-1 h-3 w-3 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
                  </Link>
                  {/* 🚨 THE SIGNATURE OUTLIVES THE RUN BOX. The Try box shows
                      the thumbs the moment a run ends, and then forgets the run
                      on purpose — so without this, an Expert who came back an
                      hour later had no way to say "yes, that one was mine" and
                      the most important signal we have was lost to a page
                      reload. Same control, same row in
                      `platform.output_feedback`. Only a FINISHED run: there is
                      nothing to sign on a run that failed. */}
                  {run.status === "completed" ? (
                    <ExpertSignOff
                      subjectType={MASTERWORK_RUN_SUBJECT_TYPE}
                      subjectId={run.id}
                      showPrompt={false}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
