"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ExternalLink,
  Maximize2,
  MessageSquareQuote,
  PanelRightOpen,
  Play,
  RefreshCw,
  ScanSearch,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";

import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InlineQueryError,
  StatusBadge,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import type { MarketingSite } from "@/features/marketing/types";
import { markdownToPlainText } from "@/lib/markdown/plain-text";
import { cn } from "@/lib/utils";
import { ShareButton } from "@/features/sharing/components/ShareButton";

import {
  AI_VISIBILITY_ENGINES,
  type AiVisibilityCitation,
  type AiVisibilityClaim,
  type AiVisibilityEngine,
  type AiVisibilityResponse,
  type AiVisibilitySignal,
} from "./types";
import { useAiVisibility } from "./useAiVisibility";
import {
  AI_VISIBILITY_EVIDENCE_VIEWS,
  isAiVisibilityEvidenceView,
  type AiVisibilityEvidenceView,
} from "./evidence-views";

interface ClaimRow extends AiVisibilityClaim {
  engine: string;
  query: string;
}

interface CitationRow extends AiVisibilityCitation {
  engine: string;
  query: string;
}

interface SignalRow extends AiVisibilitySignal {
  engine: string;
  query: string;
}

function engineLabel(engine: string): string {
  return (
    AI_VISIBILITY_ENGINES.find((item) => item.id === engine)?.label ?? engine
  );
}

function Score({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="font-mono font-semibold tabular-nums">{value}</span>
  );
}

/** True when a non-empty analysis object landed.
 *
 * Takes `unknown` on purpose: the live stream supplies a typed
 * `Record<string, unknown>`, but the persisted row supplies a `Json` column
 * that is legitimately any JSON value. Narrowing here — rather than asserting
 * a shape at the callsite — is what keeps an array or a scalar from reading as
 * "Analyzed". */
function hasAnalysis(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function ProviderCard({
  engine,
  response,
  live,
  running,
  onOpen,
}: {
  engine: AiVisibilityEngine;
  response?: AiVisibilityResponse;
  live?: ReturnType<
    typeof useAiVisibility
  >["run"]["answers"][AiVisibilityEngine];
  running: boolean;
  onOpen: () => void;
}) {
  const title = engineLabel(engine);
  const answer = live?.answerText || response?.answer_text || "";
  const cited = live?.targetCited ?? response?.target_cited ?? false;
  const mentioned =
    live?.targetMentioned ?? response?.target_mentioned ?? false;
  const citations = live?.citationCount ?? response?.citation_count ?? 0;
  const analysisReady =
    hasAnalysis(live?.analysis) || hasAnalysis(response?.analysis);
  return (
    <article className="flex min-h-36 flex-col rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquareQuote className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {live?.modelName ?? response?.model_name ?? "Answer engine"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {live?.error ? (
            <Badge variant="destructive">Partial</Badge>
          ) : answer ? (
            <Badge variant={analysisReady ? "success" : "warning"}>
              {analysisReady ? "Analyzed" : "Analysis incomplete"}
            </Badge>
          ) : running ? (
            <Badge variant="outline">Waiting for answer</Badge>
          ) : (
            <Badge variant="outline">No saved answer</Badge>
          )}
          {answer ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Read full ${title} answer`}
              title="Read full answer"
              onClick={onOpen}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        {answer ? (
          // Provider answers ARE markdown. Rendered as raw text they put
          // literal `**asterisks**` on screen. BasicMarkdownContent is the
          // canonical renderer for stored markdown and is already in this
          // canonical markdown renderer. Bounded + faded rather than line-clamped:
          // line-clamp cannot clamp the block children markdown produces.
          <div className="relative max-h-24 overflow-hidden text-xs leading-relaxed text-foreground/90">
            <BasicMarkdownContent content={answer} showCopyButton={false} />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent"
            />
            <button
              type="button"
              className="absolute inset-0 z-10 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Read full ${title} answer`}
              onClick={onOpen}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This provider’s answer will appear here as soon as it returns.
          </p>
        )}
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
          <div>
            <p
              className={cn(
                "text-xs font-semibold",
                mentioned && "text-emerald-600",
              )}
            >
              {mentioned ? "Yes" : "No"}
            </p>
            <p className="text-xs uppercase text-muted-foreground">Mentioned</p>
          </div>
          <div>
            <p
              className={cn(
                "text-xs font-semibold",
                cited && "text-emerald-600",
              )}
            >
              {cited ? "Yes" : "No"}
            </p>
            <p className="text-xs uppercase text-muted-foreground">Cited</p>
          </div>
          <div>
            <p className="text-xs font-semibold tabular-nums">{citations}</p>
            <p className="text-xs uppercase text-muted-foreground">Sources</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AiVisibilityWorkspace({
  site,
  sitePath,
  evidenceView,
}: {
  site: MarketingSite;
  sitePath: string;
  evidenceView?: AiVisibilityEvidenceView;
}) {
  const {
    evidence,
    evidenceRefreshError,
    retryEvidence,
    run,
    analyze,
    watchProgress,
  } = useAiVisibility(site.id, site.organization_id);
  const [query, setQuery] = useState("");
  const [countryIso, setCountryIso] = useState("US");
  const [city, setCity] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [activeEvidenceView, setActiveEvidenceView] =
    useState<AiVisibilityEvidenceView>(evidenceView ?? "claims");
  const [openAnswer, setOpenAnswer] = useState<{
    engine: AiVisibilityEngine;
    answer: string;
    model: string;
  } | null>(null);
  const [engines, setEngines] = useState<AiVisibilityEngine[]>(
    AI_VISIBILITY_ENGINES.map((item) => item.id),
  );
  const responses = evidence.data?.responses ?? [];
  const latestCommandId = responses[0]?.command_run_id;
  const latestResponses = latestCommandId
    ? responses.filter((row) => row.command_run_id === latestCommandId)
    : [];
  const responseById = new Map(responses.map((row) => [row.id, row]));
  const claimRows: ClaimRow[] = (evidence.data?.claims ?? []).map((row) => ({
    ...row,
    engine: responseById.get(row.response_id)?.engine ?? "unknown",
    query: responseById.get(row.response_id)?.query ?? "",
  }));
  const citationRows: CitationRow[] = (evidence.data?.citations ?? []).map(
    (row) => ({
      ...row,
      engine: responseById.get(row.response_id)?.engine ?? "unknown",
      query: responseById.get(row.response_id)?.query ?? "",
    }),
  );
  const signalRows: SignalRow[] = (evidence.data?.signals ?? []).map((row) => ({
    ...row,
    engine: responseById.get(row.response_id)?.engine ?? "unknown",
    query: responseById.get(row.response_id)?.query ?? "",
  }));
  const latestIncompleteCount = latestResponses.filter(
    (row) => row.answer_text && !hasAnalysis(row.analysis),
  ).length;

  const claimColumns: MatrxColumnDef<ClaimRow>[] = [
    {
      accessorKey: "influential_unverified",
      header: "Critical",
      filter: "boolean",
      cell: (row) =>
        row.influential_unverified ? (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-3 w-3" /> Unverified + influential
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "engine",
      header: "Provider",
      filter: "select",
      cell: (row) => <StatusBadge value={engineLabel(row.engine)} />,
    },
    { accessorKey: "subject", header: "Subject", filter: "text" },
    {
      accessorKey: "claim_text",
      header: "Claim used in the answer",
      filter: "text",
      width: 420,
      cell: (row) => (
        <p className="min-w-80 whitespace-normal text-xs leading-relaxed">
          {row.claim_text}
        </p>
      ),
    },
    {
      accessorKey: "verification_status",
      header: "Verification posture",
      filter: "select",
      cell: (row) => <StatusBadge value={row.verification_status} />,
    },
    {
      accessorKey: "influence_role",
      header: "Decision role",
      filter: "select",
      cell: (row) => <StatusBadge value={row.influence_role} />,
    },
    {
      accessorKey: "significance",
      header: "Impact",
      filter: "number",
      align: "right",
      cell: (row) => <Score value={row.significance} />,
    },
    {
      accessorKey: "evidence_text",
      header: "Exact influential wording",
      filter: "text",
      width: 360,
      cell: (row) => (
        // A table cell shows WORDS, not a rendered document — the provider's
        // `**markers**` are formatting, not part of the wording being quoted.
        <q className="block min-w-72 whitespace-normal text-xs text-muted-foreground">
          {markdownToPlainText(row.evidence_text)}
        </q>
      ),
    },
  ];

  const citationColumns: MatrxColumnDef<CitationRow>[] = [
    {
      accessorKey: "engine",
      header: "Provider",
      filter: "select",
      cell: (row) => <StatusBadge value={engineLabel(row.engine)} />,
    },
    {
      accessorKey: "ordinal",
      header: "Order",
      filter: "number",
      align: "right",
    },
    {
      accessorKey: "title",
      header: "Cited page",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-72 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <span className="max-w-xl truncate">{row.title || row.url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ),
    },
    { accessorKey: "domain", header: "Domain", filter: "text" },
    {
      accessorKey: "capture_status",
      header: "Page capture",
      filter: "select",
      cell: (row) => <StatusBadge value={row.capture_status} />,
    },
    {
      accessorKey: "cited_for",
      header: "Why it was cited",
      filter: "text",
      width: 360,
      cell: (row) => (
        <p className="min-w-72 whitespace-normal text-xs">
          {row.cited_for || "—"}
        </p>
      ),
    },
    {
      accessorKey: "endorsement_signal",
      header: "Endorsement",
      filter: "select",
      cell: (row) => <StatusBadge value={row.endorsement_signal} />,
    },
    {
      accessorKey: "evidence_quality",
      header: "Evidence quality",
      filter: "number",
      align: "right",
      cell: (row) => <Score value={row.evidence_quality} />,
    },
  ];

  const signalColumns: MatrxColumnDef<SignalRow>[] = [
    {
      accessorKey: "engine",
      header: "Provider",
      filter: "select",
      cell: (row) => <StatusBadge value={engineLabel(row.engine)} />,
    },
    {
      accessorKey: "category",
      header: "Signal class",
      filter: "select",
      cell: (row) => <StatusBadge value={row.category} />,
    },
    {
      accessorKey: "signal",
      header: "Decision signal",
      filter: "text",
      width: 360,
      cell: (row) => (
        <p className="min-w-72 whitespace-normal text-xs font-medium">
          {row.signal}
        </p>
      ),
    },
    {
      accessorKey: "evidence_text",
      header: "Observed evidence",
      filter: "text",
      width: 420,
      cell: (row) => (
        <p className="min-w-80 whitespace-normal text-xs text-muted-foreground">
          {row.evidence_text}
        </p>
      ),
    },
    {
      accessorKey: "target_subject",
      header: "Affected subject",
      filter: "text",
    },
    {
      accessorKey: "influence",
      header: "Influence",
      filter: "number",
      align: "right",
      cell: (row) => <Score value={row.influence} />,
    },
  ];

  const responseColumns: MatrxColumnDef<AiVisibilityResponse>[] = [
    { accessorKey: "query", header: "Exact query", filter: "text", width: 420 },
    {
      accessorKey: "engine",
      header: "Provider",
      filter: "select",
      cell: (row) => <StatusBadge value={engineLabel(row.engine)} />,
    },
    {
      accessorKey: "target_mentioned",
      header: "Mentioned",
      filter: "boolean",
      cell: (row) => (row.target_mentioned ? "Yes" : "No"),
    },
    {
      accessorKey: "target_cited",
      header: "Cited",
      filter: "boolean",
      cell: (row) => (row.target_cited ? "Yes" : "No"),
    },
    {
      accessorKey: "citation_count",
      header: "Sources",
      filter: "number",
      align: "right",
    },
    {
      accessorKey: "unverified_influential_count",
      header: "Unverified + influential",
      filter: "number",
      align: "right",
    },
    {
      accessorKey: "recommendation_strength",
      header: "Recommendation",
      filter: "number",
      align: "right",
      cell: (row) => <Score value={row.recommendation_strength} />,
    },
    {
      accessorKey: "observed_at",
      header: "Observed",
      filter: "text",
      cell: (row) => formatDate(row.observed_at),
    },
  ];

  const toggleEngine = (engine: AiVisibilityEngine) => {
    setEngines((current) =>
      current.includes(engine)
        ? current.filter((item) => item !== engine)
        : [...current, engine],
    );
  };
  const running = run.status === "running";
  const unverifiedCount = claimRows.filter(
    (row) => row.influential_unverified,
  ).length;
  const latestCited = latestResponses.filter((row) => row.target_cited).length;
  const latestProviderCount =
    latestResponses.length || AI_VISIBILITY_ENGINES.length;
  const compactComposer = responses.length > 0 || run.status !== "idle";

  const renderEvidenceTable = (view: AiVisibilityEvidenceView) => {
    if (view === "claims") {
      return (
        <MatrxDataTable
          data={claimRows}
          columns={claimColumns}
          getRowId={(row) => row.id}
          isLoading={evidence.isLoading}
          pageSize={25}
          toolbar={{
            search: true,
            searchPlaceholder: "Search claims, wording, or subjects…",
          }}
          detail={{
            title: (row) => row.subject,
            description: (row) =>
              `${engineLabel(row.engine)} · ${row.verification_status}`,
          }}
          emptyState={{
            icon: <ShieldAlert className="h-8 w-8 text-muted-foreground" />,
            title: "No analyzed claims yet",
            description:
              "Run an exact query to see which facts, caveats, and unsupported claims influenced each answer.",
          }}
        />
      );
    }
    if (view === "sources") {
      return (
        <MatrxDataTable
          data={citationRows}
          columns={citationColumns}
          getRowId={(row) => row.id}
          isLoading={evidence.isLoading}
          pageSize={25}
          toolbar={{
            search: true,
            searchPlaceholder: "Search cited pages and domains…",
          }}
          detail={{
            title: (row) => row.title || row.domain || row.url,
            description: (row) =>
              `${engineLabel(row.engine)} · citation #${row.ordinal}`,
            headerActions: (row) => (
              <Button asChild size="sm" variant="outline">
                <a href={row.url} target="_blank" rel="noreferrer">
                  Open source
                </a>
              </Button>
            ),
          }}
          emptyState={{
            icon: <SearchCheck className="h-8 w-8 text-muted-foreground" />,
            title: "No citation sources yet",
            description:
              "Sources appear as providers cite them; every eligible page is captured through the shared crawl cache.",
          }}
        />
      );
    }
    if (view === "signals") {
      return (
        <MatrxDataTable
          data={signalRows}
          columns={signalColumns}
          getRowId={(row) => row.id}
          isLoading={evidence.isLoading}
          pageSize={25}
          toolbar={{
            search: true,
            searchPlaceholder:
              "Search authority, evidence, language, rankings…",
          }}
          detail={{
            title: (row) => row.signal,
            description: (row) =>
              `${engineLabel(row.engine)} · ${row.category}`,
          }}
          emptyState={{
            icon: <ScanSearch className="h-8 w-8 text-muted-foreground" />,
            title: "No decision signals yet",
            description:
              "The specialist identifies the evidence, wording, authority, familiarity, rankings, and other signals behind each answer.",
          }}
        />
      );
    }
    return (
      <MatrxDataTable
        data={responses}
        columns={responseColumns}
        getRowId={(row) => row.id}
        isLoading={evidence.isLoading}
        pageSize={25}
        toolbar={{
          search: true,
          searchPlaceholder: "Search prior exact queries…",
        }}
        detail={{
          title: (row) => row.query,
          description: (row) =>
            `${engineLabel(row.engine)} · ${formatDate(row.observed_at)}`,
        }}
        emptyState={{
          icon: (
            <MessageSquareQuote className="h-8 w-8 text-muted-foreground" />
          ),
          title: "No saved analyses",
          description:
            "Your first completed query will be stored here with every provider answer and evidence record.",
        }}
      />
    );
  };

  if (evidenceView) {
    return (
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured p-3 sm:p-4">
        <header className="mb-2 flex shrink-0 flex-wrap items-center gap-2 border-b border-border pb-2">
          <Button asChild size="sm" variant="ghost" className="gap-1.5">
            <Link href={`${sitePath}/ai-visibility`}>
              <ArrowLeft className="h-3.5 w-3.5" /> AI Visibility
            </Link>
          </Button>
          <div className="h-5 w-px bg-border" aria-hidden />
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {AI_VISIBILITY_EVIDENCE_VIEWS.map((view) => (
              <Button
                key={view.id}
                asChild
                size="sm"
                variant={view.id === evidenceView ? "secondary" : "ghost"}
              >
                <Link href={`${sitePath}/ai-visibility/${view.id}`}>
                  {view.label}
                </Link>
              </Button>
            ))}
          </nav>
          <span className="text-xs text-muted-foreground">
            {site.name} · full-page evidence
          </span>
        </header>
        {evidence.isError ? (
          <div className="mb-2 shrink-0">
            <InlineQueryError
              what="saved AI visibility evidence"
              error={evidence.error}
              onRetry={() => void evidence.refetch()}
            />
          </div>
        ) : null}
        {evidenceRefreshError ? (
          <div className="mb-2 flex shrink-0 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="flex-1">{evidenceRefreshError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retryEvidence()}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <section className="min-h-0 flex-1">
          {renderEvidenceTable(evidenceView)}
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto bg-textured p-3">
      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ScanSearch className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-base font-semibold">
                  AI citation reverse engineer
                </h1>
                <p className="text-xs text-muted-foreground">
                  See what each assistant recommended, which words influenced
                  it, and why every source earned attention.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latestCommandId ? (
              <ShareButton
                resourceType="seo_collection_run"
                resourceId={latestCommandId}
                resourceName={`${site.name} AI Visibility Report`}
                size="sm"
                showStatus={false}
              />
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={sitePath}>Open {site.name}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-2.5 grid gap-2 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <ProTextarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter the exact question a buyer would ask an AI assistant…"
            autoGrow
            minHeight={compactComposer ? 48 : 72}
            maxHeight={compactComposer ? 96 : 144}
            enableCleanup={false}
            enableTextStats={false}
          />
          <div className="grid grid-cols-2 gap-2">
            {AI_VISIBILITY_ENGINES.map((engine) => {
              const checked = engines.includes(engine.id);
              return (
                <label
                  key={engine.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                    checked
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleEngine(engine.id)}
                  />
                  {engine.label}
                </label>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={countryIso}
            onChange={(event) =>
              setCountryIso(event.target.value.toUpperCase().slice(0, 2))
            }
            aria-label="Country code"
            placeholder="US"
            className="h-8 w-20 uppercase"
          />
          <Input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="Optional city"
            placeholder="Optional city"
            className="h-8 w-48"
          />
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Checkbox
              checked={forceRefresh}
              onCheckedChange={(value) => setForceRefresh(value === true)}
            />
            Ignore today’s saved provider result
          </label>
          <Button
            className="ml-auto gap-2"
            disabled={
              !running && (query.trim().length < 2 || engines.length === 0)
            }
            onClick={() => {
              if (running) {
                watchProgress();
                return;
              }
              void analyze({
                query,
                engines,
                country_iso: countryIso || "US",
                city: city.trim() || null,
                force_refresh: forceRefresh,
              });
            }}
          >
            {running ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? "Watch live progress" : "Analyze this query"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Saved provider answers are reused when fresh. Cited pages use the
          shared crawl cache, and only completed answers reach the specialist
          agent.
        </p>
      </section>

      {run.status === "error" && run.error ? (
        <section className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{run.error}</p>
        </section>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {AI_VISIBILITY_ENGINES.map((engine) => (
          <ProviderCard
            key={engine.id}
            engine={engine.id}
            live={run.answers[engine.id]}
            response={latestResponses.find((row) => row.engine === engine.id)}
            running={running && engines.includes(engine.id)}
            onOpen={() => {
              const live = run.answers[engine.id];
              const saved = latestResponses.find(
                (row) => row.engine === engine.id,
              );
              const answer = live?.answerText || saved?.answer_text || "";
              if (!answer) return;
              setOpenAnswer({
                engine: engine.id,
                answer,
                model: live?.modelName ?? saved?.model_name ?? "Answer engine",
              });
            }}
          />
        ))}
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-2.5">
          <p className="text-xs uppercase text-muted-foreground">
            Latest citation coverage
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {latestCited}/{latestProviderCount}
          </p>
          <p className="text-xs text-muted-foreground">
            providers cited this managed site
          </p>
        </div>
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-2.5">
          <p className="text-xs uppercase text-muted-foreground">
            Critical claim posture
          </p>
          <p className="text-lg font-semibold tabular-nums text-destructive">
            {unverifiedCount}
          </p>
          <p className="text-xs text-muted-foreground">
            unverified claims still influencing answers
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-2.5">
          <p className="text-xs uppercase text-muted-foreground">
            Evidence captured
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {citationRows.length}
          </p>
          <p className="text-xs text-muted-foreground">
            cited pages preserved for analysis
          </p>
        </div>
      </section>

      {evidence.isError ? (
        <InlineQueryError
          what="saved AI visibility evidence"
          error={evidence.error}
          onRetry={() => void evidence.refetch()}
        />
      ) : null}

      {evidenceRefreshError ? (
        <section className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="flex-1">{evidenceRefreshError}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void retryEvidence()}
          >
            Retry
          </Button>
        </section>
      ) : null}

      {latestIncompleteCount > 0 ? (
        <section className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">
              The answers arrived, but their specialist analysis did not finish.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Claims and decision signals are created automatically after cited
              pages are captured; there is no separate button. Select “Ignore
              today’s saved provider result,” then run the exact query again to
              start a fresh analysis.
            </p>
          </div>
        </section>
      ) : null}

      <Tabs
        value={activeEvidenceView}
        onValueChange={(value) => {
          if (isAiVisibilityEvidenceView(value)) setActiveEvidenceView(value);
        }}
        className="flex min-h-[560px] flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="w-fit max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="claims" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Claims
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-1.5">
              <SearchCheck className="h-3.5 w-3.5" /> Sources
            </TabsTrigger>
            <TabsTrigger value="signals" className="gap-1.5">
              <ScanSearch className="h-3.5 w-3.5" /> Decision signals
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> History
            </TabsTrigger>
          </TabsList>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`${sitePath}/ai-visibility/${activeEvidenceView}`}>
              <Maximize2 className="h-3.5 w-3.5" /> Open full page
            </Link>
          </Button>
        </div>
        <TabsContent value={activeEvidenceView} className="min-h-0 flex-1">
          {renderEvidenceTable(activeEvidenceView)}
        </TabsContent>
      </Tabs>

      {openAnswer ? (
        <SidePanelSurface
          title={`${engineLabel(openAnswer.engine)} answer`}
          description={openAnswer.model}
          onClose={() => setOpenAnswer(null)}
          defaultWidth={620}
        >
          <div className="p-5 text-sm leading-relaxed">
            <BasicMarkdownContent content={openAnswer.answer} showCopyButton />
          </div>
        </SidePanelSurface>
      ) : null}
    </main>
  );
}
