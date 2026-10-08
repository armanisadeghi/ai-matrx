"use client";

import { useParams } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@ai-matrx/design-system";

const SELECT_COLS = "id, title, status, priority, due_date, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await projectsDb(supabase)
    .from("tasks")
    .select(SELECT_COLS)
    .is("deleted_at", null)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.title as string | null) ?? "Untitled task",
  subtitle: [row.status as string | null, row.priority as string | null]
    .filter(Boolean)
    .join(" · ") || null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: row.due_date ? [`Due ${String(row.due_date)}`] : undefined,
  source,
});


export default function OrgTasksPage() {
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
      resourceName="Tasks"
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
          resourceType="task"
          tableName="tasks"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared tasks yet"
          emptyDescription="Tasks owned by this organization will appear here, along with tasks other members share."
          emptyIcon={<ListTodo className="h-8 w-8 text-green-600 dark:text-green-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
