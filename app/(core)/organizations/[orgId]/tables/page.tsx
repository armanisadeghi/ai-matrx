"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Table, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { RecordsMount, WhereItLives, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { KeptByTheAppLine } from "@/features/unified-data/hub/KeptByTheAppLine";

const SELECT_COLS = "id, table_name, description, version, updated_at";

/**
 * Which cards are record-store Tables — only those say where they live and can move
 * (`WhereItLives`); the older datasets have no such door. Filled by `listTables` before the
 * list renders its cards.
 */
const storeTableIds = new Set<string>();

/**
 * THE ORGANIZATION'S TABLES, READ WHERE TABLES LIVE (lane PROOF-DEFECTS, D5): one call to
 * `custom.table_list_everywhere` — the both-stores list door (GRID-PRIMITIVES G9) the table
 * pickers use — which answers each table's store and whether the app keeps it for itself. This
 * page used to read `workbench.udt_datasets` directly for the older side and list every
 * record-store table beside it, so a column's choice list ("Insurance Carriers") or a test's
 * choices showed as ordinary tables while /data-v2 kept them behind Show everything. A list that
 * cannot be read is a failure the page shows, never a silently shorter list.
 */
async function listTables(orgId: string): Promise<{ rows: Array<Record<string, unknown>>; kept: Array<Record<string, unknown>> }> {
  const store = await (supabase as unknown as SupabaseClient).schema("custom").rpc("table_list_everywhere", { p_organization_id: orgId });
  if (store.error) throw new Error(`The organization's tables could not be listed: ${store.error.message}`);
  const tables = ((store.data as { tables?: unknown } | null)?.tables ?? []) as Array<Record<string, unknown>>;
  storeTableIds.clear();
  for (const t of tables) if (t.store === "records") storeTableIds.add(String(t.id));
  const byRecent = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  return {
    rows: tables.filter((t) => t.kept_by_the_app !== true).sort(byRecent),
    kept: tables.filter((t) => t.kept_by_the_app === true).sort(byRecent),
  };
}

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.table_name as string | null) ?? "Untitled table",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  // No "v14" tag (lane HANDOVER, 2026-09-27): a table's version is the store's edit counter, not
  // anything a person named or can act on; every card wore one.
  source,
});


export default function OrgTablesPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  // The org is resolved by THE one resolver (RC-B12 r13): its read used to
  // log-and-null inside a bare effect, so a failure spun here forever.
  const {
    organization: resolvedOrg,
    organizationId: resolvedOrgId,
    error: orgReadError,
    refresh: retryOrgRead,
  } = useResolvedOrganization(orgIdParam);
  const orgName = resolvedOrg?.name ?? null;
  const [dataSource] = React.useState(() => recordsDataSource(supabase as unknown as SupabaseClient));
  const userId = useAppSelector(selectUserId);
  // A table moved from a card re-reads the list (the moved card leaves this organization's page).
  const [reread, setReread] = React.useState(0);
  // THE SAME "SHOW EVERYTHING" AS /data-v2 (KeptByTheAppLine): the tables the app keeps for
  // itself are counted, and listed only when asked.
  const [showEverything, setShowEverything] = React.useState(false);
  const [keptCount, setKeptCount] = React.useState(0);
  const ownedQuery = React.useCallback(
    async (orgId: string) => {
      const { rows, kept } = await listTables(orgId);
      setKeptCount(kept.length);
      return showEverything ? [...rows, ...kept] : rows;
    },
    [showEverything],
  );


  return (
    <OrgResourceLayout
      resourceName="Tables"
    >
      {!resolvedOrgId && orgReadError != null ? (
        <ReadFailure error={orgReadError} what="this organization" onRetry={retryOrgRead} />
      ) : !resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* records-ui's WhereItLives reads the store through the mount's client: one mount for
           the page, keyed to the organization the page lists (each chip still asks the store
           where ITS table lives — never this organization). */
        <RecordsMount
          letTheStoreDecideRights
          config={{ dataSource, actor: personActor(userId), organizationId: resolvedOrgId }}
          // The page's toasts: a landed move's sentence outlives the list's re-read (UI-FIX-19).
          host={{ notify: RECORDS_NOTIFY }}
        >
          <OrgResourceList
            key={reread}
            orgId={resolvedOrgId}
            resourceType="dataset"
            tableName="udt_datasets"
            selectColumns={SELECT_COLS}
            ownedQuery={ownedQuery}
            mapRow={mapRow}
            // A table in the new system opens at its own address; only an older one at /data/<id>
            // (lane HANDOVER: every card opened the older address, which then claimed the table
            // had moved there).
            getHref={(id) => (storeTableIds.has(id) ? `/data-v2/${id}` : `/data/${id}`)}
            emptyTitle="No shared tables yet"
            emptyDescription="Data tables owned by this organization will appear here, along with tables other members share."
            emptyIcon={
              <Table className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            }
            renderCardAside={(item) =>
              storeTableIds.has(item.id) ? (
                <WhereItLives
                  variant="row"
                  tableId={item.id}
                  knownOrganizationName={orgName}
                  onMoved={() => setReread((n) => n + 1)}
                />
              ) : null
            }
          />
          <div className="mt-4">
            <KeptByTheAppLine
              keptCount={keptCount}
              showEverything={showEverything}
              onToggle={() => setShowEverything((on) => !on)}
            />
          </div>
        </RecordsMount>
      )}
    </OrgResourceLayout>
  );
}
