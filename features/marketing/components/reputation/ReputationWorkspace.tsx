"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleDot,
  FileWarning,
  Flag,
  Loader2,
  MessageSquareText,
  Newspaper,
  Play,
  Radar,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  StatusBadge,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useReputationWorkspace,
  useUpdateReputationCase,
} from "@/features/marketing/data/reputation-hooks";
import type {
  PublicationOpportunity,
  ReputationCaseRow,
  ReputationCaseStatus,
  ReputationEvidenceRef,
  ReputationNarrative,
  ReputationWorkspaceData,
} from "@/features/marketing/data/reputation-types";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingReputationScope } from "@/features/surfaces/manifests/marketing-reputation.manifest";
import type { Json } from "@/types/database.types";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useReputationAnalysis } from "./useReputationAnalysis";

const SURFACE = "matrx-user/marketing-reputation";

type Tab = "brief" | "cases" | "publications" | "narratives" | "evidence";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "brief", label: "Decision brief" },
  { key: "cases", label: "Cases" },
  { key: "publications", label: "Publications" },
  { key: "narratives", label: "Narratives" },
  { key: "evidence", label: "Evidence" },
];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.key === value);
}

function jsonStrings(value: Json): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function evidenceRefs(value: Json): ReputationEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, Json | undefined>;
    if (
      typeof record.source_kind !== "string" ||
      typeof record.exact_excerpt !== "string" ||
      typeof record.supports !== "string"
    ) {
      return [];
    }
    return [
      {
        source_kind: record.source_kind,
        source_id:
          typeof record.source_id === "string" ? record.source_id : null,
        url: typeof record.url === "string" ? record.url : null,
        title: typeof record.title === "string" ? record.title : null,
        exact_excerpt: record.exact_excerpt,
        observed_at:
          typeof record.observed_at === "string" ? record.observed_at : null,
        supports: record.supports,
      },
    ];
  });
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function verdictVariant(
  verdict: string,
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (["protect", "pitch", "strengthen"].includes(verdict)) return "success";
  if (["correct", "respond", "request_update"].includes(verdict))
    return "destructive";
  if (["investigate", "monitor"].includes(verdict)) return "warning";
  return "secondary";
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background/70 px-2.5 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", scoreTone(value))}>
        {value}
      </div>
    </div>
  );
}

function EvidenceReferenceCard({ reference }: { reference: ReputationEvidenceRef }) {
  const content = (
    <div className="rounded-md border bg-muted/20 p-3 transition-colors hover:bg-muted/35">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {reference.title || reference.source_kind.replaceAll("_", " ")}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {reference.source_kind.replaceAll("_", " ")}
            {reference.observed_at ? ` · ${formatDate(reference.observed_at)}` : ""}
          </p>
        </div>
        {reference.url ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : null}
      </div>
      <blockquote className="mt-2 border-l-2 border-primary/40 pl-2 text-xs leading-relaxed text-foreground">
        {reference.exact_excerpt}
      </blockquote>
      <p className="mt-2 text-[11px] text-muted-foreground">{reference.supports}</p>
    </div>
  );
  return reference.url ? (
    <a href={reference.url} target="_blank" rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
}

function CaseCard({
  row,
  sitePath,
  onStatus,
  updating,
}: {
  row: ReputationCaseRow;
  sitePath: string;
  onStatus: (status: ReputationCaseStatus) => void;
  updating: boolean;
}) {
  const facts = jsonStrings(row.facts);
  const inferences = jsonStrings(row.inferences);
  const refs = evidenceRefs(row.evidence_refs);
  const missing = jsonStrings(row.missing_evidence);
  const backlinkHref = row.backlink_id
    ? `${sitePath}/backlinks?tab=backlinks&search=${encodeURIComponent(row.source_url ?? row.backlink_id)}`
    : null;
  const pageHref = row.page_id ? `${sitePath}/pages/${row.page_id}` : null;
  return (
    <article className="rounded-xl border bg-card shadow-sm">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={verdictVariant(row.verdict)} className="capitalize">
                {row.verdict.replaceAll("_", " ")}
              </Badge>
              <StatusBadge value={row.status} />
              {row.requires_human_review ? (
                <Badge variant="warning">Human review</Badge>
              ) : null}
            </div>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{row.headline}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.summary}</p>
          </div>
          <div className="flex gap-1.5">
            <Score label="Priority" value={row.priority} />
            <Score label="Confidence" value={row.confidence} />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-semibold text-foreground">{row.recommended_action}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {row.action_reason}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {row.source_url ? (
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open source <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
          {backlinkHref ? (
            <Link href={backlinkHref} className="inline-flex items-center gap-1 text-primary hover:underline">
              Backlink record <ChevronRight className="h-3 w-3" />
            </Link>
          ) : null}
          {pageHref ? (
            <Link href={pageHref} className="inline-flex items-center gap-1 text-primary hover:underline">
              Target page <ChevronRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
      <details className="border-t">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          Evidence and quality details
        </summary>
        <div className="grid gap-4 border-t bg-muted/10 p-4 lg:grid-cols-2">
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Verified facts
            </h4>
            <ul className="mt-2 space-y-1.5 text-xs text-foreground">
              {facts.map((fact) => (
                <li key={fact} className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {fact}
                </li>
              ))}
            </ul>
            {inferences.length ? (
              <>
                <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Inferences, not facts
                </h4>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {inferences.map((inference) => (
                    <li key={inference} className="flex gap-2">
                      <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {inference}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {missing.length ? (
              <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-muted-foreground">
                Missing evidence: {missing.join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            {refs.map((reference, index) => (
              <EvidenceReferenceCard
                key={`${reference.source_kind}-${reference.source_id ?? reference.url}-${index}`}
                reference={reference}
              />
            ))}
          </div>
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t px-4 py-2.5">
        {updating ? <Loader2 className="mr-auto h-3.5 w-3.5 animate-spin" /> : null}
        <Button size="sm" variant="ghost" className="h-7" disabled={updating} onClick={() => onStatus("dismissed")}>
          <X className="mr-1 h-3.5 w-3.5" /> Dismiss
        </Button>
        <Button size="sm" variant="outline" className="h-7" disabled={updating} onClick={() => onStatus("monitoring")}>
          <Radar className="mr-1 h-3.5 w-3.5" /> Monitor
        </Button>
        {row.status === "open" ? (
          <Button size="sm" variant="outline" className="h-7" disabled={updating} onClick={() => onStatus("accepted")}>
            <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Accept
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="h-7" disabled={updating} onClick={() => onStatus("in_progress")}>
          <Flag className="mr-1 h-3.5 w-3.5" /> Start action
        </Button>
        <Button size="sm" className="h-7" disabled={updating} onClick={() => onStatus("completed")}>
          <Check className="mr-1 h-3.5 w-3.5" /> Complete
        </Button>
      </div>
    </article>
  );
}

function PublicationCard({ opportunity }: { opportunity: PublicationOpportunity }) {
  const href = opportunity.evidence_refs.find((ref) => ref.url)?.url ?? `https://${opportunity.domain}`;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary hover:underline"
          >
            {opportunity.publication_name} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <p className="mt-1 text-xs text-muted-foreground">{opportunity.relationship_basis}</p>
        </div>
        <Score label="Confidence" value={opportunity.confidence} />
      </div>
      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Suggested angle</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">{opportunity.suggested_angle}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {opportunity.demonstrated_topics.map((topic) => (
          <Badge key={topic} variant="secondary">{topic}</Badge>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Supporting assets: {opportunity.supporting_assets.join(" · ")}
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-primary">Why this qualifies</summary>
        <div className="mt-2 space-y-2">
          {opportunity.evidence_refs.map((reference, index) => (
            <EvidenceReferenceCard key={`${reference.source_id}-${index}`} reference={reference} />
          ))}
        </div>
      </details>
    </article>
  );
}

function NarrativeCard({ narrative }: { narrative: ReputationNarrative }) {
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={narrative.verification_status === "verified" ? "success" : "warning"}>
          {narrative.verification_status.replaceAll("_", " ")}
        </Badge>
        <Badge variant="outline" className="capitalize">{narrative.stance}</Badge>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{narrative.narrative}</h3>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div><span className="text-muted-foreground">Prevalence:</span> {narrative.prevalence}</div>
        <div><span className="text-muted-foreground">Severity:</span> {narrative.severity}</div>
      </div>
      <p className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs text-foreground">
        {narrative.recommended_handling}
      </p>
    </article>
  );
}

function KpiBand({ data }: { data: ReputationWorkspaceData }) {
  const active = data.cases.filter((row) => !["completed", "dismissed"].includes(row.status));
  const highRisk = active.filter((row) => row.risk_score >= 70).length;
  const positive = active.filter((row) => row.opportunity_score >= 70).length;
  const review = active.filter((row) => row.requires_human_review).length;
  const items = [
    { label: "Open decisions", value: active.length, icon: SearchCheck },
    { label: "High-risk cases", value: highRisk, icon: FileWarning },
    { label: "Strong opportunities", value: positive, icon: Target },
    { label: "Needs your review", value: review, icon: BookOpenCheck },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function ReputationWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const params = useParams<{ brandId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspace = useReputationWorkspace(site.id, params.brandId);
  const analysis = useReputationAnalysis({
    siteId: site.id,
    brandId: params.brandId,
    organizationId: site.organization_id,
  });
  const updateCase = useUpdateReputationCase(site.id, params.brandId);
  const tabValue = searchParams.get("tab");
  const tab: Tab = isTab(tabValue) ? tabValue : "brief";
  const data = workspace.data;
  const brief = analysis.run.result?.brief ?? data?.latestBrief ?? null;
  const running = analysis.run.status === "running";

  // THE FLOATING LAW: the run streams in the floating LiveRunWindow. It used to
  // render inline above the KPI band and the brief, pushing both down the
  // instant the user pressed "Run intelligence".
  useFloatingLiveRun({
    active: running,
    instanceId: `reputation:${site.id}`,
    requestId: analysis.run.requestId,
    label: analysis.run.stage || "Building the evidence bundle",
  });

  const setTab = (next: Tab) => {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "brief") query.delete("tab");
    else query.set("tab", next);
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const setCaseStatus = (row: ReputationCaseRow, status: ReputationCaseStatus) => {
    updateCase.mutate(
      {
        caseId: row.id,
        status,
        ruling: {
          lifecycle_decision: status,
          decided_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => toast.success(`Case marked ${status.replaceAll("_", " ")}.`),
        onError: (error) =>
          toast.error("Could not update the case", {
            description: error instanceof Error ? error.message : String(error),
          }),
      },
    );
  };

  if (workspace.isLoading) return <LoadingSurface label="Loading reputation intelligence…" />;
  if (workspace.isError || !data) {
    return <QueryError error={workspace.error} onRetry={() => void workspace.refetch()} />;
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE}
      getScope={() =>
        createMarketingReputationScope({
          ...getBaseValues(),
          reputation_cases: data.cases as unknown as Array<Record<string, unknown>>,
          publication_opportunities:
            brief?.publication_opportunities as unknown as Array<Record<string, unknown>> | undefined,
          reputation_narratives:
            brief?.narratives as unknown as Array<Record<string, unknown>> | undefined,
          reputation_brief: brief as unknown as Record<string, unknown> | undefined,
          evidence_inventory: data.inventory as unknown as Record<string, unknown>,
          reputation_run_state: {
            status: analysis.run.status,
            stage: analysis.run.stage,
            run_id: analysis.run.runId,
          },
        })
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10">
        <div className="shrink-0 border-b bg-background px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h1 className="text-base font-semibold text-foreground">Digital PR & Reputation</h1>
              </div>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                Evidence-backed publication opportunities and protect, correct, respond, update, or leave-alone decisions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={running}
                onClick={() => void analysis.analyze(true)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recheck evidence
              </Button>
              <Button size="sm" className="h-8" disabled={running} onClick={() => void analysis.analyze(false)}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                {running ? analysis.run.stage || "Analyzing" : "Run intelligence"}
              </Button>
            </div>
          </div>
          <AssistStrip surfaceName={SURFACE} className="mt-2" />
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <Button
                key={item.key}
                variant={tab === item.key ? "secondary" : "ghost"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-7xl space-y-4">
            {analysis.run.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {analysis.run.error}
              </div>
            ) : null}
            <KpiBand data={data} />

            {tab === "brief" ? (
              brief ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.7fr)]">
                  <div className="space-y-4">
                    <SectionCard title="Executive verdict" anchor="executive-verdict">
                      <div className="p-4">
                        <div className="flex gap-3">
                          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <p className="text-sm leading-relaxed text-foreground">{brief.executive_verdict}</p>
                        </div>
                      </div>
                    </SectionCard>
                    <SectionCard
                      title="Top decisions"
                      anchor="top-decisions"
                      action={{ label: "View all cases", href: `${pathname}?tab=cases` }}
                    >
                      <div className="space-y-3 p-3">
                        {data.cases.slice(0, 3).map((row) => (
                          <CaseCard
                            key={row.id}
                            row={row}
                            sitePath={sitePath}
                            updating={updateCase.isPending && updateCase.variables?.caseId === row.id}
                            onStatus={(status) => setCaseStatus(row, status)}
                          />
                        ))}
                        {data.cases.length === 0 ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">
                            The evidence gates accepted no cases. Review the limitations or collect more evidence.
                          </p>
                        ) : null}
                      </div>
                    </SectionCard>
                  </div>
                  <div className="space-y-4">
                    <SectionCard title="Quality control" anchor="quality-control">
                      <div className="p-4">
                        <Score label="Overall confidence" value={brief.quality.overall_confidence} />
                        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="rounded-md bg-emerald-500/10 p-2">
                            <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{brief.quality.accepted_cases}</div>
                            accepted cases
                          </div>
                          <div className="rounded-md bg-muted p-2">
                            <div className="text-lg font-semibold text-foreground">{brief.quality.rejected_cases}</div>
                            excluded cases
                          </div>
                        </div>
                      </div>
                    </SectionCard>
                    <SectionCard title="Known limitations" anchor="limitations">
                      <ul className="space-y-2 p-4 text-xs text-muted-foreground">
                        {brief.limitations.map((limitation) => (
                          <li key={limitation} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            {limitation}
                          </li>
                        ))}
                      </ul>
                    </SectionCard>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-card p-10 text-center">
                  <ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground" />
                  <h2 className="mt-3 text-sm font-semibold">No reputation brief yet</h2>
                  <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                    Run intelligence to combine captured backlinks, first-party domain opinions, competitor intersections, AI citations, brand facts, and internal expert knowledge.
                  </p>
                  <Button className="mt-4" size="sm" onClick={() => void analysis.analyze(false)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Run intelligence
                  </Button>
                </div>
              )
            ) : null}

            {tab === "cases" ? (
              <div className="space-y-3">
                {data.cases.map((row) => (
                  <CaseCard
                    key={row.id}
                    row={row}
                    sitePath={sitePath}
                    updating={updateCase.isPending && updateCase.variables?.caseId === row.id}
                    onStatus={(status) => setCaseStatus(row, status)}
                  />
                ))}
                {data.cases.length === 0 ? (
                  <p className="rounded-xl border border-dashed bg-card p-10 text-center text-xs text-muted-foreground">
                    No case passed the evidence gates yet.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "publications" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {(brief?.publication_opportunities ?? []).map((opportunity) => (
                  <PublicationCard key={`${opportunity.domain}-${opportunity.suggested_angle}`} opportunity={opportunity} />
                ))}
                {(brief?.publication_opportunities.length ?? 0) === 0 ? (
                  <p className="col-span-full rounded-xl border border-dashed bg-card p-10 text-center text-xs text-muted-foreground">
                    No publication passed the demonstrated-interest and asset-support gates.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "narratives" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {(brief?.narratives ?? []).map((narrative) => (
                  <NarrativeCard key={`${narrative.narrative}-${narrative.verification_status}`} narrative={narrative} />
                ))}
                {(brief?.narratives.length ?? 0) === 0 ? (
                  <p className="col-span-full rounded-xl border border-dashed bg-card p-10 text-center text-xs text-muted-foreground">
                    No recurring narrative has enough grounded evidence yet.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "evidence" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Platform evidence inventory" anchor="evidence-inventory">
                  <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                    {[
                      ["Enriched backlinks", data.inventory.enrichedBacklinks, BadgeCheck],
                      ["Known domains", data.inventory.referringDomains, Newspaper],
                      ["Competitor openings", data.inventory.competitorOpportunities, Target],
                      ["AI citations", data.inventory.aiCitations, MessageSquareText],
                      ["AI claims", data.inventory.aiClaims, FileWarning],
                      ["Business facts", data.inventory.businessFacts, ShieldCheck],
                    ].map(([label, value, Icon]) => {
                      const EvidenceIcon = Icon as typeof ShieldCheck;
                      return (
                        <div key={String(label)} className="rounded-lg border bg-background p-3">
                          <EvidenceIcon className="h-4 w-4 text-muted-foreground" />
                          <div className="mt-2 text-xl font-semibold tabular-nums">{String(value)}</div>
                          <div className="text-[11px] text-muted-foreground">{String(label)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t p-3">
                    <Button asChild size="sm" variant="outline" className="h-7">
                      <Link href={`${sitePath}/backlinks`}>Open backlink evidence</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7">
                      <Link href={`/marketing/brands/${params.brandId}`}>Open brand facts & assets</Link>
                    </Button>
                  </div>
                </SectionCard>
                <SectionCard title="Last reviewed coverage" anchor="reviewed-coverage">
                  <div className="space-y-2 p-4">
                    {brief
                      ? Object.entries(brief.evidence_coverage).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between gap-3 border-b py-1.5 text-xs last:border-0">
                            <span className="text-muted-foreground">{key.replaceAll("_", " ")}</span>
                            <span className="font-semibold tabular-nums text-foreground">{value}</span>
                          </div>
                        ))
                      : null}
                    {!brief ? (
                      <p className="text-xs text-muted-foreground">Run intelligence to record exactly what was reviewed and excluded.</p>
                    ) : null}
                  </div>
                </SectionCard>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
