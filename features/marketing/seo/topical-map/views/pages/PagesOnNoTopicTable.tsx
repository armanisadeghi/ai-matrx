"use client";

// features/marketing/seo/topical-map/views/pages/PagesOnNoTopicTable.tsx
//
// THE "On no topic" TAB — `seo.list_pages_without_topic`: the active pages of
// ONE SITE that sit on no live topic of the map that site uses, most clicks
// first.
//
// 🚨 IT NEEDS ONE SITE, AND SAYS SO RATHER THAN GUESSING. The ledger belongs to
// a site, not to a map, so with no site in scope this renders a chooser over
// the sites the map's diagnostics reported — each one a real door plus a link
// that comes back to this same screen with `?site=`.
//
// 🚨 NO SELECTION, AND THE REASON IS ON THE SCREEN. These pages cover nothing,
// so `seo.set_page_intents` has no topic to derive from and answers 22023 for
// `keep`/`rewrite`/`delete` while `move`/`merge`/`redirect` need a destination
// nobody has chosen. A checkbox column here would offer a bulk write that every
// row would refuse; the sentence above the table says what to do instead.
//
// `rendition_of` is the one column that must not read as a defect: a second
// address of a page (amp, paginated, a parameter variant) is a DUPLICATE
// ADDRESS, not a gap, and the cell says so in its title.

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../../components/TopicalMapStates";
import { usePagesWithoutTopic } from "../../hooks";
import { useMapLinks } from "../../links";
import type { PageWithoutTopic } from "../../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface PagesOnNoTopicTableProps {
  mapId: string;
  siteId: string | null;
  /** The sites using this map, from `seo.map_diagnostics.sites_using_map`. */
  siteIds: readonly string[];
  page: number;
  pageSize: number;
  onQueryChange: (next: { page: number; pageSize: number }) => void;
}

/** Every column is inert for the same reason as the All-pages table: the read
 *  takes no ORDER BY and no filters beyond its site, limit and offset. */
const INERT = { sortable: false, filter: false } as const;

function columnsFor(): MatrxColumnDef<PageWithoutTopic>[] {
  return [
    {
      id: "url",
      header: "Page",
      label: "Page",
      ...INERT,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1">
          <EntityRef token="web_page" id={row.page_id} name={row.url} />
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${row.url} in a new tab`}
            title="Open the live page in a new tab"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </span>
      ),
    },
    {
      id: "clicks",
      header: "Clicks",
      label: "Clicks",
      ...INERT,
      // This read always carries `clicks` (types.ts: only queue_status,
      // mapping_source, last_error and rendition_of are stripped), so a number
      // here is always a real one — including a real 0.
      cell: (row) => <span className="block text-right tabular-nums">{row.clicks}</span>,
    },
    {
      id: "queue_status",
      header: "Queue",
      label: "Queue",
      ...INERT,
      cell: (row) =>
        row.queue_status === undefined ? (
          <span
            className="text-muted-foreground"
            title="The mapper has never been asked to place this page. Running “Map the pages” enrols it."
          >
            never enrolled
          </span>
        ) : (
          <span>{row.queue_status}</span>
        ),
    },
    {
      id: "mapping_source",
      header: "Mapped by",
      label: "Mapped by",
      ...INERT,
      cell: (row) =>
        row.mapping_source === undefined ? (
          <span className="text-muted-foreground" title="Nothing has placed this page.">
            —
          </span>
        ) : (
          <span>{row.mapping_source}</span>
        ),
    },
    {
      id: "last_error",
      header: "Last error",
      label: "Last error",
      ...INERT,
      cell: (row) =>
        row.last_error === undefined ? (
          <span className="text-muted-foreground" title="No failure is standing on this page.">
            —
          </span>
        ) : (
          // The mapper's OWN sentence, unaltered — it is the only explanation
          // the person will get for why this page never landed.
          <span
            className="block max-w-[24rem] truncate text-destructive"
            title={row.last_error}
          >
            {row.last_error}
            <ErrorAlchemyMenu error={row.last_error} />
          </span>
        ),
    },
    {
      id: "rendition_of",
      header: "Rendition of",
      label: "Rendition of",
      ...INERT,
      cell: (row) =>
        row.rendition_of === undefined ? (
          <span
            className="text-muted-foreground"
            title="This page is its own address, not a variant of another one."
          >
            —
          </span>
        ) : (
          <span
            title="a second address of this page, not a gap"
            className="inline-flex min-w-0"
          >
            <EntityRef token="web_page" id={row.rendition_of} />
          </span>
        ),
    },
  ];
}

function SiteChooser({
  mapId,
  siteIds,
}: {
  mapId: string;
  siteIds: readonly string[];
}) {
  const links = useMapLinks();
  if (siteIds.length === 0) {
    return (
      <TopicalMapEmpty
        title="Pick a site to see its bare pages"
        detail="This list belongs to a site, not to a map — and no site using this map has been reported yet. Bind a site to this map, then come back."
      />
    );
  }
  return (
    <TopicalMapEmpty
      title="Pick a site to see its bare pages"
      detail="Pages with no topic belong to a site's own mapping ledger, so this list needs one site in scope."
      action={
        <ul className="space-y-1">
          {siteIds.map((id) => (
            <li key={id} className="flex items-center gap-2 text-xs">
              <EntityRef token="web_site" id={id} />
              <Link
                href={links.mapView(mapId, "pages", id)}
                className="rounded border border-border px-1.5 py-px hover:bg-accent"
              >
                Use
              </Link>
            </li>
          ))}
        </ul>
      }
    />
  );
}

export function PagesOnNoTopicTable({
  mapId,
  siteId,
  siteIds,
  page,
  pageSize,
  onQueryChange,
}: PagesOnNoTopicTableProps) {
  const bare = usePagesWithoutTopic(
    siteId ?? "",
    pageSize,
    Math.max(0, (page - 1) * pageSize),
    Boolean(siteId),
  );

  if (siteId === null) return <SiteChooser mapId={mapId} siteIds={siteIds} />;
  if (bare.isPending) return <TopicalMapLoading what="this site's pages with no topic" />;
  if (bare.isError) {
    return <TopicalMapFailed what="this site's pages with no topic" error={bare.error} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <p className="shrink-0 px-0.5 text-xs text-muted-foreground">
        {bare.data.total} page(s) of this site sit on no live topic of this map.
        To give these pages an intent, first map them (Map the pages) or move
        them to a topic from the topic panel.
      </p>
      {bare.data.items.length === 0 ? (
        <TopicalMapEmpty
          title="Every active page of this site is on a topic"
          detail="Nothing here is a gap. New pages appear as the crawler finds them and the mapper cannot place them."
        />
      ) : (
        <div className="min-h-0 flex-1">
          <MatrxDataTableHost>
            <MatrxDataTable<PageWithoutTopic>
              data={bare.data.items}
              columns={columnsFor()}
              getRowId={(row) => row.page_id}
              isFetching={bare.isFetching}
              zebra
              className="text-xs [&_td]:py-1 [&_th]:py-1"
              pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
              query={{
                mode: "controlled",
                totalItems: bare.data.total,
                state: {
                  page,
                  pageSize,
                  search: "",
                  anyOf: "",
                  columnFilters: {},
                  sort: null,
                },
                onStateChange: (next) => {
                  onQueryChange({ page: next.page, pageSize: next.pageSize });
                },
              }}
              toolbar={{ search: false }}
              detail={{ enabled: false }}
              window={{ enabled: false }}
            />
          </MatrxDataTableHost>
        </div>
      )}
    </div>
  );
}
