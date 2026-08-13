"use client";

/**
 * THE HUMAN PIPE for the growth loop, on one site.
 *
 * The vision's acceptance test is "click one thing and have the whole thing
 * done": this surface is the click. It starts the site's loop, shows which of
 * the twelve stages it is on, shows the blocker in plain English when it stops,
 * and gives the owner the buttons that continue it.
 *
 * It renders NO spinner while the loop runs — an active loop re-reads itself
 * and its ledger every few seconds, so the rail is live progress. See the
 * FLOATING LAW in CLAUDE.md: the model-token case (an AI-pipe stage streaming
 * output) belongs in the floating live-run window. The AI pipe HAS an executor
 * since 2026-08-13 (G-PIPE-SELECTOR closed — aidream installs the pipe.step AI
 * runner at boot); what is still missing here is the stage service that hands
 * a stage to it (G-ORCHESTRATOR).
 */

import { useState } from "react";
import {
  CheckCheck,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  InlineQueryError,
  LoadingSurface,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { STAGES } from "../../map/loop-map";
import { GrowthLoopApiError, type LoopStateView } from "../api";
import { isLoopLive, useLoopActions, useLoopHistory, useSiteLoops } from "../hooks";
import type { RefSubject } from "../stage-doors";
import { LoopBlockerCard } from "./LoopBlockerCard";
import { LoopHistoryFeed } from "./LoopHistoryFeed";
import { LoopStageRail } from "./LoopStageRail";

function stageTitle(stageId: string): string {
  const stage = STAGES.find((s) => s.id === stageId);
  return stage?.publicInfo?.title ?? stage?.label ?? stageId;
}

function errorMessage(error: unknown): string {
  if (error instanceof GrowthLoopApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function LoopSummary({ loop }: { loop: LoopStateView }) {
  const label =
    loop.status === "blocked"
      ? "Waiting on you"
      : loop.status === "paused"
        ? "Paused"
        : loop.status === "active"
          ? "Running"
          : loop.status === "completed"
            ? "Finished"
            : "Cancelled";

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <dt className="text-xs text-muted-foreground">Status</dt>
        <dd className="text-sm font-medium text-foreground">{label}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">On step</dt>
        <dd className="text-sm font-medium text-foreground">
          {loop.stage_position} of {loop.stage_count} · {stageTitle(loop.current_stage)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Round</dt>
        <dd className="text-sm font-medium text-foreground">{loop.cycle}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Done this round</dt>
        <dd className="text-sm font-medium text-foreground">
          {loop.stages_completed_this_cycle}
        </dd>
      </div>
    </dl>
  );
}

export function SiteGrowthLoopWorkspace() {
  const { site } = useMarketingSite();
  const subject: RefSubject = { brandId: site.brand_id, siteId: site.id };

  const loops = useSiteLoops(site.id);
  const actions = useLoopActions(site.id);
  const live = loops.liveLoop;
  const history = useLoopHistory(live?.loop_run_id ?? null, isLoopLive(live));
  const [busy, setBusy] = useState(false);

  async function run(what: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(`${what} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loops.isLoading) {
    return <LoadingSurface label="Loading this site's growth loop…" />;
  }

  if (loops.error) {
    return (
      <div className="p-3">
        <InlineQueryError
          what="this site's growth loop"
          error={loops.error}
          onRetry={() => void loops.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {!live && (
        <SectionCard title="Growth loop">
          <div className="flex flex-col gap-3 p-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              The growth loop runs {site.name} end to end — learn the market,
              plan the pages, write them, put them live, check what search
              engines actually see, and improve it. You decide each step, or
              hand it to an agent.
            </p>
            <Button
              className="w-fit"
              disabled={busy || actions.start.isPending}
              onClick={() =>
                void run("Starting the loop", async () => {
                  const started = await actions.start.mutateAsync({
                    label: `${site.name} growth loop`,
                  });
                  toast.success(
                    `Loop started on ${stageTitle(started.current_stage)}.`,
                  );
                })
              }
            >
              {busy || actions.start.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Rocket className="h-4 w-4" aria-hidden />
              )}
              Start the growth loop
            </Button>
          </div>
        </SectionCard>
      )}

      {live && (
        <>
          <SectionCard
            title="Growth loop"
            headerExtra={
              <div className="flex items-center gap-1.5">
                {live.status === "paused" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run("Resuming", () =>
                        actions.control.mutateAsync({
                          loopRunId: live.loop_run_id,
                          action: "resume",
                        }),
                      )
                    }
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Resume
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run("Pausing", () =>
                        actions.control.mutateAsync({
                          loopRunId: live.loop_run_id,
                          action: "pause",
                        }),
                      )
                    }
                  >
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                    Pause
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run("Re-checking", () =>
                      actions.reconcile.mutateAsync(live.loop_run_id),
                    )
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Re-check
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-3 p-3">
              <LoopSummary loop={live} />

              {live.is_blocked && (
                <LoopBlockerCard
                  loop={live}
                  subject={subject}
                  busy={busy}
                  onUnblock={(stageRunId) =>
                    void run("Continuing", () =>
                      actions.unblock.mutateAsync({
                        loopRunId: live.loop_run_id,
                        stageRunId,
                      }),
                    )
                  }
                  onSkip={(stageRunId, reason) =>
                    void run("Skipping", () =>
                      actions.skip.mutateAsync({
                        loopRunId: live.loop_run_id,
                        stageRunId,
                        reason,
                      }),
                    )
                  }
                />
              )}

              {!live.is_blocked && !live.open_stage && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">
                    Nobody is working on{" "}
                    <span className="font-medium text-foreground">
                      {stageTitle(live.current_stage)}
                    </span>{" "}
                    yet.
                  </span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run("Opening the step", () =>
                        actions.open.mutateAsync({
                          loopRunId: live.loop_run_id,
                          stage: live.current_stage,
                        }),
                      )
                    }
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    I'll do this step
                  </Button>
                </div>
              )}

              {!live.is_blocked && live.open_stage && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">
                    You are on{" "}
                    <span className="font-medium text-foreground">
                      {stageTitle(live.open_stage.stage)}
                    </span>
                    .
                  </span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run("Finishing the step", async () => {
                        const next = await actions.complete.mutateAsync({
                          loopRunId: live.loop_run_id,
                          stageRunId: live.open_stage!.id,
                        });
                        toast.success(
                          `Next: ${stageTitle(next.current_stage)}.`,
                        );
                      })
                    }
                  >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                    This step is done
                  </Button>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="The twelve steps">
            <div className="p-3">
              <LoopStageRail loop={live} subject={subject} />
            </div>
          </SectionCard>

          <SectionCard title="What has happened">
            <div className="p-3">
              <LoopHistoryFeed events={history.events} />
            </div>
          </SectionCard>
        </>
      )}

      {loops.pastLoops.length > 0 && (
        <SectionCard title="Earlier loops">
          <ul className="flex flex-col gap-1.5 p-3">
            {loops.pastLoops.map((loop) => (
              <li key={loop.loop_run_id} className="text-sm text-muted-foreground">
                {loop.label ?? "Growth loop"} — {loop.status}, stopped on{" "}
                {stageTitle(loop.current_stage)} after {loop.cycle} round
                {loop.cycle === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
