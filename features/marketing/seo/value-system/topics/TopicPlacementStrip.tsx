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

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, Check, UserCheck } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { formatCount } from "@/features/marketing/search-console/types";
import { getTopicPlacementStatus } from "./data";

/** The knob registry namespace this strip obeys. */
const KNOB_FEATURE = "seo.topic_placement";
function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function Meter({
  label,
  part,
  whole,
  suffix,
  tone,
}: {
  label: string;
  part: number;
  whole: number;
  suffix: string;
  tone: "primary" | "muted";
}) {
  const share = pct(part, whole);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "text-[11px] tabular-nums",
            tone === "primary"
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {share.toFixed(share >= 10 ? 0 : 1)}%
        </p>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "primary" ? "bg-primary" : "bg-muted-foreground/50",
          )}
          style={{ width: `${Math.min(share, 100)}%` }}
        />
      </div>
      <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
        {formatCount(part)} of {formatCount(whole)} {suffix}
      </p>
    </div>
  );
}

export function TopicPlacementStrip({
  siteId,
}: {
  siteId: string;
  siteName: string;
  onPassFinished: () => void;
}) {

  // The demand floor is the SERVER's number. Reading it here (rather than
  // assuming one) is what lets the strip report what the floor defers instead
  // of presenting a shortened queue as the whole job.
  const knobs = useQuery({
    queryKey: ["marketing", "gsc", "placement-knobs"],
    queryFn: () => fetchFeatureKnobValues(KNOB_FEATURE),
    staleTime: 5 * 60 * 1000,
  });
  const minImpressions = Number(knobs.data?.min_impressions ?? 0);

  const status = useQuery({
    queryKey: ["seo", "topics", "placement-status", siteId, minImpressions],
    queryFn: ({ signal }) =>
      getTopicPlacementStatus(siteId, minImpressions, signal),
    enabled: knobs.isSuccess,
    staleTime: 30 * 1000,
  });

  const row = status.data;

  if (status.isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-foreground">
          Could not read the topic placement status.
        </p>
      </div>
    );
  }
  if (!row) return null;

  const clicksPlaced = pct(row.demand_clicks_placed, row.demand_clicks);
  const owed = row.queue_pending - row.queue_deferred;
  // Nothing above the demand floor left to place is the only honest "done".
  const complete = owed <= 0;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border p-2",
        complete ? "border-border bg-card" : "border-primary/40 bg-accent/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs font-medium text-foreground">
          Placing keywords on the tree{" "}
          <span className="font-normal text-muted-foreground">
            — a keyword with no topic can never resolve a value
          </span>
        </p>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" /> Demand placed
          </span>
        ) : (
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {formatCount(owed)} keywords owed
          </span>
        )}
        {row.proposals_pending > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] tabular-nums text-warning">
            <UserCheck className="h-3 w-3" />
            {formatCount(row.proposals_pending)} awaiting your confirmation
          </span>
        ) : null}
        {row.queue_failed > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] tabular-nums text-warning"
            title={row.last_error ?? "Quarantined after repeated failures"}
          >
            <AlertTriangle className="h-3 w-3" />
            {formatCount(row.queue_failed)} quarantined
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <CopyButtons
            size="xs"
            label="Topic placement status"
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
              location: webLocation("Topic tree"),
              description:
                "How much of this site's Search Console demand sits on the topic tree, measured by clicks rather than row count, plus what the placement queue still owes and what the assigner placed but is not sure about.",
              data: row,
              attributes: { site_id: siteId, min_impressions: minImpressions },
            })}
            json={() => row}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Meter
          label="Search Console clicks placed"
          part={row.demand_clicks_placed}
          whole={row.demand_clicks}
          suffix="clicks"
          tone="primary"
        />
        <Meter
          label="Keywords with demand"
          part={row.demand_keywords_placed}
          whole={row.demand_keywords}
          suffix="keywords"
          tone="muted"
        />
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {row.next_phrase && !complete ? (
          <>
            Next up: <span className="text-foreground">{row.next_phrase}</span> —
            the queue is ordered by the clicks and impressions a keyword actually
            earned in the last {row.demand_window_days ?? 90} days.{" "}
          </>
        ) : null}
        {row.queue_deferred > 0 ? (
          <>
            {formatCount(row.queue_deferred)} keywords are held back by the demand
            floor ({minImpressions} impressions), not placed and not counted as
            done.{" "}
          </>
        ) : null}
        {row.placed_by_human > 0 ? (
          <>
            The assigner never touches the {formatCount(row.placed_by_human)}{" "}
            {row.placed_by_human === 1 ? "keyword" : "keywords"} you placed
            yourself.{" "}
          </>
        ) : null}
      </p>
    </div>
  );
}
