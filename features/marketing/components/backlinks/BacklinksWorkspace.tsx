"use client";

/**
 * `/marketing/brands/[brandId]/sites/[siteId]/backlinks` — the tabbed
 * backlink intelligence workspace, modeled on the Search Console workspace
 * (SearchConsoleWorkspace): tab pills + toolbar in one slim top row, tab in
 * the URL (`?tab=`), each tab body owning its own scroll region.
 *
 * This file is the inside of the route's single dynamic edge
 * (BacklinksGate) — recharts and every sub-component import statically here
 * (Fragmentation Law).
 */

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Save, Settings2 } from "lucide-react";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
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
  humanDimensionList,
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
  InlineQueryError,
  LoadingSurface,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBacklinksScope } from "@/features/surfaces/manifests/marketing-backlinks.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useBacklinkTrend,
  useBacklinkWorkspace,
  useLatestBacklinks,
} from "@/features/marketing/data/backlinks-hooks";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { BacklinkKpiBand } from "@/features/marketing/components/backlinks/BacklinkKpiBand";
import { BacklinkTrendChart } from "@/features/marketing/components/backlinks/BacklinkTrendChart";
import { BacklinkObservationTable } from "@/features/marketing/components/backlinks/BacklinkObservationTable";
import { BacklinkDimensionTable } from "@/features/marketing/components/backlinks/BacklinkDimensionTable";
import { BacklinkInsightsTab } from "@/features/marketing/components/backlinks/BacklinkInsightsTab";
import {
  BACKLINK_TABS,
  isBacklinkTabKey,
  spamTone,
  type BacklinkTabKey,
} from "@/features/marketing/components/backlinks/lib/vocab";
import { parseDimensionExtras } from "@/features/marketing/components/backlinks/lib/extras";
import type { BacklinkDimensionRow } from "@/features/marketing/data/backlinks-types";
import {
  buildSiteIntegrations,
  parseSiteIntegrations,
  validateSiteIntegrations,
  type DataForSeoCadence,
} from "@/features/marketing/data/integrations-schema";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
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

/**
 * The workspace's own rows feed — a FIXED first page by domain rank that
 * powers the page copy/export payloads and the surface-scope values. The
 * Backlinks tab's table owns its own (URL-backed) state independently; this
 * one never touches the URL, so the two cannot fight over `?page=`.
 */
const OVERVIEW_ROWS_STATE: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 100,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: { id: "domain_rank", direction: "desc" },
};

const DIMENSION_KIND_BY_TAB = {
  domains: "referring_domain",
  anchors: "anchor",
  pages: "target_page",
  competitors: "competitor_domain",
} as const;

type DimensionTabKey = keyof typeof DIMENSION_KIND_BY_TAB;

function isDimensionTab(tab: BacklinkTabKey): tab is DimensionTabKey {
  return tab in DIMENSION_KIND_BY_TAB;
}

/** Compact top-10 card for the Overview grid — exactly 10 rows, no scroller. */
function TopTenCard({
  title,
  anchor,
  rows,
  total,
  viewAllHref,
  kind,
  location,
  siteDomain,
  showIntersections = false,
}: {
  title: string;
  anchor: string;
  rows: BacklinkDimensionRow[];
  total: number;
  viewAllHref: string;
  /** Stable slug for agent payloads, e.g. "backlink-referring-domain". */
  kind: string;
  location: string;
  siteDomain: string;
  showIntersections?: boolean;
}) {
  const visible = rows.slice(0, 10);
  return (
    <SectionCard
      title={title}
      anchor={anchor}
      action={{ label: "View all", href: viewAllHref }}
      copy={{
        label: `${title} (top ${visible.length} of ${total})`,
        human: () => humanDimensionList(title, rows),
        json: () => rows,
        agent: (): AgentPayloadInput => ({
          kind: `${kind}-list`,
          location,
          description: `The stored "${title}" backlink dimension rows for ${siteDomain}.`,
          data: rows,
          summary: humanDimensionList(title, rows),
          attributes: { count: total, shown: visible.length },
        }),
      }}
    >
      <div className="space-y-1 p-2">
        {visible.map((row) => {
          const label = row.label ?? row.dimension_key;
          const tone = spamTone(row.spam_score);
          const extras = showIntersections
            ? parseDimensionExtras(row.extras)
            : null;
          return (
            <div
              key={row.id}
              className="flex min-w-0 items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {tone === "warn" || tone === "toxic" ? (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      tone === "toxic" ? "bg-destructive" : "bg-amber-500",
                    )}
                    title={`Spam score ${row.spam_score}`}
                  />
                ) : null}
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1 truncate text-foreground hover:text-primary hover:underline"
                    title={label}
                  >
                    <span className="truncate">{label}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </a>
                ) : (
                  <span className="truncate text-foreground" title={label}>
                    {label}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {extras?.intersections !== null &&
                extras?.intersections !== undefined ? (
                  <span
                    className="text-muted-foreground"
                    title="Referring domains shared with this site"
                  >
                    {compactNumber(extras.intersections)} shared
                  </span>
                ) : null}
                {row.rank_score !== null ? (
                  <span
                    className="text-[11px] text-muted-foreground"
                    title="DataForSEO rank (0–1000)"
                  >
                    r{row.rank_score}
                  </span>
                ) : null}
                <span className="font-medium text-foreground">
                  {compactNumber(row.backlinks ?? row.referring_domains)}
                </span>
              </span>
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">
            No stored rows yet — run a Weekly core or Full bootstrap refresh to
            collect this rollup.
          </p>
        ) : total > visible.length ? (
          <p className="pt-0.5 text-[11px] text-muted-foreground">
            Showing top {visible.length} of {total.toLocaleString()} stored.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function BacklinksWorkspace() {
  const { site } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const seoTarget = serviceTargets.find((target) => target.service === "seo");

  const workspace = useBacklinkWorkspace(site.id);
  const trend = useBacklinkTrend(site.id);
  const backlinks = useLatestBacklinks(site.id, OVERVIEW_ROWS_STATE);

  const [profile, setProfile] = useState<BacklinkRefreshProfile>("bootstrap");
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<BacklinkRefreshReceipt | null>(null);
  // Remount key for the receipt card so each completed refresh re-opens it.
  const [receiptRun, setReceiptRun] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const savedSchedule = parseSiteIntegrations(site.integrations).dataForSeo;
  const [schedule, setSchedule] = useState(savedSchedule);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleDirty =
    JSON.stringify(schedule) !== JSON.stringify(savedSchedule);
  const detailLimitValid =
    Number.isInteger(schedule.detailLimit) &&
    schedule.detailLimit >= 1 &&
    schedule.detailLimit <= 1000;

  const tabParam = searchParams.get("tab");
  const tab: BacklinkTabKey = isBacklinkTabKey(tabParam)
    ? tabParam
    : "overview";
  const tabHref = (next: BacklinkTabKey): string => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    // Every tab's table persists state through the same URL params
    // (useMarketingTableState: page/q/sort/f_*). Drop them on tab switch so
    // one tab's paging/filters never leak into another's query.
    for (const key of ["page", "pageSize", "q", "anyOf", "sort", "direction"]) {
      params.delete(key);
    }
    for (const key of Array.from(params.keys())) {
      if (key.startsWith("f_")) params.delete(key);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const setTab = (next: BacklinkTabKey) => {
    startNavigation(() => {
      router.replace(tabHref(next), { scroll: false });
    });
  };

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
      setReceiptRun((run) => run + 1);
      // One prefix covers every backlink query — workspace, trend,
      // observations, dimension tables, anchors-full.
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(site.id), "backlinks"],
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
      tab: "domains" as const,
      rows: data?.referringDomains ?? [],
    },
    {
      id: "anchors",
      anchor: "top_anchors",
      title: "Anchor text",
      kind: "backlink-anchor",
      tab: "anchors" as const,
      rows: data?.anchors ?? [],
    },
    {
      id: "target_pages",
      anchor: "top_target_pages",
      title: "Top pages",
      kind: "backlink-target-page",
      tab: "pages" as const,
      rows: data?.targetPages ?? [],
    },
    {
      id: "competitors",
      anchor: "top_competitors",
      title: "Competitors",
      kind: "backlink-competitor",
      tab: "competitors" as const,
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
        description: `${tableRows.length} loaded of ${(backlinks.data?.total ?? 0).toLocaleString()} recorded (top rows by domain rank).`,
        cuttable: true,
        levelLabels: {
          full: `Loaded ${tableRows.length} (raw)`,
          compact: "Top 25 (key fields)",
          brief: "Counts only",
        },
        build: (level) =>
          level === "full"
            ? { query: OVERVIEW_ROWS_STATE, rows: tableRows }
            : level === "compact"
              ? {
                  query: OVERVIEW_ROWS_STATE,
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
            page: OVERVIEW_ROWS_STATE.page,
            search: OVERVIEW_ROWS_STATE.search || null,
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
      <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
        {/* One slim top row: tab pills left, toolbar right. */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-1.5 sm:px-4">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <div className="flex w-max items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
              {BACKLINK_TABS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  title={entry.description}
                  disabled={isNavigating}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs transition-colors",
                    tab === entry.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  onClick={() => setTab(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <CopyButtons
              size="icon"
              label={`Backlinks page (${site.domain})`}
              human={pageHuman}
              json={pageFullData}
              agent={pageAgentPayload}
            />
            <ExportMenu
              label={`backlinks-${site.domain}`}
              items={[
                jsonExportItem(pageFullData, "Page data (.json)"),
                {
                  id: "csv",
                  label: "CSV (top backlink rows)",
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
              Refresh
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Refresh schedule settings"
              aria-pressed={settingsOpen}
              title="Automatic refresh schedule"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings2
                className={cn(
                  "h-3.5 w-3.5",
                  settingsOpen && "text-primary",
                )}
              />
            </Button>
          </div>
        </div>

        {settingsOpen ? (
          <div className="shrink-0 px-3 pt-2 sm:px-4">
            <SectionCard title="Automatic refresh" anchor="refresh_schedule">
              <div className="flex flex-wrap items-end gap-3 p-3">
                <div className="mr-auto min-w-64">
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label="Enable automatic backlink refresh"
                      checked={schedule.enabled}
                      onCheckedChange={(enabled) =>
                        setSchedule((current) => ({ ...current, enabled }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Stored on this site; the aidream scheduler checks due
                      sites daily. Manual refresh follows the shell&apos;s{" "}
                      <span data-surface-value="seo_environment">
                        {seoTarget?.environment ?? "selected"}
                      </span>{" "}
                      SEO server target.
                    </p>
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
                  disabled={
                    !scheduleDirty || savingSchedule || !detailLimitValid
                  }
                  onClick={() => void saveSchedule()}
                >
                  {savingSchedule ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save schedule
                </Button>
              </div>
            </SectionCard>
          </div>
        ) : null}

        {/* key={tab}: table URL state (page/sort/filters) remounts cleanly
            when the user switches tabs. */}
        <div
          key={tab}
          className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2 sm:px-4"
        >
          {tab === "overview" ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
              <BacklinkKpiBand
                summary={summary ?? null}
                siteDomain={site.domain}
                location={pageLocation}
              />
              <SectionCard
                title="Link growth — new vs lost, with running totals"
                anchor="backlink_trend"
              >
                {trend.isLoading ? (
                  <LoadingSurface label="Loading backlink trend…" />
                ) : trend.isError ? (
                  <div className="p-2">
                    <InlineQueryError
                      what="the backlink trend"
                      error={trend.error}
                      onRetry={() => void trend.refetch()}
                    />
                  </div>
                ) : (
                  <BacklinkTrendChart
                    points={trend.data ?? []}
                    siteDomain={site.domain}
                    location={pageLocation}
                  />
                )}
              </SectionCard>
              {backlinks.isError ? (
                <InlineQueryError
                  what="the stored backlink rows (copy/export payloads may be incomplete)"
                  error={backlinks.error}
                  onRetry={() => void backlinks.refetch()}
                />
              ) : null}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {dimensionGroups.map((group) => (
                  <TopTenCard
                    key={group.id}
                    title={group.title}
                    anchor={group.anchor}
                    rows={group.rows}
                    total={group.rows.length}
                    viewAllHref={tabHref(group.tab)}
                    kind={group.kind}
                    location={pageLocation}
                    siteDomain={site.domain}
                    showIntersections={group.id === "competitors"}
                  />
                ))}
              </div>
              {receipt ? (
                <SectionCard
                  key={`receipt-${receiptRun}`}
                  title="Refresh receipt"
                  anchor="refresh_receipt"
                  collapsible
                  defaultOpen={receiptRun > 0}
                >
                  <div className="h-80 overflow-hidden">
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
                  </div>
                </SectionCard>
              ) : null}
            </div>
          ) : tab === "links" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <BacklinkObservationTable siteId={site.id} />
            </div>
          ) : tab === "insights" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <BacklinkInsightsTab siteId={site.id} />
            </div>
          ) : isDimensionTab(tab) ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <BacklinkDimensionTable
                siteId={site.id}
                kind={DIMENSION_KIND_BY_TAB[tab]}
              />
            </div>
          ) : null}
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}
