"use client";

// features/unified-data/pages/PagesHome.tsx — v6 lane 11, wave D: EVERY PAGE BUILT FROM TABLES.
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

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderOpen } from "lucide-react";
import { RecordsMount, personActor } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListConfig, EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { makeScope } from "@/lib/list-scope/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { DATA_HOME_SHELL_LANES } from "@/features/unified-data/hub/dataHomeScope";
import { createDataHomeCorpus } from "@/features/unified-data/home/dataHomeCorpus";
import { createDataHomeService } from "@/features/unified-data/home/dataHomeService";
import { dataHomeColumns, ownerLabel } from "@/features/unified-data/home/dataHomeColumns";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

export const PAGES_SURFACE_KEY = "data-pages";

/** The columns a page row fills: no star (pages are not starred yet), no record count (a page holds none). */
const PAGE_COLUMNS = new Set(["name", "organization", "updated", "owner", "access", "details"]);

const onlyPages = (rows: DataHomeRow[]) => rows.filter((row) => row.kind === "page");

export function PagesHome() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/data");
  };
  return (
    <>
      <PageHeader>
        <HeaderStructured back={back} title="Pages" />
      </PageHeader>
      <div className="h-full overflow-y-auto p-4 pt-[var(--shell-header-h)]">
        {!userId ? (
          <OrganizationContextNotice state="resolving" what="Pages" />
        ) : (
          // org-filter: none — All organizations; the doors answer for the person.
          <RecordsMount
            letTheStoreDecideRights
            config={{ dataSource, actor: personActor(userId), organizationId: null }}
            host={{ Link, density: "condensed" }}
          >
            <PagesList dataSource={dataSource} />
          </RecordsMount>
        )}
      </div>
    </>
  );
}

function usePageRowActions(_list: EntityListController<DataHomeRow>): EntityRowActionsResult<DataHomeRow> {
  const router = useRouter();
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
        ],
      }),
    },
  };
}

function PagesList({ dataSource }: { dataSource: RecordsDataSource }) {
  const client = useRecordsClient();
  const corpus = useMemo(() => createDataHomeCorpus(client, dataSource), [client, dataSource]);
  const service = useMemo(
    () =>
      createDataHomeService({
        load: () => corpus.load().then(onlyPages),
        loaded: () => {
          const held = corpus.loaded();
          return held ? onlyPages(held) : undefined;
        },
        isStarred: () => false,
        ownerLabel,
      }),
    [corpus],
  );
  const config = useMemo<EntityListConfig<DataHomeRow>>(
    () => ({
      surfaceKey: PAGES_SURFACE_KEY,
      entityLabel: { singular: "page", plural: "pages" },
      sourceFeature: "udt",
      scopes: [...DATA_HOME_SHELL_LANES],
      lanes: { system: false },
      service,
      columns: dataHomeColumns({ organizationName: (id) => corpus.meta.names.get(id) ?? id }).filter((c) =>
        PAGE_COLUMNS.has(c.id),
      ),
      prefsVersion: 1,
      prefsDefaults: { view: "table", density: "compact", sort: "updated", direction: "desc" },
      getRowId: (row) => row.id,
      getRowName: (row) => row.name,
      rowKeys: true,
      door: { column: "name", hrefFor: (row) => row.href },
      useRowActions: usePageRowActions,
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
      searchPlaceholder: "Search pages",
      searchDebounceMs: 0,
      emptyState: { title: "No pages yet", description: "On a table, open Dashboards and press New page." },
    }),
    [service, corpus],
  );
  return <EntityListPage config={config} defaultScope={makeScope("all")} clearsShellHeader={false} />;
}
