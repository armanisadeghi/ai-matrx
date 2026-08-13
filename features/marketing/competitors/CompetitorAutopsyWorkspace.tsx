"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Loader2,
  Radar,
  RefreshCw,
  ScanSearch,
  Swords,
  Target,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCompetitorsScope } from "@/features/surfaces/manifests/marketing-competitors.manifest";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { toast } from "@/lib/toast";

import type {
  CompetitorOpportunityRow,
  CompetitorRow,
  CompetitorRunRow,
} from "./data";
import { updateCompetitorTracking, updateOpportunityStatus } from "./data";
import {
  AUTOPSY_RUN_BOUND_CHOICES,
  parseAutopsyRunPlan,
  parseCompetitorDomainsField,
  parseCompetitorTrackingWrite,
  parseOpportunityStatusWrite,
  serializeCompetitorDomains,
  type CompetitorTrackingStatus,
  type OpportunityStatus,
} from "./autopsy-controls";
import { useCompetitorAutopsy } from "./useCompetitorAutopsy";

type Artifact = {
  executive_verdict?: string;
  summary?: string;
  already_have_percentage?: number;
  evidence_coverage?: {
    competitors_analyzed?: number;
    competitor_pages_crawled?: number;
    keywords_compared?: number;
    limitations?: string[];
  };
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function artifactFromRun(run: CompetitorRunRow | undefined): Artifact | null {
  const result = object(run?.result);
  return object(result?.artifact) as Artifact | null;
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function externalLink(url: string | null, label: string) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-64 items-center gap-1 truncate text-primary hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight className="size-3 shrink-0" />
    </a>
  );
}

function OpportunityDetail({ row }: { row: CompetitorOpportunityRow }) {
  return (
    <div className="space-y-5 p-1 text-sm">
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Verdict
        </p>
        <p className="leading-6">{row.verdict}</p>
      </section>
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Why they win
        </p>
        <p className="leading-6">{row.why_competitor_wins}</p>
      </section>
      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What you already have
        </p>
        <p className="leading-6">{row.current_advantage}</p>
      </section>
      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
          Recommended action
        </p>
        <p className="leading-6">{row.recommended_action}</p>
      </section>
      {Array.isArray(row.evidence) && row.evidence.length ? (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          <ul className="space-y-2">
            {row.evidence.map((item, index) => (
              <li key={index} className="rounded-md bg-muted/50 px-3 py-2">
                {String(item)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function CompetitorAutopsyWorkspace() {
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState<string | null>(() =>
    searchParams.get("siteId"),
  );
  const [domains, setDomains] = useState("");
  const [maxCompetitors, setMaxCompetitors] = useState(3);
  const [pagesPerCompetitor, setPagesPerCompetitor] = useState(3);
  const [forceRefresh, setForceRefresh] = useState(false);
  const queryClient = useQueryClient();
  const { sites, workspace, run, start, resolvedSiteId } =
    useCompetitorAutopsy(siteId);

  const data = workspace.data;
  const completedRun = data?.runs.find((item) => item.status === "completed");
  const latestArtifact = artifactFromRun(completedRun);
  const openActions =
    data?.opportunities.filter((item) => item.status === "open").length ?? 0;
  const tracked =
    data?.competitors.filter((item) => item.tracking_status === "tracked")
      .length ?? 0;

  const refresh = async () => {
    if (!resolvedSiteId) return;
    await queryClient.invalidateQueries({
      queryKey: ["marketing", "competitors", resolvedSiteId],
    });
  };

  // ── The ONE write path per entity ────────────────────────────────────────
  // Both the user's row-action click and the surface write target go through
  // these. They deliberately do NOT catch: the row-action wrappers below turn a
  // failure into a toast, while the write handlers let it propagate so the
  // writeback seam converts it into the error envelope the agent reads. A
  // shared `try/catch` here would have swallowed the agent's only feedback.
  const applyTracking = useCallback(
    async (id: string, status: CompetitorTrackingStatus) => {
      await updateCompetitorTracking(id, status);
      await refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedSiteId, queryClient],
  );

  const applyOpportunityStatus = useCallback(
    async (id: string, status: OpportunityStatus) => {
      await updateOpportunityStatus(id, status);
      await refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedSiteId, queryClient],
  );

  const mutateTracking = async (
    id: string,
    status: CompetitorTrackingStatus,
  ) => {
    try {
      await applyTracking(id, status);
      toast.success(
        status === "tracked" ? "Competitor is now tracked" : "Tracking updated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update competitor",
      );
    }
  };

  const mutateOpportunity = async (id: string, status: OpportunityStatus) => {
    try {
      await applyOpportunityStatus(id, status);
      toast.success(
        status === "completed" ? "Action completed" : "Action status updated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update action",
      );
    }
  };

  // ── Write half of the marketing-competitors surface ──────────────────────
  // An agent may STAGE the next autopsy (who to look at, how much to buy) and
  // TRIAGE what the last one produced. It may never press Run — that spends
  // provider credits and crawls someone else's pages — and it may never touch
  // a provider fact, a crawl observation, or an AI judgment. See the
  // writeTargets docblock in `marketing-competitors.manifest.ts`.
  //
  // WHY A REF AND NOT THE RENDER CLOSURE: when an agent stages several targets
  // in one turn, the writeback seam resolves EVERY handler closure BEFORE the
  // user confirms the first dialog. A handler that decided which row to write
  // from its render closure could therefore act on a stale snapshot — writing a
  // status onto a row the user is no longer looking at. Both selection-scoped
  // handlers resolve the visible rows (and the run state) through this ref at
  // APPLY time instead, and refuse the whole write on one unknown id.
  const liveRef = useRef<{
    competitors: Array<{ id: string; label: string }>;
    opportunities: Array<{ id: string; label: string }>;
    runStatus: typeof run.status;
  }>({ competitors: [], opportunities: [], runStatus: "idle" });

  useEffect(() => {
    liveRef.current = {
      competitors: (data?.competitors ?? []).map((row) => ({
        id: row.id,
        label: row.display_domain ?? row.normalized_domain ?? row.id,
      })),
      opportunities: (data?.opportunities ?? []).map((row) => ({
        id: row.id,
        label: row.title ?? row.id,
      })),
      runStatus: run.status,
    };
  }, [data, run.status]);

  /** A run in flight replaces exactly the rows these targets write to, and
   *  disables the button the staged plan exists to feed. Refuse rather than
   *  land a value onto state that is about to be thrown away. */
  const assertNoRunInFlight = (target: string) => {
    if (liveRef.current.runStatus === "running") {
      throw new Error(
        `${target} is unavailable while a competitor autopsy is running — the run is about to replace these rows. Wait for it to finish, then try again.`,
      );
    }
  };

  const getSurfaceWriteHandlers = () => ({
    autopsy_run_plan: (value: unknown) => {
      assertNoRunInFlight("autopsy_run_plan");
      // Validated in a PURE module, OUTSIDE the state updaters, so the throw is
      // synchronous and lands in the writeback seam's catch. A throw raised
      // inside a setState callback fires during React's commit instead, and the
      // agent would read a success envelope for a value that never landed.
      const patch = parseAutopsyRunPlan(value);
      if (patch.domains !== undefined) {
        setDomains(serializeCompetitorDomains(patch.domains));
      }
      if (patch.maxCompetitors !== undefined) {
        setMaxCompetitors(patch.maxCompetitors);
      }
      if (patch.pagesPerCompetitor !== undefined) {
        setPagesPerCompetitor(patch.pagesPerCompetitor);
      }
    },
    competitor_tracking: async (value: unknown) => {
      assertNoRunInFlight("competitor_tracking");
      const write = parseCompetitorTrackingWrite(
        value,
        liveRef.current.competitors,
      );
      await applyTracking(write.competitorId, write.trackingStatus);
    },
    opportunity_status: async (value: unknown) => {
      assertNoRunInFlight("opportunity_status");
      const write = parseOpportunityStatusWrite(
        value,
        liveRef.current.opportunities,
      );
      await applyOpportunityStatus(write.opportunityId, write.status);
    },
  });

  const competitorColumns = useMemo<MatrxColumnDef<CompetitorRow>[]>(
    () => [
      {
        accessorKey: "display_domain",
        header: "Competitor",
        cell: (row) =>
          externalLink(`https://${row.normalized_domain}`, row.display_domain),
        filter: "text",
      },
      { accessorKey: "tracking_status", header: "Tracking", filter: "select" },
      { accessorKey: "threat_level", header: "Threat", filter: "select" },
      {
        accessorKey: "relevance_score",
        header: "Relevance",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span
            className={`font-semibold tabular-nums ${scoreTone(row.relevance_score)}`}
          >
            {row.relevance_score ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "keyword_intersections",
        header: "Shared keywords",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "organic_keywords",
        header: "Organic keywords",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "estimated_traffic",
        header: "Est. traffic",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "average_position",
        header: "Avg. position",
        filter: "number",
        align: "right",
      },
      { accessorKey: "discovery_source", header: "Source", filter: "select" },
      {
        accessorKey: "last_observed_at",
        header: "Last observed",
        filter: "text",
      },
    ],
    [],
  );

  const opportunityColumns = useMemo<
    MatrxColumnDef<CompetitorOpportunityRow>[]
  >(
    () => [
      {
        accessorKey: "priority",
        header: "Priority",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span className={`font-bold tabular-nums ${scoreTone(row.priority)}`}>
            {row.priority}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: "Opportunity",
        filter: "text",
        width: 280,
      },
      { accessorKey: "status", header: "Status", filter: "select" },
      { accessorKey: "opportunity_type", header: "Type", filter: "select" },
      {
        accessorKey: "competitor_domain",
        header: "Competitor",
        filter: "text",
        cell: (row) => externalLink(row.competitor_url, row.competitor_domain),
      },
      {
        accessorKey: "target_page_url",
        header: "Your page",
        filter: "text",
        cell: (row) =>
          row.target_page_id ? (
            <Link
              href={marketingRoutes.sitePage(
                null,
                row.site_id,
                row.target_page_id,
              )}
              className="block max-w-64 truncate text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.target_page_url ?? row.target_page_id}
            </Link>
          ) : (
            <span className="text-muted-foreground">New asset</span>
          ),
      },
      {
        accessorKey: "primary_keyword",
        header: "Primary keyword",
        filter: "text",
      },
      { accessorKey: "impact", header: "Impact", filter: "select" },
      { accessorKey: "effort", header: "Effort", filter: "select" },
      {
        accessorKey: "confidence",
        header: "Confidence",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "recommended_action",
        header: "Recommended action",
        filter: "text",
        width: 360,
      },
    ],
    [],
  );

  const runColumns = useMemo<MatrxColumnDef<CompetitorRunRow>[]>(
    () => [
      { accessorKey: "status", header: "Status", filter: "select" },
      { accessorKey: "created_at", header: "Started", filter: "text" },
      { accessorKey: "completed_at", header: "Completed", filter: "text" },
      {
        accessorKey: "attempt_count",
        header: "Attempts",
        filter: "number",
        align: "right",
      },
      {
        accessorKey: "reported_cost",
        header: "Reported cost",
        filter: "number",
        align: "right",
      },
      { accessorKey: "id", header: "Run ID", filter: "text" },
    ],
    [],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-competitors"
      getScope={() =>
        createMarketingCompetitorsScope({
          site_id: resolvedSiteId ?? undefined,
          site: sites.data?.find((site) => site.id === resolvedSiteId) as
            Record<string, unknown> | undefined,
          competitors: data?.competitors as
            Array<Record<string, unknown>> | undefined,
          opportunities: data?.opportunities as
            Array<Record<string, unknown>> | undefined,
          latest_autopsy: latestArtifact as Record<string, unknown> | undefined,
          active_run: run as unknown as Record<string, unknown>,
          // The staged run plan — the read twins of `autopsy_run_plan`, so the
          // agent can see what is already in the card before it patches it.
          autopsy_competitor_domains: parseCompetitorDomainsField(domains),
          autopsy_max_competitors: maxCompetitors,
          autopsy_pages_per_competitor: pagesPerCompetitor,
          autopsy_force_refresh: forceRefresh,
          selection: resolvedSiteId ?? undefined,
        })
      }
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 p-4 md:p-6">
        <AssistStrip surfaceName="matrx-user/marketing-competitors" />

        <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-primary/[0.06] shadow-sm">
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_440px] lg:p-7">
            {/* Centered, not top-anchored: the run form on the right is taller
              than the heading + tiles, which left a large dead void under this
              column. */}
            <div className="flex flex-col justify-center gap-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Swords className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Competitor opportunity autopsy
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Find the competitors that actually overlap, inspect the
                    pages creating their advantage, and turn the evidence into a
                    prioritized plan for the assets you already own.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Radar className="size-5 text-primary" />
                    <div>
                      <p className="text-2xl font-semibold">
                        {data?.competitors.length ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Relevant competitors
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Target className="size-5 text-amber-500" />
                    <div>
                      <p className="text-2xl font-semibold">{openActions}</p>
                      <p className="text-xs text-muted-foreground">
                        Open actions
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <CheckCircle2 className="size-5 text-emerald-500" />
                    <div>
                      <p className="text-2xl font-semibold">
                        {latestArtifact?.already_have_percentage ?? "—"}
                        {typeof latestArtifact?.already_have_percentage ===
                        "number"
                          ? "%"
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Advantage already covered
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="border-primary/15 bg-background/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Run a fresh autopsy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="competitor-site">Site</Label>
                  <Select
                    value={resolvedSiteId ?? ""}
                    onValueChange={setSiteId}
                  >
                    <SelectTrigger id="competitor-site">
                      <SelectValue placeholder="Choose a site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.data?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name || site.domain || site.root_url}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="competitor-domains">
                    Competitors to include{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="competitor-domains"
                    value={domains}
                    onChange={(event) => setDomains(event.target.value)}
                    placeholder="One domain per line. Leave blank for automatic discovery."
                    className="min-h-20 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Both selects render from the SAME constant the manifest's
                    contract prose is interpolated from and the write handler
                    validates against, so the three cannot drift. */}
                  <div className="space-y-1.5">
                    <Label>Competitors</Label>
                    <Select
                      value={String(maxCompetitors)}
                      onValueChange={(value) =>
                        setMaxCompetitors(Number(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTOPSY_RUN_BOUND_CHOICES.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pages each</Label>
                    <Select
                      value={String(pagesPerCompetitor)}
                      onValueChange={(value) =>
                        setPagesPerCompetitor(Number(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTOPSY_RUN_BOUND_CHOICES.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="force-refresh"
                    checked={forceRefresh}
                    onCheckedChange={(value) => setForceRefresh(value === true)}
                  />
                  <Label htmlFor="force-refresh" className="font-normal">
                    Ignore today&apos;s cached provider evidence
                  </Label>
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={!resolvedSiteId || run.status === "running"}
                  onClick={() =>
                    void start({
                      competitorDomains: parseCompetitorDomainsField(domains),
                      maxCompetitors,
                      pagesPerCompetitor,
                      forceRefresh,
                    })
                  }
                >
                  {run.status === "running" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ScanSearch className="size-4" />
                  )}
                  {run.status === "running"
                    ? "Building the autopsy"
                    : "Run competitor autopsy"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Only while the run is live. The strategist's output is pure structured
          JSON, so the canonical renderer has no text to show and parks on its
          "Processing…" shimmer — which, left mounted after completion, sat under
          a finished "Autopsy complete" run forever. The verdict card and the
          tables below ARE the finished output. */}
        {run.status === "running" ? (
          <LiveRunDisplay
            requestId={run.requestId}
            pending={!run.requestId}
            label={run.stage ?? "Competitor autopsy"}
            bodyClassName="max-h-[34rem]"
          />
        ) : null}
        {run.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {run.error}
          </div>
        ) : null}

        {latestArtifact?.executive_verdict ? (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CircleDot className="size-4 text-primary" />
                Latest verdict
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base font-medium leading-7">
                {latestArtifact.executive_verdict}
              </p>
              {latestArtifact.summary ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {latestArtifact.summary}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="opportunities" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="opportunities">
                Opportunities{" "}
                <Badge variant="secondary" className="ml-2">
                  {data?.opportunities.length ?? 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="competitors">
                Competitors{" "}
                <Badge variant="secondary" className="ml-2">
                  {data?.competitors.length ?? 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>

          <TabsContent value="opportunities" className="mt-4">
            <MatrxDataTable
              urlState={{ id: "competitor-opportunities" }}
              data={data?.opportunities ?? []}
              columns={opportunityColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              detail={{
                title: (row) => row.title,
                render: (row) => <OpportunityDetail row={row} />,
              }}
              window={{
                title: (row) => row.title,
                renderView: (row) => <OpportunityDetail row={row} />,
                enabled: true,
              }}
              rowActions={(row) => (
                <div className="flex items-center gap-1">
                  {row.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void mutateOpportunity(row.id, "accepted")}
                    >
                      Accept
                    </Button>
                  ) : null}
                  {row.status === "accepted" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void mutateOpportunity(row.id, "in_progress")
                      }
                    >
                      Start
                    </Button>
                  ) : null}
                  {row.status === "in_progress" ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        void mutateOpportunity(row.id, "completed")
                      }
                    >
                      Complete
                    </Button>
                  ) : null}
                  {row.status !== "completed" && row.status !== "dismissed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void mutateOpportunity(row.id, "dismissed")
                      }
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              )}
              emptyState={{
                icon: <Target className="size-8" />,
                title: "No opportunities yet",
                description:
                  "Run an autopsy to turn competitive evidence into a prioritized action list.",
              }}
            />
          </TabsContent>

          <TabsContent value="competitors" className="mt-4">
            <MatrxDataTable
              urlState={{ id: "competitors" }}
              data={data?.competitors ?? []}
              columns={competitorColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              detail={{ title: (row) => row.display_domain }}
              window={{ title: (row) => row.display_domain, enabled: true }}
              rowActions={(row) =>
                // "tracked" is the server's vocabulary (see autopsy-controls);
                // this row action sent "tracking" until 2026-08-12, which the
                // canonical RPC rejects outright.
                row.tracking_status === "tracked" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void mutateTracking(row.id, "ignored")}
                  >
                    Stop tracking
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mutateTracking(row.id, "tracked")}
                  >
                    Track
                  </Button>
                )
              }
              emptyState={{
                icon: <Swords className="size-8" />,
                title: "No competitors identified",
                description:
                  "Automatic discovery measures real keyword overlap before adding a rival.",
              }}
            />
          </TabsContent>

          <TabsContent value="evidence" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Competitors analyzed
                    </span>
                    <strong>
                      {latestArtifact?.evidence_coverage
                        ?.competitors_analyzed ?? 0}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pages crawled</span>
                    <strong>
                      {latestArtifact?.evidence_coverage
                        ?.competitor_pages_crawled ?? 0}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Keywords compared
                    </span>
                    <strong>
                      {latestArtifact?.evidence_coverage?.keywords_compared ??
                        0}
                    </strong>
                  </div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Known limitations</CardTitle>
                </CardHeader>
                <CardContent>
                  {latestArtifact?.evidence_coverage?.limitations?.length ? (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {latestArtifact.evidence_coverage.limitations.map(
                        (item, index) => (
                          <li
                            key={index}
                            className="rounded-md bg-muted/50 px-3 py-2"
                          >
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No limitations were recorded for the latest run.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <MatrxDataTable
              urlState={{ id: "competitor-autopsy-runs" }}
              data={data?.runs ?? []}
              columns={runColumns}
              getRowId={(row) => row.id}
              isLoading={workspace.isLoading}
              isFetching={workspace.isFetching}
              detail={{ title: (row) => `Autopsy ${row.id}` }}
              window={{ title: (row) => `Autopsy ${row.id}`, enabled: true }}
              emptyState={{
                title: "No autopsy history",
                description:
                  "Every run will remain here with its durable result and cost evidence.",
              }}
            />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          {tracked} competitor{tracked === 1 ? "" : "s"} currently tracked.
          Every provider fact, crawl observation, AI judgment, and human status
          remains separate in the stored record.
        </p>
      </main>
    </SurfaceRuntimeProvider>
  );
}
