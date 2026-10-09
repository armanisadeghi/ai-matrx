"use client";

// features/unified-data/home/DataHomeList.tsx — LANE DATA-HOME-3A
//
// THE DATA HOME ON THE CANONICAL LIST SHELL (DATA-HOME-3-SPEC §2). /data was the only major list
// page that did not use `EntityListPage`; the ten hand-drawn sections had no table, no column sort,
// no title search and no cards. This mounts the shell — the same one /agents/all uses — over one
// row type with a `kind` column, served in hand from the home's one door (`custom.data_home`).
//
// The two organization concepts never touch (common-docs/policies/access-ladder.md):
// the shell's organization filter (`?org_filter=`, All organizations every visit) narrows the list;
// the ACTIVE organization is only where New table lands (the page header). Nothing in this file reads the active organization for a read.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { foundHighlightOf } from "@ai-matrx/kit/reversible";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListConfig } from "@/lib/entity-list/config";
import { makeScope } from "@/lib/list-scope/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { isTestOrganization } from "@/features/make/recent";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
import { readArchivedDataHomePage } from "./dataHomeArchived";
import { ARCHIVED_TABLES_HREF, ARCHIVED_TABLES_SPOT } from "./archivedTablesPlace";
import { createRecordCountStore } from "./dataHomeRecordCounts";
import { tableRowCounts } from "@/features/unified-data/hub/doors";
import { dataHomeColumns, ownerLabel } from "./dataHomeColumns";
import { DataHomeCards, DataHomeRows } from "./DataHomeViews";
import { useDataHomeMarks, useDataHomeShowPlatformTables } from "./useDataHomeMarks";
import { useDataHomeRowMenus, useReadAgainOnRestore } from "./useDataHomeRowMenus";
import { DataMenuProvider } from "@/features/unified-data/actions/DataMenuProvider";
import { useFocusedRowCommands } from "@/features/unified-data/actions/tableActionCommands";

const ROW_ID = (row: DataHomeRow) => row.id;
const ROW_NAME = (row: DataHomeRow) => row.name;
import { DATA_HOME_DEFAULT_VIEW_KNOB, resolveDataHomeView } from "./dataHomeKnobs";
import { tokensToFilters, updatedBucket } from "./dataHomeQuery";
import { DataHomeRecent, recentRows } from "./DataHomeRecent";
import { formatCount } from "@ai-matrx/kit/format";

const withoutHidden = (rows: DataHomeRow[], hidden: ReadonlySet<string>) =>
  hidden.size === 0 ? rows : rows.filter((row) => !hidden.has(row.id));

export const DATA_HOME_SURFACE_KEY = "data-home";

export interface DataHomeListProps {
  dataSource: RecordsDataSource;
  /** The organization the page's filter names, when it shows only a member what is shared. */
  sharedOnlyHere?: boolean;
}

export function DataHomeList({ dataSource, sharedOnlyHere = false }: DataHomeListProps) {
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const marks = useDataHomeMarks();

  // A person's own marks. The service is cheap and is made again when they change (the corpus is
  // held by the loader below, so a star never re-reads the door); `serviceKey` tells the shell.
  const starredSet = useMemo(() => new Set(marks.starred), [marks.starred]);
  const starredKey = marks.starred.join(",");

  // "SHOW PLATFORM TABLES" (CHAIR-DOORS-2, N-C8; lane 10 item 7): the tables the app keeps — an agent's
  // outputs, a choice column's Lists — stay out of the home until the person turns this on in
  // Filters; on, the corpus is read again with them. Her own synced preference, so it holds.
  const [showPlatformTables, setShowPlatformTables] = useDataHomeShowPlatformTables();
  /** A row's menu renamed, moved or archived a table: the corpus is read again. */
  const [corpusVersion, setCorpusVersion] = useState(0);
  // A restore (Undo, ⌘Z, Restore) on this page lists the table again at once.
  const restoredVersion = useReadAgainOnRestore();
  // OPTIMISTIC ARCHIVE: a table being archived (or archived this visit) leaves the list the moment
  // it is pressed, from the rows already in hand — no re-read, no loading state. A refusal or an
  // Undo takes its id out again. The next full read simply no longer has the row.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const hideRow = useCallback((id: string) => setHiddenIds((now) => new Set(now).add(id)), []);
  const unhideRow = useCallback(
    (id: string) =>
      setHiddenIds((now) => {
        if (!now.has(id)) return now;
        const next = new Set(now);
        next.delete(id);
        return next;
      }),
    [],
  );
  // THE CORPUS (rows in hand) and the server search beside it — dataHomeCorpus.ts.
  const corpus = useMemo(
    () => createDataHomeCorpus(client, dataSource, { includePlatformTables: showPlatformTables }),
    // `corpusVersion`: a row's menu renamed, moved or archived a table, so the corpus is read again.
    [client, dataSource, showPlatformTables, corpusVersion, restoredVersion],
  );
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
  const { organizations } = useUserOrganizations();
  const testOrganizationIds = useMemo(
    () => new Set(organizations.filter((o) => isTestOrganization(o)).map((o) => o.id)),
    [organizations],
  );
  const recent = recentRows(marks.recent, rowsById, testOrganizationIds);
  // THE ROW'S MENU IS THE TABLE'S ONE ACTION LIST (lane TABLE-ACTIONS): row ⋯, card ⋯ and
  // right-click all draw `menuFor`, which draws `tableActions()` for a table row.
  const withFocusedRow = useFocusedRowCommands<DataHomeRow>(ROW_ID, ROW_NAME);
  const rowMenus = useDataHomeRowMenus({
    starred: starredSet,
    onOpened: (row) => marks.opened(row.id),
    onChanged: () => setCorpusVersion((v) => v + 1),
    onHide: hideRow,
    onUnhide: unhideRow,
  });

  const service = useMemo(
    () =>
      createDataHomeService({
        load: () => corpus.load().then((rows) => withoutHidden(rows, hiddenIds)),
        loaded: () => {
          const rows = corpus.loaded();
          return rows && withoutHidden(rows, hiddenIds);
        },
        // The Archived filter's rows, a store page at a time, only when it asks (TABLE-ACTIONS item 10).
        readArchived: (page, sort) => readArchivedDataHomePage(dataSource, page, userId, sort),
        server: corpus.server,
        isStarred: (row) => starredSet.has(row.id),
        ownerLabel,
      }),
    [corpus, starredSet, dataSource, userId, hiddenIds],
  );

  // Defaults stay knobs (person / platform tier; never the active organization).
  const defaultScope = resolveDataHomeScope(null, useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_SCOPE_KNOB));
  const searchParams = useSearchParams();
  // `?kind=` (the old page's address) is kept as an alias: it opens on that kind, one chip away from all.
  const kindParam = searchParams.get("kind");
  // "Open Archived tables" from an older announcement (`?found=archived-tables`) lands on the
  // list's Archived filter, where the archive lives now (TABLE-ACTIONS item 10).
  const router = useRouter();
  const foundArchive = foundHighlightOf(searchParams) === ARCHIVED_TABLES_SPOT;
  useEffect(() => {
    if (foundArchive) router.replace(ARCHIVED_TABLES_HREF);
  }, [foundArchive, router]);
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
      serviceKey: `${starredKey}|${serverVersion}|${showPlatformTables ? "app" : ""}|${corpusVersion}.${restoredVersion}|${[...hiddenIds].join(",")}`,
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
      // ⌘K offers the focused row's menu as commands (TABLE-ACTIONS T4.1).
      useRowActions: (list) => withFocusedRow(rowMenus.useRowActions(list), list.rows),
      // WHAT A ROW IS, for right-click's Attach To (a record-store table is a `record`). No
      // `resourceType`: the action list carries Share, so v3's generic Share is not drawn beside it.
      getRowEntity: (row) =>
        row.kind === "table" && row.tableId ? { type: "record", id: row.tableId, title: row.name } : undefined,
      favorite: {
        isFavorite: (row) => starredSet.has(row.id),
        canToggle: () => true,
      },
      // THE ARCHIVE IS THE LIST'S ARCHIVED FILTER (hide archived · show all · archived only;
      // common-docs/policies/archived-items.md): archived tables and portals, each with Restore.
      supportsArchived: true,
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
        // LANE 10 FD: the business's day-one tables. Offered only when there is a choice to make.
        {
          facet: "foundation",
          filterId: "foundation",
          label: "Foundation",
          noneLabel: "None",
          countInLabel: false,
          minOptions: 2,
          formatValue: (v) => (v === "true" ? "Foundation" : "Other"),
        },
      ],
      noneLabels: { owner: "—", records: "Not counted", organization: "None", access: "None" },
      searchPlaceholder: "Search tables, forms, dashboards",
      // The rows are in hand: every keystroke repaints on that keystroke. Only the server's
      // full-text layer waits (its own 250 ms, dataHomeCorpus.ts).
      searchDebounceMs: 0,
      searchToggles: [{ id: "title_only", label: "Title only" }],
      panelSwitches: [
        { id: "platform_tables", section: "Platform tables", label: "Show platform tables", on: showPlatformTables, onChange: setShowPlatformTables },
      ],
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
      // A phone row is two lines — name, then kind · organization · updated (Linear's mobile list).
      phoneCardDensity: "line",
      views: {
        cards: (p) => (
          <DataHomeCards
            {...p}
            isStarred={(row) => starredSet.has(row.id)}
            onOpened={(row) => marks.opened(row.id)}
            recordCounts={recordCounts}
          />
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
  }, [service, starredKey, serverVersion, showPlatformTables, corpusVersion, restoredVersion, corpus, recordCounts, order, defaultView, defaultKind, sharedOnlyHere, starredSet, marks, rowMenus, withFocusedRow]);

  return (
    // The right-click on every row and card is the proposed menu (`DataMenuProvider`).
    <DataMenuProvider>
      <EntityListPage
        config={config}
        defaultScope={makeScope(defaultScope)}
        clearsShellHeader={false}
        notice={(list) => (
          <>
            {!list.query.search ? <DataHomeRecent rows={recent} onOpened={(row) => marks.opened(row.id)} /> : null}
            {corpus.meta.refusals.length > 0 || corpus.meta.capped || corpus.meta.searchTrouble ? (
            <div role="status" className="flex flex-col gap-1 text-xs text-muted-foreground" data-data-home-notice="">
              {corpus.meta.capped ? <span>Showing the newest {formatCount(DATA_HOME_ROW_CAP)}.</span> : null}
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
      />
    </DataMenuProvider>
  );
}
