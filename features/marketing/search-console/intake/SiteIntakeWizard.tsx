"use client";

/**
 * Site Intake Wizard — the first-run interview for a GSC-bound site.
 *
 * UX doctrine (Arman, 2026-08-08): NEVER make the user stare at a spinner —
 * the interview auto-starts on load, every bundle slice streams onto the
 * screen the moment the server has it, and exactly ONE activity indicator
 * exists at a time. No page title (the tab says Intake), no intro prose —
 * data starts at the top. The page owns its scroll (the site layout is
 * overflow-hidden).
 *
 * Persistence contract (never chat-only): keyword rulings via
 * `seo.gsc_set_keyword_class` (the same write path as classification
 * review), topic valuations via the Site Strategy Interviewer, brand
 * aliases on `web.brand.profile.brand_aliases`. See ./FEATURE.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Compass,
  DownloadCloud,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useGscBackfillStatus,
  useGscFreshness,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { syncGscSearchPerformance } from "@/features/marketing/search-console/sync";
import {
  applySiteIntake,
  intakeStageLabel,
  runSiteIntake,
  type IntakeAnswer,
  type IntakeBundlePeriodPreview,
  type IntakeClass,
  type IntakeKeywordRuling,
  type SiteIntakeApplyResult,
  type SiteIntakeRunResult,
} from "@/features/marketing/search-console/intake/intake-service";

const CLASS_META: Record<IntakeClass, { label: string; className: string }> = {
  money: {
    label: "Money",
    className:
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  educational: {
    label: "Educational",
    className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  brand: {
    label: "Brand",
    className:
      "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  mismatch: {
    label: "Mismatch",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
};

const PERIOD_LABELS: Record<string, string> = {
  latest_28d: "Latest 28 days",
  prior_28d: "Prior 28 days",
  year_ago_28d: "Same period last year",
  oldest_28d: "Oldest on record",
};

type GroupDecision = { include: boolean; ruling: IntakeClass };

function ClassChip({ value }: { value: IntakeClass }) {
  const meta = CLASS_META[value];
  return (
    <Badge variant="outline" className={`border ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

/** Live preview of one streamed bundle slice — the user watches the data
 *  arrive instead of watching a spinner. */
function PeriodPreviewCard({ period }: { period: IntakeBundlePeriodPreview }) {
  const classTotals = period.class_summary.rows
    .map((row) => `${row[1] ?? 0} ${String(row[0])}`)
    .join(" · ");
  const queryCol = period.top_queries.columns.indexOf("key");
  const clicksCol = period.top_queries.columns.indexOf("clicks");
  return (
    <div className="rounded-md border bg-card/60 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">
          {PERIOD_LABELS[period.key] ?? period.key}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {period.start} → {period.end} · {period.query_count} queries
        </span>
      </div>
      {classTotals ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Clicks: {classTotals}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {period.top_queries.rows.slice(0, 10).map((row, index) => (
          <Badge key={index} variant="secondary" className="font-normal">
            {String(row[queryCol])}
            <span className="ml-1 text-muted-foreground">
              {String(row[clicksCol])}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function SiteIntakeWizard() {
  const { site } = useMarketingSite();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const organizationId = site.organization_id ?? null;

  // ── Connect + import state (server truth, refresh-proof) ─────────────────
  const gscStatus = siteConnectionStatuses(site).find(
    (status) => status.key === "search_console",
  );
  const gscBound = gscStatus?.state !== "off";
  const backfill = useGscBackfillStatus(gscBound ? site.id : null);
  const importRunning = backfill.data?.active === true;
  const freshness = useGscFreshness(gscBound ? site.id : null, {
    refetchIntervalMs: importRunning ? 30_000 : false,
  });
  const freshnessRows = freshness.data ?? [];
  const hasAnyData = freshnessRows.length > 0;
  const dataFrom = freshnessRows.reduce<string | null>(
    (min, row) => (min === null || row.min_date < min ? row.min_date : min),
    null,
  );
  const dataTo = freshnessRows.reduce<string | null>(
    (max, row) => (max === null || row.max_date > max ? row.max_date : max),
    null,
  );

  const [importKicking, setImportKicking] = useState(false);
  const startHistoryImport = () => {
    setImportKicking(true);
    // Detached server work — leaving the page never stops it; freshness
    // polling narrates progress from server state.
    void syncGscSearchPerformance(dispatch, site.id, organizationId, {
      mode: "backfill",
    })
      .catch((error) => {
        toast.error(
          `History import problem: ${extractErrorMessage(error)}`,
        );
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      });
    void syncGscSearchPerformance(dispatch, site.id, organizationId, {}).catch(
      () => undefined,
    );
    setTimeout(() => {
      setImportKicking(false);
      void backfill.refetch();
      void freshness.refetch();
    }, 3_000);
  };

  // ── Interview state ──────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [previews, setPreviews] = useState<IntakeBundlePeriodPreview[]>([]);
  const [runResult, setRunResult] = useState<SiteIntakeRunResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // ── Review state ─────────────────────────────────────────────────────────
  const [confirmedSummary, setConfirmedSummary] = useState("");
  const [decisions, setDecisions] = useState<GroupDecision[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aliasChecks, setAliasChecks] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<SiteIntakeApplyResult | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);

  const startInterview = async (forceRefresh: boolean) => {
    setRunning(true);
    setRunError(null);
    setActivity("Reading this site's Search Console history…");
    setPreviews([]);
    setApplyResult(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { result, runId: id } = await runSiteIntake(
        dispatch,
        site.id,
        organizationId,
        { forceRefresh },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.event !== "data") return;
            const data = event.data as {
              kind?: unknown;
              period?: IntakeBundlePeriodPreview;
            };
            if (typeof data.kind !== "string") return;
            if (data.kind === "seo.intake_bundle_period" && data.period) {
              const period = data.period;
              setPreviews((prev) =>
                prev.some((p) => p.key === period.key)
                  ? prev
                  : [...prev, period],
              );
              setActivity("Reading this site's Search Console history…");
              return;
            }
            const label = intakeStageLabel(data.kind);
            if (label) setActivity(label);
          },
        },
      );
      setRunResult(result);
      setRunId(id);
      const inference = result.proposal.business_inference;
      setConfirmedSummary(
        `${inference.what_they_sell}\n\nWhat "money traffic" means here: ${inference.money_definition}`,
      );
      setDecisions(
        result.proposal.term_groups.map((group) => ({
          include: true,
          ruling: group.proposed_class,
        })),
      );
      setAnswers({});
      setAliasChecks(
        Object.fromEntries(
          result.proposal.proposed_brand_aliases.map((alias) => [alias, true]),
        ),
      );
    } catch (error) {
      setRunError(extractErrorMessage(error));
    } finally {
      setRunning(false);
      setActivity(null);
    }
  };

  // Auto-start: the analysis begins the moment the page can support it — a
  // completed same-day run replays instantly (no paid call), so this is
  // either free or exactly the run the user came here for.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!gscBound || !hasAnyData || runResult || running) return;
    autoStartedRef.current = true;
    const timer = setTimeout(() => void startInterview(false), 0);
    return () => clearTimeout(timer);
     
  }, [gscBound, hasAnyData]);

  const proposal = runResult?.proposal ?? null;

  const rulings = useMemo<IntakeKeywordRuling[]>(() => {
    if (!proposal) return [];
    return proposal.term_groups.flatMap((group, index) => {
      const decision = decisions[index];
      if (!decision?.include) return [];
      return group.sample_terms.map((phrase) => ({
        phrase,
        ruling: decision.ruling,
        reasoning: group.reasoning,
      }));
    });
  }, [proposal, decisions]);

  const answerList = useMemo<IntakeAnswer[]>(() => {
    if (!proposal) return [];
    return proposal.key_questions
      .map((question) => ({
        question_id: question.id,
        question: question.question,
        answer: (answers[question.id] ?? "").trim(),
      }))
      .filter((entry) => entry.answer.length > 0);
  }, [proposal, answers]);

  const applyRulings = async () => {
    if (!proposal) return;
    setApplying(true);
    setActivity("Saving your rulings…");
    try {
      const result = await applySiteIntake(dispatch, site.id, organizationId, {
        confirmed_summary: confirmedSummary.trim(),
        answers: answerList,
        keyword_rulings: rulings,
        brand_aliases_add: Object.entries(aliasChecks)
          .filter(([, checked]) => checked)
          .map(([alias]) => alias),
        run_topic_valuation: true,
        intake_run_id: runId,
      });
      setApplyResult(result);
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setApplying(false);
      setActivity(null);
    }
  };

  // ── Not connected / no data — one compact block, no prose ───────────────
  if (!gscBound) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between rounded-lg border p-3">
          <span className="text-sm">
            Connect Google Search Console to run the site interview.
          </span>
          <Button asChild size="sm">
            <Link
              href={`${marketingRoutes.site(site.brand_id, site.id)}/integrations`}
            >
              Open Integrations
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (freshness.isSuccess && !hasAnyData) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-lg border p-3">
          <span className="text-sm">
            No Search Console data imported yet. Google only keeps ~16 months —
            days not imported are eventually lost.
          </span>
          <div>
            <Button
              size="sm"
              disabled={importKicking || importRunning}
              onClick={startHistoryImport}
            >
              {importKicking || importRunning ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="mr-1.5 h-3.5 w-3.5" />
              )}
              {importRunning ? "Importing…" : "Import full history now"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const busy = running || applying;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 pb-16">
        {/* ── ONE status line: data range + import + the single activity spinner ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {busy && activity ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {activity}
            </span>
          ) : null}
          {dataFrom && dataTo ? (
            <span>
              Data {dataFrom} → {dataTo}
            </span>
          ) : null}
          {importRunning ? (
            <span>history import running server-side</span>
          ) : dataFrom ? (
            <button
              type="button"
              className="underline-offset-2 hover:underline disabled:opacity-50"
              disabled={importKicking}
              onClick={startHistoryImport}
            >
              Import older history
            </button>
          ) : null}
          {!busy && runResult ? (
            <button
              type="button"
              className="flex items-center gap-1 underline-offset-2 hover:underline"
              onClick={() => void startInterview(true)}
            >
              <RotateCcw className="h-3 w-3" /> Re-run analysis
              {runResult.cost_usd != null
                ? ` ($${runResult.cost_usd.toFixed(2)}/run)`
                : ""}
            </button>
          ) : null}
        </div>

        {runError ? (
          <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
            <span>{runError}</span>
            <Button size="sm" variant="outline" onClick={() => void startInterview(false)}>
              Try again
            </Button>
          </div>
        ) : null}

        {/* ── Streamed bundle slices — data on screen while the run works ── */}
        {running && previews.length > 0 ? (
          <div className="flex flex-col gap-2">
            {previews.map((period) => (
              <PeriodPreviewCard key={period.key} period={period} />
            ))}
            <p className="text-[11px] text-muted-foreground">
              The analyst is reading this data now — proposals appear here when
              it finishes.
            </p>
          </div>
        ) : null}

        {/* ── Proposal ── */}
        {proposal && !running ? (
          <>
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">What this business is</h2>
                <Badge variant="outline">
                  {proposal.business_inference.confidence} confidence
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {proposal.business_inference.evidence}
              </p>
              <Textarea
                className="mt-2 min-h-20 text-sm"
                value={confirmedSummary}
                onChange={(event) => setConfirmedSummary(event.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Correct anything wrong — this becomes the durable summary every
                future analysis reads.
              </p>
            </div>

            {proposal.term_groups.length > 0 ? (
              <div className="rounded-lg border p-3">
                <h2 className="text-sm font-semibold">
                  Proposed traffic rulings
                </h2>
                <div className="mt-2 flex flex-col gap-2.5">
                  {proposal.term_groups.map((group, index) => {
                    const decision = decisions[index] ?? {
                      include: true,
                      ruling: group.proposed_class,
                    };
                    return (
                      <div
                        key={`${group.label}-${index}`}
                        className={`rounded-md border p-2.5 ${decision.include ? "" : "opacity-50"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ClassChip value={decision.ruling} />
                            <span className="text-sm font-medium">
                              {group.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {(Object.keys(CLASS_META) as IntakeClass[]).map(
                              (cls) => (
                                <Button
                                  key={cls}
                                  size="sm"
                                  variant={
                                    decision.include && decision.ruling === cls
                                      ? "secondary"
                                      : "ghost"
                                  }
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() =>
                                    setDecisions((prev) =>
                                      prev.map((d, i) =>
                                        i === index
                                          ? { include: true, ruling: cls }
                                          : d,
                                      ),
                                    )
                                  }
                                >
                                  {CLASS_META[cls].label}
                                </Button>
                              ),
                            )}
                            <Button
                              size="sm"
                              variant={decision.include ? "ghost" : "secondary"}
                              className="h-6 px-2 text-[11px]"
                              onClick={() =>
                                setDecisions((prev) =>
                                  prev.map((d, i) =>
                                    i === index
                                      ? { ...d, include: !d.include }
                                      : d,
                                  ),
                                )
                              }
                            >
                              {decision.include ? "Exclude" : "Include"}
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.reasoning}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {group.sample_terms.map((term) => (
                            <Badge
                              key={term}
                              variant="secondary"
                              className="font-normal"
                            >
                              {term}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {proposal.key_questions.length > 0 ? (
              <div className="rounded-lg border p-3">
                <h2 className="text-sm font-semibold">
                  Only you can answer these
                </h2>
                <div className="mt-2 flex flex-col gap-3">
                  {proposal.key_questions.map((question) => (
                    <div key={question.id}>
                      <p className="text-sm font-medium">{question.question}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {question.why_it_matters}
                      </p>
                      {question.suggested_answers.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {question.suggested_answers.map((suggestion) => (
                            <Button
                              key={suggestion}
                              size="sm"
                              variant={
                                answers[question.id] === suggestion
                                  ? "secondary"
                                  : "outline"
                              }
                              className="h-6 px-2 text-[11px] font-normal"
                              onClick={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: suggestion,
                                }))
                              }
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      <Input
                        className="mt-1.5 text-sm"
                        placeholder="Answer in your own words (optional)"
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {proposal.proposed_brand_aliases.length > 0 ? (
              <div className="rounded-lg border p-3">
                <h2 className="text-sm font-semibold">Brand name variations</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Counted as brand traffic. Uncheck any that aren&apos;t yours.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {proposal.proposed_brand_aliases.map((alias) => (
                    <Button
                      key={alias}
                      size="sm"
                      variant={aliasChecks[alias] ? "secondary" : "outline"}
                      className="h-6 px-2 text-[11px] font-normal"
                      onClick={() =>
                        setAliasChecks((prev) => ({
                          ...prev,
                          [alias]: !prev[alias],
                        }))
                      }
                    >
                      {aliasChecks[alias] ? "✓ " : ""}
                      {alias}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {proposal.gaps.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                <p className="text-xs font-medium">
                  What the analyst could NOT see:
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {proposal.gaps.map((gap, index) => (
                    <li key={index}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!applyResult ? (
              <div className="flex items-center gap-3">
                <Button disabled={applying} onClick={() => void applyRulings()}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Save these rulings
                </Button>
                <span className="text-xs text-muted-foreground">
                  {rulings.length} keyword ruling
                  {rulings.length === 1 ? "" : "s"} · {answerList.length} answer
                  {answerList.length === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── Saved ── */}
        {applyResult ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Saved —
              every future analysis uses these rulings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {applyResult.keyword_rulings_written} keyword rulings ·{" "}
              {applyResult.valuations_written} topic valuations ·{" "}
              {applyResult.brand_aliases_added.length} brand aliases
            </p>
            {applyResult.open_questions.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Still open: {applyResult.open_questions.join(" · ")}
              </p>
            ) : null}
            {applyResult.classify_estimate &&
            applyResult.classify_estimate.unclassified_keywords > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {applyResult.classify_estimate.unclassified_keywords.toLocaleString()}{" "}
                keywords remain machine-unclassified platform-wide (~
                {applyResult.classify_estimate.batches} batches
                {applyResult.classify_estimate.est_cost_usd != null
                  ? `, ≈$${applyResult.classify_estimate.est_cost_usd.toFixed(2)}`
                  : ""}
                ) — the nightly classifier sweeps them under your boundaries.
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button asChild size="sm">
                <Link href={marketingRoutes.searchConsole(site.id)}>
                  Open the dashboard
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`${marketingRoutes.site(site.brand_id, site.id)}/keywords`}
                >
                  Review keywords
                </Link>
              </Button>
            </div>
          </div>
        ) : null}

        {/* First-load skeleton: only while nothing at all has arrived */}
        {running && previews.length === 0 && !proposal ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <Compass className="mb-1 h-4 w-4" />
            Pulling four periods of this site&apos;s Search Console data — each
            slice appears here the moment it&apos;s ready.
          </div>
        ) : null}
      </div>
    </div>
  );
}
