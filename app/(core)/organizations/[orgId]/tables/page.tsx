"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Table, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@ai-matrx/design-system";
import { RecordsMount, WhereItLives } from "@ai-matrx/records-ui";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { PlatformTableLine } from "@/features/unified-data/hub/PlatformTableLine";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

const SELECT_COLS = "id, table_name, description, version, updated_at";

/**
 * THE ORGANIZATION'S TABLES (lane PROOF-DEFECTS, D5): one call to `custom.table_list_everywhere` —
 * the list door (GRID-PRIMITIVES G9) the table pickers use — which also answers whether the app
 * keeps a table for itself, so a column's choice list stays behind Show everything as on /data.
 * A list that cannot be read is a failure the page shows, never a silently shorter list.
 */
async function listTables(orgId: string): Promise<{ rows: Array<Record<string, unknown>>; kept: Array<Record<string, unknown>> }> {
  const store = await (supabase as unknown as SupabaseClient).schema("custom").rpc("table_list_everywhere", {
    p_organization_id: orgId,
    // The page keeps every table the app keeps behind its own Show everything — an agent's
    // outputs tables included, which the door otherwise leaves out (CHAIR-DOORS-2).
    p_include_platform_tables: true,
  });
  if (store.error) throw new Error(`The organization's tables could not be listed: ${store.error.message}`);
  const tables = ((store.data as { tables?: unknown } | null)?.tables ?? []) as Array<Record<string, unknown>>;
  const byRecent = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  return {
    rows: tables.filter((t) => t.platform_owned !== true).sort(byRecent),
    kept: tables.filter((t) => t.platform_owned === true).sort(byRecent),
  };
}

/** A table another member shared with this organization, read from the store by id. */
async function sharedTables(ids: string[]): Promise<Array<Record<string, unknown>>> {
  const store = await (supabase as unknown as SupabaseClient).schema("custom").rpc("table_list_everywhere", { p_organization_id: null, p_include_platform_tables: true });
  if (store.error) throw new Error(`The shared tables could not be read: ${store.error.message}`);
  const wanted = new Set(ids);
  const tables = ((store.data as { tables?: unknown } | null)?.tables ?? []) as Array<Record<string, unknown>>;
  return tables.filter((t) => wanted.has(String(t.id)));
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
  const recordsConfig = useAppRecordsConfig(resolvedOrgId ?? null);
  const dataSource = recordsConfig.dataSource;
  // A table moved from a card re-reads the list (the moved card leaves this organization's page).
  const [reread, setReread] = React.useState(0);
  // THE SAME "SHOW EVERYTHING" AS /data (PlatformTableLine): the tables the app keeps for
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
          config={recordsConfig}
          // The page's toasts: a landed move's sentence outlives the list's re-read (UI-FIX-19).
          host={{ notify: RECORDS_NOTIFY }}
        >
          <OrgResourceList
            key={reread}
            orgId={resolvedOrgId}
            resourceType="record"
            doorToken="table"
            hydrateShared={sharedTables}
            selectColumns={SELECT_COLS}
            ownedQuery={ownedQuery}
            mapRow={mapRow}
            getHref={(id) => `/data/${id}`}
            emptyTitle="No shared tables yet"
            emptyDescription="Data tables owned by this organization will appear here, along with tables other members share."
            emptyIcon={
              <Table className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            }
            renderCardAside={(item) => (
              <WhereItLives
                variant="row"
                tableId={item.id}
                knownOrganizationName={orgName}
                onMoved={() => setReread((n) => n + 1)}
              />
            )}
          />
          <div className="mt-4">
            <PlatformTableLine
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
