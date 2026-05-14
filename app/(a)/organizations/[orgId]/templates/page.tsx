"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ClipboardType, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, label, role, updated_at, tags";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .from("content_template")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.label as string | null) ?? "Untitled",
  subtitle: row.role ? `Role: ${String(row.role)}` : null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
  source,
});

const getHref = (id: string) => `/settings/content-templates/${id}`;

export default function OrgTemplatesPage() {
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
      resourceName="Content Templates"
      icon={<ClipboardType className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="content_template"
          tableName="content_template"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared content templates yet"
          emptyDescription="Content templates you create under this organization will appear here, along with templates other members share."
          emptyIcon={<ClipboardType className="h-8 w-8 text-purple-600 dark:text-purple-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
