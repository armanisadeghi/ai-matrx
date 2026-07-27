"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Globe, Link2Off, Network, Table2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import { createMarketingLinksScope } from "@/features/surfaces/manifests/marketing-links.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  tableFilterValues,
  tableViewState,
} from "@/features/marketing/lib/scopes/table-view-values";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useCrawlLinks,
  useLinkGraphEdges,
  useSiteLinks,
} from "@/features/marketing/data/inspection-hooks";
import type {
  InspectionLinkRow,
  LinkGraphEdgeResult,
  LinkGraphEdgeRow,
} from "@/features/marketing/data/inspection-types";
import { useCrawl } from "@/features/marketing/data/hooks";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { ExternalLinksView } from "@/features/marketing/components/inspection/link-graph/ExternalLinksView";
import { LinkGraphView } from "@/features/marketing/components/inspection/link-graph/LinkGraphView";
import { displayUrl } from "@/features/marketing/components/inspection/link-graph/model";
import { cn } from "@/lib/utils";

function humanLinkEdgeRow(row: InspectionLinkRow): string {
  return humanLines([
    ["Source", sourceUrl(row)],
    ["Target", row.target_url],
    ["Scope", row.is_internal ? "internal" : "external"],
    ["HTTP", row.http_status],
    ["Anchor", row.anchor_text],
    ["Rel", row.rel],
    ["Position", row.position],
    ["Recorded", formatCompactDate(row.snapshot?.captured_at ?? row.created_at)],
  ]);
}

/** One raw edge row → the shape the `link_rows` surface value declares. */
function projectLinkRow(row: InspectionLinkRow): Record<string, unknown> {
  return {
    id: row.id,
    source_url: sourceUrl(row),
    target_url: row.target_url,
    is_internal: row.is_internal,
    http_status: row.http_status,
    anchor_text: row.anchor_text,
    rel: row.rel,
    position: row.position,
    snapshot_id: row.snapshot_id,
    recorded_at: row.snapshot?.captured_at ?? row.created_at,
  };
}

function sourceUrl(row: InspectionLinkRow): string {
  return row.source_page?.url ?? row.source_page_id;
}

type LinksViewMode = "graph" | "external" | "table";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

interface LinkTotals extends Record<string, unknown> {
  edges: number;
  edges_loaded: number;
  truncated: boolean;
  internal_pages: number;
  external_domains: number;
  nofollow_links: number;
  broken_links: number;
}

/** Run-time aggregate over already-cached link-graph edges. Pure, no fetch. */
function buildLinkTotals(result: LinkGraphEdgeResult): LinkTotals {
  const internalPages = new Set<string>();
  const externalDomains = new Set<string>();
  let nofollowLinks = 0;
  let brokenLinks = 0;
  for (const edge of result.rows) {
    internalPages.add(edge.source_page_id);
    if (edge.is_internal && edge.target_page_id) {
      internalPages.add(edge.target_page_id);
    }
    if (!edge.is_internal) {
      const domain = hostnameOf(edge.target_url);
      if (domain) externalDomains.add(domain);
    }
    if (edge.rel?.includes("nofollow")) nofollowLinks += 1;
    if (edge.http_status !== null && edge.http_status >= 400) brokenLinks += 1;
  }
  return {
    edges: result.total,
    edges_loaded: result.rows.length,
    truncated: result.truncated,
    internal_pages: internalPages.size,
    external_domains: externalDomains.size,
    nofollow_links: nofollowLinks,
    broken_links: brokenLinks,
  };
}

/** Top outbound destination domains from cached edges (External rollup). */
function buildExternalDomainsTop(
  rows: LinkGraphEdgeRow[],
): Array<Record<string, unknown>> {
  const byDomain = new Map<
    string,
    { links: number; nofollow: number; pages: Set<string> }
  >();
  for (const edge of rows) {
    if (edge.is_internal) continue;
    const domain = hostnameOf(edge.target_url);
    if (!domain) continue;
    const entry = byDomain.get(domain) ?? {
      links: 0,
      nofollow: 0,
      pages: new Set<string>(),
    };
    entry.links += 1;
    if (edge.rel?.includes("nofollow")) entry.nofollow += 1;
    entry.pages.add(edge.source_page_id);
    byDomain.set(domain, entry);
  }
  return [...byDomain.entries()]
    .sort((a, b) => b[1].links - a[1].links)
    .slice(0, 15)
    .map(([domain, entry]) => ({
      domain,
      links: entry.links,
      linking_pages: entry.pages.size,
      nofollow_share: entry.links > 0 ? entry.nofollow / entry.links : 0,
    }));
}

export function LinksInspectionTable({ crawlId }: { crawlId?: string }) {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // enabled=false — a pure cache subscription to whatever the Graph/External
  // views already fetched. Zero added requests; getScope reads it at Run time.
  const graphEdges = useLinkGraphEdges(site.id, null, false);
  // Graph is the default view — the URL only records the exception.
  const viewParam = searchParams.get("view");
  const view: LinksViewMode =
    viewParam === "table" || viewParam === "external" ? viewParam : "graph";
  const setView = (next: LinksViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    next === "graph" ? params.delete("view") : params.set("view", next);
    const encoded = params.toString();
    router.replace(encoded ? `${pathname}?${encoded}` : pathname, {
      scroll: false,
    });
  };
  const table = useMarketingTableState({
    defaultSort: { id: "created_at", direction: "desc" },
    defaultPageSize: 50,
  });
  const siteLinks = useSiteLinks(
    site.id,
    table.queryState,
    !crawlId && view === "table",
  );
  const crawlLinks = useCrawlLinks(
    site.id,
    crawlId ?? "",
    table.queryState,
    Boolean(crawlId) && view === "table",
  );
  const crawl = useCrawl(site.id, crawlId ?? "");
  const links = crawlId ? crawlLinks : siteLinks;
  const columns: MatrxColumnDef<InspectionLinkRow>[] = [
    {
      id: "source_page",
      header: "Source page",
      sortable: false,
      filter: false,
      cellKind: "text",
      cell: (row) => (
        <Link
          href={`${sitePath}/pages/${row.source_page_id}`}
          className="block min-w-48 max-w-xl truncate font-mono text-xs text-primary"
          title={sourceUrl(row)}
        >
          {displayUrl(sourceUrl(row), site.root_url)}
        </Link>
      ),
    },
    {
      id: "target_url",
      accessorKey: "target_url",
      header: "Target URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="flex min-w-48 max-w-xl items-center gap-1.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs"
            title={row.target_url}
          >
            {displayUrl(row.target_url, site.root_url)}
          </span>
          <a
            href={row.target_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${row.target_url}`}
            className="shrink-0 text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ),
    },
    {
      id: "is_internal",
      accessorKey: "is_internal",
      header: "Scope",
      filter: "boolean",
      cell: (row) => (
        <StatusBadge value={row.is_internal ? "internal" : "external"} />
      ),
    },
    {
      id: "http_status",
      accessorKey: "http_status",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.http_status ?? "—"}
        </span>
      ),
    },
    {
      id: "anchor_text",
      accessorKey: "anchor_text",
      header: "Anchor",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-64 truncate text-xs">
          {row.anchor_text || "—"}
        </span>
      ),
    },
    {
      id: "rel",
      accessorKey: "rel",
      header: "Rel",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-40 truncate font-mono text-[11px] text-muted-foreground">
          {row.rel || "—"}
        </span>
      ),
    },
    {
      id: "position",
      accessorKey: "position",
      header: "Pos",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">{row.position ?? "—"}</span>
      ),
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Recorded",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.snapshot?.captured_at ?? row.created_at)}
        </span>
      ),
    },
    {
      id: "snapshot_id",
      accessorKey: "snapshot_id",
      header: "Snapshot",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: {
        href: (id, row) =>
          `${sitePath}/pages/${row.source_page_id}/snapshots/${id}`,
      },
    },
  ];

  if (crawlId && crawl.isLoading)
    return <LoadingSurface label="Loading crawl…" />;
  if (crawlId && (crawl.isError || !crawl.data)) {
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  }

  const pageLocation = webLocation(
    crawlId
      ? `Crawl link edges — session ${crawlId}`
      : `Site link graph — ${site.root_url}`,
  );
  const edgesResult = graphEdges.data;
  const linkTotals = edgesResult ? buildLinkTotals(edgesResult) : undefined;
  const externalDomainsTop = edgesResult
    ? buildExternalDomainsTop(edgesResult.rows)
    : [];
  const tableRows = links.data?.rows ?? [];

  const groomerSections = (): AgentCopyGroomerSection[] => {
    const sections: AgentCopyGroomerSection[] = [
      {
        id: "link_totals",
        title: "Link totals",
        description: "Aggregate counts over the cached link-graph edges.",
        build: () => linkTotals ?? { note: "Graph view has not loaded edges yet." },
      },
      {
        id: "external_domains",
        title: "Top external domains",
        description: `${externalDomainsTop.length} destination domains ranked by outbound link count.`,
        cuttable: true,
        levelLabels: { full: "All 15", compact: "Top 8", brief: "Top 3" },
        build: (level) =>
          level === "full"
            ? externalDomainsTop
            : externalDomainsTop.slice(0, level === "compact" ? 8 : 3),
      },
    ];
    if (view === "table") {
      sections.push({
        id: "table_rows",
        title: "Link edge rows",
        description: `${tableRows.length} loaded of ${(links.data?.total ?? 0).toLocaleString()} recorded (current table page + filters).`,
        cuttable: true,
        levelLabels: {
          full: `Loaded ${tableRows.length} (raw)`,
          compact: "Top 25",
          brief: "Counts only",
        },
        build: (level) =>
          level === "full"
            ? { query: table.state, rows: tableRows }
            : level === "compact"
              ? { query: table.state, rows: tableRows.slice(0, 25) }
              : { total_recorded: links.data?.total ?? 0, loaded_rows: tableRows.length },
      });
    }
    return sections;
  };

  const pageHuman = () =>
    [
      crawlId ? `Crawl link edges — session ${crawlId}` : `Site link graph — ${site.domain}`,
      linkTotals
        ? Object.entries(linkTotals).map(([k, v]) => `${k}: ${v}`).join("\n")
        : "Link graph not loaded yet.",
      externalDomainsTop.length
        ? `Top external domains:\n${externalDomainsTop.map((d) => `- ${d.domain}: ${d.links} links`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-links-page",
    location: pageLocation,
    description: crawlId
      ? `The crawl link-edge inspection view for session ${crawlId}.`
      : `The site link inspection view (graph/external/table) for ${site.domain}.`,
    data: pageFullData(),
    attributes: { site_id: site.id, session_id: crawlId, view_mode: view },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: crawlId ? `Crawl links — ${crawlId}` : `Links — ${site.domain}`,
    kind: "marketing-links-page",
    location: pageLocation,
    description: "The full link inspection workspace (graph, external, table).",
    attributes: { site_id: site.id, domain: site.domain, session_id: crawlId },
    sections: groomerSections(),
  });

  const content = (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      {crawl.data ? <CrawlSubnav crawl={crawl.data} /> : null}
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">
            {crawlId ? "Crawl link edges" : "Site link graph"}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {crawlId
              ? "Links observed in this crawl's immutable snapshots."
              : "Links observed across all retained snapshots for this site."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {view === "table" ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {(links.data?.total ?? 0).toLocaleString()} edges
            </span>
          ) : null}
          <CopyButtons
            size="icon"
            label={crawlId ? `Crawl link edges (${crawlId})` : `Site link graph (${site.domain})`}
            human={pageHuman}
            json={pageFullData}
            agent={pageAgentPayload}
          />
          <AgentCopyGroomerLauncher config={groomerConfig} />
          <div className="flex items-center rounded-md border border-border p-0.5">
            {(
              [
                { id: "graph", label: "Graph", icon: Network },
                { id: "external", label: "External", icon: Globe },
                { id: "table", label: "Table", icon: Table2 },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                onClick={() => setView(option.id)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
                  view === option.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <option.icon className="h-3 w-3" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="min-h-0 flex-1">
        {view === "graph" ? (
          <LinkGraphView
            crawlId={crawlId}
            onShowExternal={() => setView("external")}
          />
        ) : view === "external" ? (
          <ExternalLinksView crawlId={crawlId} />
        ) : links.isError ? (
          <QueryError error={links.error} onRetry={() => void links.refetch()} />
        ) : (
          <MatrxDataTable<InspectionLinkRow>
            data={links.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={links.isLoading}
            isFetching={links.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: links.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search target URL, anchor text, or rel…",
            }}
            copy={{
              label: "Link edge",
              listLabel: "All link edges",
              location: webLocation(
                crawlId
                  ? `Crawl link edges — session ${crawlId}`
                  : `Site link graph — ${site.root_url}`,
              ),
              rowKind: "web-link-edge",
              listKind: "web-link-edges",
              rowDescription:
                "One immutable link edge observed in a retained snapshot.",
              listDescription:
                "The currently loaded link-edge rows (respecting search, filters, sort, and pagination).",
              humanRow: humanLinkEdgeRow,
              rowAttributes: (row) => ({
                link_edge_id: row.id,
                source_page_id: row.source_page_id,
                site_id: site.id,
                session_id: crawlId,
              }),
              listAttributes: () => ({
                site_id: site.id,
                session_id: crawlId,
                total_matching: links.data?.total ?? 0,
              }),
            }}
            detail={{
              title: (row) => row.target_url,
              description: (row) =>
                `${row.is_internal ? "Internal" : "External"} link from ${sourceUrl(row)}`,
            }}
            emptyState={{
              icon: <Link2Off className="h-8 w-8 text-muted-foreground" />,
              title: crawlId
                ? "No links captured in this crawl"
                : "No link edges recorded",
              description:
                "Link edges appear after a snapshot has been captured and its extracted links are persisted.",
            }}
          />
        )}
      </div>
    </main>
  );

  // Crawl-scoped links belong to the `matrx-user/marketing-crawl` surface —
  // register it here (this page IS a crawl route), never marketing-links.
  if (crawlId) {
    return (
      <CrawlSurfaceProvider
        crawlId={crawlId}
        crawl={crawl.data ?? null}
        view="links"
        getViewSummary={() =>
          links.data
            ? { loaded_rows: links.data.rows.length, total_rows: links.data.total }
            : undefined
        }
      >
        {content}
      </CrawlSurfaceProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-links"
      getScope={() => {
        const result = graphEdges.data;
        const totals = result ? buildLinkTotals(result) : undefined;
        const liveRows = view === "table" ? (links.data?.rows ?? []) : [];
        const onTable = view === "table" && Boolean(links.data);
        return createMarketingLinksScope({
          ...getBaseValues(),
          view_mode: view,
          link_totals: totals,
          edge_total: totals?.edges,
          edges_loaded: totals?.edges_loaded,
          graph_truncated: totals?.truncated,
          internal_page_count: totals?.internal_pages,
          broken_link_count: totals?.broken_links,
          nofollow_link_count: totals?.nofollow_links,
          external_domain_count: totals?.external_domains,
          external_domains_top: result
            ? buildExternalDomainsTop(result.rows)
            : undefined,
          link_rows:
            liveRows.length > 0 ? liveRows.map(projectLinkRow) : undefined,
          link_rows_total: onTable ? links.data?.total : undefined,
          link_rows_loaded: onTable ? liveRows.length : undefined,
          active_filters: onTable
            ? tableFilterValues(table.state)
            : undefined,
          links_view_state: onTable ? tableViewState(table.state) : undefined,
        });
      }}
    >
      {content}
    </SurfaceRuntimeProvider>
  );
}
