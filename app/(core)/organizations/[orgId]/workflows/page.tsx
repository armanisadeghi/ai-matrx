"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Workflow, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, name, description, category, version, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await fromDeprecatedTable(
    "workflow",
    "app/(core)/organizations/[orgId]/workflows/page.tsx:fetchOwned",
  )
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.name as string | null) ?? "Untitled workflow",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: [
    row.category as string | null,
    row.version ? `v${row.version}` : null,
  ].filter((v): v is string => Boolean(v)),
  source,
});

const getHref = (id: string) => `/workflows/${id}`;

export default function OrgWorkflowsPage() {
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
      resourceName="Workflows"
      icon={<Workflow className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="workflow"
          tableName="workflow"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared workflows yet"
          emptyDescription="Workflows owned by this organization will appear here, along with workflows other members share."
          emptyIcon={
            <Workflow className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          }
        />
      )}
    </OrgResourceLayout>
  );
}
