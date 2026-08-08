"use client";

/**
 * The full backlink table — ONE MatrxDataTable (controlled mode) over
 * `useLatestBacklinks`, with URL-owned state via `useMarketingTableState`
 * (GscDimensionTable is the exemplar). Search, sort, pagination, and the
 * placement/type/rel/state filters all push down to the Supabase query in
 * `backlinks-queries.ts`; every sortable/filterable control here maps 1:1 to
 * what that server query honors — nothing renders a control the server
 * silently ignores. An optional `lens` narrows to one Insights slice
 * server-side; the empty state then names the lens honestly.
 */

import { ExternalLink, Image as ImageIcon, Link2, Unlink } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  DateCell,
  headerWithTooltip,
  MutedChip,
  RankCell,
  SpamCell,
  urlPath,
} from "@/features/marketing/components/backlinks/lib/columns";
import { parseObservationExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  BACKLINK_LENSES,
  BACKLINK_STATES,
  DOMAIN_RANK_EXPLAINER,
  LINK_PLACEMENTS,
  LINK_TYPES,
  PAGE_RANK_EXPLAINER,
  type BacklinkLensKey,
} from "@/features/marketing/components/backlinks/lib/vocab";
import {
  humanBacklinkRow,
  projectBacklinkRow,
} from "@/features/marketing/components/backlinks/format";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  InlineQueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useLatestBacklinks } from "@/features/marketing/data/backlinks-hooks";
import { LENS_DEFAULT_SORT } from "@/features/marketing/data/backlinks-queries";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { webLocation } from "@/features/marketing/lib/copy-payloads";

/**
 * One honest empty line per lens — a lens finding nothing is usually GOOD
 * news, and must never read like missing data.
 */
const LENS_EMPTY_LINE: Record<BacklinkLensKey, string> = {
  best: "No strong links found — no active dofollow links are stored in the latest snapshot.",
  new: "No new links found — nothing gained since the previous snapshot.",
  lost: "No lost links found — nothing to reclaim right now.",
  broken: "No broken links found — nothing to fix or 301 right now.",
  toxic:
    "No high spam-score links found — no removal or disavow candidates right now.",
};

export function BacklinkObservationTable({
  siteId,
  lens = null,
}: {
  siteId: string;
  lens?: BacklinkLensKey | null;
}) {
  const lensFallback = lens ? LENS_DEFAULT_SORT[lens] : null;
  const table = useMarketingTableState({
    defaultSort: lensFallback
      ? {
          id: lensFallback.column,
          direction: lensFallback.ascending ? "asc" : "desc",
        }
      : { id: "domain_rank", direction: "desc" },
    defaultPageSize: 50,
  });
  const backlinks = useLatestBacklinks(siteId, table.queryState, lens);
  const rows = backlinks.data?.rows ?? [];
  const total = backlinks.data?.total ?? 0;
  const lensLabel = lens
    ? BACKLINK_LENSES.find((entry) => entry.key === lens)?.label
    : null;

  const columns: MatrxColumnDef<BacklinkObservationRow>[] = [
    {
      id: "source_domain",
      accessorKey: "source_domain",
      header: "Source",
      filter: false,
      cellKind: "text",
      cell: (row) => {
        const extras = parseObservationExtras(row.extras);
        return (
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title={row.source_url}
            onClick={(event) => event.stopPropagation()}
            className="group block min-w-44 max-w-72"
          >
            <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground group-hover:text-primary group-hover:underline">
              <span className="truncate">
                {row.source_domain ?? urlPath(row.source_url)}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
            {extras.pageFromTitle ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {extras.pageFromTitle}
              </span>
            ) : null}
          </a>
        );
      },
    },
    {
      id: "anchor_text",
      accessorKey: "anchor_text",
      header: "Anchor",
      filter: false,
      cellKind: "text",
      cell: (row) => {
        const extras = parseObservationExtras(row.extras);
        if (extras.imageUrl) {
          return (
            <span
              className="flex max-w-52 items-center gap-1 text-xs text-foreground"
              title={extras.imageUrl}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {extras.imageAlt ?? row.anchor_text ?? "image link"}
              </span>
            </span>
          );
        }
        if (!row.anchor_text) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const context =
          extras.textPre || extras.textPost
            ? `…${extras.textPre ?? ""} [${row.anchor_text}] ${extras.textPost ?? ""}…`
            : row.anchor_text;
        return (
          <span
            className="block max-w-52 truncate text-xs text-foreground"
            title={context}
          >
            {row.anchor_text}
          </span>
        );
      },
    },
    {
      id: "target_url",
      accessorKey: "target_url",
      header: "Target",
      filter: false,
      cellKind: "text",
      cell: (row) => (
        <a
          href={row.target_url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.target_url}
          onClick={(event) => event.stopPropagation()}
          className="block min-w-40 max-w-72 truncate font-mono text-[11px] text-primary hover:underline"
        >
          {urlPath(row.target_url)}
        </a>
      ),
    },
    {
      id: "placement",
      header: "Placement",
      sortable: false,
      filter: "select",
      filterOptions: LINK_PLACEMENTS.map((placement) => ({
        value: placement.key,
        label: placement.label,
      })),
      accessorFn: (row) =>
        parseObservationExtras(row.extras).semanticLocation ?? "",
      cell: (row) => {
        const placement = parseObservationExtras(row.extras).semanticLocation;
        const label = placement
          ? (LINK_PLACEMENTS.find((entry) => entry.key === placement)?.label ??
            placement)
          : null;
        return label ? (
          <span className="text-xs text-foreground">{label}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "link_type",
      accessorKey: "link_type",
      header: "Type",
      filter: "select",
      filterOptions: LINK_TYPES.map((type) => ({
        value: type.key,
        label: type.label,
      })),
      cell: (row) => {
        const label = row.link_type
          ? (LINK_TYPES.find((entry) => entry.key === row.link_type)?.label ??
            row.link_type)
          : null;
        return label ? (
          <span className="text-xs text-foreground">{label}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "is_dofollow",
      accessorKey: "is_dofollow",
      header: "Rel",
      filter: "boolean",
      cell: (row) => {
        const extras = parseObservationExtras(row.extras);
        const special = (extras.attributes ?? []).filter(
          (attribute) => attribute === "sponsored" || attribute === "ugc",
        );
        return (
          <span className="flex flex-wrap items-center gap-1">
            {row.is_dofollow ? (
              <span className="inline-flex items-center rounded border border-success/30 bg-success/10 px-1 py-px text-[10px] font-medium leading-4 text-success">
                Dofollow
              </span>
            ) : (
              <MutedChip>Nofollow</MutedChip>
            )}
            {special.map((attribute) => (
              <MutedChip key={attribute}>{attribute}</MutedChip>
            ))}
          </span>
        );
      },
    },
    {
      id: "source_rank",
      accessorKey: "source_rank",
      header: headerWithTooltip("PR", PAGE_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.source_rank} />,
    },
    {
      id: "domain_rank",
      accessorKey: "domain_rank",
      header: headerWithTooltip("DR", DOMAIN_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.domain_rank} />,
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
      id: "state",
      accessorKey: "state",
      header: "State",
      filter: "select",
      filterOptions: BACKLINK_STATES.map((state) => ({
        value: state.key,
        label: state.label,
      })),
      cell: (row) => {
        const extras = parseObservationExtras(row.extras);
        const broken =
          extras.isBroken === true ||
          (extras.urlToStatusCode !== null && extras.urlToStatusCode >= 400);
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <StatusBadge value={row.state} />
            {row.state === "lost" && row.lost_at ? (
              <span className="text-[11px] text-muted-foreground">
                {formatGscDate(row.lost_at)}
              </span>
            ) : null}
            {broken ? (
              <span
                title={
                  extras.urlToStatusCode
                    ? `Broken target — HTTP ${extras.urlToStatusCode}`
                    : "Broken target"
                }
              >
                <Unlink
                  className="h-3.5 w-3.5 shrink-0 text-destructive"
                  aria-label="Broken target"
                />
              </span>
            ) : null}
          </span>
        );
      },
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
      {backlinks.isError ? (
        <InlineQueryError
          what="backlinks"
          error={backlinks.error}
          onRetry={() => void backlinks.refetch()}
        />
      ) : (
        <MatrxDataTable<BacklinkObservationRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={backlinks.isLoading}
          isFetching={backlinks.isFetching}
          query={{
            mode: "controlled",
            totalItems: total,
            state: table.state,
            onStateChange: table.onStateChange,
          }}
          toolbar={{
            searchPlaceholder: "Search source, target, or anchor…",
          }}
          copy={{
            label: "Backlink",
            listLabel: lensLabel
              ? `Backlinks — ${lensLabel}`
              : "Backlinks table",
            location: webLocation(
              lensLabel ? `Backlinks — ${lensLabel}` : "Backlinks",
            ),
            rowKind: "web-backlink",
            listKind: "web-backlink-table",
            rowDescription:
              "One stored backlink observation with authority, placement, rel attributes, spam score, and lifecycle dates.",
            listDescription:
              "The currently visible backlink rows (respecting search, sort, filters, lens, and pagination).",
            humanRow: humanBacklinkRow,
            agentRow: projectBacklinkRow,
            rowAttributes: (row) => ({
              site_id: siteId,
              lens: lens ?? undefined,
              id: row.id,
              state: row.state,
              source_domain: row.source_domain ?? undefined,
              domain_rank: row.domain_rank ?? undefined,
              spam_score: row.spam_score ?? undefined,
            }),
            listAttributes: (visible) => ({
              site_id: siteId,
              lens: lens ?? undefined,
              page: table.state.page,
              visible_rows: visible.length,
              total_rows: total,
              search: table.state.search || undefined,
            }),
          }}
          detail={{
            title: (row) => row.source_domain ?? row.source_url,
            description: (row) => `${row.state} link to ${row.target_url}`,
          }}
          window={{
            title: (row) => row.source_domain ?? row.source_url,
          }}
          pageSize={50}
          pageSizeOptions={[25, 50, 100, 250]}
          emptyState={{
            icon: <Link2 className="h-8 w-8 text-muted-foreground" />,
            title: lensLabel ? `${lensLabel}: nothing found` : "No detailed backlinks stored",
            description:
              backlinks.isSuccess && (lens || table.queryState.search)
                ? lens
                  ? LENS_EMPTY_LINE[lens]
                  : "No stored backlinks match this search and filter set."
                : "No detailed backlinks stored — run a Monthly detail or Full bootstrap refresh.",
          }}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
