"use client";

// features/unified-data/home/DataHomeList.tsx — LANE DATA-HOME-3A
//
// THE DATA HOME ON THE CANONICAL LIST SHELL (DATA-HOME-3-SPEC §2). /data-v2 was the only major list
// page that did not use `EntityListPage`; the ten hand-drawn sections had no table, no column sort,
// no title search and no cards. This mounts the shell — the same one /agents/all uses — over one
// row type with a `kind` column, served in hand from the home's one door (`custom.data_home`).
//
// The two organization concepts never touch (common-docs/policies/active-org-is-never-a-list-filter.md):
// the shell's organization filter (`?org_filter=`, All organizations every visit) narrows the list;
// the ACTIVE organization is only where New table lands (the page header, and the making controls
// in the footer). Nothing in this file reads the active organization for a read.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Link2, Star, StarOff } from "lucide-react";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListConfig, EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import { makeScope } from "@/lib/list-scope/types";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";

import {
  DATA_HOME_DEFAULT_KIND_KNOB,
  DATA_HOME_DEFAULT_ORDER_KNOB,
  DATA_HOME_DEFAULT_SCOPE_KNOB,
  DATA_HOME_SHELL_LANES,
  resolveDataHomeKind,
  resolveDataHomeOrder,
  resolveDataHomeScope,
  ALL_KINDS,
} from "@/features/unified-data/hub/dataHomeScope";
import { ACCESS_WORD, dataHomeKindWord, type DataHomeAccess, type DataHomeRow } from "./dataHomeRows";
import { createDataHomeService, DATA_HOME_ROW_CAP } from "./dataHomeService";
import { createDataHomeCorpus } from "./dataHomeCorpus";
import { createRecordCountStore } from "./dataHomeRecordCounts";
import { tableRowCounts } from "@/features/unified-data/hub/doors";
import { dataHomeColumns, ownerLabel } from "./dataHomeColumns";
import { DataHomeCards, DataHomeRows } from "./DataHomeViews";
import { nextStarred, useDataHomeMarks } from "./useDataHomeMarks";
import { DATA_HOME_DEFAULT_VIEW_KNOB, resolveDataHomeView } from "./dataHomeKnobs";
import { tokensToFilters, updatedBucket } from "./dataHomeQuery";
import { DataHomeRecent, recentRows } from "./DataHomeRecent";

export const DATA_HOME_SURFACE_KEY = "data-home";

export interface DataHomeListProps {
  dataSource: RecordsDataSource;
  /** Header slot for nothing; the page owns the header. Footer: making, inbox, archive. */
  footer?: ReactNode;
  /** The organization the page's filter names, when it shows only a member what is shared. */
  sharedOnlyHere?: boolean;
}

export function DataHomeList({ dataSource, footer, sharedOnlyHere = false }: DataHomeListProps) {
  const router = useRouter();
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const marks = useDataHomeMarks();

  // A person's own marks. The service is cheap and is made again when they change (the corpus is
  // held by the loader below, so a star never re-reads the door); `serviceKey` tells the shell.
  const starredSet = useMemo(() => new Set(marks.starred), [marks.starred]);
  const starredKey = marks.starred.join(",");

  // THE CORPUS (rows in hand) and the server search beside it — dataHomeCorpus.ts.
  const corpus = useMemo(() => createDataHomeCorpus(client, dataSource), [client, dataSource]);
  // THE RECORDS COLUMN, lazily: cells on screen ask this; the list never waits on it.
  const recordCounts = useMemo(
    () => createRecordCountStore((organizationId, tableIds) => tableRowCounts(dataSource, organizationId, tableIds)),
    [dataSource],
  );
  // A server answer for the box's current text re-asks the list (its rows join beneath the instant hits).
  const [serverVersion, setServerVersion] = useState(0);
  useEffect(() => corpus.onAnswer(() => setServerVersion((v) => v + 1)), [corpus]);
  // The rows in hand by id, for Recent (the corpus's one held read; never a second door call).
  const [rowsById, setRowsById] = useState<ReadonlyMap<string, DataHomeRow>>(() => new Map());
  useEffect(() => {
    let live = true;
    corpus
      .load()
      .then((rows) => {
        if (live) setRowsById(new Map(rows.map((row) => [row.id, row])));
      })
      // The list's own load reports a failed read in its one failure slot; Recent just stays absent.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [corpus]);
  const recent = recentRows(marks.recent, rowsById);

  const service = useMemo(
    () =>
      createDataHomeService({
        load: corpus.load,
        server: corpus.server,
        isStarred: (row) => starredSet.has(row.id),
        ownerLabel,
      }),
    [corpus, starredSet],
  );

  // Defaults stay knobs (person / platform tier; never the active organization).
  const defaultScope = resolveDataHomeScope(null, useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_SCOPE_KNOB));
  // `?kind=` (the old page's address) is kept as an alias: it opens on that kind, one chip away from all.
  const kindParam = useSearchParams().get("kind");
  const defaultKind = resolveDataHomeKind(kindParam, useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_KIND_KNOB));
  const order = resolveDataHomeOrder(useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_ORDER_KNOB));
  const defaultView = resolveDataHomeView(useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_VIEW_KNOB));

  const config = useMemo<EntityListConfig<DataHomeRow>>(() => {
    const columns = dataHomeColumns({ organizationName: (id) => corpus.meta.names.get(id) ?? id, recordCounts });
    return {
      surfaceKey: DATA_HOME_SURFACE_KEY,
      entityLabel: { singular: "table", plural: "tables" },
      sourceFeature: "udt",
      scopes: [...DATA_HOME_SHELL_LANES],
      // No person can reach the platform's own tables from the data home today (the door reads only
      // organizations the viewer belongs to or holds a grant in), so System is absent, not empty.
      lanes: { system: false },
      service,
      serviceKey: `${starredKey}|${serverVersion}`,
      columns,
      prefsVersion: 1,
      prefsDefaults: {
        view: defaultView,
        density: "compact",
        sort: order === "name" ? "name" : "updated",
        direction: order === "name" ? "asc" : "desc",
        favoritesFirst: true,
      },
      getRowId: (row) => row.id,
      getRowName: (row) => row.name,
      // `/` search, ↑/↓ move, Enter opens, `s` stars, Esc clears — the shell's one keyboard handler.
      rowKeys: true,
      door: { column: "name", hrefFor: (row) => row.href },
      useRowActions: (list) => dataHomeRowActions(list, starredSet, marks, router),
      favorite: {
        isFavorite: (row) => starredSet.has(row.id),
        canToggle: () => true,
      },
      supportsArchived: false,
      facetSections: [
        { facet: "kind", filterId: "kind", label: "Kind", noneLabel: "None", countInLabel: false, formatValue: dataHomeKindWord },
        {
          facet: "organization",
          filterId: "organization",
          label: "Organization",
          noneLabel: "None",
          countInLabel: false,
          formatValue: (id) => corpus.meta.names.get(id) ?? id,
        },
        {
          facet: "access",
          filterId: "access",
          label: "Access",
          noneLabel: "None",
          countInLabel: false,
          formatValue: (v) => ACCESS_WORD[v as DataHomeAccess] ?? v,
        },
      ],
      noneLabels: { owner: "—", records: "Not counted", organization: "None", access: "None" },
      searchPlaceholder: "Search tables, forms, dashboards",
      searchToggles: [{ id: "title_only", label: "Title only" }],
      searchTokens: (search) => tokensToFilters(search, corpus.meta),
      filterChips: true,
      ...(defaultKind !== ALL_KINDS ? { defaultFilters: { kind: { kind: "select", values: [defaultKind] } } } : {}),
      grouping: {
        groupableColumnIds: ["kind", "organization", "access", "owner", "updated"],
        rowNoun: "item",
        readCell: (row, columnId) =>
          columnId === "updated"
            ? updatedBucket(row.updatedAt)
            : columnId === "owner"
              ? ownerLabel(row)
              : columnId === "organization"
                ? row.organizationName
                : columnId === "kind"
                  ? row.kind
                  : columnId === "access"
                    ? row.access
                    : null,
        labelOf: (columnId, value) =>
          value === null || value === undefined || value === ""
            ? "—"
            : columnId === "kind"
              ? dataHomeKindWord(String(value))
              : columnId === "access"
                ? (ACCESS_WORD[value as DataHomeAccess] ?? String(value))
                : String(value),
      },
      virtualize: { enabled: true, threshold: 150, overscan: 8 },
      views: {
        cards: (p) => (
          <DataHomeCards {...p} isStarred={(row) => starredSet.has(row.id)} onOpened={(row) => marks.opened(row.id)} />
        ),
        rows: (p) => (
          <DataHomeRows {...p} isStarred={(row) => starredSet.has(row.id)} onOpened={(row) => marks.opened(row.id)} />
        ),
      },
      emptyState: sharedOnlyHere
        ? {
            title: "Nothing shared with you here yet",
            description: "Ask a table's keeper to share it with you.",
          }
        : { title: "No tables yet", description: "New table makes one." },
    };
  }, [service, starredKey, serverVersion, corpus, recordCounts, order, defaultView, defaultKind, sharedOnlyHere, router, starredSet, marks]);

  return (
    <EntityListPage
      config={config}
      defaultScope={makeScope(defaultScope)}
      clearsShellHeader={false}
      notice={(list) => (
        <>
          {!list.query.search ? <DataHomeRecent rows={recent} onOpened={(row) => marks.opened(row.id)} /> : null}
          {corpus.meta.refusals.length > 0 || corpus.meta.capped || corpus.meta.searchTrouble ? (
          <div role="status" className="flex flex-col gap-1 text-xs text-muted-foreground" data-data-home-notice="">
            {corpus.meta.capped ? <span>Showing the newest {DATA_HOME_ROW_CAP.toLocaleString()}.</span> : null}
            {corpus.meta.searchTrouble ? (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                Search inside fields did not answer. {corpus.meta.searchTrouble}
                <ErrorAlchemyMenu error={corpus.meta.searchTrouble} />
              </span>
            ) : null}
            {corpus.meta.refusals.map((r) => (
              <span key={r.listing} className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                {r.listing} could not be read. {r.message}
                <ErrorAlchemyMenu error={r.message} />
              </span>
            ))}
          </div>
          ) : null}
        </>
      )}
      footer={footer}
    />
  );
}

function dataHomeRowActions(
  _list: EntityListController<DataHomeRow>,
  starred: ReadonlySet<string>,
  marks: ReturnType<typeof useDataHomeMarks>,
  router: ReturnType<typeof useRouter>,
): EntityRowActionsResult<DataHomeRow> {
  const toggle = (row: DataHomeRow) => {
    const { next, refused } = nextStarred([...starred], row.id);
    if (refused) {
      toast.error("You can keep up to 500 favorites. Remove one first.");
      return;
    }
    // The new set makes a new service (serviceKey), and the shell re-asks: the row moves at once.
    marks.setStarred(next);
  };
  return {
    actions: {
      onOpenRow: (row) => {
        marks.opened(row.id);
        router.push(row.href);
      },
      onToggleFavorite: toggle,
      menuFor: (row) => (): ItemMenuConfig => {
        const isStarred = starred.has(row.id);
        return {
          sections: [
            {
              id: "open",
              items: [
                { id: "open", kind: "link", label: "Open", href: row.href },
                { id: "open-tab", kind: "link", label: "Open in new tab", icon: ExternalLink, href: row.href, target: "_blank" },
                ...(row.publicHref
                  ? [{ id: "public", kind: "link" as const, label: "Open public link", icon: Link2, href: row.publicHref, target: "_blank" as const }]
                  : []),
              ],
            },
            {
              id: "mark",
              items: [
                {
                  id: "star",
                  label: isStarred ? "Remove from favorites" : "Add to favorites",
                  icon: isStarred ? StarOff : Star,
                  onSelect: () => toggle(row),
                },
              ],
            },
          ],
        };
      },
    },
  };
}
