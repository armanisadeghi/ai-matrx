"use client";

/**
 * The universal-facet backfill strip — where the 13-facet plane actually stands,
 * read from SERVER state.
 *
 * WHY THIS EXISTS (2026-08-21): every facet rule in the Keyword Value System
 * (`free_seeking ⇒ ×0.2`, `certification_seeking ⇒ ×3.0`, …) reads columns that
 * only 1,835 of 196,483 keyword rows carried, so every one of those rules was
 * silently a no-op for 99% of the corpus — and nothing on any screen said so.
 * The only way to move the number was a browser loop that died with the tab.
 * This strip is the layer that reaches a human, on the page they already open,
 * with a number that survives the tab: it renders
 * `seo.keyword_classification_status()`, and pressing the button advances a
 * durable server ledger rather than starting a loop in this document.
 *
 * THE HEADLINE IS CLICKS, NOT KEYWORDS. The corpus is ~68,000 GSC-active
 * keywords of which only ~1,400 have ever earned a click, so "2% of keywords
 * classified" and "52% of clicks covered" are both true and only one of them
 * describes the business. Keyword coverage is shown too, quietly — a percentage
 * that can only crawl is not a progress bar anyone believes.
 *
 * Sibling of `IngestionHealthBanner`: same job (a failure recorded where nobody
 * reads is a failure not recorded), same restraint (severity decided by the
 * data, never by the styling).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  getFacetBackfillStatus,
  runFacetBackfillPass,
} from "@/features/marketing/search-console/data-classification";
import { formatCount } from "@/features/marketing/search-console/types";

/** The knob registry namespace this strip obeys. */
const KNOB_FEATURE = "seo.keyword_classification";

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

export function FacetBackfillStrip({ siteId }: { siteId: string }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [lastPass, setLastPass] = useState<string | null>(null);

  // The demand floor is the SERVER's number. Reading it here (rather than
  // assuming one) is what lets the strip report what the floor defers instead
  // of presenting a shortened queue as the whole job.
  const knobs = useQuery({
    queryKey: ["marketing", "gsc", "facet-knobs"],
    queryFn: () => fetchFeatureKnobValues(KNOB_FEATURE),
    staleTime: 5 * 60 * 1000,
  });
  const minImpressions = Number(knobs.data?.min_impressions ?? 0);

  const status = useQuery({
    queryKey: ["marketing", "gsc", "facet-status", siteId, minImpressions],
    queryFn: ({ signal }) =>
      getFacetBackfillStatus(siteId, minImpressions, signal),
    enabled: knobs.isSuccess,
    staleTime: 30 * 1000,
  });

  const pass = useMutation({
    mutationFn: (refresh: boolean) =>
      runFacetBackfillPass(dispatch, { refresh }),
    onSuccess: (result) => {
      setLastPass(
        result.ceiling_reached
          ? `Daily ceiling reached — ${formatCount(result.classified_today)} of ${formatCount(result.daily_ceiling)} keywords classified today.`
          : `Classified ${formatCount(result.classified)} of ${formatCount(result.claimed)} claimed${
              result.quarantined > 0
                ? ` · ${formatCount(result.quarantined)} quarantined`
                : ""
            }.`,
      );
      if (result.error) toast.error(result.error);
      // Facets feed the value resolver, so every GSC surface's numbers moved.
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const row = status.data;

  if (status.isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-foreground">
          Could not read universal-facet classification status.
        </p>
      </div>
    );
  }
  if (!row) return null;

  const clicksCovered = pct(row.demand_clicks_classified, row.demand_clicks);
  // 100% of demand clicks with an empty queue is the only honest "done".
  const complete = row.queue_pending - row.queue_deferred <= 0;
  const running = pass.isPending || row.queue_running > 0;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border p-2",
        complete
          ? "border-border bg-card"
          : "border-primary/40 bg-accent/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs font-medium text-foreground">
          Universal facets{" "}
          <span className="font-normal text-muted-foreground">
            — the 13 intent signals every value rule reads
          </span>
        </p>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" /> Demand covered
          </span>
        ) : (
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {formatCount(row.queue_pending - row.queue_deferred)} keywords owed
          </span>
        )}
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
            label="Universal facet classification status"
            human={() =>
              humanLines([
                ["Keywords classified", `${row.keywords_classified} of ${row.keywords_total}`],
                ["Search Console clicks covered", `${clicksCovered.toFixed(1)}%`],
                ["Keywords owed", row.queue_pending - row.queue_deferred],
                ["Deferred by the demand floor", row.queue_deferred],
                ["Quarantined", row.queue_failed],
                ["Next keyword", row.next_phrase],
                ["Demand window (days)", row.demand_window_days],
                ["Demand measured", row.demand_as_of],
                ["Last classified", row.last_classified_at],
                ["This site's keywords", row.site_keywords],
                ["This site's keywords classified", row.site_keywords_classified],
              ])
            }
            agent={() => ({
              kind: "seo-facet-backfill-status",
              location: webLocation("Keyword classification"),
              description:
                "How much of the universal 13-facet plane is classified, measured by Search Console demand rather than row count, plus what the backfill queue still owes.",
              data: row,
              attributes: { site_id: siteId, min_impressions: minImpressions },
            })}
            json={() => row}
          />
          {isSuperAdmin ? (
            <Button
              size="sm"
              variant={complete ? "outline" : "default"}
              className="h-6 gap-1 text-[11px]"
              disabled={running || complete}
              title={
                complete
                  ? "Every keyword above the demand floor is classified"
                  : `Classify the next highest-demand keywords, starting with "${row.next_phrase ?? ""}"`
              }
              onClick={() => pass.mutate(true)}
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BrainCircuit className="h-3 w-3" />
              )}
              {running ? "Classifying…" : "Classify next"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Meter
          label="Search Console clicks covered"
          part={row.demand_clicks_classified}
          whole={row.demand_clicks}
          suffix="clicks"
          tone="primary"
        />
        <Meter
          label="Keywords with demand"
          part={row.demand_keywords_classified}
          whole={row.demand_keywords}
          suffix="keywords"
          tone="muted"
        />
        {row.site_keywords !== null ? (
          <Meter
            label="This site's keywords"
            part={row.site_keywords_classified ?? 0}
            whole={row.site_keywords}
            suffix="keywords"
            tone="muted"
          />
        ) : null}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {row.next_phrase && !complete ? (
          <>
            Next up: <span className="text-foreground">{row.next_phrase}</span>{" "}
            — the queue is ordered by the clicks and impressions a keyword
            actually earned in the last {row.demand_window_days ?? 90} days.{" "}
          </>
        ) : null}
        {row.queue_deferred > 0 ? (
          <>
            {formatCount(row.queue_deferred)} keywords are held back by the
            demand floor ({minImpressions} impressions), not classified and not
            counted as done.{" "}
          </>
        ) : null}
        {lastPass ? <span className="text-foreground">{lastPass}</span> : null}
      </p>
    </div>
  );
}
