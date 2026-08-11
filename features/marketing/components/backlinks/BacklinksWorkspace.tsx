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
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCw,
  Save,
  Settings2,
} from "lucide-react";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  applyGroomerPreset,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
  type GroomerPreset,
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
import { AuthorityRouterDoor } from "@/features/marketing/authority/AuthorityRouterDoor";
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
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBacklinksScope } from "@/features/surfaces/manifests/marketing-backlinks.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useBacklinkTrend,
  useBacklinkWorkspace,
  useLatestBacklinks,
} from "@/features/marketing/data/backlinks-hooks";
import { clearTableUrlParams } from "@/features/marketing/data/query-state";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { BacklinkKpiBand } from "@/features/marketing/components/backlinks/BacklinkKpiBand";
import { BacklinkTrendChart } from "@/features/marketing/components/backlinks/BacklinkTrendChart";
import { BacklinkObservationTable } from "@/features/marketing/components/backlinks/BacklinkObservationTable";
import { BacklinkDimensionTable } from "@/features/marketing/components/backlinks/BacklinkDimensionTable";
import { BacklinkInsightsTab } from "@/features/marketing/components/backlinks/BacklinkInsightsTab";
import { BacklinkEnrichmentRunPanel } from "@/features/marketing/components/backlinks/BacklinkEnrichmentRunPanel";
import { ReferringDomainIntelligenceTable } from "@/features/marketing/components/backlinks/ReferringDomainIntelligenceTable";
import {
  BACKLINK_REFRESH_PROFILES,
  BACKLINK_TABS,
  backlinkEmptyHint,
  backlinkRefreshProfileLabel,
  DOMAIN_RANK_EXPLAINER,
  isBacklinkTabKey,
  spamTone,
  type BacklinkTabKey,
} from "@/features/marketing/components/backlinks/lib/vocab";
import { parseDimensionExtras } from "@/features/marketing/components/backlinks/lib/extras";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
} from "@/features/marketing/data/backlinks-types";
import {
  buildSiteIntegrations,
  parseSiteIntegrations,
  validateSiteIntegrations,
  type DataForSeoCadence,
} from "@/features/marketing/data/integrations-schema";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
import { refreshSiteBacklinks } from "@/features/marketing/seo/dataforseo/client";
import type {
  BacklinkRefreshProfile,
  BacklinkRefreshReceipt,
} from "@/features/marketing/seo/dataforseo/types";
import {
  backlinkAnalysisErrorMessage,
  useBacklinkAnalysis,
} from "@/features/marketing/components/backlinks/useBacklinkAnalysis";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

function compactNumber(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en", { notation: "compact" }).format(value);
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

/**
 * The Referring domains tab holds TWO datasets over the same subject, and the
 * user picks which one explicitly. "Our view" is the first-party
 * `referring_domain_profile` directory (our score, verdict, ruling); "What the
 * data service reported" is the provider's referring-domain aggregate snapshot
 * (referring pages, platform/country mix, broken count, first/last seen).
 * Before this toggle the provider table was unreachable — the `domains` branch
 * returned first — so those columns were collected, stored, and invisible.
 */
const DOMAIN_VIEW_PARAM = "domainView";

const DOMAIN_VIEWS = [
  { key: "ours", label: "Our view" },
  { key: "provider", label: "What the data service reported" },
] as const;

type DomainViewKey = (typeof DOMAIN_VIEWS)[number]["key"];

function isDomainViewKey(value: string | null): value is DomainViewKey {
  return DOMAIN_VIEWS.some((view) => view.key === value);
}

function isDimensionTab(tab: BacklinkTabKey): tab is DimensionTabKey {
  return tab in DIMENSION_KIND_BY_TAB;
}

/** Compact top-10 card for the Overview grid — exactly 10 rows, no scroller. */
function TopTenCard({
  title,
  anchor,
  rows,
  viewAllHref,
  kind,
  location,
  siteDomain,
  showIntersections = false,
  ourPagesPath = null,
}: {
  title: string;
  anchor: string;
  rows: BacklinkDimensionRow[];
  viewAllHref: string;
  /** Stable slug for agent payloads, e.g. "backlink-referring-domain". */
  kind: string;
  location: string;
  siteDomain: string;
  showIntersections?: boolean;
  /**
   * Set for the "Top pages" card only: these rows are OUR pages, so the name
   * opens the page inside AI Matrx (`{sitePath}/pages` searched by URL —
   * dimension snapshot rows carry no `page_id`), with the live URL kept as a
   * separate new-tab affordance.
   */
  ourPagesPath?: string | null;
}) {
  const visible = rows.slice(0, 10);
  return (
    <SectionCard
      title={title}
      anchor={anchor}
      action={{ label: "View all", href: viewAllHref }}
      copy={{
        label: `${title} (top ${visible.length} shown)`,
        human: () => humanDimensionList(title, rows),
        json: () => rows,
        agent: (): AgentPayloadInput => ({
          kind: `${kind}-list`,
          location,
          description: `The stored "${title}" rows for ${siteDomain}.`,
          data: rows,
          summary: humanDimensionList(title, rows),
          attributes: { fetched: rows.length, shown: visible.length },
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
          const ourPageUrl = row.url ?? row.dimension_key;
          const internalHref =
            ourPagesPath && ourPageUrl
              ? `${ourPagesPath}/pages?q=${encodeURIComponent(ourPageUrl)}`
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
                      tone === "toxic" ? "bg-destructive" : "bg-warning",
                    )}
                    title={`Spam score ${row.spam_score}`}
                  />
                ) : null}
                {internalHref ? (
                  <>
                    <Link
                      href={internalHref}
                      className="min-w-0 truncate text-foreground hover:text-primary hover:underline"
                      title={`Open ${label} in AI Matrx`}
                    >
                      {label}
                    </Link>
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${row.url} live`}
                        aria-label={`Open ${label} live in a new tab`}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
                      </a>
                    ) : null}
                  </>
                ) : row.url ? (
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
                    title={DOMAIN_RANK_EXPLAINER}
                  >
                    Authority {row.rank_score}
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
            {backlinkEmptyHint(title.toLowerCase())}
          </p>
        ) : rows.length > visible.length ? (
          <p className="pt-0.5 text-[11px] text-muted-foreground">
            {/* The workspace fetch is capped at 50 rows — the tab holds the
                true total, so never claim a "stored" count here. */}
            Showing the top {visible.length} — open View all for the full list.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function BacklinksWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();
  const workspace = useBacklinkWorkspace(site.id);
  const trend = useBacklinkTrend(site.id);
  const backlinks = useLatestBacklinks(site.id, OVERVIEW_ROWS_STATE);

  const [profile, setProfile] = useState<BacklinkRefreshProfile>("bootstrap");
  const [refreshing, setRefreshing] = useState(false);
  const [enrichmentBatchSize, setEnrichmentBatchSize] = useState(5);
  const {
    seoTarget,
    analysisDisabled,
    analysisRuns,
    batchAnalyzing,
    batchRun,
    dismissBatchRun,
    analyzeBacklink,
    analyzeNext,
    dismissAnalysisRun,
  } = useBacklinkAnalysis({
    siteId: site.id,
    organizationId: site.organization_id,
  });
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
  const domainViewParam = searchParams.get(DOMAIN_VIEW_PARAM);
  const domainView: DomainViewKey = isDomainViewKey(domainViewParam)
    ? domainViewParam
    : "ours";
  const tabHref = (
    next: BacklinkTabKey,
    extra?: Record<string, string>,
  ): string => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    params.delete(DOMAIN_VIEW_PARAM);
    for (const [key, value] of Object.entries(extra ?? {})) {
      params.set(key, value);
    }
    // Every tab's table persists state through the same URL params
    // (useMarketingTableState). Drop them on tab switch so one tab's
    // paging/filters never leak into another's query.
    clearTableUrlParams(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const setTab = (next: BacklinkTabKey) => {
    startNavigation(() => {
      router.replace(tabHref(next), { scroll: false });
    });
  };

  const setDomainView = (next: DomainViewKey) => {
    if (next === domainView) return;
    startNavigation(() => {
      // The two views are different tables with different columns — one's
      // paging/sort/search must never carry into the other's query.
      router.replace(
        tabHref("domains", next === "ours" ? {} : { [DOMAIN_VIEW_PARAM]: next }),
        { scroll: false },
      );
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
          ? `We will now check for new links ${schedule.cadence}.`
          : "Automatic link checks turned off.",
      );
    } catch (error) {
      toast.error(backlinkAnalysisErrorMessage(error));
    } finally {
      setSavingSchedule(false);
    }
  };

  const refresh = async () => {
    if (!seoTarget?.url) {
      toast.error(
        "Refreshing link data is unavailable right now. Please try again shortly.",
      );
      return;
    }
    setRefreshing(true);
    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      const token = session.data.session?.access_token;
      if (!token) {
        throw new Error("Please sign in again before refreshing link data.");
      }
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
          // Discovery and source-page analysis are separately controlled jobs.
          // The user can inspect the new links, then choose a bounded batch or
          // one exact row instead of paying for a hidden post-refresh drain.
          enrichment_limit: 0,
        },
      );
      setReceipt(nextReceipt);
      setReceiptRun((run) => run + 1);
      // One prefix covers every backlink query — workspace, trend,
      // observations, dimension tables, anchors-full.
      await queryClient.invalidateQueries({
        queryKey: [...marketingKeys.site(site.id), "backlinks"],
      });
      toast.success(
        `Refresh finished — ${backlinkRefreshProfileLabel(profile)}.`,
      );
    } catch (error) {
      toast.error(backlinkAnalysisErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  if (workspace.isLoading) {
    return <LoadingSurface label="Loading your backlinks…" />;
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
  const pageLocation = `Marketing — Backlinks for ${site.domain}`;

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

  /**
   * Every count is a door. The status sets below are the SAME sets
   * `getBacklinkWorkspace` counts, so each link lands on exactly the rows it
   * promises (the Links tab honors `f_enrichment_status` server-side).
   */
  const linksStatusHref = (statuses?: string[]) =>
    `${sitePath}/backlinks?tab=links${
      statuses
        ? `&f_enrichment_status=${encodeURIComponent(`select:${statuses.join("|")}`)}`
        : ""
    }`;
  const enrichmentTiles: Array<{
    label: string;
    value: number;
    href: string;
    tone?: "default" | "good" | "warning" | "bad";
  }> = [
    {
      label: "Links found",
      value: data?.enrichment.total ?? 0,
      href: linksStatusHref(),
    },
    {
      label: "Reviewed",
      value: data?.enrichment.completed ?? 0,
      href: linksStatusHref(["completed"]),
      tone: "good",
    },
    {
      label: "Waiting to be reviewed",
      value: data?.enrichment.awaiting ?? 0,
      href: linksStatusHref(["pending", "capturing", "analyzing"]),
    },
    {
      label: "Needs another try",
      value: data?.enrichment.failed ?? 0,
      href: linksStatusHref(["failed", "dead_letter"]),
      tone: (data?.enrichment.failed ?? 0) > 0 ? "warning" : "default",
    },
    {
      label: "Needs your attention",
      value: data?.enrichment.highPriority ?? 0,
      href: `${sitePath}/backlinks?tab=insights&insight=actionable`,
    },
    {
      label: "You can probably edit",
      value: data?.enrichment.controllable ?? 0,
      href: `${sitePath}/backlinks?tab=insights&insight=controllable`,
    },
  ];

  const pageHuman = () =>
    [
      `Backlinks — ${site.domain}`,
      humanSummarySnapshot(summary, site.domain),
      humanTrend(trend.data ?? []),
      ...dimensionGroups.map((group) =>
        humanDimensionList(group.title, group.rows),
      ),
      `Links stored: ${(backlinks.data?.total ?? 0).toLocaleString()}${
        detailSnapshot
          ? `, as of ${formatGscDate(detailSnapshot.observed_at)}`
          : ""
      }.`,
    ].join("\n\n");

  const groomerSections = (): AgentCopyGroomerSection[] => {
    const trendPoints = trend.data ?? [];
    const tableRows = backlinks.data?.rows ?? [];
    const sections: AgentCopyGroomerSection[] = [
      {
        id: "summary",
        title: "Headline numbers",
        description: "Totals and site authority as of our last check.",
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
                    collected_at: summary.observed_at,
                  }
                : {
                    total_backlinks: summary.total_backlinks,
                    referring_domains: summary.referring_domains,
                    collected_at: summary.observed_at,
                  },
        levelLabels: {
          full: "Everything we stored",
          compact: "Headline numbers",
          brief: "Just the totals",
        },
      },
      {
        id: "refresh_schedule",
        title: "How often we check",
        description:
          "Your automatic schedule, and the depth currently selected.",
        cuttable: true,
        build: () => ({
          automatic_refresh: schedule,
          manual_profile: profile,
          seo_environment: seoTarget?.environment ?? null,
        }),
      },
      {
        id: "trend",
        title: "Links gained and lost over time",
        description: `${trendPoints.length} periods of history.`,
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
      ...dimensionGroups.map((group): AgentCopyGroomerSection => ({
        id: group.id,
        title: group.title,
        description: `${group.rows.length} rows.`,
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
      })),
      {
        id: "backlink_rows",
        title: "The links themselves",
        description: `${tableRows.length} loaded of ${(backlinks.data?.total ?? 0).toLocaleString()} stored (strongest sites first).`,
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
        title: "Last refresh details",
        description: "Exactly what the last refresh you ran collected.",
        cuttable: true,
        defaultSelection: "off",
        build: (level) =>
          level === "full"
            ? receipt
            : { note: "Trimmed — switch to Full for everything." },
      });
    }
    return sections;
  };

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Backlinks — ${site.domain}`,
    kind: "marketing-backlinks-page",
    location: pageLocation,
    description: `Everything on the backlinks page for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    context: { seo_environment: seoTarget?.environment ?? undefined },
    summary: humanSummarySnapshot(summary, site.domain),
    sections: groomerSections(),
  });

  // ONE section list feeds everything: the Groomer window, the quick
  // "Everything" payload, and the graded preset variants below.
  const pagePresetData = (
    preset: GroomerPreset,
  ): { data: Record<string, unknown>; dropped: string[] } => {
    const sections = groomerSections();
    const selections = applyGroomerPreset(preset, sections);
    const data: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const section of sections) {
      const selection = selections[section.id] ?? "full";
      if (selection === "off") {
        dropped.push(section.id);
        continue;
      }
      const value = section.build(selection);
      if (value !== null && value !== undefined) data[section.id] = value;
    }
    return { data, dropped };
  };

  const pageFullData = (): Record<string, unknown> =>
    pagePresetData("everything").data;

  const pagePresetPayload = (preset: GroomerPreset): AgentPayloadInput => {
    const { data, dropped } = pagePresetData(preset);
    return {
      kind: "marketing-backlinks-page",
      location: pageLocation,
      description: `The backlinks page for ${site.domain} (${preset} detail).`,
      data,
      summary: humanSummarySnapshot(summary, site.domain),
      // Same envelope context as the Groomer window — a preset must never
      // silently carry less ambient context than the custom path.
      context: { seo_environment: seoTarget?.environment ?? undefined },
      attributes: {
        site_id: site.id,
        domain: site.domain,
        detail: preset,
        dropped_sections: dropped.length ? dropped.join(",") : undefined,
      },
    };
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-backlinks-page",
    location: pageLocation,
    description: `Everything on the backlinks page for ${site.domain}.`,
    data: pageFullData(),
    summary: humanSummarySnapshot(summary, site.domain),
    context: { seo_environment: seoTarget?.environment ?? undefined },
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
                collected_at: summary.observed_at,
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
                  collected_at: summary.observed_at,
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
          backlink_enrichment_summary: data?.enrichment,
          referring_domain_opinions: data?.domainProfiles.map((row) => ({
            domain: row.display_domain,
            domain_type: row.domain_type,
            backlinks: row.current_backlinks,
            our_score: row.opinion_score,
            our_verdict: row.opinion_verdict,
            our_summary: row.opinion_summary,
            provider_metrics: row.provider_metrics,
            human_ruling: row.human_ruling,
          })),
          backlinks_collected_at: detailSnapshot?.observed_at ?? undefined,
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
            <AuthorityRouterDoor sitePath={sitePath} compact />
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`${sitePath}/reputation`}>
                <Newspaper className="h-3.5 w-3.5" />
                Reputation
              </Link>
            </Button>
            <CopyButtons
              size="icon"
              label={`Backlinks page (${site.domain})`}
              human={pageHuman}
              json={pageFullData}
              agent={pageAgentPayload}
              aiVariants={[
                {
                  id: "balanced",
                  label: "Balanced",
                  hint: "Compact sections — top slices, trimmed receipts",
                  build: () => pagePresetPayload("balanced"),
                },
                {
                  id: "minimal",
                  label: "Minimal",
                  hint: "Counts + briefs only; cuttable sections dropped",
                  build: () => pagePresetPayload("minimal"),
                },
              ]}
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
                aria-label="How deep the next refresh should look"
                className="w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACKLINK_REFRESH_PROFILES.map((entry) => (
                  <SelectItem
                    key={entry.key}
                    value={entry.key}
                    title={entry.description}
                  >
                    {entry.label}
                  </SelectItem>
                ))}
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
            <Select
              value={String(enrichmentBatchSize)}
              onValueChange={(value) => setEnrichmentBatchSize(Number(value))}
              disabled={batchAnalyzing || refreshing}
            >
              <SelectTrigger
                size="sm"
                className="w-20"
                aria-label="How many pages to review at a time"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 5, 10, 25].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} page{size === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={batchAnalyzing || refreshing}
              onClick={() => void analyzeNext(enrichmentBatchSize)}
            >
              {batchAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BrainCircuit className="h-3.5 w-3.5" />
              )}
              Review next {enrichmentBatchSize}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Automatic link checks"
              aria-pressed={settingsOpen}
              title="Check for new links automatically"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings2
                className={cn("h-3.5 w-3.5", settingsOpen && "text-primary")}
              />
            </Button>
          </div>
        </div>

        {/* "Review next N" runs on every tab — its aggregate progress belongs
            under the toolbar, not only inside an opened record. */}
        {batchRun ? (
          <BacklinkEnrichmentRunPanel
            run={batchRun}
            onDismiss={dismissBatchRun}
          />
        ) : null}

        {settingsOpen ? (
          <div className="shrink-0 px-3 pt-2 sm:px-4">
            <SectionCard
              title="Check for new links automatically"
              anchor="refresh_schedule"
            >
              <div className="flex flex-wrap items-end gap-3 p-3">
                <div className="mr-auto min-w-64">
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label="Check this site for new links automatically"
                      checked={schedule.enabled}
                      onCheckedChange={(enabled) =>
                        setSchedule((current) => ({ ...current, enabled }))
                      }
                    />
                    {/* The `data-surface-value` anchor stays so agents can
                        still Locate this control; the environment name is an
                        internal detail and never reads on screen. */}
                    <p
                      className="text-xs text-muted-foreground"
                      data-surface-value="seo_environment"
                    >
                      Turn this on and we check this site for new links on the
                      schedule you pick. Refresh at the top runs one right now,
                      whenever you want.
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-foreground">How often</Label>
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
                    title="How many individual links to pull in each time (1–1000)."
                  >
                    Links per check
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
                  Save
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
                sitePath={sitePath}
                location={pageLocation}
              />
              <SectionCard
                title="How far we have got reading the pages that link to you"
                anchor="backlink_enrichment"
              >
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
                  {enrichmentTiles.map((tile) => (
                    <MetricCell
                      key={tile.label}
                      variant="card"
                      label={tile.label}
                      value={tile.value}
                      tone={tile.tone ?? "default"}
                      href={tile.href}
                    />
                  ))}
                </div>
              </SectionCard>
              <SectionCard
                title="Link growth — new vs lost, with running totals"
                anchor="backlink_trend"
              >
                {trend.isLoading ? (
                  <LoadingSurface label="Loading link history…" />
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
                  what="your stored links (copies and exports may be incomplete)"
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
                    // These cards render PROVIDER dimension rows, so "View all"
                    // must open the provider view of the Domains tab — not our
                    // first-party directory, which is a different dataset with
                    // different counts.
                    viewAllHref={tabHref(
                      group.tab,
                      group.tab === "domains"
                        ? { [DOMAIN_VIEW_PARAM]: "provider" }
                        : undefined,
                    )}
                    kind={group.kind}
                    location={pageLocation}
                    siteDomain={site.domain}
                    showIntersections={group.id === "competitors"}
                    ourPagesPath={
                      group.id === "target_pages" ? sitePath : null
                    }
                  />
                ))}
              </div>
              {receipt ? (
                <SectionCard
                  key={`receipt-${receiptRun}`}
                  title="What the last refresh collected"
                  anchor="refresh_receipt"
                  collapsible
                  defaultOpen={receiptRun > 0}
                >
                  <div className="h-80 overflow-hidden">
                    <JsonInspector
                      data={receipt}
                      label="Last refresh details"
                      defaultView="json"
                      defaultExpandDepth={3}
                      className="rounded-none"
                      agentCopy={() => ({
                        kind: "backlink-refresh-receipt",
                        location: pageLocation,
                        description: `Exactly what the last refresh collected for ${site.domain}.`,
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
              <BacklinkObservationTable
                siteId={site.id}
                onAnalyze={(row) => void analyzeBacklink(row)}
                analysisRuns={analysisRuns}
                onDismissAnalysisRun={dismissAnalysisRun}
                analysisDisabled={analysisDisabled}
              />
            </div>
          ) : tab === "insights" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <BacklinkInsightsTab
                siteId={site.id}
                onAnalyze={(row) => void analyzeBacklink(row)}
                analysisRuns={analysisRuns}
                onDismissAnalysisRun={dismissAnalysisRun}
                analysisDisabled={analysisDisabled}
              />
            </div>
          ) : tab === "domains" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex w-max items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
                {DOMAIN_VIEWS.map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    disabled={isNavigating}
                    aria-pressed={domainView === view.key}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs transition-colors",
                      domainView === view.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() => setDomainView(view.key)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                {domainView === "provider" ? (
                  <BacklinkDimensionTable
                    siteId={site.id}
                    kind={DIMENSION_KIND_BY_TAB.domains}
                  />
                ) : (
                  <ReferringDomainIntelligenceTable siteId={site.id} />
                )}
              </div>
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
