"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Table, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, table_name, description, version, updated_at";

/**
 * The organization's tables, from BOTH stores (lane INTEG-CLIENTS, CUTOVER-PLAN F12): its live
 * older datasets, and the record-store Tables this person may open here
 * (`custom.table_list_everywhere`, GRID-PRIMITIVES G9). A moved table is archived on the older
 * side with the same id, so it appears once, from the store. A store that could not be listed
 * is said in the console and the older list still answers.
 */
const fetchOwned = async (orgId: string) => {
  const older = await supabase
    .schema("workbench")
    .from("udt_datasets")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const rows = (older.data ?? []) as Array<Record<string, unknown>>;
  const store = await (supabase as unknown as SupabaseClient).schema("custom").rpc("table_list_everywhere", { p_organization_id: orgId });
  if (store.error) {
    console.warn(`[org tables] The record store's tables could not be listed: ${store.error.message}`);
    return rows;
  }
  const seen = new Set(rows.map((r) => String(r.id)));
  const tables = ((store.data as { tables?: unknown } | null)?.tables ?? []) as Array<Record<string, unknown>>;
  const storeRows = tables.filter((t) => t.store === "records" && !seen.has(String(t.id)));
  return [...storeRows, ...rows].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
  );
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.table_name as string | null) ?? "Untitled table",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: row.version ? [`v${row.version}`] : undefined,
  source,
});


export default function OrgTablesPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const org = await getOrganizationBySlugOrId(orgIdParam);
      if (!cancelled && org) setResolvedOrgId(org.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  return (
    <OrgResourceLayout
      resourceName="Tables"
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="dataset"
          tableName="udt_datasets"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared tables yet"
          emptyDescription="Data tables owned by this organization will appear here, along with tables other members share."
          emptyIcon={
            <Table className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
          }
        />
      )}
    </OrgResourceLayout>
  );
}
