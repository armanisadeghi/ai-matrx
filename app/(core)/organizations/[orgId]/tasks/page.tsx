"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, title, status, priority, due_date, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .from("ctx_tasks")
    .select(SELECT_COLS)
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

const getHref = (id: string) => `/tasks/${id}`;

export default function OrgTasksPage() {
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
      resourceName="Tasks"
      icon={<ListTodo className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="task"
          tableName="ctx_tasks"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared tasks yet"
          emptyDescription="Tasks owned by this organization will appear here, along with tasks other members share."
          emptyIcon={<ListTodo className="h-8 w-8 text-green-600 dark:text-green-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
