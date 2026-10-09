"use client";

// features/unified-data/pages/ItemsHome.tsx — EVERY PAGE, OR EVERY DASHBOARD, BUILT FROM TABLES.
// (v6 lane 11 wave D for pages; v7 APPS-ON-DATA item 4 gave dashboards the same home, and both a Share.)
//
// The pages home is the canonical list shell (`EntityListPage`) over the data home's own corpus
// (`createDataHomeCorpus`): `custom.data_home_items` lists every dashboard record the person may see
// in every organization — the cross-table list door the model asked for — and the hub's dashboards
// capability names a dashboard whose `presentation.kind` is "page" as kind `page`. This screen keeps
// only those rows, so its lanes, organization filter, search and columns are the data home's own
// (one row type, one service, never a second list of the same records).
//
// The organization filter is the shell's (`?org_filter=`, All organizations on every visit); the
// active organization narrows nothing here.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderOpen, Share2 } from "lucide-react";
import { RecordsMount } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListConfig, EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { makeScope } from "@/lib/list-scope/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { DATA_HOME_SHELL_LANES } from "@/features/unified-data/hub/dataHomeScope";
import { createDataHomeCorpus } from "@/features/unified-data/home/dataHomeCorpus";
import { createDataHomeService } from "@/features/unified-data/home/dataHomeService";
import { dataHomeColumns, ownerLabel } from "@/features/unified-data/home/dataHomeColumns";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

/** The two kinds of thing built from tables that have a home of their own. */
const HOMES = {
  page: { title: "Pages", surfaceKey: "data-pages", singular: "page", plural: "pages", empty: "On a table, open Dashboards and press New page." },
  dashboard: {
    title: "Dashboards",
    surfaceKey: "data-dashboards",
    singular: "dashboard",
    plural: "dashboards",
    empty: "On a table, open Dashboards and add a chart.",
  },
} as const;
export type ItemsHomeKind = keyof typeof HOMES;

/** The columns an item row fills: no star (not starred yet), no record count (it holds none). */
const ITEM_COLUMNS = new Set(["name", "organization", "updated", "owner", "access", "details"]);

export function ItemsHome({ kind }: { kind: ItemsHomeKind }) {
  const home = HOMES[kind];
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const recordsConfig = useAppRecordsConfig(null);
  const dataSource = recordsConfig.dataSource;
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/data");
  };
  return (
    <>
      <PageHeader>
        <HeaderStructured back={back} title={home.title} />
      </PageHeader>
      <div className="h-full overflow-y-auto p-4 pt-[var(--shell-header-h)]">
        {!userId ? (
          <OrganizationContextNotice state="resolving" what={home.title} />
        ) : (
          // org-filter: none — All organizations; the doors answer for the person.
          <RecordsMount
            letTheStoreDecideRights
            config={recordsConfig}
            host={{ Link, density: "condensed" }}
          >
            <ItemsList kind={kind} dataSource={dataSource} />
          </RecordsMount>
        )}
      </div>
    </>
  );
}

// A page and a dashboard are each one record of the store, so Share is the store's record share
// (the same dialog a record and a table open), in the item's own organization.
export function useItemRowActions(_list: EntityListController<DataHomeRow>): EntityRowActionsResult<DataHomeRow> {
  const router = useRouter();
  const [sharing, setSharing] = useState<DataHomeRow | null>(null);
  const modals: ReactNode =
    sharing && sharing.organizationId
      ? recordStoreShare({
          kind: "record",
          organizationId: sharing.organizationId,
          subjectId: sharing.itemId,
          name: sharing.name,
          onClose: () => setSharing(null),
        })
      : null;
  return {
    actions: {
      onOpenRow: (row) => router.push(row.href),
      menuFor: (row) => (): ItemMenuConfig => ({
        sections: [
          {
            id: "open",
            items: [
              { kind: "command", id: "open", label: "Open", icon: FolderOpen, onSelect: () => router.push(row.href) },
              { kind: "link", id: "open-new", label: "Open in new tab", icon: ExternalLink, href: row.href, target: "_blank" },
            ],
          },
          ...(row.organizationId
            ? [{ id: "share", items: [{ kind: "command" as const, id: "share", label: "Share…", icon: Share2, onSelect: () => setSharing(row) }] }]
            : []),
        ],
      }),
    },
    modals,
  };
}

function ItemsList({ kind, dataSource }: { kind: ItemsHomeKind; dataSource: RecordsDataSource }) {
  const home = HOMES[kind];

  const client = useRecordsClient();
  const corpus = useMemo(() => createDataHomeCorpus(client, dataSource), [client, dataSource]);
  const service = useMemo(
    () =>
      createDataHomeService({
        load: () => corpus.load().then((rows) => rows.filter((row) => row.kind === kind)),
        loaded: () => {
          const held = corpus.loaded();
          return held ? held.filter((row) => row.kind === kind) : undefined;
        },
        isStarred: () => false,
        ownerLabel,
      }),
    [corpus, kind],
  );
  const config = useMemo<EntityListConfig<DataHomeRow>>(
    () => ({
      surfaceKey: home.surfaceKey,
      entityLabel: { singular: home.singular, plural: home.plural },
      sourceFeature: "udt",
      scopes: [...DATA_HOME_SHELL_LANES],
      lanes: { system: false },
      service,
      columns: dataHomeColumns({ organizationName: (id) => corpus.meta.names.get(id) ?? id }).filter((c) =>
        ITEM_COLUMNS.has(c.id),
      ),
      prefsVersion: 1,
      prefsDefaults: { view: "table", density: "compact", sort: "updated", direction: "desc" },
      getRowId: (row) => row.id,
      getRowName: (row) => row.name,
      rowKeys: true,
      door: { column: "name", hrefFor: (row) => row.href },
      useRowActions: useItemRowActions,
      supportsArchived: false,
      facetSections: [
        {
          facet: "organization",
          filterId: "organization",
          label: "Organization",
          noneLabel: "None",
          countInLabel: false,
          formatValue: (id) => corpus.meta.names.get(id) ?? id,
        },
      ],
      searchPlaceholder: `Search ${home.plural}`,
      searchDebounceMs: 0,
      emptyState: { title: `No ${home.plural} yet`, description: home.empty },
    }),
    [service, corpus, home],
  );
  return <EntityListPage config={config} defaultScope={makeScope("all")} clearsShellHeader={false} />;
}
