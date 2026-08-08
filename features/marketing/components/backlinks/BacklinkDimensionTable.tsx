"use client";

/**
 * One parameterized MatrxDataTable (controlled mode, URL state, exact server
 * counts) over `useBacklinkDimensionRows` — backs the Referring domains /
 * Anchors / Top pages / Competitors tabs, replacing the old truncated top-8
 * cards. Search and sort push down to `listDimensionRows`; only the sort
 * columns that server query whitelists are declared sortable, and no
 * per-column filter renders because the server honors none for dimensions.
 */

import { ExternalLink, Globe, Link2, Quote, Users } from "lucide-react";
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
import { DOMAIN_RANK_EXPLAINER } from "@/features/marketing/components/backlinks/lib/vocab";
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

const INTERSECTIONS_EXPLAINER =
  "Referring domains you share with this competitor — a ready-made outreach prospect list.";

const KIND_CONFIG: Record<
  BacklinkDimensionKind,
  {
    surface: string;
    nameHeader: string;
    noun: string;
    searchPlaceholder: string;
    rowKind: string;
    /** Honest empty state naming the refresh profile that collects the data. */
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
    emptyTitle: "No referring domains stored",
    emptyDescription:
      "No referring-domain rows stored yet — run a Monthly detail or Full bootstrap refresh to collect them.",
  },
  anchor: {
    surface: "Anchors",
    nameHeader: "Anchor text",
    noun: "anchor",
    searchPlaceholder: "Search anchor text…",
    rowKind: "web-backlink-anchor",
    emptyTitle: "No anchors stored",
    emptyDescription:
      "No anchor rows stored yet — run a Monthly detail or Full bootstrap refresh to collect the anchor distribution.",
  },
  target_page: {
    surface: "Top pages",
    nameHeader: "Page",
    noun: "target page",
    searchPlaceholder: "Search pages…",
    rowKind: "web-backlink-target-page",
    emptyTitle: "No linked pages stored",
    emptyDescription:
      "No target-page rows stored yet — run a Monthly detail or Full bootstrap refresh to see which pages earn links.",
  },
  competitor_domain: {
    surface: "Competitors",
    nameHeader: "Competitor",
    noun: "competitor domain",
    searchPlaceholder: "Search competitors…",
    rowKind: "web-backlink-competitor",
    emptyTitle: "No competitor overlap stored",
    emptyDescription:
      "No competitor rows stored yet — run a Monthly detail or Full bootstrap refresh to find domains with overlapping link profiles.",
  },
};

const EMPTY_ICON: Record<BacklinkDimensionKind, typeof Globe> = {
  referring_domain: Globe,
  anchor: Quote,
  target_page: Link2,
  competitor_domain: Users,
};

function nameCell(kind: BacklinkDimensionKind, row: BacklinkDimensionRow) {
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
        <a
          href={row.url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title={fullUrl}
          onClick={(event) => event.stopPropagation()}
          className="flex items-center gap-1 truncate font-mono text-[11px] text-primary hover:underline"
        >
          <span className="truncate">{urlPath(fullUrl)}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
        </a>
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

export function BacklinkDimensionTable({
  siteId,
  kind,
}: {
  siteId: string;
  kind: BacklinkDimensionKind;
}) {
  const config = KIND_CONFIG[kind];
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
      cell: (row) => nameCell(kind, row),
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
            header: "Ref domains",
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
            header: "Broken",
            sortable: false,
            filter: false,
            align: "right",
            accessorFn: (row) =>
              parseDimensionExtras(row.extras).brokenBacklinks ?? 0,
            cell: (row) => {
              const broken = parseDimensionExtras(row.extras).brokenBacklinks;
              return broken && broken > 0 ? (
                <span
                  className="text-xs font-medium tabular-nums text-destructive"
                  title={`${formatCount(broken)} broken backlinks from this domain`}
                >
                  {formatCount(broken)}
                </span>
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
            header: headerWithTooltip("Intersections", INTERSECTIONS_EXPLAINER),
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
      header: headerWithTooltip("Rank", DOMAIN_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.rank_score} />,
    },
    {
      id: "spam_score",
      accessorKey: "spam_score",
      header: "Spam",
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
            rowDescription: `One ${config.noun} aggregate from the latest backlink snapshot.`,
            listDescription: `The currently visible ${config.noun} rows (respecting search, sort, and pagination).`,
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
              `${formatCount(row.backlinks)} backlinks in the latest snapshot`,
          }}
          window={{ enabled: false }}
          pageSize={50}
          pageSizeOptions={[25, 50, 100, 250]}
          emptyState={{
            icon: <EmptyIcon className="h-8 w-8 text-muted-foreground" />,
            title: config.emptyTitle,
            description:
              dimension.isSuccess && table.queryState.search
                ? `No ${config.noun}s match "${table.queryState.search}" in the latest snapshot.`
                : config.emptyDescription,
          }}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
