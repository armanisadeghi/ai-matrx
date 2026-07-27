"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Database,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  humanBacklinkRow,
  humanDimensionList,
  humanDimensionRow,
  humanMetric,
  humanSummarySnapshot,
  humanTrend,
  projectBacklinkRow,
  projectDimensionRow,
} from "@/features/marketing/components/backlinks/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBacklinksScope } from "@/features/surfaces/manifests/marketing-backlinks.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  backlinkKeys,
  useBacklinkTrend,
  useBacklinkWorkspace,
  useLatestBacklinks,
} from "@/features/marketing/data/backlinks-hooks";
import { BacklinkTrendChart } from "@/features/marketing/components/backlinks/BacklinkTrendChart";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
} from "@/features/marketing/data/backlinks-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  buildSiteIntegrations,
  parseSiteIntegrations,
  validateSiteIntegrations,
  type DataForSeoCadence,
} from "@/features/marketing/data/integrations-schema";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  refreshSiteBacklinks,
  SeoApiError,
} from "@/features/marketing/seo/dataforseo/client";
import type {
  BacklinkRefreshProfile,
  BacklinkRefreshReceipt,
} from "@/features/marketing/seo/dataforseo/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectApiServiceTargets } from "@/lib/redux/slices/apiConfigSlice";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

function compactNumber(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof SeoApiError) {
    return typeof error.detail === "string"
      ? error.detail
      : JSON.stringify(error.detail);
  }
  return error instanceof Error ? error.message : String(error);
}

function MetricCard({
  label,
  value,
  detail,
  siteDomain,
  location,
}: {
  label: string;
  value: number | null | undefined;
  detail?: string;
  siteDomain: string;
  location: string;
}) {
  return (
    <div className="group/metric relative rounded-lg bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {compactNumber(value)}
      </p>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/metric:opacity-100">
        <CopyButtons
          size="xs"
          label={label}
          human={() => humanMetric(label, value, siteDomain, detail)}
          agent={() => ({
            kind: "backlink-metric",
            location,
            description: `The "${label}" backlink KPI for ${siteDomain}.`,
            data: { metric: label, value: value ?? null, detail: detail ?? null },
            summary: humanMetric(label, value, siteDomain, detail),
            attributes: { metric: label },
          })}
        />
      </div>
    </div>
  );
}

function DimensionList({
  title,
  rows,
  kind,
  location,
  siteDomain,
  anchor,
}: {
  title: string;
  rows: BacklinkDimensionRow[];
  /** Stable slug for agent payloads, e.g. "backlink-referring-domain". */
  kind: string;
  location: string;
  siteDomain: string;
  /** Declared surface value name this list renders — powers Locate. */
  anchor?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 8);
  return (
    <section
      data-surface-value={anchor}
      className="min-w-0 rounded-lg bg-muted/40 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="flex shrink-0 items-center gap-1">
          <CopyButtons
            size="xs"
            label={`${title} (all ${rows.length})`}
            disabled={!rows.length}
            human={() => humanDimensionList(title, rows)}
            json={() => rows}
            agent={() => ({
              kind: `${kind}-list`,
              location,
              description: `All stored "${title}" backlink dimension rows for ${siteDomain}.`,
              data: rows,
              summary: humanDimensionList(title, rows),
              attributes: { count: rows.length, shown: visible.length },
            })}
          />
          {rows.length > 8 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "top 8" : `all ${rows.length}`}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {rows.length ? `all ${rows.length}` : "empty"}
            </span>
          )}
        </span>
      </div>
      <div
        className={cn(
          "space-y-1.5",
          showAll && "max-h-64 overflow-y-auto pr-1",
        )}
      >
        {visible.map((row) => (
          <div
            key={row.id}
            className="group/dim flex min-w-0 items-center justify-between gap-2 text-xs"
          >
            <span
              className="truncate text-foreground"
              title={row.label ?? row.dimension_key}
            >
              {row.label ?? row.dimension_key}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <CopyButtons
                size="xs"
                className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/dim:opacity-100"
                label={row.label ?? row.dimension_key}
                human={() => humanDimensionRow(row)}
                json={() => row}
                agent={() => ({
                  kind,
                  location,
                  description: `One "${title}" backlink dimension row for ${siteDomain}.`,
                  data: row,
                  summary: humanDimensionRow(row),
                  attributes: { label: row.label ?? row.dimension_key },
                })}
              />
              <span className="tabular-nums text-muted-foreground">
                {compactNumber(row.backlinks ?? row.referring_domains)}
              </span>
            </span>
          </div>
        ))}
        {!rows.length ? (
          <p className="text-xs text-muted-foreground">No stored rows yet.</p>
        ) : null}
      </div>
    </section>
  );
}

export function BacklinksWorkspace() {
  const { site } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const seoTarget = serviceTargets.find((target) => target.service === "seo");
  const table = useMarketingTableState({
    defaultSort: { id: "domain_rank", direction: "desc" },
    defaultPageSize: 100,
  });
  const workspace = useBacklinkWorkspace(site.id);
  const trend = useBacklinkTrend(site.id);
  const backlinks = useLatestBacklinks(site.id, table.queryState);
  const [profile, setProfile] = useState<BacklinkRefreshProfile>("bootstrap");
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<BacklinkRefreshReceipt | null>(null);
  const savedSchedule = useMemo(
    () => parseSiteIntegrations(site.integrations).dataForSeo,
    [site.integrations],
  );
  const [schedule, setSchedule] = useState(savedSchedule);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleDirty =
    JSON.stringify(schedule) !== JSON.stringify(savedSchedule);
  const detailLimitValid =
    Number.isInteger(schedule.detailLimit) &&
    schedule.detailLimit >= 1 &&
    schedule.detailLimit <= 1000;

  const saveSchedule = async () => {
    const draft = parseSiteIntegrations(site.integrations);
    draft.dataForSeo = schedule;
    const issues = validateSiteIntegrations(draft);
    if (issues.length) {
      toast.error(issues[0].message);
      return;
    }
    setSavingSchedule(true);
    try {
      const updated = await updateSiteIntegrations({
        siteId: site.id,
        expectedVersion: site.version,
        integrations: buildSiteIntegrations(site.integrations, draft),
      });
      queryClient.setQueryData(marketingKeys.site(site.id), updated);
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
      toast.success(
        schedule.enabled
          ? `Automatic ${schedule.cadence} backlink refresh enabled.`
          : "Automatic backlink refresh disabled.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingSchedule(false);
    }
  };

  const refresh = async () => {
    if (!seoTarget?.url) {
      toast.error("No SEO server is configured for the selected environment.");
      return;
    }
    setRefreshing(true);
    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Sign in before refreshing backlink data.");
      const nextReceipt = await refreshSiteBacklinks(
        seoTarget.url,
        token,
        site.id,
        {
          organization_id: site.organization_id,
          profile,
          detail_limit: schedule.detailLimit,
          force_refresh: true,
          request_id: crypto.randomUUID(),
        },
      );
      setReceipt(nextReceipt);
      await queryClient.invalidateQueries({
        queryKey: backlinkKeys.workspace(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: backlinkKeys.trend(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: [
          ...backlinkKeys.workspace(site.id).slice(0, -1),
          "observations",
        ],
      });
      toast.success(`Backlink ${profile} refresh completed.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  if (workspace.isLoading) {
    return <LoadingSurface label="Loading backlink intelligence…" />;
  }
  if (workspace.isError) {
    return (
      <QueryError
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  }

  const data = workspace.data;
  const summary = data?.latestByDataset.summary;
  const detailSnapshot = data?.latestByDataset.backlinks;
  const pageLocation = `Marketing — Backlink intelligence for ${site.domain}`;

  const dimensionGroups = [
    {
      id: "referring_domains",
      anchor: "top_referring_domains",
      title: "Referring domains",
      kind: "backlink-referring-domain",
      rows: data?.referringDomains ?? [],
    },
    {
      id: "anchors",
      anchor: "top_anchors",
      title: "Anchor text",
      kind: "backlink-anchor",
      rows: data?.anchors ?? [],
    },
    {
      id: "target_pages",
      anchor: "top_target_pages",
      title: "Linked pages",
      kind: "backlink-target-page",
      rows: data?.targetPages ?? [],
    },
    {
      id: "competitors",
      anchor: "top_competitors",
      title: "Competitors",
      kind: "backlink-competitor",
      rows: data?.competitors ?? [],
    },
  ] as const;

  const pageHuman = () =>
    [
      `Backlink intelligence — ${site.domain}`,
      humanSummarySnapshot(summary, site.domain),
      humanTrend(trend.data ?? []),
      ...dimensionGroups.map((group) =>
        humanDimensionList(group.title, group.rows),
      ),
      `Stored backlink rows: ${(backlinks.data?.total ?? 0).toLocaleString()} total recorded${
        detailSnapshot
          ? `, collected until ${formatCompactDate(detailSnapshot.created_at)}`
          : ""
      }.`,
    ].join("\n\n");

  const groomerSections = (): AgentCopyGroomerSection[] => {
    const trendPoints = trend.data ?? [];
    const tableRows = backlinks.data?.rows ?? [];
    const sections: AgentCopyGroomerSection[] = [
      {
        id: "summary",
        title: "KPI summary",
        description: "Latest backlink summary snapshot (totals, rank).",
        build: (level) =>
          !summary
            ? null
            : level === "full"
              ? summary
              : level === "compact"
                ? {
                    total_backlinks: summary.total_backlinks,
                    referring_domains: summary.referring_domains,
                    dofollow_backlinks: summary.dofollow_backlinks,
                    nofollow_backlinks: summary.nofollow_backlinks,
                    rank_score: summary.rank_score,
                    collected_at: summary.created_at,
                  }
                : {
                    total_backlinks: summary.total_backlinks,
                    referring_domains: summary.referring_domains,
                    collected_at: summary.created_at,
                  },
        levelLabels: { full: "Raw snapshot", compact: "KPIs", brief: "Core" },
      },
      {
        id: "refresh_schedule",
        title: "Refresh schedule",
        description: "Automatic refresh config + selected manual profile.",
        cuttable: true,
        build: () => ({
          automatic_refresh: schedule,
          manual_profile: profile,
          seo_environment: seoTarget?.environment ?? null,
        }),
      },
      {
        id: "trend",
        title: "New vs. lost trend",
        description: `${trendPoints.length} stored timeseries periods.`,
        cuttable: true,
        levelLabels: {
          full: `All ${trendPoints.length}`,
          compact: "Last 12",
          brief: "Totals",
        },
        build: (level) =>
          level === "full"
            ? trendPoints
            : level === "compact"
              ? trendPoints.slice(-12)
              : { summary: humanTrend(trendPoints) },
      },
      ...dimensionGroups.map(
        (group): AgentCopyGroomerSection => ({
          id: group.id,
          title: group.title,
          description: `${group.rows.length} stored dimension rows.`,
          cuttable: true,
          levelLabels: {
            full: `All ${group.rows.length} (raw)`,
            compact: "Top 8",
            brief: "Top 3",
          },
          build: (level) =>
            level === "full"
              ? group.rows
              : group.rows
                  .slice(0, level === "compact" ? 8 : 3)
                  .map(projectDimensionRow),
        }),
      ),
      {
        id: "backlink_rows",
        title: "Backlink rows",
        description: `${tableRows.length} loaded of ${(backlinks.data?.total ?? 0).toLocaleString()} recorded (current table page + filters).`,
        cuttable: true,
        levelLabels: {
          full: `Loaded ${tableRows.length} (raw)`,
          compact: "Top 25 (key fields)",
          brief: "Counts only",
        },
        build: (level) =>
          level === "full"
            ? { query: table.state, rows: tableRows }
            : level === "compact"
              ? {
                  query: table.state,
                  rows: tableRows.slice(0, 25).map(projectBacklinkRow),
                }
              : {
                  total_recorded: backlinks.data?.total ?? 0,
                  loaded_rows: tableRows.length,
                  top_source_domains: tableRows
                    .slice(0, 5)
                    .map((row) => row.source_domain ?? row.source_url),
                },
      },
    ];
    if (receipt) {
      sections.push({
        id: "refresh_receipt",
        title: "Refresh receipt",
        description: "Raw receipt from the last manual refresh in this tab.",
        cuttable: true,
        defaultSelection: "off",
        build: (level) =>
          level === "full"
            ? receipt
            : { note: "Receipt trimmed — switch to Full for the raw payload." },
      });
    }
    return sections;
  };

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Backlinks — ${site.domain}`,
    kind: "marketing-backlinks-page",
    location: pageLocation,
    description: `The full backlink intelligence workspace for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    context: { seo_environment: seoTarget?.environment ?? undefined },
    summary: humanSummarySnapshot(summary, site.domain),
    sections: groomerSections(),
  });

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-backlinks-page",
    location: pageLocation,
    description: `The full backlink intelligence workspace for ${site.domain}.`,
    data: pageFullData(),
    summary: humanSummarySnapshot(summary, site.domain),
    attributes: { site_id: site.id, domain: site.domain },
  });
  const columns: MatrxColumnDef<BacklinkObservationRow>[] = [
    {
      id: "source_domain",
      accessorKey: "source_domain",
      header: "Source domain",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-40 max-w-64 truncate font-medium text-foreground">
          {row.source_domain ?? "—"}
        </span>
      ),
    },
    {
      id: "source_url",
      accessorKey: "source_url",
      header: "Source URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <a
          href={row.source_url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-56 max-w-xl items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
        >
          <span className="truncate">{row.source_url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ),
    },
    {
      id: "target_url",
      accessorKey: "target_url",
      header: "Target page URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <a
          href={row.target_url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-56 max-w-xl items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
        >
          <span className="truncate">{row.target_url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ),
    },
    {
      id: "anchor_text",
      accessorKey: "anchor_text",
      header: "Anchor",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-52 truncate text-xs text-foreground">
          {row.anchor_text || "—"}
        </span>
      ),
    },
    {
      id: "state",
      accessorKey: "state",
      header: "State",
      filter: "select",
      filterOptions: [
        { value: "active", label: "Active" },
        { value: "new", label: "New" },
        { value: "lost", label: "Lost" },
      ],
      cell: (row) => <StatusBadge value={row.state} />,
    },
    {
      id: "is_dofollow",
      accessorKey: "is_dofollow",
      header: "Follow",
      filter: "boolean",
      cell: (row) => (
        <span
          className={cn(
            "text-xs font-medium",
            row.is_dofollow ? "text-success" : "text-foreground",
          )}
        >
          {row.is_dofollow ? "dofollow" : "nofollow"}
        </span>
      ),
    },
    {
      id: "domain_rank",
      accessorKey: "domain_rank",
      header: "Domain rank",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-foreground">
          {row.domain_rank ?? "—"}
        </span>
      ),
    },
    {
      id: "last_seen_at",
      accessorKey: "last_seen_at",
      header: "Last seen",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {row.last_seen_at ? formatCompactDate(row.last_seen_at) : "—"}
        </span>
      ),
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-backlinks"
      getScope={() =>
        createMarketingBacklinksScope({
          ...getBaseValues(),
          // Explicit KPI object — never the raw provider payload.
          backlink_summary: summary
            ? {
                total_backlinks: summary.total_backlinks,
                referring_domains: summary.referring_domains,
                dofollow_backlinks: summary.dofollow_backlinks,
                nofollow_backlinks: summary.nofollow_backlinks,
                rank_score: summary.rank_score,
                collected_at: summary.created_at,
              }
            : undefined,
          top_referring_domains: data?.referringDomains
            .slice(0, 15)
            .map((row) => ({
              domain: row.label ?? row.dimension_key,
              backlinks: row.backlinks,
              referring_domains: row.referring_domains,
            })),
          top_anchors: data?.anchors.slice(0, 15).map((row) => ({
            anchor: row.label ?? row.dimension_key,
            backlinks: row.backlinks,
          })),
          top_target_pages: data?.targetPages
            .slice(0, 15)
            .map((row) => projectDimensionRow(row)),
          top_competitors: data?.competitors
            .slice(0, 15)
            .map((row) => projectDimensionRow(row)),
          backlink_trend: (trend.data ?? []).slice(-30).map((point) => ({
            ...point,
          })),
          backlink_profile: summary
            ? {
                summary: {
                  total_backlinks: summary.total_backlinks,
                  referring_domains: summary.referring_domains,
                  dofollow_backlinks: summary.dofollow_backlinks,
                  nofollow_backlinks: summary.nofollow_backlinks,
                  rank_score: summary.rank_score,
                  collected_at: summary.created_at,
                },
                referring_domain_count: data?.referringDomains.length ?? 0,
                anchor_count: data?.anchors.length ?? 0,
                target_page_count: data?.targetPages.length ?? 0,
                competitor_count: data?.competitors.length ?? 0,
                trend_points: (trend.data ?? []).length,
              }
            : undefined,
          backlinks_table_state: {
            total_recorded: backlinks.data?.total ?? 0,
            loaded_rows: backlinks.data?.rows.length ?? 0,
            page: table.state.page,
            search: table.state.search || null,
          },
          backlink_rows: backlinks.data?.rows.map((row) =>
            projectBacklinkRow(row),
          ) as Array<Record<string, unknown>> | undefined,
          backlinks_collected_at: detailSnapshot?.created_at ?? undefined,
          refresh_schedule: {
            enabled: savedSchedule.enabled,
            cadence: savedSchedule.cadence,
            detail_limit: savedSchedule.detailLimit,
          },
          refresh_profile: profile,
          seo_environment: seoTarget?.environment ?? undefined,
          refresh_receipt: receipt
            ? (receipt as unknown as Record<string, unknown>)
            : undefined,
        })
      }
    >
      <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-textured p-3 pb-40 sm:p-4 sm:pb-48">
        <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-primary" /> Backlink intelligence
            </h1>
            <p
              data-surface-value="seo_environment"
              className="mt-0.5 text-xs text-muted-foreground"
            >
              DataForSEO evidence stored for {site.domain}. Manual refresh
              follows the shell&apos;s {seoTarget?.environment ?? "selected"}{" "}
              SEO server target.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CopyButtons
              size="icon"
              label={`Backlinks page (${site.domain})`}
              human={pageHuman}
              json={pageFullData}
              agent={pageAgentPayload}
            />
            <ExportMenu
              label={`backlinks-page-${site.domain}`}
              items={[jsonExportItem(pageFullData, "Page data (.json)")]}
            />
            <AgentCopyGroomerLauncher config={groomerConfig} />
            <Select
              value={profile}
              onValueChange={(value) =>
                setProfile(value as BacklinkRefreshProfile)
              }
            >
              <SelectTrigger
                data-surface-value="refresh_profile"
                size="sm"
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly core</SelectItem>
                <SelectItem value="monthly">Monthly detail</SelectItem>
                <SelectItem value="bootstrap">Full bootstrap</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={refreshing || !detailLimitValid}
              onClick={() => void refresh()}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh now
            </Button>
          </div>
        </section>

        <section
          data-surface-value="refresh_schedule"
          className="flex flex-wrap items-end gap-3 border-b border-border pb-3"
        >
          <div className="mr-auto min-w-64">
            <div className="flex items-center gap-2">
              <Switch
                aria-label="Enable automatic backlink refresh"
                checked={schedule.enabled}
                onCheckedChange={(enabled) =>
                  setSchedule((current) => ({ ...current, enabled }))
                }
              />
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Automatic refresh
                </h2>
                <p className="text-xs text-muted-foreground">
                  Stored on this site; the aidream scheduler checks due sites
                  daily.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-foreground">Cadence</Label>
            <Select
              value={schedule.cadence}
              onValueChange={(cadence) =>
                setSchedule((current) => ({
                  ...current,
                  cadence: cadence as DataForSeoCadence,
                }))
              }
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="backlink-detail-limit"
              className="text-xs text-foreground"
            >
              Detail rows
            </Label>
            <Input
              id="backlink-detail-limit"
              type="number"
              min={1}
              max={1000}
              value={schedule.detailLimit}
              className="h-8 w-28"
              onChange={(event) =>
                setSchedule((current) => ({
                  ...current,
                  detailLimit: Number(event.target.value),
                }))
              }
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!scheduleDirty || savingSchedule || !detailLimitValid}
            onClick={() => void saveSchedule()}
          >
            {savingSchedule ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save schedule
          </Button>
        </section>

        <section
          data-surface-value="backlink_summary"
          className="grid grid-cols-2 gap-2 lg:grid-cols-6"
        >
          <MetricCard
            label="Backlinks"
            value={summary?.total_backlinks}
            siteDomain={site.domain}
            location={pageLocation}
          />
          <MetricCard
            label="Referring domains"
            value={summary?.referring_domains}
            siteDomain={site.domain}
            location={pageLocation}
          />
          <MetricCard
            label="Dofollow"
            value={summary?.dofollow_backlinks}
            siteDomain={site.domain}
            location={pageLocation}
          />
          <MetricCard
            label="Nofollow"
            value={summary?.nofollow_backlinks}
            siteDomain={site.domain}
            location={pageLocation}
          />
          <MetricCard
            label="Rank"
            value={summary?.rank_score}
            siteDomain={site.domain}
            location={pageLocation}
          />
          <MetricCard
            label="Last refreshed"
            value={null}
            detail={
              summary
                ? formatCompactDate(summary.created_at)
                : "No snapshot yet"
            }
            siteDomain={site.domain}
            location={pageLocation}
          />
        </section>

        <section data-surface-value="backlink_trend" className="border-b border-border pb-3">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-foreground">
              New vs. lost backlinks over time
            </h2>
            <p className="text-xs text-muted-foreground">
              From the stored DataForSEO backlink timeseries — no re-fetch
              required once a weekly or bootstrap refresh has run.
            </p>
          </div>
          {trend.isLoading ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              Loading trend…
            </div>
          ) : trend.isError ? (
            <QueryError
              error={trend.error}
              onRetry={() => void trend.refetch()}
            />
          ) : (
            <BacklinkTrendChart points={trend.data ?? []} />
          )}
        </section>

        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {dimensionGroups.map((group) => (
            <DimensionList
              key={group.id}
              title={group.title}
              rows={group.rows}
              kind={group.kind}
              anchor={group.anchor}
              location={pageLocation}
              siteDomain={site.domain}
            />
          ))}
        </section>

        {receipt ? (
          <section
            data-surface-value="refresh_receipt"
            className="h-80 overflow-hidden rounded-lg border border-border bg-card"
          >
            <JsonInspector
              data={receipt}
              label="Exact refresh receipt"
              defaultView="json"
              defaultExpandDepth={3}
              className="rounded-none"
              agentCopy={() => ({
                kind: "backlink-refresh-receipt",
                location: pageLocation,
                description: `The raw receipt from the last manual backlink refresh for ${site.domain}.`,
                data: receipt,
                attributes: { profile },
              })}
            />
          </section>
        ) : null}

        <section data-surface-value="backlink_rows" className="flex min-h-[44rem] flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 py-2">
            <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground">
              <Database className="h-4 w-4 text-primary" />
              Backlinks
            </h2>
            <span
              data-surface-value="backlinks_collected_at"
              className="text-xs tabular-nums text-muted-foreground"
              title={
                detailSnapshot
                  ? `Collected until ${formatCompactDate(detailSnapshot.created_at)}`
                  : "Not collected yet"
              }
            >
              {(backlinks.data?.total ?? 0).toLocaleString()}
            </span>
            <div
              data-surface-value="backlinks_table_state"
              className="ml-auto flex min-w-0 items-center gap-1"
            >
              <div className="relative w-full min-w-40 sm:w-72">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={table.state.search}
                  onChange={(event) =>
                    table.onStateChange({
                      ...table.state,
                      search: event.target.value,
                      page: 1,
                    })
                  }
                  placeholder="Search source, target, or anchor…"
                  className="h-8 pl-8 pr-8 text-sm"
                  style={{ fontSize: "16px" }}
                />
                {table.state.search ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      table.onStateChange({
                        ...table.state,
                        search: "",
                        page: 1,
                      })
                    }
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <CopyButtons
                size="icon"
                label="Backlinks (loaded rows)"
                human={() =>
                  (backlinks.data?.rows ?? [])
                    .map(humanBacklinkRow)
                    .join("\n\n")
                }
                json={() =>
                  (backlinks.data?.rows ?? []).map(projectBacklinkRow)
                }
                agent={() => ({
                  kind: "backlinks",
                  location: pageLocation,
                  description: `The currently loaded backlink rows for ${site.domain} (server-paged view).`,
                  data: backlinks.data?.rows ?? [],
                  attributes: {
                    loaded_rows: backlinks.data?.rows.length ?? 0,
                    total_recorded: backlinks.data?.total ?? 0,
                    page: table.state.page,
                    search: table.state.search || undefined,
                  },
                })}
              />
              <ExportMenu
                label={`backlinks-${site.domain}`}
                items={[
                  jsonExportItem(
                    () => backlinks.data?.rows ?? [],
                    "JSON (loaded rows, raw)",
                  ),
                  {
                    id: "csv",
                    label: "CSV (loaded rows)",
                    build: () => ({
                      content: rowsToCsv(
                        (backlinks.data?.rows ?? []).map(
                          projectBacklinkRow,
                        ) as unknown as Array<Record<string, unknown>>,
                      ),
                      extension: "csv",
                      mime: "text/csv",
                    }),
                  },
                ]}
              />
            </div>
          </div>
          <MatrxDataTable<BacklinkObservationRow>
            className="min-h-0 flex-1 gap-0 overflow-hidden rounded-md border border-border bg-card [&>div:last-child]:border-t [&>div:last-child]:border-border [&>div:last-child]:bg-muted/30 [&>div:last-child]:px-3 [&>div:last-child]:py-2"
            tableClassName="min-h-[36rem] rounded-none border-0"
            data={backlinks.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={backlinks.isLoading}
            isFetching={backlinks.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: backlinks.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{ search: false }}
            copy={{
              label: "Backlink",
              listLabel: "Backlinks view",
              showToolbar: false,
              location: pageLocation,
              rowKind: "backlink",
              listKind: "backlinks",
              humanRow: humanBacklinkRow,
              rowAttributes: (row) => ({
                id: row.id,
                state: row.state,
                dofollow: row.is_dofollow ?? undefined,
                domain_rank: row.domain_rank ?? undefined,
              }),
              listAttributes: (visible) => ({
                page: table.state.page,
                loaded_rows: visible.length,
                total_recorded: backlinks.data?.total ?? 0,
                search: table.state.search || undefined,
              }),
            }}
            window={{
              title: (row) => row.source_domain ?? row.source_url,
            }}
            pageSizeOptions={[25, 50, 100]}
            emptyState={{
              icon: <Link2 className="h-8 w-8 text-muted-foreground" />,
              title: "No detailed backlinks stored",
              description:
                "Run Full bootstrap or Monthly detail to collect backlink rows.",
            }}
            detail={{
              title: (row) => row.source_domain ?? row.source_url,
              description: (row) => `${row.state} link to ${row.target_url}`,
            }}
          />
        </section>
      </main>
    </SurfaceRuntimeProvider>
  );
}
