"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Table, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, table_name, description, version, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .from("udt_datasets")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.table_name as string | null) ?? "Untitled table",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: row.version ? [`v${row.version}`] : undefined,
  source,
});

const getHref = (id: string) => `/data/${id}`;

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
      icon={<Table className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="udt_datasets"
          tableName="udt_datasets"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared tables yet"
          emptyDescription="Data tables owned by this organization will appear here, along with tables other members share."
          emptyIcon={<Table className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
