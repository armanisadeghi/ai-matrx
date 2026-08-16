"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  MessageCircleQuestion,
  Workflow,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { PackInterviewPanel } from "../detail/PackInterviewPanel";
import { BacktestDialog } from "./BacktestDialog";
import { PackDriftDialog } from "./PackDriftDialog";
import { TryDeskBox } from "./TryDeskBox";
import {
  getPack,
  listDesksForPack,
  listRecentRunsForDesks,
  type DeskRun,
} from "../../service";
import type { ExpertisePack, PackDesk } from "../../types";

function runDuration(run: DeskRun): string | null {
  if (!run.started_at || !run.completed_at) return null;
  const seconds =
    (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) /
    1000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds < 90 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`;
}

function runWhen(run: DeskRun): string {
  const ms = Date.now() - new Date(run.created_at).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const RUN_STATUS_STYLES: Record<string, string> = {
  completed: "bg-primary",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

function DeskRunRow({
  run,
  onFeedback,
}: {
  run: DeskRun;
  onFeedback?: (run: DeskRun) => void;
}) {
  const duration = runDuration(run);
  return (
    <div className="group flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/50">
      <a
        href={`${WORKFLOWS_APP_URL}/runs/${run.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2 hover:text-foreground"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            RUN_STATUS_STYLES[run.status] ?? "bg-muted-foreground/50",
          )}
        />
        <span className="capitalize">{run.status}</span>
        <span>· {runWhen(run)}</span>
        {duration ? <span>· {duration}</span> : null}
        {run.cost_usd !== null ? (
          <span>· ${run.cost_usd < 0.01 ? run.cost_usd.toFixed(4) : run.cost_usd.toFixed(2)}</span>
        ) : null}
        <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
      {onFeedback && run.status === "completed" ? (
        <button
          type="button"
          onClick={() => onFeedback(run)}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:border-primary/40 hover:text-primary group-hover:opacity-100"
          title="Turn what went wrong into new rules"
        >
          <MessageCircleQuestion className="mr-0.5 inline h-3 w-3" />
          What did it get wrong?
        </button>
      ) : null}
    </div>
  );
}

/**
 * Desks compiled from this pack: each is a working AI checker (a workflow)
 * stamped with the pack version it was compiled from. A desk behind the
 * pack's current version gets a drift flag — recompile to adopt the new rules.
 */
export function PackDesksPage({ packId }: { packId: string }) {
  const [pack, setPack] = useState<ExpertisePack | null>(null);
  const [desks, setDesks] = useState<PackDesk[]>([]);
  const [runsByDesk, setRunsByDesk] = useState<Record<string, DeskRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "What did it get wrong?" — the run whose outcome the expert is correcting.
  // Opens the interview panel seeded with the run context; the complaint
  // becomes draft rules in the pack through the Interviewer's tool. Owner-only:
  // the tool refuses non-owner writes, so inviting a visitor into an interview
  // that silently captures nothing would be a dead end.
  const userId = useAppSelector(selectUserId);
  const [feedbackSeed, setFeedbackSeed] = useState<string | null>(null);
  // The backtest, optionally prefilled with a finished run's own output —
  // "Compare to the original" beside a verdict is the same dialog, one paste
  // shorter. `null` = closed.
  const [backtestCandidate, setBacktestCandidate] = useState<string | null>(
    null,
  );
  // THE DOOR ON THE DRIFT FLAG: "the pack has newer rules" is a timestamp, not a
  // verdict, until the expert can see WHICH rules moved. Holds the drifted desk.
  const [driftDesk, setDriftDesk] = useState<PackDesk | null>(null);
  const isOwner =
    pack !== null && userId !== null && pack.created_by === userId;

  const refreshRuns = useCallback(async () => {
    if (desks.length === 0) return;
    try {
      setRunsByDesk(await listRecentRunsForDesks(desks.map((d) => d.id)));
    } catch {
      // Run history is enrichment — a failed refresh keeps the stale list.
    }
  }, [desks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, d] = await Promise.all([
          getPack(packId),
          listDesksForPack(packId),
        ]);
        if (cancelled) return;
        setPack(p);
        setDesks(d);
        if (!p) setError("This pack doesn't exist, or you don't have access.");
        if (d.length > 0) {
          // Run history is enrichment — its failure never blanks the page.
          listRecentRunsForDesks(d.map((desk) => desk.id))
            .then((runs) => {
              if (!cancelled) setRunsByDesk(runs);
            })
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load desks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !pack) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/expertise">Back to Expertise</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">
          Desks built from “{pack.name}”
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A desk is a working AI checker compiled from this pack&apos;s rules —
          cheap auditors check every rule, and the expert persona gives one
          final ruling. The pack is currently at version {pack.version}.
        </p>
      </div>

      {desks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Workflow className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No desks yet. Compile one from the pack page — one button, a few
            minutes, and this pack becomes a working checker.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/expertise/${pack.id}`}>Open the pack</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {desks.map((desk) => {
            const drifted =
              desk.pack_version !== null && desk.pack_version < pack.version;
            return (
              <div
                key={desk.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {desk.name}
                      </span>
                      {desk.desk_kind ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {desk.desk_kind === "edit"
                            ? "Checks & corrects"
                            : desk.desk_kind === "generate"
                              ? "Creates & checks"
                              : desk.desk_kind}
                        </Badge>
                      ) : null}
                      {desk.pack_version !== null ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          built from v{desk.pack_version}
                        </Badge>
                      ) : null}
                    </div>
                    {desk.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {desk.description}
                      </p>
                    ) : null}
                    {drifted ? (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-primary">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        The pack has newer rules (v{pack.version}) than this
                        desk was built from — recompile the desk to adopt them.
                        <button
                          type="button"
                          onClick={() => setDriftDesk(desk)}
                          className="underline underline-offset-2 hover:text-primary/80"
                        >
                          See what changed
                        </button>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`${WORKFLOWS_APP_URL}/workflows/${desk.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        Open in studio
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`${WORKFLOWS_APP_URL}/runs?workflow=${desk.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        Past runs
                      </a>
                    </Button>
                  </div>
                </div>
                {/* Try it right here — the desk is a working checker, not a
                    link to another app. Runs land in Recent runs below. */}
                <div className="mt-3 border-t border-border pt-3">
                  <TryDeskBox
                    deskId={desk.id}
                    deskKind={desk.desk_kind}
                    onRunFinished={() => void refreshRuns()}
                    onCompare={
                      isOwner
                        ? (candidate) => setBacktestCandidate(candidate)
                        : undefined
                    }
                  />
                </div>
                {(runsByDesk[desk.id] ?? []).length > 0 ? (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Recent runs
                    </p>
                    <div className="mt-1">
                      {(runsByDesk[desk.id] ?? []).map((run) => (
                        <DeskRunRow
                          key={run.id}
                          run={run}
                          onFeedback={
                            isOwner
                              ? () =>
                                  setFeedbackSeed(
                                    `I just looked at a run of the "${desk.name}" desk (${runWhen(run)}, run ${run.id.slice(0, 8)}) and something came out wrong. Here's what it got wrong: `,
                                  )
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {driftDesk !== null && driftDesk.pack_version !== null ? (
        <PackDriftDialog
          open
          onOpenChange={(open) => {
            if (!open) setDriftDesk(null);
          }}
          packId={packId}
          deskName={driftDesk.name}
          deskVersion={driftDesk.pack_version}
          currentVersion={pack.version}
          currentPrinciples={pack.principles}
        />
      ) : null}
      {isOwner ? (
        <BacktestDialog
          open={backtestCandidate !== null}
          onOpenChange={(open) => {
            if (!open) setBacktestCandidate(null);
          }}
          packId={packId}
          initialCandidate={backtestCandidate ?? undefined}
        />
      ) : null}
      {isOwner ? (
        <PackInterviewPanel
          packId={packId}
          open={feedbackSeed !== null}
          onOpenChange={(open) => {
            if (!open) setFeedbackSeed(null);
          }}
          seedText={feedbackSeed ?? undefined}
          onPackChanged={() => {
            toast.success("New draft rules captured", {
              description:
                "Review and approve them on the pack page — then recompile the desk to adopt them.",
            });
          }}
        />
      ) : null}
    </div>
  );
}
