"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  History,
  MessageCircleQuestion,
  Play,
  Rocket,
  SquareArrowOutUpRight,
  Undo2,
  Workflow,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { ScoutInterviewPanel } from "../detail/ScoutInterviewPanel";
import { AuditionDialog } from "./AuditionDialog";
import { MasterworkDriftDialog } from "./MasterworkDriftDialog";
import { TryMasterworkBox } from "./TryMasterworkBox";
import {
  computeMasterworkKpis,
  MasterworkKpiStrip,
  type MasterworkKpiFilter,
} from "../detail/RulebookKpiStrip";
import {
  listMasterworksForRulebook,
  listRecentRunsForMasterworks,
  setMasterworkReleased,
  type MasterworkRun,
} from "../../service";
import type { Masterwork, Rulebook } from "../../types";

function runDuration(run: MasterworkRun): string | null {
  if (!run.started_at || !run.completed_at) return null;
  const seconds =
    (new Date(run.completed_at).getTime() -
      new Date(run.started_at).getTime()) /
    1000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds < 90
    ? `${Math.round(seconds)}s`
    : `${Math.round(seconds / 60)}m`;
}

function runWhen(run: MasterworkRun): string {
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

function MasterworkRunRow({
  run,
  onFeedback,
}: {
  run: MasterworkRun;
  onFeedback?: (run: MasterworkRun) => void;
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
          <span>
            · $
            {run.cost_usd < 0.01
              ? run.cost_usd.toFixed(4)
              : run.cost_usd.toFixed(2)}
          </span>
        ) : null}
        <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
      {onFeedback && run.status === "completed" ? (
        <button
          type="button"
          onClick={() => onFeedback(run)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          title="Turn what went wrong into new rules"
          aria-label="What did this run get wrong?"
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Masterworks built from this Rulebook: each is a working AI checker (a
 * workflow) stamped with the Rulebook version it was built from. A Masterwork
 * behind the Rulebook's current version gets a drift flag — rebuild to adopt
 * the new rules.
 */
export function MasterworksPage({
  rulebook,
}: {
  /**
   * Handed down by `RulebookLaneRoute`, which already loaded and gated it.
   * This page must NOT read the Rulebook again: a second read is a second
   * denial story to hand-write, and hand-written denial copy is exactly what
   * AccessGate exists to kill.
   */
  rulebook: Rulebook;
}) {
  const rulebookId = rulebook.id;
  const searchParams = useSearchParams();
  const requestedFilter = searchParams.get("status");
  const activeFilter: MasterworkKpiFilter =
    requestedFilter === "current" || requestedFilter === "released"
      ? requestedFilter
      : "all";
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [runsByMasterwork, setRunsByMasterwork] = useState<
    Record<string, MasterworkRun[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "What did it get wrong?" — the run whose outcome the Expert is correcting.
  // Opens the interview panel seeded with the run context; the complaint
  // becomes draft rules in the Rulebook through the Scout's tool. Owner-only:
  // the tool refuses non-owner writes, so inviting a visitor into an interview
  // that silently captures nothing would be a dead end.
  const userId = useAppSelector(selectUserId);
  const [feedbackSeed, setFeedbackSeed] = useState<string | null>(null);
  // The Audition, optionally prefilled with a finished run's own output —
  // "Compare to the original" beside a verdict is the same dialog, one paste
  // shorter. `null` = closed.
  const [auditionCandidate, setAuditionCandidate] = useState<string | null>(
    null,
  );
  // THE DOOR ON THE DRIFT FLAG: "the Rulebook has newer rules" is a timestamp,
  // not a verdict, until the Expert can see WHICH rules moved. Holds the
  // drifted Masterwork.
  const [driftMasterwork, setDriftMasterwork] = useState<Masterwork | null>(
    null,
  );
  const isOwner =
    rulebook !== null && userId !== null && rulebook.created_by === userId;
  // Release / un-release in flight for one Masterwork (the Studio's lifecycle
  // action — released Masterworks appear on /masterwork/encore for Operators).
  const [releaseBusy, setReleaseBusy] = useState<string | null>(null);
  const kpis = computeMasterworkKpis(masterworks, rulebook.version);
  const visibleMasterworks = useMemo(
    () =>
      masterworks.filter((masterwork) => {
        if (activeFilter === "current") {
          return masterwork.rulebook_version === rulebook.version;
        }
        if (activeFilter === "released") {
          return masterwork.released_at !== null;
        }
        return true;
      }),
    [activeFilter, masterworks, rulebook.version],
  );

  const toggleReleased = async (masterwork: Masterwork) => {
    setReleaseBusy(masterwork.id);
    try {
      const updated = await setMasterworkReleased({
        masterworkId: masterwork.id,
        expectedVersion: masterwork.version,
        released: masterwork.released_at === null,
      });
      setMasterworks((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      toast.success(
        updated.released_at !== null
          ? "Released — Operators can now run it on Encore."
          : "Un-released — it no longer appears on Encore.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not change the release.",
      );
    } finally {
      setReleaseBusy(null);
    }
  };

  const refreshRuns = useCallback(async () => {
    if (masterworks.length === 0) return;
    try {
      setRunsByMasterwork(
        await listRecentRunsForMasterworks(masterworks.map((m) => m.id)),
      );
    } catch {
      // Run history is enrichment — a failed refresh keeps the stale list.
    }
  }, [masterworks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allRows = await listMasterworksForRulebook(rulebookId);
        if (cancelled) return;
        // The Understudy (running-from-minute-one) lives on the Rulebook page
        // and is never releasable — this page manages the BUILT Masterworks.
        const m = allRows.filter((mw) => !mw.understudy);
        setMasterworks(m);
        if (m.length > 0) {
          // Run history is enrichment — its failure never blanks the page.
          listRecentRunsForMasterworks(m.map((mw) => mw.id))
            .then((runs) => {
              if (!cancelled) setRunsByMasterwork(runs);
            })
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load Masterworks",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoadingSpinner />
        <span>Loading Masterworks…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/masterwork/all">Back to Masterwork Studio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <MasterworkKpiStrip
          kpis={kpis}
          rulebookId={rulebook.id}
          activeFilter={activeFilter}
        />
      </section>

      {masterworks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Workflow className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No Masterworks yet. Build one from the Rulebook page — one button, a
            few minutes, and this Rulebook becomes a working checker.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/masterwork/${rulebook.id}`}>Open the Rulebook</Link>
          </Button>
        </div>
      ) : visibleMasterworks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No {activeFilter === "current" ? "current" : "released"}{" "}
            Masterworks.
          </p>
          <Button asChild size="sm" variant="ghost" className="mt-2">
            <Link href={`/masterwork/${rulebook.id}/masterworks?status=all`}>
              Show all Masterworks
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleMasterworks.map((masterwork) => {
            const drifted =
              masterwork.rulebook_version !== null &&
              masterwork.rulebook_version < rulebook.version;
            return (
              <div
                key={masterwork.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`${WORKFLOWS_APP_URL}/workflows/${masterwork.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
                      >
                        {masterwork.name}
                      </a>
                      {masterwork.masterwork_kind ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {masterwork.masterwork_kind === "edit"
                            ? "Checks & corrects"
                            : masterwork.masterwork_kind === "generate"
                              ? "Creates & checks"
                              : masterwork.masterwork_kind}
                        </Badge>
                      ) : null}
                      {masterwork.rulebook_version !== null ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          v{masterwork.rulebook_version}
                        </Badge>
                      ) : null}
                      {masterwork.released_at !== null ? (
                        <Badge className="px-1.5 py-0 text-[10px]">
                          Released
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] text-muted-foreground"
                        >
                          Draft
                        </Badge>
                      )}
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
                        Updated {formatRelativeTime(masterwork.updated_at)}
                      </span>
                    </div>
                    {masterwork.description ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {masterwork.description}
                      </p>
                    ) : null}
                    {masterwork.deliverable ? (
                      <p className="mt-1 line-clamp-1 text-xs text-foreground">
                        <span className="text-muted-foreground">Creates: </span>
                        {masterwork.deliverable}
                      </p>
                    ) : null}
                    {drifted ? (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-primary">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Needs rebuild for v{rulebook.version}.
                        <button
                          type="button"
                          onClick={() => setDriftMasterwork(masterwork)}
                          className="underline underline-offset-2 hover:text-primary/80"
                        >
                          See what changed
                        </button>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isOwner ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={releaseBusy === masterwork.id}
                            onClick={() => void toggleReleased(masterwork)}
                            aria-label={
                              masterwork.released_at === null
                                ? "Release Masterwork"
                                : "Un-release Masterwork"
                            }
                          >
                            {masterwork.released_at === null ? (
                              <Rocket className="h-4 w-4" />
                            ) : (
                              <Undo2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {masterwork.released_at === null
                            ? "Release"
                            : "Un-release"}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    {masterwork.released_at !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                          >
                            <Link
                              href={`/masterwork/encore/${masterwork.id}`}
                              aria-label="Open in Encore"
                            >
                              <Play className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in Encore</TooltipContent>
                      </Tooltip>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                        >
                          <a
                            href={`${WORKFLOWS_APP_URL}/workflows/${masterwork.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open in Studio"
                          >
                            <SquareArrowOutUpRight className="h-4 w-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open in Studio</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                        >
                          <a
                            href={`${WORKFLOWS_APP_URL}/runs?workflow=${masterwork.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Past runs"
                          >
                            <History className="h-4 w-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Past runs</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {/* Try it right here — the Masterwork is a working checker, not
                    a link to another app. Runs land in Recent runs below. */}
                <div className="mt-3 border-t border-border pt-3">
                  <TryMasterworkBox
                    masterworkId={masterwork.id}
                    masterworkKind={masterwork.masterwork_kind}
                    submitLabel={masterwork.submit_label}
                    fieldLabels={
                      masterwork.masterwork_kind === "edit"
                        ? ["Your text", "Key facts"]
                        : undefined
                    }
                    onRunFinished={() => void refreshRuns()}
                    onCompare={
                      isOwner
                        ? (candidate) => setAuditionCandidate(candidate)
                        : undefined
                    }
                  />
                </div>
                {(runsByMasterwork[masterwork.id] ?? []).length > 0 ? (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Recent runs
                    </p>
                    <div className="mt-1">
                      {(runsByMasterwork[masterwork.id] ?? []).map((run) => (
                        <MasterworkRunRow
                          key={run.id}
                          run={run}
                          onFeedback={
                            isOwner
                              ? () =>
                                  setFeedbackSeed(
                                    `I just looked at a run of the "${masterwork.name}" Masterwork (${runWhen(run)}, run ${run.id.slice(0, 8)}) and something came out wrong. Here's what it got wrong: `,
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
      {driftMasterwork !== null && driftMasterwork.rulebook_version !== null ? (
        <MasterworkDriftDialog
          open
          onOpenChange={(open) => {
            if (!open) setDriftMasterwork(null);
          }}
          rulebookId={rulebookId}
          masterworkName={driftMasterwork.name}
          masterworkVersion={driftMasterwork.rulebook_version}
          currentVersion={rulebook.version}
          currentRules={rulebook.rules}
        />
      ) : null}
      {isOwner ? (
        <AuditionDialog
          open={auditionCandidate !== null}
          onOpenChange={(open) => {
            if (!open) setAuditionCandidate(null);
          }}
          rulebookId={rulebookId}
          benchmarkClaim={
            (rulebook.metadata as { intake?: { benchmark?: string } } | null)
              ?.intake?.benchmark
          }
          initialCandidate={auditionCandidate ?? undefined}
        />
      ) : null}
      {isOwner ? (
        <ScoutInterviewPanel
          rulebookId={rulebookId}
          rulebookName={rulebook.name}
          open={feedbackSeed !== null}
          onOpenChange={(open) => {
            if (!open) setFeedbackSeed(null);
          }}
          seedText={feedbackSeed ?? undefined}
          onRulebookChanged={() => {
            toast.success("New draft rules captured", {
              description:
                "Review and approve them on the Rulebook page — then rebuild the Masterwork to adopt them.",
            });
          }}
        />
      ) : null}
    </div>
  );
}
