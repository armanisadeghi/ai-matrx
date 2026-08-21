"use client";

/**
 * Keyword Value Workbench — variant B: "The Value Ledger".
 *
 * ui-reimagine seat. The reference product channeled is a private-banking
 * portfolio review (Copilot Money's portfolio view) crossed with Superhuman's
 * one-at-a-time triage: search traffic is a portfolio, value bands are asset
 * classes, the unvalued bucket is the pile of unsorted transactions, and the
 * expert issues rulings — never "edits tiers". Three movements on one page:
 *
 *   1. The verdict + composition ledger (getValueSummary w/ compare window)
 *   2. The ruling desk (getValueReview, server-paged, receipts on every row)
 *   3. The ruling session (triage mode for the unvalued queue)
 *
 * The rulebook sheet exposes the meaning that drives computation. All data
 * through ../../data.ts; a tier without its why never renders.
 */

import { useState } from "react";
import { BookOpenText, Gavel, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import {
  InlineQueryError,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { CompositionLedger } from "./CompositionLedger";
import { RulingDesk, DEFAULT_FILTERS, type DeskFilters } from "./RulingDesk";
import { Rulebook } from "./Rulebook";
import { TriageMode } from "./TriageMode";
import { UNVALUED, compact, ledgerWindow, windowLabel } from "./lib";
import {
  useRuleKeywords,
  useValueReview,
  useValueSummary,
  useValueVocabulary,
} from "./useLedgerData";

const WINDOW = ledgerWindow();

export function ValueWorkbenchB() {
  const { site } = useMarketingSite();
  const siteId = site.id;

  const [filters, setFilters] = useState<DeskFilters>(DEFAULT_FILTERS);
  const [triage, setTriage] = useState(false);
  const [rulebookOpen, setRulebookOpen] = useState(false);

  const vocab = useValueVocabulary(siteId, "value_band");
  const summary = useValueSummary(siteId, WINDOW);
  const review = useValueReview(
    siteId,
    WINDOW,
    {
      band: filters.band,
      source: filters.source,
      search: filters.search || null,
      sort: filters.sort,
      sortDir: filters.sortDir,
      limit: 50,
      offset: filters.page * 50,
    },
    !triage,
  );
  const triageQueue = useValueReview(
    siteId,
    WINDOW,
    { source: "unvalued", sort: "clicks", sortDir: "desc", limit: 25, offset: 0 },
    triage,
  );
  const ruling = useRuleKeywords(siteId);

  const unvaluedQueries = (summary.data ?? [])
    .filter((r) => r.value_band === UNVALUED)
    .reduce((n, r) => n + r.queries, 0);
  const unvaluedClicks = (summary.data ?? [])
    .filter((r) => r.value_band === UNVALUED)
    .reduce((n, r) => n + r.clicks, 0);

  // Vocabulary is the page's spine — without it no band can even be named.
  if (vocab.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <CardLoading />
        <CardLoading />
      </div>
    );
  }
  if (vocab.isError) {
    return (
      <QueryError error={vocab.error} onRetry={() => void vocab.refetch()} />
    );
  }
  const bands = vocab.data ?? [];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      {/* Page intro row */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 pr-14">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Scale className="h-4 w-4 text-muted-foreground" />
            What is this traffic worth?
          </h1>
          <p className="text-xs text-muted-foreground">
            Last 28 reported days · {windowLabel(WINDOW)} · compared with the 28
            days before
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setRulebookOpen(true)}
          >
            <BookOpenText className="h-3.5 w-3.5" />
            The rulebook
          </Button>
          {!triage && unvaluedQueries > 0 && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setTriage(true)}
            >
              <Gavel className="h-3.5 w-3.5" />
              Start a ruling session
            </Button>
          )}
        </div>
      </div>

      {triage ? (
        <TriageMode
          rows={triageQueue.data?.rows}
          totalUnvalued={triageQueue.data?.total ?? unvaluedQueries}
          isLoading={triageQueue.isLoading}
          isFetching={triageQueue.isFetching}
          error={triageQueue.error as Error | null}
          onRetry={() => void triageQueue.refetch()}
          vocab={bands}
          onRule={(input) => ruling.mutate(input)}
          rulingPending={ruling.isPending}
          onExit={() => setTriage(false)}
        />
      ) : (
        <div className="space-y-5">
          {/* Movement 1 — the composition ledger */}
          {summary.isLoading ? (
            <CardLoading />
          ) : summary.isError ? (
            <InlineQueryError
              what="the value composition"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          ) : (
            <CompositionLedger
              rows={summary.data ?? []}
              vocab={bands}
              vocabIsTemplate={bands.some((b) => b.is_template)}
              activeBand={filters.band}
              onSelectBand={(band) =>
                setFilters((f) => ({ ...f, band, page: 0 }))
              }
            />
          )}

          {/* The work-queue callout — the unvalued bucket is the job */}
          {!summary.isLoading && !summary.isError && unvaluedQueries > 0 && (
            <button
              type="button"
              onClick={() => setTriage(true)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-left transition-colors hover:border-warning/70"
            >
              <Gavel className="h-4 w-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 text-sm text-foreground">
                <span className="font-semibold">
                  {compact(unvaluedQueries)} keywords
                </span>{" "}
                — carrying {compact(unvaluedClicks)} clicks — have no value yet.
                Until you rule on them, the totals above understate what you
                know.
              </span>
              <span className="shrink-0 text-xs font-semibold text-warning">
                Start ruling →
              </span>
            </button>
          )}

          {/* Movement 2 — the ruling desk */}
          <RulingDesk
            rows={review.data?.rows}
            total={review.data?.total ?? 0}
            isLoading={review.isLoading}
            isFetching={review.isFetching}
            error={review.error as Error | null}
            onRetry={() => void review.refetch()}
            vocab={bands}
            filters={filters}
            onFilters={setFilters}
            onRule={(input) => ruling.mutate(input)}
            rulingPending={ruling.isPending}
          />
        </div>
      )}

      <Rulebook
        siteId={siteId}
        open={rulebookOpen}
        onOpenChange={setRulebookOpen}
        bandVocab={bands}
      />
    </div>
  );
}
