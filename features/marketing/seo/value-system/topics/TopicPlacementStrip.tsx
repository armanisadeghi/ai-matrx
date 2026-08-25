"use client";

/**
 * The topic-placement strip — where this site's tree coverage actually stands,
 * read from SERVER state.
 *
 * WHY THIS EXISTS (measured 2026-08-22 on datadestruction.com): 4,524 of 4,543
 * windowed keywords had no primary topic, so 70% of the site's clicks were
 * honestly "not placed" — and a keyword that never reaches the tree can never
 * resolve a value through it (the tree is the resolver's base, P8). The Topic
 * Assigner existed; the only way to run it was a human typing an industry into
 * the queue below and pressing a button, one page at a time, with nothing
 * remembering what had been done.
 *
 * This strip is the layer that reaches a person, on the screen they already
 * open, with a number that survives the tab: it renders
 * `seo.topic_placement_status()`, and pressing the button advances a durable
 * server ledger (`seo.topic_placement_queue`) rather than starting a loop in
 * this document.
 *
 * THE HEADLINE IS CLICKS, NOT KEYWORDS — the exact sibling reasoning of
 * `FacetBackfillStrip`: 8,455 enrolled keywords and 457 clicks are both true,
 * and only one of them describes the business.
 *
 * TWO NUMBERS THIS STRIP REFUSES TO BLUR:
 *   • what the demand floor DEFERS is named, never folded into "placed";
 *   • what the agent placed but is not sure about is a PROPOSAL, counted apart
 *     from what a human ruled — an unreviewed machine ruling must never read
 *     like an expert one (P12).
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { formatCount } from "@/features/marketing/search-console/types";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import type { TopicPlacementPassResult, TopicPlacementStatus } from "./types";

// 🚨 THIS PATH SHIPS AHEAD OF THE DEPLOYED BACKEND, ON PURPOSE.
// `POST /seo/keywords/topics/backfill` lives on aidream main (service
// `topic_placement_backfill.py`, endpoint added 2026-08-22) and reaches
// production on aidream's next release. `types/python-generated/*` is therefore
// generated from aidream main — a strict superset of production's contract
// today. If you regenerate it from the deployed backend and this path
// disappears, the fix is to regenerate from aidream main (or wait for its
// deploy), NEVER to delete the button: a strip that reports the gap and offers
// no way to close it is the exact defect this feature exists to end. Verified
// live 2026-08-22 against a local backend on this contract: two bounded passes
// took datadestruction.com from 31% to 74% of clicks placed.
const PLACEMENT_PATH = "/seo/keywords/topics/backfill";

/** The server's own milestones, in the operator's words. Never invented. */
const PLACEMENT_STAGES: Record<string, string> = {
  "seo.placement_refreshed": "Measuring this site's Search Console demand…",
  "seo.placement_claimed": "Claiming the highest-demand unplaced keywords…",
  "seo.assign_topics_started": "Reading the keywords…",
  "seo.assign_topics_tree_loaded": "Reading the shared offering tree…",
  "seo.assign_topics_agent_completed": "Placing keywords on the tree…",
  "seo.assign_topics_applied": "Saving placements…",
  "seo.placement_settled": "Settling the batch…",
  "seo.placement_ceiling_reached": "Daily ceiling reached",
  "seo.placement_completed": "Placement pass complete",
};

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function TopicPlacementStrip({
  siteId,
  siteName,
  status,
  minImpressions,
  onPassFinished,
}: {
  siteId: string;
  siteName: string;
  status: TopicPlacementStatus;
  minImpressions: number;
  onPassFinished: () => void;
}) {
  const queryClient = useQueryClient();
  const isAdmin = useAppSelector(selectIsAdmin);
  const [lastPass, setLastPass] = useState<string | null>(null);

  // The assigner's own reasoning is the product here, so the pass streams into
  // the floating live-run window rather than hiding behind a spinner.
  const pass = useSeoCommandRun<TopicPlacementPassResult>({
    key: "topic-placement",
    path: PLACEMENT_PATH,
    finalKind: "seo.placement_completed",
    stageLabels: PLACEMENT_STAGES,
    live: { label: "Offering assigner" },
  });

  // The result lands on the handle (a durable run can also arrive by REJOIN
  // after a refresh), so the settle-up reads it there rather than from a
  // launch call that resolves as soon as the stream is handed over.
  useEffect(() => {
    const result = pass.result;
    if (!result) return;
    setLastPass(
      result.ceiling_reached
        ? `Daily ceiling reached — ${formatCount(result.placed_today)} of ${formatCount(result.daily_ceiling)} keywords placed today.`
        : `Placed ${formatCount(result.placed)} of ${formatCount(result.claimed)} claimed` +
            (result.proposed > 0
              ? ` · ${formatCount(result.proposed)} need your confirmation`
              : "") +
            (result.human_protected > 0
              ? ` · ${formatCount(result.human_protected)} left alone (you placed them)`
              : "") +
            (result.quarantined > 0
              ? ` · ${formatCount(result.quarantined)} quarantined`
              : "") +
            ".",
    );
    if (result.error) toast.error(result.error);
    // Placement moves the tree, the offering split and every value the
    // resolver reaches through it.
    void queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    onPassFinished();
  }, [onPassFinished, pass.result, queryClient]);

  const row = status;

  const clicksPlaced = pct(row.demand_clicks_placed, row.demand_clicks);
  const owed = row.queue_pending - row.queue_deferred;
  // Nothing above the demand floor left to place is the only honest "done".
  const complete = owed <= 0;
  const running = pass.running || row.queue_running > 0;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border p-2",
        "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs font-medium text-foreground">
          Place keywords on offerings
        </p>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" /> Demand placed
          </span>
        ) : (
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
            {formatCount(owed)} keywords owed
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <CopyButtons
            size="xs"
            label="Offering placement status"
            human={() =>
              humanLines([
                ["Search Console clicks placed", `${clicksPlaced.toFixed(1)}%`],
                [
                  "Keywords placed",
                  `${row.demand_keywords_placed} of ${row.demand_keywords}`,
                ],
                ["Placed by a person", row.placed_by_human],
                ["Placed by the assigner", row.placed_by_agent],
                ["Awaiting confirmation", row.proposals_pending],
                ["Keywords owed", owed],
                ["Deferred by the demand floor", row.queue_deferred],
                ["Quarantined", row.queue_failed],
                ["Next keyword", row.next_phrase],
                ["Demand window (days)", row.demand_window_days],
                ["Demand measured", row.demand_as_of],
              ])
            }
            agent={() => ({
              kind: "seo-topic-placement-status",
              location: webLocation("Offering tree"),
              description:
                "How much of this site's Search Console demand sits on the offering tree, measured by clicks rather than row count, plus what the placement queue still owes and what the assigner placed but is not sure about.",
              data: row,
              attributes: { site_id: siteId, min_impressions: minImpressions },
            })}
            json={() => row}
          />
          {isAdmin ? (
            <Button
              size="sm"
              variant={complete ? "outline" : "default"}
              className="h-6 gap-1 text-[11px]"
              disabled={running || complete}
              title={
                complete
                  ? "Every keyword above the demand floor is on the tree"
                  : `Place the next highest-demand keywords, starting with "${row.next_phrase ?? ""}"`
              }
              onClick={() =>
                void pass.launch({ site_id: siteId, refresh: true }, siteName)
              }
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BrainCircuit className="h-3 w-3" />
              )}
              {running ? "Placing…" : "Place next"}
            </Button>
          ) : null}
        </div>
      </div>

      {pass.stage && running ? (
        <p className="text-[10px] text-foreground">{pass.stage}</p>
      ) : null}
      {pass.error ? (
        <p className="text-[10px] text-destructive">{pass.error}</p>
      ) : null}
      {lastPass ? (
        <p className="text-[10px] text-muted-foreground">{lastPass}</p>
      ) : row.next_phrase && !complete ? (
        <p className="truncate text-[10px] text-muted-foreground">
          Next: <span className="text-foreground">{row.next_phrase}</span>
          {row.queue_deferred > 0
            ? ` · ${formatCount(row.queue_deferred)} below the ${minImpressions}-impression floor`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
