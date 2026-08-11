"use client";

/**
 * One parameterized MatrxDataTable (controlled mode, URL state, exact server
 * counts) over `useBacklinkDimensionRows` — backs the Referring domains /
 * Anchors / Top pages / Competitors tabs, replacing the old truncated top-8
 * cards. Search and sort push down to `listDimensionRows`; only the sort
 * columns that server query whitelists are declared sortable, and no
 * per-column filter renders because the server honors none for dimensions.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Globe, Link2, Quote, Users } from "lucide-react";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  DateCell,
  dominantKeys,
  headerWithTooltip,
  MutedChip,
  RankCell,
  SpamCell,
  urlPath,
} from "@/features/marketing/components/backlinks/lib/columns";
import { parseDimensionExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  backlinkEmptyHint,
  DOMAIN_RANK_EXPLAINER,
  SPAM_SCORE_EXPLAINER,
} from "@/features/marketing/components/backlinks/lib/vocab";
import {
  formatCount,
  humanDimensionRow,
  projectDimensionRow,
} from "@/features/marketing/components/backlinks/format";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useBacklinkDimensionRows } from "@/features/marketing/data/backlinks-hooks";
import type { BacklinkDimensionKind } from "@/features/marketing/data/backlinks-queries";
import type { BacklinkDimensionRow } from "@/features/marketing/data/backlinks-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

const INTERSECTIONS_EXPLAINER =
  "Websites that link to both you and this competitor. They already know your space, so they are the easiest places to ask for a link.";

const KIND_CONFIG: Record<
  BacklinkDimensionKind,
  {
    surface: string;
    nameHeader: string;
    noun: string;
    searchPlaceholder: string;
    rowKind: string;
    /** Honest empty state; the "what to do" half is the one shared sentence. */
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  referring_domain: {
    surface: "Referring domains",
    nameHeader: "Domain",
    noun: "referring domain",
    searchPlaceholder: "Search domains…",
    rowKind: "web-backlink-referring-domain",
    emptyTitle: "No referring domains yet",
    emptyDescription: backlinkEmptyHint("the websites that link to you"),
  },
  anchor: {
    surface: "Anchors",
    nameHeader: "Anchor text",
    noun: "anchor",
    searchPlaceholder: "Search anchor text…",
    rowKind: "web-backlink-anchor",
    emptyTitle: "No anchor text yet",
    emptyDescription: backlinkEmptyHint(
      "the words other sites use when they link to you",
    ),
  },
  target_page: {
    surface: "Top pages",
    nameHeader: "Page",
    noun: "target page",
    searchPlaceholder: "Search pages…",
    rowKind: "web-backlink-target-page",
    emptyTitle: "No linked pages yet",
    emptyDescription: backlinkEmptyHint("which of your pages earn links"),
  },
  competitor_domain: {
    surface: "Competitors",
    nameHeader: "Competitor",
    noun: "competitor domain",
    searchPlaceholder: "Search competitors…",
    rowKind: "web-backlink-competitor",
    emptyTitle: "No competitors yet",
    emptyDescription: backlinkEmptyHint(
      "the sites that share link sources with you",
    ),
  },
};

const EMPTY_ICON: Record<BacklinkDimensionKind, typeof Globe> = {
  referring_domain: Globe,
  anchor: Quote,
  target_page: Link2,
  competitor_domain: Users,
};

/** Links tab, searched by this dimension's domain — the rows it stands for. */
function domainLinksHref(sitePath: string, label: string): string {
  return `${sitePath}/backlinks?tab=links&q=${encodeURIComponent(label)}`;
}

/** Broken links FROM this domain: the broken lens, narrowed to that domain. */
function domainBrokenHref(sitePath: string, label: string): string {
  return `${sitePath}/backlinks?tab=insights&insight=broken&q=${encodeURIComponent(label)}`;
}

/** Our own page, opened in AI Matrx (dimension rows carry no `page_id`). */
function ourPageHref(sitePath: string, url: string): string {
  return `${sitePath}/pages?q=${encodeURIComponent(url)}`;
}

function nameCell(
  kind: BacklinkDimensionKind,
  row: BacklinkDimensionRow,
  sitePath: string,
) {
  const label = row.label ?? row.dimension_key;
  const extras = parseDimensionExtras(row.extras);

  if (kind === "anchor") {
    return label ? (
      <span
        className="block max-w-72 truncate text-xs text-foreground"
        title={label}
      >
        &ldquo;{label}&rdquo;
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">(empty)</span>
    );
  }

  if (kind === "target_page") {
    const fullUrl = row.url ?? row.dimension_key;
    return (
      <span className="block min-w-44 max-w-80">
        <span className="flex items-center gap-1">
          {/* Our own page opens in OUR system first; the live URL stays as a
              separate new-tab affordance. */}
          <Link
            href={ourPageHref(sitePath, fullUrl)}
            title={`Open ${fullUrl} in AI Matrx`}
            onClick={(event) => event.stopPropagation()}
            className="truncate font-mono text-[11px] text-primary hover:underline"
          >
            {urlPath(fullUrl)}
          </Link>
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${row.url} live`}
              aria-label={`Open ${fullUrl} live in a new tab`}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
            </a>
          ) : null}
        </span>
        {extras.metaTitle ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            {extras.metaTitle}
          </span>
        ) : null}
      </span>
    );
  }

  // referring_domain / competitor_domain — the name IS a domain.
  const href = row.url ?? `https://${label}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      onClick={(event) => event.stopPropagation()}
      className="flex min-w-40 max-w-72 items-center gap-1 truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 break-words text-xs text-foreground">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

function histogramLine(
  histogram: Record<string, number> | null,
  max = 6,
): string | null {
  if (!histogram) return null;
  return Object.entries(histogram)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([key, count]) => `${key || "(none)"} ${formatCount(count)}`)
    .join(" · ");
}

/**
 * The drawer body for one dimension row. Previously this drawer opened with a
 * title and an empty panel — every fact below was already parsed and stored.
 */
function DimensionDetail({
  kind,
  row,
  sitePath,
}: {
  kind: BacklinkDimensionKind;
  row: BacklinkDimensionRow;
  sitePath: string;
}) {
  const label = row.label ?? row.dimension_key;
  const extras = parseDimensionExtras(row.extras);
  const isDomain = kind === "referring_domain" || kind === "competitor_domain";
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {kind === "target_page" ? (
          <Link
            href={ourPageHref(sitePath, row.url ?? row.dimension_key)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open this page in AI Matrx
          </Link>
        ) : null}
        {isDomain ? (
          <Link
            href={domainLinksHref(sitePath, label)}
            className="text-xs font-medium text-primary hover:underline"
          >
            View this domain&apos;s links
          </Link>
        ) : null}
        {row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open live URL <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Fact label={KIND_CONFIG[kind].nameHeader} value={label} />
        <Fact label="Backlinks" value={formatCount(row.backlinks)} />
        <Fact
          label="Referring domains"
          value={formatCount(row.referring_domains)}
        />
        <Fact label="Referring pages" value={formatCount(extras.referringPages)} />
        <Fact
          label="Pages linking without credit"
          value={formatCount(extras.referringPagesNofollow)}
        />
        <Fact
          label="Broken links"
          value={
            extras.brokenBacklinks && extras.brokenBacklinks > 0 && isDomain ? (
              <Link
                href={domainBrokenHref(sitePath, label)}
                className="font-medium text-destructive hover:underline"
              >
                {formatCount(extras.brokenBacklinks)}
              </Link>
            ) : (
              formatCount(extras.brokenBacklinks)
            )
          }
        />
        <Fact label="Site authority" value={row.rank_score} />
        <Fact label="Spam signals" value={row.spam_score} />
        <Fact label="Shared link sources" value={extras.intersections} />
        <Fact label="Page response when checked" value={extras.statusCode} />
        <Fact label="Page title" value={extras.metaTitle} />
        <Fact label="Where this came from" value={row.provider} />
        <Fact label="First seen" value={formatGscDate(row.first_seen_at)} />
        <Fact label="Last seen" value={formatGscDate(row.last_seen_at)} />
      </div>
      <div className="mt-2 grid gap-2">
        <Fact
          label="Kinds of site"
          value={histogramLine(extras.platformTypes)}
        />
        <Fact label="Countries" value={histogramLine(extras.countries)} />
        <Fact label="Domain endings" value={histogramLine(extras.tlds)} />
        <Fact label="Kinds of link" value={histogramLine(extras.linkTypes)} />
        <Fact
          label="Extra link labels"
          value={histogramLine(extras.linkAttributes)}
        />
        <Fact
          label="Where on the page"
          value={histogramLine(extras.semanticLocations)}
        />
      </div>
    </div>
  );
}

export function BacklinkDimensionTable({
  siteId,
  kind,
}: {
  siteId: string;
  kind: BacklinkDimensionKind;
}) {
  const config = KIND_CONFIG[kind];
  const { sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "backlinks", direction: "desc" },
    defaultPageSize: 50,
  });
  const dimension = useBacklinkDimensionRows(siteId, kind, table.queryState);
  const rows = dimension.data?.rows ?? [];
  const total = dimension.data?.total ?? 0;
  const EmptyIcon = EMPTY_ICON[kind];

  const columns: MatrxColumnDef<BacklinkDimensionRow>[] = [
    {
      id: "label",
      accessorFn: (row) => row.label ?? row.dimension_key,
      header: config.nameHeader,
      filter: false,
      cellKind: "text",
      cell: (row) => nameCell(kind, row, sitePath),
    },
    {
      id: "backlinks",
      accessorKey: "backlinks",
      header: "Backlinks",
      filter: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums text-foreground">
          {formatCount(row.backlinks)}
        </span>
      ),
    },
    ...(kind === "anchor" || kind === "competitor_domain"
      ? [
          {
            id: "referring_domains",
            accessorKey: "referring_domains",
            header: "Referring domains",
            filter: false,
            align: "right",
            cell: (row) => (
              <span className="text-xs tabular-nums text-foreground">
                {formatCount(row.referring_domains)}
              </span>
            ),
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
        ]
      : []),
    ...(kind === "referring_domain"
      ? [
          {
            id: "referring_pages",
            header: "Referring pages",
            sortable: false,
            filter: false,
            align: "right",
            accessorFn: (row) =>
              parseDimensionExtras(row.extras).referringPages ?? 0,
            cell: (row) => (
              <span className="text-xs tabular-nums text-foreground">
                {formatCount(parseDimensionExtras(row.extras).referringPages)}
              </span>
            ),
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
          {
            id: "platform",
            header: "Platform",
            sortable: false,
            filter: false,
            accessorFn: (row) =>
              dominantKeys(
                parseDimensionExtras(row.extras).platformTypes,
                2,
              ).join(", "),
            cell: (row) => {
              const extras = parseDimensionExtras(row.extras);
              const platforms = dominantKeys(extras.platformTypes, 2);
              const countries = dominantKeys(extras.countries, 1).filter(
                (country) => country !== "",
              );
              if (!platforms.length && !countries.length) {
                return <span className="text-xs text-muted-foreground">—</span>;
              }
              return (
                <span className="flex flex-wrap items-center gap-1">
                  {platforms.map((platform) => (
                    <MutedChip key={platform}>{platform}</MutedChip>
                  ))}
                  {countries.map((country) => (
                    <MutedChip key={country}>
                      {country.toUpperCase()}
                    </MutedChip>
                  ))}
                </span>
              );
            },
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
          {
            id: "broken",
            header: "Broken links",
            sortable: false,
            filter: false,
            align: "right",
            accessorFn: (row) =>
              parseDimensionExtras(row.extras).brokenBacklinks ?? 0,
            cell: (row) => {
              const broken = parseDimensionExtras(row.extras).brokenBacklinks;
              const label = row.label ?? row.dimension_key;
              return broken && broken > 0 ? (
                // A count is a door: the broken lens narrowed to this domain.
                <Link
                  href={domainBrokenHref(sitePath, label)}
                  onClick={(event) => event.stopPropagation()}
                  className="text-xs font-medium tabular-nums text-destructive hover:underline"
                  title={`Open the ${formatCount(broken)} broken backlinks from ${label}`}
                >
                  {formatCount(broken)}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              );
            },
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
        ]
      : []),
    ...(kind === "competitor_domain"
      ? [
          {
            id: "intersections",
            header: headerWithTooltip(
              "Shared link sources",
              INTERSECTIONS_EXPLAINER,
            ),
            sortable: false,
            filter: false,
            align: "right",
            accessorFn: (row) =>
              parseDimensionExtras(row.extras).intersections ?? 0,
            cell: (row) => (
              <span className="text-xs tabular-nums text-foreground">
                {formatCount(parseDimensionExtras(row.extras).intersections)}
              </span>
            ),
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
        ]
      : []),
    ...(kind === "target_page"
      ? [
          {
            id: "status",
            header: "Status",
            sortable: false,
            filter: false,
            accessorFn: (row) =>
              parseDimensionExtras(row.extras).statusCode ?? "",
            cell: (row) => {
              const status = parseDimensionExtras(row.extras).statusCode;
              if (status === null) {
                return <span className="text-xs text-muted-foreground">—</span>;
              }
              return (
                <span
                  className={
                    status === 200
                      ? "inline-flex items-center rounded border border-border bg-muted px-1 py-px text-[10px] leading-4 text-muted-foreground"
                      : "inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1 py-px text-[10px] font-medium leading-4 text-destructive"
                  }
                >
                  {status}
                </span>
              );
            },
          } satisfies MatrxColumnDef<BacklinkDimensionRow>,
        ]
      : []),
    {
      id: "rank_score",
      accessorKey: "rank_score",
      header: headerWithTooltip("Site authority", DOMAIN_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.rank_score} />,
    },
    {
      id: "spam_score",
      accessorKey: "spam_score",
      header: headerWithTooltip("Spam signals", SPAM_SCORE_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <SpamCell score={row.spam_score} />,
    },
    {
      id: "first_seen_at",
      accessorKey: "first_seen_at",
      header: "First seen",
      filter: false,
      cell: (row) => <DateCell iso={row.first_seen_at} />,
    },
    {
      id: "last_seen_at",
      accessorKey: "last_seen_at",
      header: "Last seen",
      filter: false,
      cell: (row) => <DateCell iso={row.last_seen_at} />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {dimension.isError ? (
        <InlineQueryError
          what={`${config.noun}s`}
          error={dimension.error}
          onRetry={() => void dimension.refetch()}
        />
      ) : (
        <MatrxDataTable<BacklinkDimensionRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={dimension.isLoading}
          isFetching={dimension.isFetching}
          query={{
            mode: "controlled",
            totalItems: total,
            state: table.state,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: config.searchPlaceholder }}
          copy={{
            label: config.surface,
            listLabel: `${config.surface} table`,
            location: webLocation(`Backlinks — ${config.surface}`),
            rowKind: config.rowKind,
            listKind: `${config.rowKind}-table`,
            rowDescription: `One ${config.noun}, totalled up as of our last check.`,
            listDescription: `The ${config.noun} rows currently on screen (respecting the search, sort, and page you are on).`,
            humanRow: humanDimensionRow,
            agentRow: projectDimensionRow,
            rowAttributes: (row) => ({
              site_id: siteId,
              kind,
              label: row.label ?? row.dimension_key,
              backlinks: row.backlinks ?? undefined,
              rank_score: row.rank_score ?? undefined,
            }),
            listAttributes: (visible) => ({
              site_id: siteId,
              kind,
              page: table.state.page,
              visible_rows: visible.length,
              total_rows: total,
              search: table.state.search || undefined,
            }),
          }}
          detail={{
            title: (row) => row.label ?? row.dimension_key,
            description: (row) =>
              `${formatCount(row.backlinks)} backlinks as of our last check`,
            render: (row) => (
              <DimensionDetail kind={kind} row={row} sitePath={sitePath} />
            ),
          }}
          window={{ enabled: false }}
          pageSize={50}
          pageSizeOptions={[25, 50, 100, 250]}
          emptyState={{
            icon: <EmptyIcon className="h-8 w-8 text-muted-foreground" />,
            title: config.emptyTitle,
            description:
              dimension.isSuccess && table.queryState.search
                ? `No ${config.noun}s match "${table.queryState.search}".`
                : config.emptyDescription,
          }}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
