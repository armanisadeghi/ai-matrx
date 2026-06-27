"use client";

import React from "react";
import { useParams } from "next/navigation";
import { LayoutGrid, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { appDb } from "@/utils/supabase/appDb";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, name, tagline, updated_at, category, tags";

const fetchOwned = async (orgId: string) => {
  const res = await appDb(supabase)
    .from("definition")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.name as string | null) ?? "Untitled",
  subtitle: (row.tagline as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
  source,
});

const getHref = (id: string) => `/agent-apps/${id}`;

export default function OrgAgentAppsPage() {
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
      resourceName="Agent Apps"
      icon={<LayoutGrid className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="agent_app"
          tableName="definition"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared agent apps yet"
          emptyDescription="Agent apps you publish under this organization will appear here, along with apps other members share with this organization."
          emptyIcon={<LayoutGrid className="h-8 w-8 text-rose-600 dark:text-rose-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
