"use client";

import { useParams } from "next/navigation";
import { LayoutGrid, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { appDb } from "@/utils/supabase/appDb";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@ai-matrx/design-system";

const SELECT_COLS = "id, name, tagline, updated_at, category, tags";

const fetchOwned = async (orgId: string) => {
  const res = await appDb(supabase)
    .from("definition")
    .select(SELECT_COLS)
    .is("deleted_at", null)
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


export default function OrgAppletsPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  // The org is resolved by THE one resolver (RC-B12 r13): its read used to
  // log-and-null inside a bare effect, so a failure spun here forever.
  const {
    organizationId: resolvedOrgId,
    error: orgReadError,
    refresh: retryOrgRead,
  } = useResolvedOrganization(orgIdParam);


  return (
    <OrgResourceLayout
      resourceName="Applets"
    >
      {!resolvedOrgId && orgReadError != null ? (
        <ReadFailure error={orgReadError} what="this organization" onRetry={retryOrgRead} />
      ) : !resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="app"
          tableName="definition"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared Applets yet"
          emptyDescription="Applets you publish under this organization will appear here, along with Applets other members share with this organization."
          emptyIcon={<LayoutGrid className="h-8 w-8 text-rose-600 dark:text-rose-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
