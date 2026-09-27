"use client";

import { useParams } from "next/navigation";
import { ClipboardType, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@/components/read-state/ReadFailure";

const SELECT_COLS = "id, label, role, updated_at, tags";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .schema("agent").from("message_template")
    .select(SELECT_COLS)
    .is("deleted_at", null)
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


export default function OrgTemplatesPage() {
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
      resourceName="Message Templates"
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
          resourceType="message_template"
          tableName="message_template"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared message templates yet"
          emptyDescription="Message templates you create under this organization will appear here, along with templates other members share."
          emptyIcon={<ClipboardType className="h-8 w-8 text-purple-600 dark:text-purple-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
