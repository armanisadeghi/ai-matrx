"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ExternalLink,
  GitBranch,
  Loader2,
  Network,
  Play,
  Route,
  ShieldAlert,
  Waypoints,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { createMarketingAuthorityScope } from "@/features/surfaces/manifests/marketing-authority.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  addAuthorityRecommendationToPlan,
  dismissAuthorityRecommendation,
} from "./actions";
import { AuthorityFlowMap } from "./AuthorityFlowMap";
import type { AuthorityRecommendation, AuthorityRouterResult } from "./types";
import { useAuthorityRouter } from "./useAuthorityRouter";

type View = "map" | "routes" | "evidence";

export function AuthorityRouterWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const authority = useAuthorityRouter(site.id);
  const [guidance, setGuidance] = useState("");
  const [view, setView] = useState<View>("map");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const result = authority.result;

  const metrics = useMemo(() => summarize(result), [result]);
  const visibleRecommendations = result?.recommendations.filter(
    (item) => !dismissed.has(item.candidate_key),
  );

  const approve = async (recommendation: AuthorityRecommendation) => {
    setWorking(recommendation.candidate_key);
    try {
      await addAuthorityRecommendationToPlan(site.id, recommendation);
      setApproved((current) =>
        new Set(current).add(recommendation.candidate_key),
      );
      toast.success("Added to both pages’ existing link plans.");
    } catch (error) {
      toast.error("Could not add this route to the link plan", {
        description: extractErrorMessage(error),
      });
    } finally {
      setWorking(null);
    }
  };

  const dismiss = async (recommendation: AuthorityRecommendation) => {
    setWorking(recommendation.candidate_key);
    try {
      await dismissAuthorityRecommendation(site.id, recommendation);
      setDismissed((current) =>
        new Set(current).add(recommendation.candidate_key),
      );
      toast.success("Recommendation dismissed.");
    } catch (error) {
      toast.error("Could not dismiss this recommendation", {
        description: extractErrorMessage(error),
      });
    } finally {
      setWorking(null);
    }
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-authority"
      getScope={() =>
        createMarketingAuthorityScope({
          ...getBaseValues(),
          authority_summary: result
            ? {
                verdict: result.overall_verdict,
                executive_summary: result.executive_summary,
                pages_analyzed: result.pages_analyzed,
                edges_analyzed: result.edges_analyzed,
                generated_at: result.generated_at,
                warnings: result.warnings,
              }
            : undefined,
          authority_pages: result?.pages as
            Array<Record<string, unknown>> | undefined,
          authority_candidates: result?.candidates as
            Array<Record<string, unknown>> | undefined,
          authority_recommendations: result?.recommendations as
            Array<Record<string, unknown>> | undefined,
        })
      }
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:p-5">
        <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-emerald-500/5 shadow-sm">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:p-7">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                <Route className="h-4 w-4" /> Internal Authority Router
              </div>
              <h1 className="mt-3 max-w-4xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Move authority from where it enters to the pages that can turn
                it into growth.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                This joins enriched backlinks, the live crawl graph, internal
                Link Score, Search Console opportunity, page roles, keyword
                mapping, content plans, and cannibalization evidence. Every
                route names the exact source, target, anchor, placement,
                benefit, and risk.
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-3 backdrop-blur">
              <label
                className="text-xs font-semibold"
                htmlFor="authority-guidance"
              >
                Optional priority
              </label>
              <Textarea
                id="authority-guidance"
                value={guidance}
                onChange={(event) => setGuidance(event.target.value)}
                maxLength={4000}
                placeholder="Example: prioritize the California service pages and avoid changing the pricing guide."
                className="mt-2 min-h-20 resize-none text-xs"
              />
              <Button
                className="mt-3 w-full"
                disabled={authority.run.status === "running"}
                onClick={() =>
                  void authority.start({
                    guidance,
                    forceRefresh: Boolean(result),
                  })
                }
              >
                {authority.run.status === "running" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {result
                  ? "Recalculate authority routes"
                  : "Map authority routes"}
              </Button>
            </div>
          </div>
        </section>

        <LiveRunDisplay
          requestId={authority.run.requestId}
          pending={authority.run.status === "running"}
          label={authority.run.stage ?? "Analyzing authority flow"}
          className="border-emerald-500/25"
          bodyClassName="max-h-[30rem]"
        />

        {authority.run.status === "error" ? (
          <QueryError
            error={
              new Error(authority.run.error ?? "Authority analysis failed")
            }
            onRetry={() =>
              void authority.start({ guidance, forceRefresh: true })
            }
          />
        ) : null}

        {result ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                icon={Network}
                label="Pages modeled"
                value={result.pages_analyzed}
                detail={`${result.edges_analyzed.toLocaleString()} current routes`}
              />
              <Kpi
                icon={BadgeCheck}
                label="Authority entry pages"
                value={metrics.entryPages}
                detail="pages receiving active backlinks"
              />
              <Kpi
                icon={GitBranch}
                label="Authority traps"
                value={metrics.traps}
                detail="strong pages with little distribution"
                tone="amber"
              />
              <Kpi
                icon={Waypoints}
                label="Recommended routes"
                value={visibleRecommendations?.length ?? 0}
                detail={`${approved.size} added to the plan`}
                tone="emerald"
              />
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge
                    variant="outline"
                    className={verdictClass(result.overall_verdict)}
                  >
                    {result.overall_verdict}
                  </Badge>
                  <p className="mt-2 max-w-5xl text-sm leading-relaxed">
                    {result.executive_summary}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Computed {new Date(result.generated_at).toLocaleString()}
                </p>
              </div>
              {result.warnings.length ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" />{" "}
                  {result.warnings.join(" · ")}
                </div>
              ) : null}
            </section>

            <div className="flex gap-1 rounded-lg border bg-muted/35 p-1">
              {(["map", "routes", "evidence"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    view === item
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "routes"
                    ? `Routes (${visibleRecommendations?.length ?? 0})`
                    : item}
                </button>
              ))}
            </div>

            {view === "map" ? (
              <AuthorityFlowMap
                result={{
                  ...result,
                  recommendations: visibleRecommendations ?? [],
                }}
              />
            ) : null}
            {view === "routes" ? (
              <div className="space-y-3">
                {(visibleRecommendations ?? []).map((recommendation, index) => (
                  <RecommendationCard
                    key={recommendation.candidate_key}
                    recommendation={recommendation}
                    rank={index + 1}
                    sitePath={sitePath}
                    approved={approved.has(recommendation.candidate_key)}
                    working={working === recommendation.candidate_key}
                    onApprove={() => void approve(recommendation)}
                    onDismiss={() => void dismiss(recommendation)}
                  />
                ))}
              </div>
            ) : null}
            {view === "evidence" ? (
              <EvidenceTable result={result} sitePath={sitePath} />
            ) : null}
          </>
        ) : authority.latest.isError ? (
          <QueryError
            error={authority.latest.error}
            onRetry={() => void authority.latest.refetch()}
          />
        ) : authority.run.status !== "running" ? (
          <section className="rounded-xl border border-dashed p-10 text-center">
            <Route className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">
              Your authority map has not been calculated yet
            </h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
              Run it once to join the evidence already in the platform. The
              deterministic map appears first; the strategist’s Content IR
              develops live underneath it.
            </p>
          </section>
        ) : null}
      </div>
    </SurfaceRuntimeProvider>
  );
}

function summarize(result: AuthorityRouterResult | null) {
  if (!result) return { entryPages: 0, traps: 0 };
  return {
    entryPages: result.pages.filter((page) => page.active_backlinks > 0).length,
    traps: result.pages.filter(
      (page) => (page.link_score ?? 0) >= 50 && page.outbound_links <= 1,
    ).length,
  };
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Network;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "amber" | "emerald";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "amber"
              ? "text-amber-500"
              : tone === "emerald"
                ? "text-emerald-500"
                : "text-primary",
          )}
        />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function verdictClass(verdict: AuthorityRouterResult["overall_verdict"]) {
  return verdict === "urgent"
    ? "border-destructive/40 text-destructive"
    : verdict === "opportunities"
      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
      : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
}

function RecommendationCard({
  recommendation,
  rank,
  sitePath,
  approved,
  working,
  onApprove,
  onDismiss,
}: {
  recommendation: AuthorityRecommendation;
  rank: number;
  sitePath: string;
  approved: boolean;
  working: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <Link
                className="truncate hover:text-primary"
                href={`${sitePath}/pages/${recommendation.source_page_id}`}
              >
                {pathOf(recommendation.source_url)}
              </Link>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Link
                className="truncate hover:text-primary"
                href={`${sitePath}/pages/${recommendation.target_page_id}`}
              >
                {pathOf(recommendation.target_url)}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline">impact {recommendation.score}</Badge>
              <Badge variant="outline">
                confidence {recommendation.confidence}%
              </Badge>
              <Badge variant="outline">
                {recommendation.topical_relevance} relevance
              </Badge>
              <Badge
                variant="outline"
                className={
                  recommendation.cannibalization_risk === "high"
                    ? "border-destructive/40 text-destructive"
                    : ""
                }
              >
                {recommendation.cannibalization_risk} cannibalization risk
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={working || approved}
            onClick={onDismiss}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Dismiss
          </Button>
          <Button size="sm" disabled={working || approved} onClick={onApprove}>
            {working ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : approved ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
            )}
            {approved ? "In link plan" : "Add to link plan"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Detail label="Anchor text" value={`“${recommendation.anchor_text}”`} />
        <Detail
          label="Placement"
          value={
            recommendation.placement_quote
              ? `After “${recommendation.placement_quote}” — ${recommendation.placement_instruction}`
              : recommendation.placement_instruction
          }
        />
        <Detail
          label="Expected benefit"
          value={recommendation.expected_benefit}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {recommendation.rationale}
      </p>
      {recommendation.evidence.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recommendation.evidence.map((item) => (
            <span
              key={item}
              className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed">{value}</p>
    </div>
  );
}
function pathOf(url: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function EvidenceTable({
  result,
  sitePath,
}: {
  result: AuthorityRouterResult;
  sitePath: string;
}) {
  const rows = [...result.pages].sort(
    (a, b) =>
      (b.link_score ?? 0) +
      b.active_backlinks * 4 -
      ((a.link_score ?? 0) + a.active_backlinks * 4),
  );
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Page</th>
              <th className="px-3 py-2">Role / keyword</th>
              <th className="px-3 py-2 text-right">Link Score</th>
              <th className="px-3 py-2 text-right">Backlinks</th>
              <th className="px-3 py-2 text-right">In / out</th>
              <th className="px-3 py-2 text-right">GSC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((page) => (
              <tr key={page.page_id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`${sitePath}/pages/${page.page_id}`}
                    className="font-mono font-medium hover:text-primary"
                  >
                    {page.path || pathOf(page.url)}
                  </Link>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1.5 text-muted-foreground hover:text-primary"
                    aria-label="Open live page"
                  >
                    <ExternalLink className="inline h-3 w-3" />
                  </a>
                </td>
                <td className="px-3 py-2">
                  <p>{page.role}</p>
                  <p className="text-muted-foreground">
                    {page.target_keyword || "Unmapped"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {page.link_score?.toFixed(1) ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {page.active_backlinks}
                </td>
                <td className="px-3 py-2 text-right">
                  {page.inbound_links} / {page.outbound_links}
                </td>
                <td className="px-3 py-2 text-right">
                  <p>{page.clicks.toLocaleString()} clicks</p>
                  <p className="text-muted-foreground">
                    pos. {page.average_position?.toFixed(1) ?? "—"}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
