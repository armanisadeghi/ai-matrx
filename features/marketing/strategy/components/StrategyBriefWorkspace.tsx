"use client";

/**
 * features/marketing/strategy/components/StrategyBriefWorkspace.tsx
 *
 * ONE workspace, two scopes: the BRAND strategy (business facts, service lines
 * with footprints) and the SITE brief (what this website is for, reading the
 * brand facts). Same component, split by `scope` — never a fork.
 *
 * What it answers, always, on every visit: does a brief exist; what state is
 * it in (waiting for you / confirmed / accepted by lapse / none); what it was
 * built from; what the AI was unsure about; and the ONE action that moves it
 * forward. Regenerating never touches a page or a plan — it supersedes the
 * previous version and carries your corrections forward, and the button says
 * so before it spends anything.
 */
import { useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  Check,
  Compass,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ProTextarea } from "@/components/official/ProTextarea";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import type { StrategyBrief, StrategyScope } from "../data";
import {
  useGenerateStrategy,
  useStrategyBrief,
  useStrategyHistory,
  useStrategyRuling,
} from "../hooks";

const SCOPE_NOUN: Record<StrategyScope, string> = {
  brand: "brand strategy",
  site: "site brief",
};

/** Facts the agent establishes, in the order a person reads them. */
const FACT_ROWS: Record<StrategyScope, Array<{ key: string; label: string }>> = {
  brand: [
    { key: "what_they_do", label: "What they do" },
    { key: "primary_location", label: "Where they are" },
    { key: "customer_description", label: "Who they serve" },
  ],
  site: [
    { key: "site_purpose", label: "What this site is for" },
    { key: "audience_slice", label: "Who this site is for" },
    { key: "what_it_must_win", label: "What it must win" },
    { key: "service_lines_served", label: "Service lines this site carries" },
    { key: "shape_notes", label: "Its shape" },
  ],
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "number") return String(value);
  return "";
}

/** Footprint enum tokens, in the reader's words — never a raw `location_set`. */
const FOOTPRINT_LABEL: Record<string, string> = {
  national: "national",
  regional: "regional",
  local: "local",
  radius: "service radius",
  location_set: "specific locations",
  global: "global",
  online: "online only",
};
function footprintLabel(token: string): string {
  return FOOTPRINT_LABEL[token] ?? token.replace(/_/g, " ");
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

/** "Built from a crawl of 983 pages and 28 days of Search Console" — from provenance, never inferred. */
function builtFrom(scope: StrategyScope, inputs: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const crawl = inputs.crawl as Record<string, unknown> | undefined;
  if (crawl && typeof crawl.pages === "number") {
    parts.push(`a crawl of ${crawl.pages.toLocaleString()} pages`);
  }
  const gsc = inputs.gsc as Record<string, unknown> | null | undefined;
  if (gsc && typeof gsc === "object") {
    parts.push(
      typeof gsc.window === "string"
        ? `Search Console (${gsc.window})`
        : "Search Console",
    );
  } else if (gsc === null && scope === "site") {
    parts.push("no Search Console data (the site has none connected)");
  }
  if (inputs.research_document_id) parts.push("the research report");
  if (typeof inputs.plan_nodes === "number" && inputs.plan_nodes > 0) {
    parts.push(`the content plan (${inputs.plan_nodes} planned pages)`);
  }
  if (inputs.brand_strategy_id) parts.push("the brand strategy");
  if (Array.isArray(inputs.sites)) {
    parts.push(`${inputs.sites.length} website${inputs.sites.length === 1 ? "" : "s"}`);
  }
  return parts;
}

function StatusLine({ brief }: { brief: StrategyBrief }) {
  switch (brief.status) {
    case "confirmed":
      return (
        <p className="text-sm text-foreground">
          <Check className="mr-1 inline size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Confirmed by you on {formatDate(brief.reviewedAt)}. Every agent works from this.
        </p>
      );
    case "auto_accepted":
      return (
        <p className="text-sm text-foreground">
          Nobody reviewed this — the 24-hour window lapsed on{" "}
          {formatDate(brief.autoAcceptAt)} and these assumptions stand. Correct
          anything below and confirm to make it yours.
        </p>
      );
    case "awaiting_review":
      return (
        <p className="text-sm text-foreground">
          Waiting for your review. Until you confirm, agents proceed without it;
          on {formatDate(brief.autoAcceptAt)} it takes effect as written.
        </p>
      );
    default:
      return <p className="text-sm text-muted-foreground">Draft.</p>;
  }
}

export function StrategyBriefWorkspace({
  scope,
  id,
  brandId,
  brandSeg,
  organizationId,
}: {
  scope: StrategyScope;
  /** brand id for brand scope, site id for site scope. */
  id: string;
  brandId: string;
  brandSeg: string;
  organizationId: string;
}) {
  const brief = useStrategyBrief(scope, id, organizationId);
  const history = useStrategyHistory(scope, id, organizationId, Boolean(brief.data));
  const ruling = useStrategyRuling(scope, id, organizationId);
  const generate = useGenerateStrategy(scope, id, organizationId);
  // The site brief READS the brand strategy — say what it read.
  const brandStrategy = useStrategyBrief(
    "brand",
    scope === "site" ? brandId : null,
    organizationId,
  );
  // Cheap and cached; rendered only in brand scope.
  const sites = useBrandSites(brandId);

  const [guidance, setGuidance] = useState<string | null>(null);
  const current = brief.data ?? null;
  const guidanceValue = guidance ?? current?.guidance ?? "";
  const noun = SCOPE_NOUN[scope];
  const brandStrategyHref = `${marketingRoutes.brandIdentity(brandSeg)}/strategy`;

  async function runGenerate() {
    const ok = await confirm({
      title: current ? `Rewrite the ${noun}?` : `Write the ${noun}?`,
      description: current
        ? `This runs the AI again over everything we now know and produces a new version. The current version is kept in history, and your corrections carry forward into the new one. No page and no plan changes.`
        : `This reads everything we know — the website, Search Console, research, the plan — and writes a first ${noun} for you to correct. No page and no plan changes.`,
      confirmLabel: current ? "Write a new version" : "Write it",
    });
    if (!ok) return;
    await generate.launch({});
  }

  if (brief.isLoading) return <LoadingSurface label={`Loading the ${noun}…`} />;
  if (brief.error) {
    return <QueryError error={brief.error} onRetry={() => void brief.refetch()} />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      {/* The one line that answers "where does this stand" */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card p-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold capitalize">{noun}</span>
            {current ? (
              <Badge variant="secondary">v{current.versionNo}</Badge>
            ) : null}
            {current?.agentConfidence != null ? (
              <Badge variant="outline" title={current.confidenceReason}>
                AI confidence {current.agentConfidence}/5
              </Badge>
            ) : null}
          </div>
          {current ? (
            <StatusLine brief={current} />
          ) : (
            <p className="text-sm text-foreground">
              No {noun} yet. Nothing downstream can refer back to it until one exists.
            </p>
          )}
          {current && builtFrom(scope, current.inputs).length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Built {formatDate(current.generatedAt)} from {builtFrom(scope, current.inputs).join(", ")}.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {generate.running ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {generate.stage ?? "Working…"}
            </span>
          ) : (
            <Button
              size="sm"
              variant={current ? "outline" : "default"}
              onClick={() => void runGenerate()}
            >
              {current ? (
                <RefreshCw className="size-3.5" aria-hidden />
              ) : (
                <BrainCircuit className="size-3.5" aria-hidden />
              )}
              {current ? "Write a new version" : `Write the ${noun}`}
            </Button>
          )}
        </div>
      </div>

      <DurableRunFailure
        error={generate.error}
        retry={generate.retry}
        running={generate.running}
      />

      {scope === "site" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-foreground">
            {brandStrategy.data
              ? `Reads the brand strategy (${brandStrategy.data.status === "confirmed" ? "confirmed" : brandStrategy.data.status === "auto_accepted" ? "accepted by lapse" : "not yet reviewed"}).`
              : "This brand has no strategy yet — the site brief will have to infer the business facts itself. Write the brand strategy first for a better brief."}
          </span>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link href={brandStrategyHref}>
              Brand strategy
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      {current ? (
        <>
          <SectionCard title="The brief">
            <MarkdownRenderer content={current.briefMarkdown} fontSize={14} />
          </SectionCard>

          <SectionCard title="Facts the AI established">
            {FACT_ROWS[scope].every((row) => !asText(current.facts[row.key])) ? (
              <p className="mb-3 text-sm text-foreground">
                This version was written before the {noun} asked these questions,
                so none of them are answered yet. Write a new version to establish
                them.
              </p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              {FACT_ROWS[scope].map((row) => {
                const value = asText(current.facts[row.key]);
                return (
                  <div key={row.key} className="space-y-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm text-foreground">
                      {value || <span className="text-muted-foreground">Not established</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {asList(current.facts.open_questions).length > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  What the AI was unsure about
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
                  {asList(current.facts.open_questions).map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          {scope === "brand" || current.serviceLines.length > 0 ? (
            <SectionCard
              title={scope === "brand" ? "Service lines and where each one competes" : "Service lines this site carries"}
            >
              {current.serviceLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">None established yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {current.serviceLines.map((line) => (
                    <li key={line.name} className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{line.name}</span>
                        <Badge variant="outline">{footprintLabel(line.footprint)}</Badge>
                        {line.customerSegment ? (
                          <span className="text-xs text-muted-foreground">for {line.customerSegment}</span>
                        ) : null}
                      </div>
                      {line.footprintDetail || line.why ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[line.footprintDetail, line.why].filter(Boolean).join(" — ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="Your corrections">
            <p className="mb-2 text-xs text-muted-foreground">
              Say it the way you would say it out loud — "it's more like a
              30-mile radius", "we stopped doing residential last year". This
              outranks everything the AI inferred and carries into every later
              version.
            </p>
            <ProTextarea
              value={guidanceValue}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder="Anything the AI got wrong, or anything it could not have known."
              autoGrow
              minHeight={96}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                disabled={ruling.isPending}
                onClick={() => ruling.mutate({ guidance: guidanceValue })}
              >
                {ruling.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                {current.status === "confirmed" ? "Save corrections" : "Confirm this brief"}
              </Button>
              {current.status !== "confirmed" ? (
                <span className="text-xs text-muted-foreground">
                  Confirming with no corrections means "this is right".
                </span>
              ) : null}
            </div>
          </SectionCard>
        </>
      ) : null}

      {scope === "brand" && (sites.data?.length ?? 0) > 0 ? (
        <SectionCard title="Each website's own brief">
          <ul className="divide-y divide-border">
            {(sites.data ?? []).map((site) => (
              <li key={site.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-foreground">{site.domain ?? site.name}</span>
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                  <Link href={marketingRoutes.brandContentPlanSite(brandSeg, marketingSeg(site), "brief")}>
                    Site brief
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {(history.data?.length ?? 0) > 0 ? (
        <SectionCard title="Earlier versions" collapsible defaultOpen={false}>
          <ul className="divide-y divide-border">
            {(history.data ?? []).map((version) => (
              <li key={version.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-xs">
                    <History className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="font-medium text-foreground">v{version.versionNo}</span>
                    <span className="text-muted-foreground">{formatDate(version.generatedAt)}</span>
                    {version.agentConfidence != null ? (
                      <Badge variant="outline">confidence {version.agentConfidence}/5</Badge>
                    ) : null}
                    {version.reviewedAt ? (
                      <span className="text-muted-foreground">confirmed {formatDate(version.reviewedAt)}</span>
                    ) : null}
                  </summary>
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3">
                    <MarkdownRenderer content={version.briefMarkdown} fontSize={13} />
                    {version.guidance ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Your words at the time: {version.guidance}
                      </p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
