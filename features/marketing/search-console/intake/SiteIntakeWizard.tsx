"use client";

/**
 * Site Intake Wizard — the first-run interview for a GSC-bound site.
 *
 * The platform vision in miniature: the SEO expert's doctrine lives in the
 * intake agent; the AI reads the site's real Search Console history; the
 * human answers ONLY what data cannot answer ("we're called All Green
 * RECYCLING but we make our money from ITAD"). Every confirmed ruling
 * persists server-side where every future agent reads it — never chat-only:
 * keyword rulings via `seo.gsc_set_keyword_class` (the same write path the
 * classification-review UI uses), topic valuations via the Site Strategy
 * Interviewer (`seo.site_topic_value`), brand aliases on
 * `web.brand.profile.brand_aliases`.
 *
 * Flow: Connect (status) → Import history (server-state narrator) →
 * Interview (durable streamed agent run, cost surfaced) → Review & apply
 * (confirmable cards + key questions) → Done (what was saved + bulk-classify
 * cost estimate).
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Compass,
  DownloadCloud,
  Loader2,
  MessageSquareText,
  Plug,
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
  type IntakeClass,
  type IntakeKeywordRuling,
  type SiteIntakeApplyResult,
  type SiteIntakeRunResult,
} from "@/features/marketing/search-console/intake/intake-service";

const CLASS_META: Record<
  IntakeClass,
  { label: string; className: string; blurb: string }
> = {
  money: {
    label: "Money",
    className:
      "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    blurb: "Traffic that can turn into revenue for this business.",
  },
  educational: {
    label: "Educational",
    className:
      "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
    blurb: "Informational traffic that supports the money pages.",
  },
  brand: {
    label: "Brand",
    className:
      "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30",
    blurb: "People searching for you by name — not real SEO wins.",
  },
  mismatch: {
    label: "Mismatch",
    className:
      "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
    blurb: "Traffic that can never convert, no matter how well it ranks.",
  },
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

function StepMarker({
  state,
  label,
}: {
  state: "done" | "active" | "todo";
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {state === "done" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : state === "active" ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/50" />
      )}
      <span
        className={
          state === "todo"
            ? "text-xs text-muted-foreground"
            : "text-xs font-medium"
        }
      >
        {label}
      </span>
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
  const startHistoryImport = async () => {
    setImportKicking(true);
    try {
      // One request walks up to 17×30-day windows — the full ~16-month
      // horizon. The server detaches on disconnect; leaving the page never
      // stops the import (the banner keeps narrating from server state).
      void syncGscSearchPerformance(
        dispatch,
        site.id,
        organizationId,
        { mode: "backfill" },
        {},
      )
        .catch((error) => {
          toast.error(
            `History import reported a problem: ${extractErrorMessage(error)}`,
          );
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
        });
      // Also bring the freshest window current.
      void syncGscSearchPerformance(dispatch, site.id, organizationId, {}, {}).catch(
        () => undefined,
      );
      toast.success(
        "History import started. It keeps running server-side even if you leave this page.",
      );
      setTimeout(() => {
        void backfill.refetch();
        void freshness.refetch();
      }, 3_000);
    } finally {
      setImportKicking(false);
    }
  };

  // ── Interview state ──────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<SiteIntakeRunResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  // ── Review state (initialized from the proposal) ─────────────────────────
  const [confirmedSummary, setConfirmedSummary] = useState("");
  const [decisions, setDecisions] = useState<GroupDecision[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aliasChecks, setAliasChecks] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<SiteIntakeApplyResult | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const startInterview = async (forceRefresh: boolean) => {
    setRunning(true);
    setStages([]);
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
            const kind = (event.data as { kind?: unknown }).kind;
            if (typeof kind !== "string") return;
            const label = intakeStageLabel(kind);
            if (label) {
              setStages((prev) =>
                prev[prev.length - 1] === label ? prev : [...prev, label],
              );
            }
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
      toast.error(extractErrorMessage(error));
    } finally {
      setRunning(false);
    }
  };

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
    setStages([]);
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
      // Class maps, insights, and keyword views all changed server-side.
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      toast.success("Your rulings are saved — every future analysis uses them.");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setApplying(false);
    }
  };

  // ── Step derivation ──────────────────────────────────────────────────────
  const importDone = hasAnyData && !importRunning;
  const interviewDone = runResult !== null;
  const applied = applyResult !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Site intake interview</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          A one-time interview that teaches the system what {site.name} actually
          sells — so traffic reports separate money, educational, brand, and
          mismatch traffic the way an SEO expert would. You only answer what the
          data cannot.
        </p>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-3 py-2">
          <StepMarker
            state={gscBound ? "done" : "active"}
            label="Connect Search Console"
          />
          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
          <StepMarker
            state={importDone ? "done" : importRunning ? "active" : "todo"}
            label="Import history"
          />
          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
          <StepMarker
            state={interviewDone ? "done" : running ? "active" : "todo"}
            label="Interview"
          />
          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
          <StepMarker state={applied ? "done" : "todo"} label="Apply rulings" />
        </div>
      </header>

      {/* ── Step 1: Connect ── */}
      {!gscBound ? (
        <section className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4" /> Connect Google Search Console first
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            This site has no Search Console binding yet. Connect it on the
            Integrations page — the wizard picks up from there automatically.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link
              href={`${marketingRoutes.site(site.brand_id, site.id)}/integrations`}
            >
              Open Integrations
            </Link>
          </Button>
        </section>
      ) : null}

      {/* ── Step 2: Import history ── */}
      {gscBound ? (
        <section className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DownloadCloud className="h-4 w-4" /> Search Console history
            </div>
            {importRunning ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> importing…
              </Badge>
            ) : null}
          </div>
          {freshness.isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Checking what data this site already has…
            </p>
          ) : hasAnyData ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Data on file from <span className="font-medium">{dataFrom}</span>{" "}
              to <span className="font-medium">{dataTo}</span>
              {importRunning
                ? " — the import is still filling in older history. You can run the interview now and re-run it later on fuller data."
                : "."}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No performance data imported yet. Google only keeps ~16 months of
              history — every day not imported is eventually lost, so start the
              full import now.
            </p>
          )}
          {!importRunning ? (
            <Button
              size="sm"
              variant={hasAnyData ? "outline" : "default"}
              className="mt-3"
              disabled={importKicking}
              onClick={() => void startHistoryImport()}
            >
              {importKicking ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="mr-1.5 h-3.5 w-3.5" />
              )}
              {hasAnyData ? "Import older history" : "Import full history now"}
            </Button>
          ) : null}
        </section>
      ) : null}

      {/* ── Step 3: Interview ── */}
      {gscBound && hasAnyData ? (
        <section className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquareText className="h-4 w-4" /> The interview
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            An expert analyst reads four periods of this site&apos;s real
            queries and pages, infers the business, and proposes how to
            classify its traffic — then asks you the few questions only you can
            answer.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={running}
              onClick={() => void startInterview(interviewDone)}
            >
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
              )}
              {interviewDone ? "Re-run the interview" : "Run the interview"}
            </Button>
            {runResult?.cost_usd != null ? (
              <span className="text-xs text-muted-foreground">
                Last run cost ${runResult.cost_usd.toFixed(3)}
                {runResult.model_id ? " · one model call" : ""}
              </span>
            ) : null}
          </div>
          {running && stages.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {stages.map((stage, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  {index === stages.length - 1 ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  )}
                  {stage}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* ── Step 4: Review & apply ── */}
      {proposal ? (
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">What this business is</h2>
              <Badge variant="outline">
                {proposal.business_inference.confidence} confidence
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Evidence: {proposal.business_inference.evidence}
            </p>
            <p className="mt-2 text-xs font-medium">
              Correct anything that&apos;s wrong — this becomes the durable
              business summary every future analysis reads:
            </p>
            <Textarea
              className="mt-1.5 min-h-24 text-sm"
              value={confirmedSummary}
              onChange={(event) => setConfirmedSummary(event.target.value)}
            />
          </div>

          {proposal.term_groups.length > 0 ? (
            <div className="rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Proposed traffic rulings</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Each group applies one ruling to its example terms. Change the
                class or exclude a group if the analyst got it wrong — your
                ruling wins over every automatic classifier, forever.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {proposal.term_groups.map((group, index) => {
                  const decision = decisions[index] ?? {
                    include: true,
                    ruling: group.proposed_class,
                  };
                  return (
                    <div
                      key={`${group.label}-${index}`}
                      className={`rounded-md border p-3 ${decision.include ? "" : "opacity-50"}`}
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
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {group.reasoning}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
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
            <div className="rounded-lg border p-4">
              <h2 className="text-sm font-semibold">
                Only you can answer these
              </h2>
              <div className="mt-3 flex flex-col gap-4">
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
            <div className="rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Brand name variations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Searches containing these are counted as brand traffic (people
                who already know you — not SEO wins). Uncheck any that are not
                really your brand.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-medium">
                The analyst flagged what it could NOT see:
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                {proposal.gaps.map((gap, index) => (
                  <li key={index}>{gap}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Button disabled={applying} onClick={() => void applyRulings()}>
              {applying ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              Save these rulings
            </Button>
            <span className="text-xs text-muted-foreground">
              {rulings.length} keyword ruling{rulings.length === 1 ? "" : "s"} ·{" "}
              {answerList.length} answer{answerList.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>
      ) : null}

      {/* ── Step 5: Done ── */}
      {applyResult ? (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Saved as
            durable business truth
          </h2>
          <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
            <li>{applyResult.keyword_rulings_written} keyword rulings</li>
            <li>{applyResult.valuations_written} topic valuations</li>
            <li>
              {applyResult.brand_aliases_added.length} brand aliases added
            </li>
          </ul>
          {applyResult.open_questions.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Still open for later: {applyResult.open_questions.join(" · ")}
            </p>
          ) : null}
          {applyResult.classify_estimate &&
          applyResult.classify_estimate.unclassified_keywords > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {applyResult.classify_estimate.unclassified_keywords.toLocaleString()}{" "}
              keywords are still machine-unclassified platform-wide (~
              {applyResult.classify_estimate.batches} agent batches
              {applyResult.classify_estimate.est_cost_usd != null
                ? `, ≈$${applyResult.classify_estimate.est_cost_usd.toFixed(2)}`
                : ""}
              ). The nightly classifier sweeps them under your new boundaries.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
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
        </section>
      ) : null}
    </div>
  );
}
