"use client";

/**
 * UNIVERSAL FACET COVERAGE — does the shared meaning actually reach your
 * keywords? (KI-022)
 *
 * WHY IT EXISTS. Every facet rule in the Keyword Value System
 * (`free_seeking ⇒ ×0.2`, `certification_seeking ⇒ ×3.0`, …) reads columns that
 * only a small slice of the corpus carries, so those rules are silently a
 * no-op for the rest of it — and until 2026-08-21 nothing on any screen said
 * so. A strip that said it (`FacetBackfillStrip`) shipped inside the
 * `?view=classification` workspace, and died with that workspace on 2026-08-25
 * (KI-036) because it had no other mount point. This is that capability
 * rebuilt with a real home, on the screen where a site owner already reasons
 * about whether their meaning reaches their keywords.
 *
 * REFERENCE PRODUCT: Vercel's usage panel — one bold percentage per meter, a
 * hairline bar under it, and the raw "x of y" kept small underneath, so the
 * headline is readable across the room and the arithmetic is still checkable.
 * The two-plane split (yours / everyone's) is Linear's cycle-vs-project
 * framing: the same measurement at two scopes, never averaged into one number.
 *
 * FOUR THINGS IT REFUSES TO GET WRONG:
 *  1. THE HEADLINE IS CLICKS, NOT KEYWORDS. Most keywords never earn a click,
 *     so "1% of keywords classified" and "60% of clicks covered" are both true
 *     and only one of them describes the business. Keyword coverage is shown
 *     too, quietly.
 *  2. TWO PLANES, NEVER MERGED. This site's slice and the platform-wide plane
 *     are different kinds of truth (the facet plane is ONE classification per
 *     phrase, shared by every tenant — P3 / KI-039) and they never share a
 *     meter.
 *  3. THE DEMAND FLOOR IS REPORTED, NEVER SILENT. Keywords under the live
 *     `min_impressions` knob are shown held back — not classified, and not
 *     counted as done.
 *  4. SERVER STATE, NOT TAB STATE. Progress lives in
 *     `seo.keyword_classification_queue`; "Classify next" advances that ledger
 *     by one bounded pass and streams into the floating run window, so closing
 *     the tab costs the current pass and nothing else.
 *
 * ADMIN-ONLY AND HIDDEN, NOT DISABLED. Both the read and the pass are gated on
 * `public.is_admin()` server-side, and the counts they return are platform-wide.
 * A door a person can never open is noise on their screen, so for everyone else
 * this renders nothing at all.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { formatCount } from "@/features/marketing/search-console/types";
import { formatRelativeTime } from "@/utils/datetime";
import {
  InlineQueryError,
  formatDateOnly,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import {
  FACET_BACKFILL_PATH,
  FACET_BACKFILL_STAGES,
  FACET_KNOB_FEATURE,
  getFacetCoverage,
  type FacetBackfillResult,
  type FacetCoverage as Coverage,
} from "./data";

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** One decimal only where it changes the reading — 60% beats 60.0%. */
function pctLabel(value: number): string {
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`;
}

/**
 * One measured plane. `held` is the slice deliberately NOT being worked yet —
 * it renders as its own band inside the track so a bar can never imply that
 * held-back work is finished work.
 */
function Meter({
  headline,
  part,
  whole,
  unit,
  emptyNote,
  rows,
  tone = "primary",
}: {
  headline: string;
  part: number;
  whole: number;
  unit: string;
  /** Shown instead of a 0% bar when there is genuinely nothing to measure. */
  emptyNote: string;
  rows: { label: string; part: number; whole: number; held?: number }[];
  tone?: "primary" | "muted";
}) {
  const value = share(part, whole);
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background/40 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {headline}
      </p>
      {whole <= 0 ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{emptyNote}</p>
      ) : (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-semibold leading-none tabular-nums tracking-tight",
                tone === "primary" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {pctLabel(value)}
            </span>
            <span className="min-w-0 text-[11px] leading-4 text-muted-foreground">
              of {formatCount(whole)} {unit} covered
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                tone === "primary" ? "bg-primary" : "bg-muted-foreground/60",
              )}
              style={{ width: `${Math.min(value, 100)}%` }}
            />
          </div>
        </>
      )}
      <dl className="mt-2.5 space-y-1.5">
        {rows.map((row) => {
          const rowShare = share(row.part, row.whole);
          const heldShare = row.held ? share(row.held, row.whole) : 0;
          return (
            <div key={row.label} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-[11px] text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="shrink-0 text-[11px] tabular-nums text-foreground">
                  {formatCount(row.part)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatCount(row.whole)}
                  </span>
                  <span className="ml-1.5 text-muted-foreground">
                    {pctLabel(rowShare)}
                  </span>
                </dd>
              </div>
              <div className="mt-1 flex h-[3px] w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-muted-foreground/60"
                  style={{ width: `${Math.min(rowShare, 100)}%` }}
                />
                {heldShare > 0 ? (
                  // The demand floor's own band: present, measured, and visibly
                  // not the same thing as covered.
                  <div
                    className="h-full bg-muted-foreground/25"
                    style={{ width: `${Math.min(heldShare, 100 - rowShare)}%` }}
                    title="Held back by the demand floor"
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone = "default",
  title,
}: {
  icon: typeof Check;
  value: string;
  label: string;
  tone?: "default" | "warning";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]",
        tone === "warning" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium tabular-nums text-foreground">{value}</span>
      {label}
    </span>
  );
}

function CoverageSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="ml-auto h-7 w-28 rounded-md" />
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="flex-1 rounded-lg border border-border/70 p-3"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-7 w-24" />
            <Skeleton className="mt-2.5 h-1.5 w-full rounded-full" />
            <Skeleton className="mt-3 h-2.5 w-full" />
            <Skeleton className="mt-2 h-2.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FacetCoverage({ siteId }: { siteId: string }) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const queryClient = useQueryClient();

  // The demand floor is the SERVER's number. Reading it (rather than assuming
  // one) is what lets this report what the floor defers instead of presenting a
  // shortened queue as the whole job. A missing knob is an error, never a
  // frozen default — see `fetchFeatureKnobValues`.
  const knobs = useQuery({
    queryKey: ["marketing", "seo", "facet-knobs"],
    queryFn: () => fetchFeatureKnobValues(FACET_KNOB_FEATURE),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });
  const minImpressions = Number(knobs.data?.min_impressions ?? 0);

  const coverageKey = [
    "marketing",
    "seo",
    "facet-coverage",
    siteId,
    minImpressions,
  ];
  const coverage = useQuery({
    queryKey: coverageKey,
    queryFn: ({ signal }) => getFacetCoverage(siteId, minImpressions, signal),
    enabled: isAdmin && knobs.isSuccess,
    staleTime: 30_000,
  });

  const pass = useSeoCommandRun<FacetBackfillResult>({
    key: "facet-backfill",
    path: FACET_BACKFILL_PATH,
    finalKind: "seo.backfill_completed",
    stageLabels: FACET_BACKFILL_STAGES,
    // The classifier's own words are the point — the operator watches the work
    // in the floating run window rather than a stage line over an invisible
    // model.
    live: { label: "Universal facet classifier" },
  });

  // A finished pass moved facets, and facets feed the value resolver — so every
  // number on every keyword surface just changed, not only this meter.
  const settledRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pass.result || !pass.runId || settledRunRef.current === pass.runId) {
      return;
    }
    settledRunRef.current = pass.runId;
    void queryClient.invalidateQueries({ queryKey: ["marketing", "seo"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
  }, [pass.result, pass.runId, queryClient]);

  if (!isAdmin) return null;

  if ((knobs.isPending || coverage.isPending) && !coverage.data) {
    return <CoverageSkeleton />;
  }

  const failed = knobs.error ?? coverage.error;
  const row: Coverage | undefined = coverage.data;
  if (!row) {
    return (
      <InlineQueryError
        what="universal facet coverage — how much of the shared meaning has reached your keywords"
        error={failed}
        onRetry={() => {
          void knobs.refetch();
          void coverage.refetch();
        }}
      />
    );
  }

  const owed = Math.max(row.queue_pending - row.queue_deferred, 0);
  const complete = owed === 0;
  const running = pass.running || row.queue_running > 0;
  const windowDays = row.demand_window_days ?? 90;
  const siteClicks = row.site_clicks ?? 0;
  const siteClicksCovered = row.site_clicks_classified ?? 0;
  const result = pass.result;

  return (
    <section
      data-surface-value="facet-coverage"
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        complete ? "border-border" : "border-primary/40",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2">
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Universal facets
        </h2>
        <p className="min-w-0 text-[11px] text-muted-foreground">
          The 13 shared intent signals every value rule reads
        </p>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" /> Demand covered
          </span>
        ) : (
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {formatCount(owed)} owed
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <CopyButtons
            size="xs"
            label="Universal facet coverage"
            human={() =>
              humanLines([
                [
                  "This site's clicks covered",
                  `${pctLabel(share(siteClicksCovered, siteClicks))} (${siteClicksCovered} of ${siteClicks})`,
                ],
                [
                  "This site's keywords covered",
                  `${row.site_keywords_classified ?? 0} of ${row.site_keywords ?? 0}`,
                ],
                [
                  "Platform clicks covered",
                  `${pctLabel(share(row.demand_clicks_classified, row.demand_clicks))} (${row.demand_clicks_classified} of ${row.demand_clicks})`,
                ],
                [
                  "Platform keywords classified",
                  `${row.keywords_classified} of ${row.keywords_total}`,
                ],
                ["Keywords owed", owed],
                ["Held back by the demand floor", row.queue_deferred],
                ["Quarantined", row.queue_failed],
                ["Next keyword", row.next_phrase],
                ["Demand window (days)", windowDays],
                ["Demand measured", row.demand_as_of],
                ["Last classified", row.last_classified_at],
              ])
            }
            agent={() => ({
              kind: "seo-facet-coverage",
              location: webLocation("Keyword dimensions"),
              description:
                "How much of the universal 13-facet plane has reached this site's keywords and the platform corpus, measured by Search Console demand rather than row count, plus what the backfill queue still owes.",
              data: row,
              attributes: { site_id: siteId, min_impressions: minImpressions },
            })}
            json={() => row}
          />
          <Button
            size="sm"
            variant={complete ? "outline" : "default"}
            className="h-7 gap-1.5 text-[11px]"
            disabled={running || complete}
            title={
              complete
                ? "Every keyword above the demand floor is classified"
                : row.next_phrase
                  ? `Classify the next highest-demand keywords, starting with “${row.next_phrase}”`
                  : "Classify the next highest-demand keywords"
            }
            onClick={() => void pass.launch({ refresh: true })}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BrainCircuit className="h-3.5 w-3.5" />
            )}
            {running ? "Classifying…" : "Classify next"}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2.5 p-3 sm:flex-row">
        <Meter
          headline="This site"
          part={siteClicksCovered}
          whole={siteClicks}
          unit="clicks"
          emptyNote={`No Search Console clicks recorded for this site in the last ${windowDays} days, so there is no click coverage to measure yet. Keyword coverage below still counts.`}
          rows={[
            {
              label: "Keywords with traffic here",
              part: row.site_keywords_classified ?? 0,
              whole: row.site_keywords ?? 0,
            },
          ]}
        />
        <Meter
          headline="Across the platform"
          part={row.demand_clicks_classified}
          whole={row.demand_clicks}
          unit="clicks"
          emptyNote="No demand has been measured yet — run a pass to build the queue."
          tone="muted"
          rows={[
            {
              label: "Keywords with demand",
              part: row.demand_keywords_classified,
              whole: row.demand_keywords,
              held: row.queue_deferred,
            },
            {
              label: "Every keyword ever seen",
              part: row.keywords_classified,
              whole: row.keywords_total,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-3 py-2">
        {row.queue_deferred > 0 ? (
          <Stat
            icon={ShieldAlert}
            value={formatCount(row.queue_deferred)}
            label={`held back below ${minImpressions} impressions`}
            title="Under the demand floor: not classified, and not counted as done. An admin raises or lowers the floor on the seo.keyword_classification knob."
          />
        ) : null}
        {row.queue_failed > 0 ? (
          <Stat
            icon={AlertTriangle}
            value={formatCount(row.queue_failed)}
            label="quarantined"
            tone="warning"
            title={row.last_error ?? "Quarantined after repeated failures"}
          />
        ) : null}
        {row.next_phrase && !complete ? (
          <p className="min-w-0 text-[11px] text-muted-foreground">
            Next up{" "}
            <span className="text-foreground">“{row.next_phrase}”</span> — the
            queue is ordered by the clicks and impressions a keyword actually
            earned in the last {windowDays} days.
          </p>
        ) : null}
        <p className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          Demand measured {formatDateOnly(row.demand_as_of)}
          {row.last_classified_at
            ? ` · last classified ${formatRelativeTime(row.last_classified_at)}`
            : null}
        </p>
      </div>

      {pass.error || result?.error ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-destructive">
          {pass.error ?? result?.error}
        </p>
      ) : null}
      {running && pass.stage ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {pass.stage}
        </p>
      ) : null}
      {result && !running ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {result.ceiling_reached ? (
            <>
              Today's ceiling is reached —{" "}
              <span className="text-foreground">
                {formatCount(result.classified_today)} of{" "}
                {formatCount(result.daily_ceiling)}
              </span>{" "}
              keywords classified today. The nightly pass continues tomorrow.
            </>
          ) : (
            <>
              Last pass classified{" "}
              <span className="text-foreground">
                {formatCount(result.classified)} of {formatCount(result.claimed)}
              </span>{" "}
              claimed
              {result.quarantined > 0
                ? ` · ${formatCount(result.quarantined)} quarantined`
                : ""}
              {result.returned_to_queue > 0
                ? ` · ${formatCount(result.returned_to_queue)} returned to the queue`
                : ""}
              .
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}
